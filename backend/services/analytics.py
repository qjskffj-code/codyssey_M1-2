"""저장된 데이터에서 요약 정보를 만든다. 챗봇 프롬프트 주입에도 이 결과를 쓴다."""

from services.data_service import list_data

SUBJECT = "대전 방문자 수와 성심당 검색 관심도"
TREND_THRESHOLD = 2.0  # % 이내 변화는 '유지'로 본다
MIN_SAMPLES = 12  # 상관계수를 계산할 최소 표본 수

REF_LABELS = {
    "ref_value": "성심당 검색 지수",
    "foreign_value": "외국인 방문자",
    "junggu_share": "중구(성심당 소재) 방문자 비중",
}

NOTES = [
    "방문자 수는 이동통신 기반 추정치로, 같은 사람이 여러 날 방문하면 중복 집계된다.",
    "성심당 검색 지수는 실제 방문이 아니라 관심도를 나타내는 상대 지표(최댓값 100)다.",
    "지표마다 제공 기간이 달라 상관계수는 겹치는 구간에서만 계산한다.",
    "상관관계는 인과관계를 뜻하지 않는다.",
]


def correlation(xs: list[float], ys: list[float]) -> float | None:
    """피어슨 상관계수. 표본이 너무 적으면 계산하지 않는다."""
    if len(xs) < MIN_SAMPLES:
        return None

    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    dx = [x - mean_x for x in xs]
    dy = [y - mean_y for y in ys]
    denominator = (sum(d * d for d in dx) * sum(d * d for d in dy)) ** 0.5
    if denominator == 0:
        return None
    return round(sum(a * b for a, b in zip(dx, dy)) / denominator, 3)


def describe_correlation(r: float) -> str:
    strength = abs(r)
    if strength >= 0.7:
        level = "강한"
    elif strength >= 0.4:
        level = "뚜렷한"
    elif strength >= 0.2:
        level = "약한"
    else:
        level = "거의 없는"
    return f"{level} {'양' if r > 0 else '음'}의 상관관계"


def build_trend(records: list[dict]) -> dict:
    """최근 3개월 평균을 1년 전 같은 3개월과 비교한다.

    방문자 수는 계절성이 강해서 직전 3개월과 비교하면 계절 변동을 추세로 오해하게 된다.
    1년 치가 모이지 않은 경우에만 직전 3개월과 비교한다.
    비교 구간을 응답에 함께 담아야 AI가 기간을 추측하지 않는다.
    """
    if len(records) < 6:
        return {"direction": "판단 불가", "change_rate": 0.0, "description": "데이터가 부족합니다."}

    values = [record["value"] for record in records]
    months = [record["date"] for record in records]

    recent = sum(values[-3:]) / 3
    if len(values) >= 15:
        previous_slice = slice(-15, -12)
        basis = "전년 동기"
    else:
        previous_slice = slice(-6, -3)
        basis = "직전 3개월"

    previous = sum(values[previous_slice]) / 3
    rate = round((recent / previous - 1) * 100, 1) if previous else 0.0
    recent_label = f"{months[-3]}~{months[-1]}"
    previous_label = f"{months[previous_slice][0]}~{months[previous_slice][-1]}"

    if rate > TREND_THRESHOLD:
        direction = "증가"
    elif rate < -TREND_THRESHOLD:
        direction = "감소"
    else:
        direction = "유지"

    return {
        "direction": direction,
        "change_rate": rate,
        "description": (
            f"최근 3개월({recent_label}) 평균이 {basis}({previous_label}) 대비 "
            f"{rate:+.1f}% ({direction})"
        ),
    }


def build_correlations(records: list[dict]) -> list[dict]:
    results = []
    for field, label in REF_LABELS.items():
        paired = [r for r in records if r.get(field) is not None]
        r_value = correlation([r["value"] for r in paired], [r[field] for r in paired])
        if r_value is None:
            continue
        results.append(
            {
                "metric": label,
                "r": r_value,
                "period": f"{paired[0]['date']} ~ {paired[-1]['date']}",
                "count": len(paired),
                "description": describe_correlation(r_value),
            }
        )
    return results


def empty_summary() -> dict:
    return {
        "subject": SUBJECT,
        "period": "-",
        "count": 0,
        "metrics": {"average": 0, "max": 0, "min": 0, "latest": 0},
        "trend": {"direction": "판단 불가", "change_rate": 0.0, "description": "데이터가 없습니다."},
        "correlations": [],
        "notes": ["저장된 데이터가 없습니다."],
    }


def build_summary() -> dict:
    records = sorted(list_data(), key=lambda record: record["date"])
    if not records:
        return empty_summary()

    values = [record["value"] for record in records]
    return {
        "subject": SUBJECT,
        "period": f"{records[0]['date']} ~ {records[-1]['date']}",
        "count": len(records),
        "metrics": {
            "average": round(sum(values) / len(values)),
            "max": round(max(values)),
            "min": round(min(values)),
            "latest": round(values[-1]),
        },
        "trend": build_trend(records),
        "correlations": build_correlations(records),
        "notes": NOTES,
    }
