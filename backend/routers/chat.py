from fastapi import APIRouter, HTTPException

from schemas.chat import ChatRequest, ChatResponse
from services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def post_chat(payload: ChatRequest):
    """데이터 요약을 시스템 프롬프트에 주입해 답변하고, 대화를 자동 저장한다."""
    try:
        return chat_service.chat(payload.message, payload.conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
