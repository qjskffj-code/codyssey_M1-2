"""대화 기록 스키마."""

from typing import Literal

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    created_at: str | None = None


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    messages: list[Message] = Field(min_length=1)


class ConversationSummary(BaseModel):
    """목록 조회용. 본문(messages)은 포함하지 않는다."""

    id: str
    title: str
    message_count: int
    created_at: str | None = None
    updated_at: str | None = None


class ConversationDetail(ConversationSummary):
    """단건 조회용. 전체 messages를 포함한다."""

    messages: list[Message]
