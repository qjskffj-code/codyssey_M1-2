"""데이터 CRUD 요청/응답 스키마.

date는 월 단위(YYYY-MM)로 다룬다. 보조 지표는 제공 기간이 서로 달라서
값이 없는 달은 0이 아니라 None으로 둔다.
"""

from pydantic import BaseModel, Field


class DataCreate(BaseModel):
    date: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")
    value: float = Field(ge=0, description="대전 외지인 방문자 일평균")
    memo: str = Field(default="", max_length=200)
    ref_value: float | None = Field(default=None, ge=0, description="성심당 검색 지수(0~100)")
    foreign_value: float | None = Field(default=None, ge=0, description="외국인 방문자 일평균")
    junggu_share: float | None = Field(default=None, ge=0, le=100, description="중구 비중(%)")


class DataUpdate(BaseModel):
    """부분 수정. 전달된 필드만 반영한다."""

    value: float | None = Field(default=None, ge=0)
    memo: str | None = Field(default=None, max_length=200)
    ref_value: float | None = Field(default=None, ge=0)
    foreign_value: float | None = Field(default=None, ge=0)
    junggu_share: float | None = Field(default=None, ge=0, le=100)


class DataOut(DataCreate):
    id: str


class Metrics(BaseModel):
    average: float
    max: float
    min: float
    latest: float


class Trend(BaseModel):
    direction: str
    change_rate: float
    description: str


class Correlation(BaseModel):
    metric: str
    r: float
    period: str
    count: int
    description: str


class Event(BaseModel):
    date: str
    memo: str
    value: float


class SummaryOut(BaseModel):
    subject: str
    period: str
    count: int
    metrics: Metrics
    trend: Trend
    correlations: list[Correlation]
    events: list[Event]
    notes: list[str]
