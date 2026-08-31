from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from schemas.chat import ChatRequest, ChatResponse, AgentIntent
from agents.graph import agent_graph

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        initial_state = {
            "user_id": request.userId,
            "conversation_id": request.conversationId,
            "message": request.message,
            "resource_ids": request.resourceIds,
            "shared_memory": request.sharedMemory,
            "history": [{"role": h.role, "content": h.content} for h in request.history],
        }

        # Invoke LangGraph StateGraph
        final_state = await agent_graph.ainvoke(initial_state)

        return ChatResponse(
            answer=final_state.get("final_answer", "No answer generated."),
            intent=final_state.get("intent", AgentIntent.GENERAL_CHAT),
            citations=final_state.get("citations"),
            generatedChart=final_state.get("chart_spec"),
            generatedCharts=final_state.get("chart_specs") or ([final_state.get("chart_spec")] if final_state.get("chart_spec") else None),
            generatedTable=final_state.get("analysis_table"),
            pythonCode=final_state.get("python_code"),
            executionOutput=final_state.get("execution_output"),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error in chat processing: {str(e)}")

@router.post("/stream")
async def chat_stream_endpoint(request: ChatRequest):
    async def event_generator():
        try:
            initial_state = {
                "user_id": request.userId,
                "conversation_id": request.conversationId,
                "message": request.message,
                "resource_ids": request.resourceIds,
                "shared_memory": request.sharedMemory,
                "history": [{"role": h.role, "content": h.content} for h in request.history],
            }

            # 1. StateGraph resolution & generation
            final_state = await agent_graph.ainvoke(initial_state)
            answer = final_state.get("final_answer", "No response generated.")

            # 2. Stream tokens in realistic chunks for smooth responsive rendering
            words = answer.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield f"event: token\ndata: {json.dumps({'token': chunk})}\n\n"
                await asyncio.sleep(0.015)

            # 3. Stream structured metadata (citations, charts, tables, execution output)
            chart_spec = final_state.get("chart_spec")
            chart_specs = final_state.get("chart_specs") or ([chart_spec] if chart_spec else None)
            table_spec = final_state.get("analysis_table")

            metadata = {
                "citations": [c.model_dump() if hasattr(c, "model_dump") else c for c in (final_state.get("citations") or [])],
                "generatedChart": chart_spec.model_dump() if hasattr(chart_spec, "model_dump") else chart_spec,
                "generatedCharts": [c.model_dump() if hasattr(c, "model_dump") else c for c in chart_specs] if chart_specs else None,
                "generatedTable": table_spec.model_dump() if hasattr(table_spec, "model_dump") else table_spec,
                "pythonCode": final_state.get("python_code"),
                "executionOutput": final_state.get("execution_output"),
                "intent": final_state.get("intent", "general_chat"),
            }
            yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            err_payload = {"error": str(e)}
            yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

class TitleRequest(BaseModel):
    message: str

class TitleResponse(BaseModel):
    title: str

def generate_fallback_title(message: str) -> str:
    cleaned = message.replace("\n", " ").strip()
    # Remove @mentions from title
    import re
    cleaned = re.sub(r'@[a-zA-Z0-9_\-\./]+', '', cleaned).strip()
    
    # Strip common conversational question prefixes
    fillers = [
        "can you please tell me about", "can you tell me about", "can you explain",
        "please tell me about", "what is the", "what are the", "how does", "tell me about",
        "create me a", "create a", "summarize the", "show me the", "give me a", "what about",
        "can you", "please", "help me"
    ]
    lower = cleaned.lower()
    for f in fillers:
        if lower.startswith(f):
            cleaned = cleaned[len(f):].strip()
            break
            
    cleaned = cleaned.strip("?:!.,- \"'`")
    words = cleaned.split()
    if not words:
        return "New Chat"
    title_words = words[:5]
    title = " ".join(title_words)
    return (title[0].upper() + title[1:]) if len(title) > 1 else title.upper()

@router.post("/title", response_model=TitleResponse)
async def generate_title_endpoint(request: TitleRequest):
    try:
        from langchain_core.messages import HumanMessage
        from llm.factory import get_llm_provider
        llm = get_llm_provider()
        prompt = (
            "Generate a short, punchy 2 to 4 word title that accurately captures the topic of the user's message, "
            "similar to ChatGPT sidebar conversation titles (e.g. 'Cardiovascular Risk Overview', 'Compounding Growth Model', 'Student Shopping Survey').\n"
            "Rules:\n"
            "- Output ONLY the title.\n"
            "- Do not include quotation marks, markdown formatting, or punctuation at the end.\n"
            "- Maximum 5 words.\n\n"
            f"User Message: {request.message[:400]}"
        )
        response = await llm.generate_response([HumanMessage(content=prompt)], temperature=0.3)
        title = response.strip().strip('"').strip("'").strip("`").replace("\n", " ").strip()
        title = title.strip("?:!.,- ")
        if not title or len(title) > 50 or title.lower() == "new conversation":
            title = generate_fallback_title(request.message)
        return TitleResponse(title=title)
    except Exception as e:
        fallback = generate_fallback_title(request.message)
        return TitleResponse(title=fallback)

class TranscribeResponse(BaseModel):
    transcript: str

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            return TranscribeResponse(transcript="")

        content_type = file.content_type or "audio/webm"
        mime_type = content_type.split(";")[0].strip()
        if mime_type not in ["audio/webm", "audio/wav", "audio/mp3", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac"]:
            mime_type = "audio/webm"

        from core.config import get_settings
        import os
        settings = get_settings()
        api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                "Accurately transcribe this audio recording into text. Return ONLY the transcribed text verbatim, with no markdown, notes, greetings, or conversational remarks.",
            ],
        )
        text = response.text.strip() if response.text else ""
        return TranscribeResponse(transcript=text)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Audio transcription failed: {e}")
        return TranscribeResponse(transcript="")
