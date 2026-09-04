import logging
from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from schemas.chat import ChatRequest, ChatResponse, AgentIntent
from agents.graph import agent_graph, guard_output_grounding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    import uuid
    req_id = f"req_{uuid.uuid4().hex[:8]}"
    logger.info(f"[AI] request_id={req_id} start user_id={request.userId} msg='{request.message[:50]}'")
    try:
        active_scope_dict = request.activeScope.model_dump() if request.activeScope else None
        initial_state = {
            "user_id": request.userId,
            "user_role": request.userRole,
            "conversation_id": request.conversationId,
            "message": request.message,
            "resource_ids": request.resourceIds,
            "active_scope": active_scope_dict,
            "shared_memory": request.sharedMemory,
            "history": [{"role": h.role, "content": h.content} for h in request.history],
        }

        # Invoke LangGraph StateGraph
        final_state = await agent_graph.ainvoke(initial_state)
        guarded_answer = guard_output_grounding(final_state.get("final_answer", "No answer generated."), final_state)
        logger.info(f"[AI] request_id={req_id} complete intent={final_state.get('intent')}")

        return ChatResponse(
            answer=guarded_answer,
            intent=final_state.get("intent", AgentIntent.GENERAL_CHAT),
            citations=final_state.get("citations"),
            generatedChart=final_state.get("chart_spec"),
            generatedCharts=final_state.get("chart_specs") or ([final_state.get("chart_spec")] if final_state.get("chart_spec") else None),
            generatedTable=final_state.get("analysis_table"),
            pythonCode=final_state.get("python_code"),
            executionOutput=final_state.get("execution_output"),
            downloadableFile=final_state.get("downloadable_file"),
        )
    except Exception as e:
        logger.error(f"[AI] request_id={req_id} error: {e}")
        err_msg = str(e)
        if "resource_exhausted" in err_msg.lower() or "429" in err_msg.lower() or "quota" in err_msg.lower():
            err_msg = "Gemini is temporarily unavailable because the AI quota has been reached. Please wait a moment or check your API key credits."
        raise HTTPException(status_code=500, detail=err_msg)

@router.post("/stream")
async def chat_stream_endpoint(request: ChatRequest):
    import uuid
    req_id = f"req_{uuid.uuid4().hex[:8]}"
    logger.info(f"[AI Stream] request_id={req_id} start user_id={request.userId} msg='{request.message[:50]}'")

    async def event_generator():
        try:
            active_scope_dict = request.activeScope.model_dump() if request.activeScope else None
            initial_state = {
                "user_id": request.userId,
                "user_role": request.userRole,
                "conversation_id": request.conversationId,
                "message": request.message,
                "resource_ids": request.resourceIds,
                "active_scope": active_scope_dict,
                "shared_memory": request.sharedMemory,
                "history": [{"role": h.role, "content": h.content} for h in request.history],
            }

            # 1. StateGraph resolution & generation
            final_state = await agent_graph.ainvoke(initial_state)
            answer = guard_output_grounding(final_state.get("final_answer", "No response generated."), final_state)
            logger.info(f"[AI Stream] request_id={req_id} stategraph complete intent={final_state.get('intent')}")

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
                "downloadableFile": final_state.get("downloadable_file"),
                "intent": final_state.get("intent", "general_chat"),
            }
            yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            logger.error(f"[AI Stream] request_id={req_id} error: {e}")
            err_msg = str(e)
            if "resource_exhausted" in err_msg.lower() or "429" in err_msg.lower() or "quota" in err_msg.lower():
                err_msg = "Gemini is temporarily unavailable because the AI quota has been reached. Please wait a moment or check your API key credits."
            err_payload = {"error": err_msg}
            yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

class TitleRequest(BaseModel):
    message: str

class TitleResponse(BaseModel):
    title: str

def generate_fallback_title(message: str) -> str:
    cleaned = message.replace("\n", " ").strip()
    import re
    cleaned = re.sub(r'@[a-zA-Z0-9_\-\./]+', '', cleaned).strip()

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
    msg = (request.message or "").strip()
    words = msg.split()

    # Fast path: For short inputs (<= 4 words) or common greetings, use rule-based title without consuming Gemini quota
    if len(words) <= 4 or msg.lower() in ["hey", "hello", "hi", "help", "test", "compare these", "what can you help me with"]:
        return TitleResponse(title=generate_fallback_title(msg))

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
            f"User Message: {msg[:400]}"
        )
        response = await llm.generate_response([HumanMessage(content=prompt)], temperature=0.3)
        title = response.strip().strip('"').strip("'").strip("`").replace("\n", " ").strip()
        title = title.strip("?:!.,- ")
        if not title or len(title) > 50 or title.lower() == "new conversation":
            title = generate_fallback_title(msg)
        return TitleResponse(title=title)
    except Exception as e:
        fallback = generate_fallback_title(msg)
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
