"""Firestore 클라이언트 초기화.

서비스 계정 키는 코드에 넣지 않고 환경 변수로만 받는다.
- 로컬: FIREBASE_SERVICE_ACCOUNT_PATH (JSON 파일 경로)
- 배포: FIREBASE_SERVICE_ACCOUNT_JSON (JSON 문자열)
"""

import json

import firebase_admin
from firebase_admin import credentials, firestore

from core.config import settings

_db = None


def _load_credentials() -> credentials.Certificate:
    if settings.firebase_service_account_json:
        return credentials.Certificate(json.loads(settings.firebase_service_account_json))
    if settings.firebase_service_account_path:
        return credentials.Certificate(settings.firebase_service_account_path)
    raise RuntimeError(
        "Firebase 서비스 계정 정보가 없습니다. "
        "FIREBASE_SERVICE_ACCOUNT_JSON 또는 FIREBASE_SERVICE_ACCOUNT_PATH를 설정하세요."
    )


def get_db():
    """Firestore 클라이언트를 최초 호출 시 한 번만 만들어 재사용한다."""
    global _db
    if _db is None:
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(_load_credentials())
        _db = firestore.client()
    return _db
