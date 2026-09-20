from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    """서버 상태 확인용. 프론트에서 Render 콜드스타트를 깨우는 용도로도 쓴다."""
    return {"status": "ok"}
