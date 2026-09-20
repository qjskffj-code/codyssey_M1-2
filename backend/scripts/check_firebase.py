"""Firestore 연결 확인 (읽기 전용).

실행: backend 폴더에서 `python -m scripts.check_firebase`
"""

from core.firebase import get_db


def main():
    db = get_db()
    names = [c.id for c in db.collections()]
    print("Firestore 연결 성공")
    print("컬렉션:", names if names else "(아직 없음)")


if __name__ == "__main__":
    main()
