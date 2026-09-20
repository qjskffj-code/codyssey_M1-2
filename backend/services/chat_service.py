"""데이터 요약을 시스템 프롬프트에 주입해 GPT와 대화한다.

흐름: 요약 조회 → 시스템 프롬프트 구성 → GPT 호출 → conversations에 자동 저장
"""

from openai import OpenAI, OpenAIError

from core.config import settings
from services import analytics, conversation_service

HISTORY_LIMIT = 10  # 프롬프트에 함께 보낼 직전 메시지 수 (토큰 절약)

SYSTEM_TEMPLATE = """당신은 '{subject}' 데이터를 분석하는 비서입니다.

[사용자 데이터 요약]
- 분석 기간: {period}
- 데이터 개수: {count}개월
- 방문자 지표: 평균 {average:,}명 / 최대 {max:,}명 / 최소 {min:,}명 / 최근 {latest:,}명
- 최근 추세: {trend}
- 지표 간 상관관계:
{correlations}

[데이터에 기록된 주요 사건]
{events}

[해석 시 주의사항]
{notes}

규칙:
- 위 데이터에 근거해서만 답하고, 없는 수치를 지어내지 마세요.
- 상관관계를 인과관계로 단정하지 마세요.
- 지표마다 집계 기간이 다르므로 기간을 함께 언급하세요.
- 한국어로 3~5문장 이내로 간결하게 답하세요."""


def build_system_prompt(summary: dict) -> str:
    correlations = "\n".join(
        f"  - {item['metric']}: r={item['r']} ({item['description']}, {item['period']}, {item['count']}개월)"
        for item in summary["correlations"]
    ) or "  - 계산할 수 있는 상관관계가 없습니다."

    events = "\n".join(
        f"  - {item['date']}: {item['memo']} (해당 월 방문자 {item['value']:,}명)"
        for item in summary["events"]
    ) or "  - 기록된 사건이 없습니다."

    notes = "\n".join(f"  - {note}" for note in summary["notes"])

    return SYSTEM_TEMPLATE.format(
        subject=summary["subject"],
        period=summary["period"],
        count=summary["count"],
        average=round(summary["metrics"]["average"]),
        max=round(summary["metrics"]["max"]),
        min=round(summary["metrics"]["min"]),
        latest=round(summary["metrics"]["latest"]),
        trend=summary["trend"]["description"],
        correlations=correlations,
        events=events,
        notes=notes,
    )


def ask_gpt(system_prompt: str, history: list[dict], question: str) -> str:
    client = OpenAI(api_key=settings.openai_api_key)
    messages = [{"role": "system", "content": system_prompt}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history[-HISTORY_LIMIT:]]
    messages.append({"role": "user", "content": question})

    completion = client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        max_completion_tokens=settings.openai_max_tokens,
    )
    return (completion.choices[0].message.content or "").strip()


def chat(question: str, conversation_id: str | None = None) -> dict:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY가 설정되어 있지 않습니다.")

    summary = analytics.build_summary()
    system_prompt = build_system_prompt(summary)

    history = []
    if conversation_id:
        conversation = conversation_service.get_conversation(conversation_id)
        if conversation is None:
            raise LookupError("대화를 찾을 수 없습니다.")
        history = conversation["messages"]

    try:
        answer = ask_gpt(system_prompt, history, question)
    except OpenAIError as error:
        raise RuntimeError(f"GPT 호출에 실패했습니다: {error}") from error

    new_messages = [
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]
    if conversation_id:
        conversation_service.append_messages(conversation_id, new_messages)
    else:
        conversation_id = conversation_service.create_conversation(new_messages)["id"]

    return {
        "conversation_id": conversation_id,
        "answer": answer,
        "summary_period": summary["period"],
        "model": settings.openai_model,
    }
