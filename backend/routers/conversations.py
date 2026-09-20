from fastapi import APIRouter, HTTPException, Query

from schemas.conversation import ConversationCreate, ConversationDetail, ConversationSummary
from services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.post("", response_model=ConversationDetail, status_code=201)
def post_conversation(payload: ConversationCreate):
    messages = [message.model_dump() for message in payload.messages]
    created = conversation_service.create_conversation(messages, payload.title)
    return {**created, "message_count": len(created["messages"])}


@router.get("", response_model=list[ConversationSummary])
def get_conversations(limit: int = Query(default=20, ge=1, le=100)):
    """목록에는 messages를 포함하지 않는다. 본문은 단건 조회로 받는다."""
    return conversation_service.list_conversations(limit)


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str):
    conversation = conversation_service.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    return conversation


@router.delete("/{conversation_id}", status_code=204)
def remove_conversation(conversation_id: str):
    if not conversation_service.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
