import os
import re
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple, Optional, Union, Callable
from schemas.dataset import DatasetSheetInfo, DatasetColumnInfo, DatasetInspectResponse


def clean_dataframe_numerics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans DataFrame columns: strips whitespace, detects numeric strings
    (e.g., '$1,250,000', '13.06%', '1,450.50', ' - ') and converts to clean float/int.
    """
    cleaned_df = df.copy()
    cleaned_df.columns = [str(c).strip() for c in cleaned_df.columns]

    for col in cleaned_df.columns:
        series = cleaned_df[col]
        if not pd.api.types.is_numeric_dtype(series):
            non_null_s = series.dropna().astype(str).str.strip()
            if len(non_null_s) == 0:
                continue

            def try_parse_num(val):
                if val is None or (isinstance(val, float) and np.isnan(val)):
                    return np.nan
                v = str(val).strip()
                if not v or v.lower() in ['-', '--', 'n/a', 'na', 'nan', 'none', 'null']:
                    return np.nan
                # Remove common currency symbols and commas
                cleaned = v.replace('$', '').replace('₹', '').replace('€', '').replace('£', '').replace(',', '').strip()
                if cleaned.endswith('%'):
                    cleaned = cleaned[:-1].strip()
                if cleaned.startswith('(') and cleaned.endswith(')'):
                    cleaned = '-' + cleaned[1:-1].strip()
                try:
                    return float(cleaned)
                except (ValueError, TypeError):
                    return np.nan

            converted_series = series.apply(try_parse_num)
            valid_numeric_count = converted_series.notna().sum()
            # If at least 50% of the non-empty cells contain valid numeric figures, convert column
            if valid_numeric_count > 0 and (valid_numeric_count / len(non_null_s)) >= 0.5:
                cleaned_df[col] = converted_series.astype(float)

    return cleaned_df


def load_dataset_metadata(
    file_path: str,
    dataset_id: str,
    filename: str,
    file_type: str,
) -> DatasetInspectResponse:
    """Reads dataset structure, sheets, columns, types, and generates preview rows."""
    clean_type = file_type.lower().replace(".", "")
    sheets_info: List[DatasetSheetInfo] = []
    sheet_names: List[str] = []
    total_rows = 0

    if clean_type == "csv":
        df = pd.read_csv(file_path, nrows=5000)
        df = clean_dataframe_numerics(df)
        sheet_names = ["Sheet1"]
        sheet_info = _analyze_dataframe(df, "Sheet1")
        sheets_info.append(sheet_info)
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                total_rows = max(0, sum(1 for _ in f) - 1)
        except Exception:
            total_rows = len(df)

    elif clean_type in ["xlsx", "xls"]:
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names

        for name in sheet_names:
            try:
                df = pd.read_excel(excel_file, sheet_name=name, nrows=5000)
                # If first row was a merged title banner, check if header needs adjustment
                if len(df.columns) <= 1 or df.columns[0].startswith("Unnamed"):
                    if len(df) > 1 and df.iloc[0].notna().sum() >= 2:
                        df.columns = df.iloc[0].astype(str).str.strip()
                        df = df.iloc[1:].reset_index(drop=True)
                df = clean_dataframe_numerics(df)
                sheet_info = _analyze_dataframe(df, name)
                sheets_info.append(sheet_info)
                total_rows += len(df)
            except Exception:
                continue
        try:
            excel_file.close()
        except Exception:
            pass
    else:
        raise ValueError(f"Unsupported dataset format: {file_type}")

    return DatasetInspectResponse(
        datasetId=dataset_id,
        sheetNames=sheet_names,
        sheets=sheets_info,
        totalRows=total_rows,
        status="ready",
    )


def _analyze_dataframe(df: pd.DataFrame, sheet_name: str) -> DatasetSheetInfo:
    cols: List[DatasetColumnInfo] = []

    df.columns = [str(c).strip() for c in df.columns]

    for col in df.columns:
        series = df[col]
        non_null = int(series.count())
        null_count = int(series.isna().sum())
        dtype_str = str(series.dtype)

        sample_vals = []
        for val in series.dropna().unique()[:5]:
            if isinstance(val, (np.integer, int)):
                sample_vals.append(int(val))
            elif isinstance(val, (np.floating, float)):
                sample_vals.append(float(val) if not np.isnan(val) else None)
            elif isinstance(val, (np.bool_, bool)):
                sample_vals.append(bool(val))
            else:
                sample_vals.append(str(val))

        cols.append(
            DatasetColumnInfo(
                name=str(col),
                dtype=dtype_str,
                nonNullCount=non_null,
                nullCount=null_count,
                sampleValues=sample_vals,
            )
        )

    preview_df = df.head(10).replace({np.nan: None})
    preview_rows = preview_df.to_dict(orient="records")

    cleaned_preview = []
    for r in preview_rows:
        cleaned_row = {}
        for k, v in r.items():
            if isinstance(v, (pd.Timestamp, np.datetime64)):
                cleaned_row[str(k)] = str(v)
            elif isinstance(v, (np.integer, int)):
                cleaned_row[str(k)] = int(v)
            elif isinstance(v, (np.floating, float)):
                cleaned_row[str(k)] = None if np.isnan(v) else float(v)
            else:
                cleaned_row[str(k)] = v
        cleaned_preview.append(cleaned_row)

    return DatasetSheetInfo(
        sheetName=sheet_name,
        rowCount=len(df),
        columnCount=len(cols),
        columns=cols,
        previewRows=cleaned_preview,
    )


def load_dataframes_for_analysis(file_path: str, file_type: str) -> Dict[str, pd.DataFrame]:
    """Loads all sheets of a dataset file into a dictionary of cleaned DataFrames."""
    clean_type = file_type.lower().replace(".", "")
    dfs: Dict[str, pd.DataFrame] = {}

    if clean_type == "csv":
        df = pd.read_csv(file_path)
        df = clean_dataframe_numerics(df)
        dfs["df"] = df
        dfs["Sheet1"] = df
    elif clean_type in ["xlsx", "xls"]:
        excel_file = pd.ExcelFile(file_path)
        primary_df = None
        max_rows = -1

        try:
            for i, name in enumerate(excel_file.sheet_names):
                try:
                    df = pd.read_excel(excel_file, sheet_name=name)
                    if len(df.columns) <= 1 or df.columns[0].startswith("Unnamed"):
                        if len(df) > 1 and df.iloc[0].notna().sum() >= 2:
                            df.columns = df.iloc[0].astype(str).str.strip()
                            df = df.iloc[1:].reset_index(drop=True)
                    df = clean_dataframe_numerics(df)
                    dfs[name] = df
                    clean_key = re.sub(r'[^a-zA-Z0-9_]', '_', name)
                    dfs[clean_key] = df
                    if len(df) > max_rows:
                        max_rows = len(df)
                        primary_df = df
                except Exception:
                    continue
        finally:
            try:
                excel_file.close()
            except Exception:
                pass

        if primary_df is not None:
            dfs["df"] = primary_df
        elif len(dfs) > 0:
            dfs["df"] = next(iter(dfs.values()))

    return dfs


def resolve_dataset_filepath(storage_path: str) -> Tuple[Optional[str], Optional[Any]]:
    """
    Locates the dataset file on disk or GridFS.
    Returns (abs_path, cleanup_callable).
    """
    if not storage_path:
        return None, None

    _ai_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _proj_root = os.path.dirname(os.path.dirname(_ai_dir))
    _uploads_root = os.path.join(_proj_root, "uploads")
    _backend_uploads = os.path.join(_proj_root, "apps", "backend", "uploads")

    candidates = [
        storage_path if os.path.isabs(storage_path) else None,
        os.path.join(_uploads_root, storage_path),
        os.path.join(_backend_uploads, storage_path),
        os.path.join(_uploads_root, "datasets", os.path.basename(storage_path)),
        os.path.join(_backend_uploads, "datasets", os.path.basename(storage_path)),
        os.path.join(os.getcwd(), "uploads", storage_path),
        os.path.join(os.getcwd(), storage_path),
    ]
    abs_path = next((p for p in candidates if p and os.path.exists(p)), None)

    if not abs_path:
        for u_dir in [_uploads_root, _backend_uploads]:
            if os.path.exists(u_dir):
                base_name = os.path.basename(storage_path)
                for root, _, files in os.walk(u_dir):
                    if base_name in files:
                        abs_path = os.path.join(root, base_name)
                        break
            if abs_path:
                break

    if abs_path:
        return abs_path, None

    # Try MongoDB GridFS
    try:
        from core.gridfs_storage import get_gridfs_temp_file
        temp_info = get_gridfs_temp_file(storage_path)
        if temp_info:
            return temp_info[0], temp_info[1]
    except Exception:
        pass

    return None, None


def load_dataframe_sync(
    dataset_or_id_or_path: Any,
    file_type: Optional[str] = None,
) -> Tuple[Optional[pd.DataFrame], Dict[str, pd.DataFrame]]:
    """
    Loads dataset into (primary_df, all_dfs_dict).
    Accepts:
    1. Dataset dict (from resolved_datasets in AgentState)
    2. Dataset ID string (MongoDB ObjectId)
    3. File path string
    """
    if dataset_or_id_or_path is None:
        return None, {}

    # Case 1: Dict representation
    if isinstance(dataset_or_id_or_path, dict):
        ds_dict = dataset_or_id_or_path
        storage_path = ds_dict.get("storagePath") or ds_dict.get("path") or ""
        ftype = file_type or ds_dict.get("fileType") or "csv"

        abs_path, cleanup_fn = resolve_dataset_filepath(storage_path)
        if abs_path and os.path.exists(abs_path):
            try:
                dfs = load_dataframes_for_analysis(abs_path, ftype)
                return dfs.get("df"), dfs
            finally:
                if cleanup_fn:
                    cleanup_fn()

        # Fallback to previewRows from metadata if file not found
        sheets = ds_dict.get("sheets", [])
        if sheets and isinstance(sheets, list) and len(sheets) > 0:
            preview_rows = sheets[0].get("previewRows", [])
            if preview_rows:
                df = pd.DataFrame(preview_rows)
                df = clean_dataframe_numerics(df)
                return df, {"df": df, "Sheet1": df}

        return None, {}

    # Case 2: String (ID or Path)
    if isinstance(dataset_or_id_or_path, str):
        target_str = dataset_or_id_or_path.strip()

        # If it looks like a direct existing file path
        if os.path.exists(target_str) or target_str.endswith(".csv") or target_str.endswith(".xlsx") or target_str.endswith(".xls"):
            abs_path, cleanup_fn = resolve_dataset_filepath(target_str)
            if abs_path and os.path.exists(abs_path):
                ftype = file_type or os.path.splitext(abs_path)[1].replace(".", "") or "csv"
                try:
                    dfs = load_dataframes_for_analysis(abs_path, ftype)
                    return dfs.get("df"), dfs
                finally:
                    if cleanup_fn:
                        cleanup_fn()

        # Otherwise try looking up in MongoDB datasets/documents
        try:
            from core.database import get_database
            from bson import ObjectId
            db = get_database()
            obj_id = ObjectId(target_str) if ObjectId.is_valid(target_str) else target_str
            ds_doc = db["datasets"].find_one({"_id": obj_id}) or db["documents"].find_one({"_id": obj_id})
            if ds_doc:
                ds_doc["id"] = str(ds_doc["_id"])
                return load_dataframe_sync(ds_doc, file_type=file_type)
        except Exception:
            pass

    return None, {}


async def load_dataframe(
    dataset_or_id_or_path: Any,
    file_type: Optional[str] = None,
) -> Tuple[Optional[pd.DataFrame], Dict[str, pd.DataFrame]]:
    """
    Asynchronously loads a dataset into (primary_df, all_dfs_dict).
    Compatible with callers awaiting load_dataframe.
    """
    return load_dataframe_sync(dataset_or_id_or_path, file_type=file_type)


