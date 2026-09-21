"""원본 데이터 3종을 월별 데이터셋으로 정제한다.

입력 (data/raw/)
  - region_visitors.csv   : 대전 광역 일별 방문자 (2018-01 ~, 외지인/외국인)
  - datalab.xlsx          : '성심당' 일별 검색 지수 (2016-01 ~)
  - district_visitors.csv : 대전 5개 구 일별 방문자 (2024-01 ~)

출력 (data/processed/dataset.json)
  date(YYYY-MM), value, ref_value, foreign_value?, junggu_share?, memo

지표마다 제공 기간이 다르므로, 없는 달은 0이 아니라 아예 필드를 넣지 않는다.

실행: backend 폴더에서 `python -m scripts.prepare_dataset`
"""

import csv
import json
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")

import openpyxl

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"
OUT_PATH = BASE_DIR / "data" / "processed" / "dataset.json"

# 해석에 도움이 되는 주요 사건. AI가 답변 근거로 사용한다.
EVENTS = {
    "2020-02": "코로나19 대구 집단감염, 위기경보 심각 격상",
    "2020-03": "강화된 사회적 거리두기 시행(3.22)",
    "2021-07": "코로나19 4차 유행, 수도권 거리두기 4단계(7.12)",
    "2022-04": "사회적 거리두기 전면 해제(4.18)",
    "2023-01": "실내 마스크 의무 해제(1.30)",
    "2023-08": "제1회 대전 0시 축제(8.11~17)",
    "2024-04": "성심당 대전역점 임대료 논란 시작(코레일유통 입찰)",
    "2024-05": "임대료 논란 확산, 성심당 검색 지수 최고치",
    "2024-08": "제2회 대전 0시 축제(8.9~17)",
    "2024-09": "성심당 대전역점 임대료 월 1.3억으로 타결",
    "2025-08": "제3회 대전 0시 축제(8.8~16)",
}


def monthly_mean(rows: dict[str, float]) -> dict[str, float]:
    grouped = defaultdict(list)
    for day, value in rows.items():
        grouped[day[:7]].append(value)
    return {month: sum(values) / len(values) for month, values in grouped.items()}


def load_region() -> tuple[dict[str, float], dict[str, float]]:
    """광역 대전의 외지인 / 외국인 일별 방문자를 월평균으로 집계한다."""
    outsiders, foreigners = {}, {}
    with (RAW_DIR / "region_visitors.csv").open(encoding="utf-8") as file:
        for row in csv.DictReader(file):
            day = row["baseYmd"]
            day = f"{day[:4]}-{day[4:6]}-{day[6:]}"
            if row["touDivCd"] == "2":
                outsiders[day] = float(row["touNum"])
            elif row["touDivCd"] == "3":
                foreigners[day] = float(row["touNum"])
    return monthly_mean(outsiders), monthly_mean(foreigners)


def load_search() -> dict[str, float]:
    """일별 검색 지수를 월별로 합산한 뒤 최댓값 100 기준으로 환산한다."""
    sheet = openpyxl.load_workbook(RAW_DIR / "datalab.xlsx").worksheets[0]
    monthly = defaultdict(float)
    for day, ratio in sheet.iter_rows(values_only=True):
        try:
            monthly[str(day)[:7]] += float(ratio)
        except (TypeError, ValueError):
            continue  # 파일 앞쪽 메타데이터 행
    peak = max(monthly.values())
    return {month: round(value / peak * 100, 2) for month, value in monthly.items()}


def load_junggu_share() -> dict[str, float]:
    """대전 5개 구 외지인 합계 중 중구(성심당 소재)가 차지하는 비율."""
    by_district = defaultdict(dict)
    with (RAW_DIR / "district_visitors.csv").open(encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row["touDivCd"] != "2":
                continue
            day = row["baseYmd"]
            by_district[row["signguNm"]][f"{day[:4]}-{day[4:6]}-{day[6:]}"] = float(row["touNum"])

    monthly = {name: monthly_mean(days) for name, days in by_district.items()}
    months = set.intersection(*(set(values) for values in monthly.values()))
    return {
        month: round(monthly["중구"][month] / sum(m[month] for m in monthly.values()) * 100, 2)
        for month in months
    }


def main():
    outsiders, foreigners = load_region()
    search = load_search()
    junggu = load_junggu_share()

    months = sorted(set(outsiders) & set(search))
    records = []
    for month in months:
        record = {
            "date": month,
            "value": round(outsiders[month]),
            "ref_value": search[month],
            "memo": EVENTS.get(month, ""),
        }
        if month in foreigners:
            record["foreign_value"] = round(foreigners[month])
        if month in junggu:
            record["junggu_share"] = junggu[month]
        records.append(record)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{len(records)}개월 저장: {OUT_PATH}")
    print(f"기간: {months[0]} ~ {months[-1]}")
    print(f"외국인 값 있는 달: {sum('foreign_value' in r for r in records)}")
    print(f"중구 비중 값 있는 달: {sum('junggu_share' in r for r in records)}")
    print(f"메모 있는 달: {sum(bool(r['memo']) for r in records)}")
    print("\n[샘플]")
    for record in (records[0], records[len(records) // 2], records[-1]):
        print("  ", json.dumps(record, ensure_ascii=False))


if __name__ == "__main__":
    main()
