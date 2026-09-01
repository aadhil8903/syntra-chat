import os
import json
import logging
from typing import List, Dict, Any, Tuple
from bson import ObjectId
from pypdf import PdfReader
from docx import Document as DocxDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from embeddings.factory import get_embedding_provider
from core.database import get_database
from core.config import get_settings

logger = logging.getLogger(__name__)


def extract_text_from_file(file_path: str, file_type: str) -> List[Tuple[str, int]]:
    """Extracts (text, page_or_section_number) pairs from a document."""
    results: List[Tuple[str, int]] = []
    clean_type = file_type.lower().replace(".", "")

    if clean_type == "pdf":
        try:
            reader = PdfReader(file_path)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    results.append((text.strip(), i + 1))
        except Exception as e:
            logger.error(f"PDF extraction error for {file_path}: {e}")

    elif clean_type == "docx":
        try:
            doc = DocxDocument(file_path)
            current_section_texts: List[str] = []
            section_num = 1
            chars_in_section = 0
            SECTION_BREAK_SIZE = 2000  # ~500 words per virtual section

            for para in doc.paragraphs:
                text = para.text.strip()
                if not text:
                    continue

                # Detect heading — start a new section
                style_name = para.style.name if para.style else ""
                is_heading = "Heading" in style_name or style_name.startswith("Title")

                if is_heading and current_section_texts and chars_in_section > 300:
                    # Flush current section
                    results.append(("\n\n".join(current_section_texts), section_num))
                    section_num += 1
                    current_section_texts = [text]
                    chars_in_section = len(text)
                else:
                    current_section_texts.append(text)
                    chars_in_section += len(text)

                    # Also split on size threshold even without headings
                    if chars_in_section >= SECTION_BREAK_SIZE:
                        results.append(("\n\n".join(current_section_texts), section_num))
                        section_num += 1
                        current_section_texts = []
                        chars_in_section = 0

            # Flush remaining text
            if current_section_texts:
                results.append(("\n\n".join(current_section_texts), section_num))

        except Exception as e:
            logger.error(f"DOCX extraction error for {file_path}: {e}")

    elif clean_type in ["txt", "md", "markdown"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        # Split into ~2000 char sections
        if content.strip():
            for i, chunk in enumerate(range(0, len(content), 2000)):
                section_text = content[chunk:chunk + 2000].strip()
                if section_text:
                    results.append((section_text, i + 1))

    elif clean_type == "json":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            data = json.load(f)
        formatted = json.dumps(data, indent=2)
        results.append((formatted, 1))

    elif clean_type == "csv":
        try:
            import pandas as pd
            df = pd.read_csv(file_path, nrows=500)
            summary = f"CSV Table with {len(df)} sample rows and columns: {list(df.columns)}.\n\n"
            table_str = df.to_string(index=False, max_rows=100)
            results.append((summary + table_str, 1))
        except Exception as e:
            logger.error(f"CSV extraction error for {file_path}: {e}")
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                results.append((f.read()[:5000], 1))

    elif clean_type in ["xlsx", "xls"]:
        try:
            import pandas as pd
            excel_file = pd.ExcelFile(file_path)
            for idx, sheet_name in enumerate(excel_file.sheet_names):
                df = pd.read_excel(file_path, sheet_name=sheet_name, nrows=200)
                summary = f"Spreadsheet Sheet '{sheet_name}' with {len(df)} sample rows. Columns: {list(df.columns)}.\n\n"
                table_str = df.to_string(index=False, max_rows=50)
                results.append((summary + table_str, idx + 1))
        except Exception as e:
            logger.error(f"Excel extraction error for {file_path}: {e}")

    else:
        # Fallback text read
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        if content.strip():
            results.append((content.strip(), 1))

    return results


def process_and_ingest_document(
    user_id: str,
    document_id: str,
    file_path: str,
    filename: str,
    file_type: str,
) -> int:
    """Chunks, embeds, and stores document content into MongoDB scoped to user_id."""
    settings = get_settings()
    db = get_database()
    chunks_collection = db["document_chunks"]

    clean_type = file_type.lower().replace(".", "")
    source_type = "tabular" if clean_type in ["csv", "xlsx", "xls"] else "narrative"

    embedder = get_embedding_provider()

    # 1. Clean any existing chunks for this document and active provider (preserve vectors of other providers)
    if embedder.provider_name == "bge_local":
        chunks_collection.delete_many({
            "document_id": document_id,
            "user_id": user_id,
            "$or": [{"embedding_provider": "bge_local"}, {"embedding_provider": {"$exists": False}}],
        })
    else:
        chunks_collection.delete_many({
            "document_id": document_id,
            "user_id": user_id,
            "embedding_provider": embedder.provider_name,
        })

    # 2. Extract text with page/section mappings
    extracted_pages = extract_text_from_file(file_path, file_type)
    if not extracted_pages:
        logger.warning(f"No text extracted from document {document_id} ({filename})")
        return 0

    # 3. Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    all_chunk_texts: List[str] = []
    chunk_metadata: List[Dict[str, Any]] = []

    chunk_idx = 0
    for page_text, page_num in extracted_pages:
        chunks = splitter.split_text(page_text)
        for c in chunks:
            if c.strip():
                all_chunk_texts.append(c)
                chunk_metadata.append({
                    "document_id": document_id,
                    "user_id": user_id,
                    "filename": filename,
                    "page": page_num,
                    "chunk_index": chunk_idx,
                    "source_type": source_type,
                })
                chunk_idx += 1

    if not all_chunk_texts:
        return 0

    # 4. Generate embeddings using active provider
    embeddings = embedder.embed_documents(all_chunk_texts)

    # 5. Insert documents into MongoDB
    documents_to_insert = []
    for i, text in enumerate(all_chunk_texts):
        meta = chunk_metadata[i]
        doc = {
            "document_id": meta["document_id"],
            "user_id": meta["user_id"],
            "filename": meta["filename"],
            "text": text,
            "embedding": embeddings[i],
            "embedding_provider": embedder.provider_name,
            "embedding_model": embedder.model_name,
            "dimension": embedder.dimension,
            "page": meta["page"],
            "chunk_index": meta["chunk_index"],
            "source_type": meta.get("source_type", source_type),
        }
        documents_to_insert.append(doc)

    if documents_to_insert:
        chunks_collection.insert_many(documents_to_insert)

    logger.info(
        f"Ingested {len(documents_to_insert)} ({source_type}) chunks for document {document_id} (user {user_id})"
    )
    return len(documents_to_insert)
