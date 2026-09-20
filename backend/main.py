from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers import chat, conversations, data, health

app = FastAPI(
    title="My AI Assistant API",
    description="내 시계열 데이터를 이해하고 답변하는 AI 비서 백엔드",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)
