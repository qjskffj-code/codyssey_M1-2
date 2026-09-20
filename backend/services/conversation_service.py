"""Firestore의 conversations 컬렉션 CRUD.

목록 조회는 messages를 제외해 가볍게 주고, 단건 조회에서 전체 대화를 준다.
"""

from datetime import datetime, timezone

from core.firebase import get_db

COLLECTION = "conversations"
TITLE_MAX_LENGTH = 40


def _collection():
    return get_db().collection(COLLECTION)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_title(messages: list[dict]) -> str:
    first = next((m["content"] for m in messages if m["role"] == "user"), "새 대화")
    return first[:TITLE_MAX_LENGTH]


def _to_summary(doc) -> dict:
    payload = doc.to_dict()
    return {
        "id": doc.id,
        "title": payload.get("title", ""),
        "message_count": len(payload.get("messages", [])),
        "created_at": payload.get("created_at"),
        "updated_at": payload.get("updated_at"),
    }


def create_conversation(messages: list[dict], title: str | None = None) -> dict:
    now = _now()
    for message in messages:
        message.setdefault("created_at", now)

    payload = {
        "title": title or _make_title(messages),
        "messages": messages,
        "created_at": now,
        "updated_at": now,
    }
    document = _collection().document()
    document.set(payload)
    return {"id": document.id, **payload}


def append_messages(conversation_id: str, messages: list[dict]) -> dict | None:
    """기존 대화에 메시지를 이어 붙인다. 챗봇이 자동 저장할 때 사용한다."""
    document = _collection().document(conversation_id)
    snapshot = document.get()
    if not snapshot.exists:
        return None

    now = _now()
    for message in messages:
        message.setdefault("created_at", now)

    payload = snapshot.to_dict()
    payload["messages"] = payload.get("messages", []) + messages
    payload["updated_at"] = now
    document.update({"messages": payload["messages"], "updated_at": now})
    return {"id": conversation_id, **payload}


def list_conversations(limit: int = 20) -> list[dict]:
    from google.cloud.firestore_v1 import Query

    query = _collection().order_by("updated_at", direction=Query.DESCENDING).limit(limit)
    return [_to_summary(doc) for doc in query.stream()]


def get_conversation(conversation_id: str) -> dict | None:
    snapshot = _collection().document(conversation_id).get()
    if not snapshot.exists:
        return None
    return {**_to_summary(snapshot), "messages": snapshot.to_dict().get("messages", [])}


def delete_conversation(conversation_id: str) -> bool:
    document = _collection().document(conversation_id)
    if not document.get().exists:
        return False
    document.delete()
    return True
