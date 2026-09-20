from fastapi import APIRouter, HTTPException, Query

from schemas.data import DataCreate, DataOut, DataUpdate, SummaryOut
from services import analytics, data_service

router = APIRouter(prefix="/api/data", tags=["data"])


# /{data_id} 보다 먼저 선언해야 summary가 id로 해석되지 않는다.
@router.get("/summary", response_model=SummaryOut)
def get_summary():
    """요약 정보. 챗봇의 시스템 프롬프트에도 그대로 주입된다."""
    return analytics.build_summary()


@router.get("", response_model=list[DataOut])
def get_data(limit: int | None = Query(default=None, ge=1, le=500)):
    return data_service.list_data(limit)


@router.post("", response_model=DataOut, status_code=201)
def post_data(payload: DataCreate):
    created = data_service.create_data(payload.model_dump())
    if not created:
        raise HTTPException(status_code=409, detail=f"{payload.date} 데이터가 이미 있습니다.")
    return created


@router.put("/{data_id}", response_model=DataOut)
def put_data(data_id: str, payload: DataUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="수정할 필드가 없습니다.")

    updated = data_service.update_data(data_id, changes)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"{data_id} 데이터를 찾을 수 없습니다.")
    return updated


@router.delete("/{data_id}", status_code=204)
def remove_data(data_id: str):
    if not data_service.delete_data(data_id):
        raise HTTPException(status_code=404, detail=f"{data_id} 데이터를 찾을 수 없습니다.")
