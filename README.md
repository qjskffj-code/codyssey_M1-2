# 대전 관광 AI 비서

"성심당 인기가 올라가면 대전 관광객도 늘어날까?"

공개 데이터로 만든 **대전 방문자 수 + 성심당 검색 관심도** 데이터셋을 Firestore에 저장하고,
그 요약을 GPT의 시스템 프롬프트에 주입해 **내 데이터를 근거로 답하는 AI 비서**를 만든 프로젝트입니다.

일반적인 챗봇은 "대전 관광객이 늘었나요?"에 일반론으로 답하지만, 이 서비스는
실제 저장된 102개월치 데이터의 평균·추세·상관계수를 근거로 답하고, 집계 기간이 다른 지표는
기간까지 함께 밝혀서 답합니다.

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 백엔드 | FastAPI, Pydantic, Uvicorn |
| 데이터베이스 | Firebase Firestore |
| AI | OpenAI GPT (chat completions) |
| 프론트엔드 | HTML / CSS / JavaScript (프레임워크 미사용) |
| 배포 | 백엔드 Render, 프론트엔드 Vercel |

## 배포 URL

| 대상 | URL |
|---|---|
| 프론트엔드 | <https://codyssey-m1-2-theta.vercel.app> |
| 백엔드 API | <https://codyssey-m1-2-vix0.onrender.com> |
| Swagger UI | <https://codyssey-m1-2-vix0.onrender.com/docs> |

> 백엔드는 Render 무료 인스턴스라 15분간 요청이 없으면 잠듭니다.
> 첫 요청은 30초~1분 걸릴 수 있어, 프론트엔드가 화면을 열 때 `/health`를 먼저 호출해 서버를 깨우고
> 그동안 안내 문구를 표시합니다.

## 데이터

| 항목 | 내용 | 출처 |
|---|---|---|
| `value` | 대전 외지인 방문자 일평균 (2018-01 ~ 2026-06, **102개월**) | 공공데이터포털 한국관광공사 빅데이터 지역별 방문자수 |
| `ref_value` | "성심당" 검색 지수 (최댓값 100 기준) | 네이버 데이터랩 검색어 트렌드 |
| `foreign_value` | 대전 외국인 방문자 일평균 (2020-01 ~) | 위와 동일 |
| `junggu_share` | 대전 5개 구 중 중구(성심당 소재) 방문자 비중 (2024-01 ~) | 공공데이터포털 기초 지자체 방문자수 |
| `memo` | 코로나 조치, 대전 0시 축제 등 해석에 필요한 사건 | 직접 작성 |

지표마다 제공 기간이 달라, 값이 없는 달은 0이 아니라 필드를 비워둡니다.
요약 API는 상관계수를 계산한 구간을 함께 응답합니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 (콜드스타트 대비) |
| GET | `/api/data` | 데이터 목록 조회 |
| POST | `/api/data` | 데이터 추가 |
| PUT | `/api/data/{id}` | 데이터 수정 |
| DELETE | `/api/data/{id}` | 데이터 삭제 |
| GET | `/api/data/summary` | 요약 정보 (통계·추세·상관계수·사건, 프롬프트 주입용) |
| POST | `/api/chat` | AI 대화 (요약 주입 + 대화 자동 저장) |
| GET | `/api/conversations` | 대화 목록 (본문 제외) |
| POST | `/api/conversations` | 대화 저장 |
| GET | `/api/conversations/{id}` | 특정 대화 전체 조회 |
| DELETE | `/api/conversations/{id}` | 대화 삭제 |

## 로컬 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
uvicorn main:app --reload
```

실행 후 <http://localhost:8000/docs> 에서 API를 확인할 수 있습니다.

## 환경 변수

| 이름 | 설명 | 필수 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API 키 | ✅ |
| `OPENAI_MODEL` | 사용할 모델 (기본 `gpt-4.1-mini`) | |
| `OPENAI_MAX_TOKENS` | 응답 토큰 상한 (기본 500) | |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | 서비스 계정 JSON 경로 (로컬용) | 둘 중 하나 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 서비스 계정 JSON 문자열 (배포용) | 둘 중 하나 |
| `ALLOWED_ORIGINS` | CORS 허용 도메인, 쉼표 구분 | ✅ |
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키 (데이터 수집 스크립트 전용) | |

키는 모두 환경 변수로만 관리하며 코드나 저장소에 포함하지 않습니다.

## 데이터 수집·적재 스크립트

`backend` 폴더에서 실행합니다. 실행 전 `pip install -r requirements-dev.txt`가 필요합니다.

```bash
python -m scripts.check_firebase          # Firestore 연결 확인
python -m scripts.fetch_region_visitors   # 대전 광역 일별 방문자 수집
python -m scripts.fetch_district_visitors # 대전 5개 구 일별 방문자 수집
python -m scripts.prepare_dataset         # 원본 → 월별 데이터셋 정제
python -m scripts.seed_firestore          # Firestore 적재
```

## 화면 구성

프레임워크 없이 HTML/CSS/JavaScript로 구현했습니다.

- **데이터 요약**: 기간, 개수, 평균·최대·최소·최근, 전년 동기 대비 추세, 상관계수 3종
- **추이 그래프**: 방문자 수와 검색 지수를 이중 축으로 그린 순수 SVG 라인 차트.
  메모가 있는 달은 점으로 표시하고, 마우스를 올리면 해당 월 수치와 사건을 보여줍니다.
- **데이터 관리**: 추가 / 수정 / 삭제, CSV 내보내기
- **AI 채팅**: 로딩 표시, 대화 이어가기, 콜드스타트 안내
- **대화 기록**: 목록 조회, 불러오기, 삭제
- **다크 모드**: 토글 및 브라우저 설정 자동 감지

## 컨텍스트 주입 방식

`POST /api/chat`은 다음 순서로 동작합니다.

1. `build_summary()`로 요약 계산 (통계 + 추세 + 상관계수 + memo 기반 사건 목록)
2. 요약을 시스템 프롬프트에 삽입
3. 직전 대화 최대 10개와 함께 GPT 호출
4. 질문과 답변을 `conversations`에 자동 저장

사건 목록을 함께 주입하는 것이 핵심입니다. 이것이 없으면 "2020년에 왜 줄었어?"라는 질문에
"데이터에 없습니다"라고 답하지만, 주입한 뒤에는 코로나19 확산과 거리두기 시행을 근거로 설명합니다.

## 보너스 구현

- 요약 API 확장: 상관계수 3종(성심당 검색 지수 / 외국인 방문자 / 중구 방문자 비중) + 사건 목록
- 프론트엔드 시각화: 순수 SVG 이중 축 라인 차트
- 데이터 내보내기: CSV 다운로드
- 다크 모드 토글
