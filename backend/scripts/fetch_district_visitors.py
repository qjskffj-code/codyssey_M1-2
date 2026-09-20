"""대전 5개 구의 일별 방문자 수를 받아 CSV로 저장한다. (기초 지자체 API)

전국 264개 시군구가 한꺼번에 내려오므로(하루 792건) 호출량이 크다.
개발계정 하루 1,000건 한도를 넘지 않도록 기간을 제한해서 쓴다.

실행: backend 폴더에서 `python -m scripts.fetch_district_visitors`
"""

import csv
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from core.config import settings

BASE_URL = "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList"
AREA_PREFIX = "30"  # 대전광역시 시군구 코드 접두사
START, END = date(2024, 1, 1), date(2026, 8, 21)
CHUNK_DAYS = 10  # 한 번에 조회할 일수
OUT_PATH = Path(__file__).resolve().parents[1] / "data" / "raw" / "district_visitors.csv"


def service_key() -> str:
    key = settings.data_go_kr_api_key
    if not key:
        raise RuntimeError("DATA_GO_KR_API_KEY가 .env에 없습니다.")
    return urllib.parse.unquote(key) if "%" in key else key


def call(start: date, end: date, page: int) -> dict:
    query = urllib.parse.urlencode(
        {
            "serviceKey": service_key(),
            "MobileOS": "ETC",
            "MobileApp": "codyssey",
            "_type": "json",
            "numOfRows": 1000,
            "pageNo": page,
            "startYmd": start.strftime("%Y%m%d"),
            "endYmd": end.strftime("%Y%m%d"),
        }
    )
    with urllib.request.urlopen(f"{BASE_URL}?{query}") as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "response" not in payload:
        raise RuntimeError(f"API 오류: {payload.get('resultMsg', payload)}")
    return payload["response"]["body"]


def main():
    rows, cursor, calls = [], START, 0
    while cursor <= END:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS - 1), END)
        page = 1
        while True:
            body = call(cursor, chunk_end, page)
            calls += 1
            items = body["items"]["item"] if body.get("items") else []
            rows.extend(i for i in items if i["signguCode"].startswith(AREA_PREFIX))
            if page * 1000 >= int(body["totalCount"]):
                break
            page += 1
        if cursor.day == 1:
            print(f"  {cursor:%Y-%m} 진행 중… (누적 {len(rows)}건, 호출 {calls}회)", flush=True)
        cursor = chunk_end + timedelta(days=1)

    rows.sort(key=lambda r: (r["baseYmd"], r["signguCode"], r["touDivCd"]))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n대전 5개 구 {len(rows)}건 저장 (API 호출 {calls}회): {OUT_PATH}")
    print(f"기간: {rows[0]['baseYmd']} ~ {rows[-1]['baseYmd']}")


if __name__ == "__main__":
    main()
