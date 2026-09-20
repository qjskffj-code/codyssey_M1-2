"""정제된 데이터셋을 Firestore의 data 컬렉션에 적재한다.

문서 ID를 date(YYYY-MM)로 쓰기 때문에 여러 번 실행해도 중복이 생기지 않는다.

실행: backend 폴더에서 `python -m scripts.seed_firestore`
"""

import json
from pathlib import Path

from core.firebase import get_db

DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "processed" / "dataset.json"
COLLECTION = "data"
BATCH_LIMIT = 500  # Firestore 배치 쓰기 상한


def main():
    records = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    db = get_db()
    collection = db.collection(COLLECTION)

    for start in range(0, len(records), BATCH_LIMIT):
        batch = db.batch()
        for record in records[start : start + BATCH_LIMIT]:
            batch.set(collection.document(record["date"]), record)
        batch.commit()
        print(f"  {min(start + BATCH_LIMIT, len(records))}/{len(records)} 완료")

    print(f"\n적재 완료: {COLLECTION} 컬렉션 {len(records)}건")
    print("확인:", collection.document(records[-1]["date"]).get().to_dict())


if __name__ == "__main__":
    main()
