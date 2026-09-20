"""공공데이터포털에서 대전 일자별 방문자 수(이동통신 빅데이터)를 받아 CSV로 저장한다.

- 엔드포인트: DataLabService/metcoRegnVisitrDDList (광역 지자체 일자별)
- 지역 필터 파라미터가 없어 전국을 받은 뒤 대전(areaCode=30)만 걸러낸다.
- 구분: 현지인(1) / 외지인(2) / 외국인(3). 외국인은 2020년부터 제공된다.

실행: backend 폴더에서 `python -m scripts.fetch_region_visitors`
"""

import csv
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from core.config import settings

BASE_URL = "https://apis.data.go.kr/B551011/DataLabService/metcoRegnVisitrDDList"
AREA_CODE = "30"  # 대전광역시
FIRST_YEAR, LAST_YEAR = 2018, 2026  # 제공 범위: 2018-01-01 ~ 2026-07-31
ROWS_PER_PAGE = 1000
OUT_PATH = Path(__file__).resolve().parents[1] / "data" / "raw" / "region_visitors.csv"


def service_key() -> str:
    key = settings.data_go_kr_api_key
    if not key:
        raise RuntimeError("DATA_GO_KR_API_KEY가 .env에 없습니다.")
    return urllib.parse.unquote(key) if "%" in key else key


def call(start_ymd: str, end_ymd: str, page: int) -> dict:
    query = urllib.parse.urlencode(
        {
            "serviceKey": service_key(),
            "MobileOS": "ETC",
            "MobileApp": "codyssey",
            "_type": "json",
            "numOfRows": ROWS_PER_PAGE,
            "pageNo": page,
            "startYmd": start_ymd,
            "endYmd": end_ymd,
        }
    )
    try:
        with urllib.request.urlopen(f"{BASE_URL}?{query}") as response:
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}: {error.read().decode('utf-8')[:300]}") from error

    payload = json.loads(text)
    if "response" not in payload:
        raise RuntimeError(f"API 오류: {payload.get('resultMsg', payload)}")
    return payload["response"]["body"]


def fetch_year(year: int) -> list[dict]:
    collected, page = [], 1
    while True:
        body = call(f"{year}0101", f"{year}1231", page)
        items = body["items"]["item"] if body.get("items") else []
        collected.extend(item for item in items if item["areaCode"] == AREA_CODE)
        if page * ROWS_PER_PAGE >= int(body["totalCount"]):
            return collected
        page += 1


def main():
    rows = []
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        yearly = fetch_year(year)
        rows.extend(yearly)
        print(f"  {year}년: {len(yearly)}건")

    rows.sort(key=lambda r: (r["baseYmd"], r["touDivCd"]))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n대전 {len(rows)}건 저장: {OUT_PATH}")
    print(f"기간: {rows[0]['baseYmd']} ~ {rows[-1]['baseYmd']}")


if __name__ == "__main__":
    main()
