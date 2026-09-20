"""환경 변수를 한 곳에서 읽어 설정 객체로 제공한다."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    openai_max_tokens: int = int(os.getenv("OPENAI_MAX_TOKENS", "500"))

    firebase_service_account_path: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    firebase_service_account_json: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

    data_go_kr_api_key: str = os.getenv("DATA_GO_KR_API_KEY", "")

    allowed_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500")
        )
    )


settings = Settings()
