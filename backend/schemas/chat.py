"""챗봇 요청/응답 스키마."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: str | None = Field(
        default=None, description="이어서 대화할 기존 대화 ID. 없으면 새 대화를 만든다."
    )


class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    summary_period: str
    model: str
