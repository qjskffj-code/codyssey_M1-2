"""Firestore의 data 컬렉션 CRUD."""

from core.firebase import get_db

COLLECTION = "data"


def _collection():
    return get_db().collection(COLLECTION)


def list_data(limit: int | None = None) -> list[dict]:
    """date 오름차순으로 조회한다."""
    query = _collection().order_by("date")
    if limit:
        query = query.limit(limit)
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def create_data(payload: dict) -> dict:
    """문서 ID를 date로 쓰면 같은 달을 두 번 넣는 실수를 막을 수 있다."""
    document = _collection().document(payload["date"])
    if document.get().exists:
        return {}
    document.set(payload)
    return {"id": document.id, **payload}


def update_data(doc_id: str, payload: dict) -> dict | None:
    document = _collection().document(doc_id)
    if not document.get().exists:
        return None
    document.update(payload)
    return {"id": doc_id, **document.get().to_dict()}


def delete_data(doc_id: str) -> bool:
    document = _collection().document(doc_id)
    if not document.get().exists:
        return False
    document.delete()
    return True
