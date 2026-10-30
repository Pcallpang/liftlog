import os
import random
import time
import traceback
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
import anthropic
from google import genai
from google.genai import types as genai_types
from workout_reference import format_workout_reference

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=None)

JULY_REFERENCE = """
7/1 (등): 바벨로우 70kg 4x8-10(휴식2분), 랫풀다운 50kg 4x12(1분15초), 시티드로우 40kg 4x12(1분), 원암덤벨로우 24-28kg 3x10-12 양팔(1분), 행잉레그레이즈 4x15-20
7/2 (가슴·어깨): 벤치프레스 80kg 4x6(2분30초), 인클라인덤벨프레스 24-28kg 4x10(1분30초), 케이블크로스오버 4x15(1분), 사이드레터럴레이즈 10-12kg 5x15-20(45초, 드롭세트), 프론트레이즈 3x12, 유산소 25분
7/3 (하체): 레그익스텐션 50kg 4x20, 핵스쿼트 80kg+ 4x12, 레그프레스 160kg 4x15, 워킹런지 6kg 3x20보, 레그컬 40kg 4x12
7/4 (가슴·팔): 체스트프레스머신 50kg 4x12(1분15초), 인클라인체스트프레스머신 40kg 4x12(1분), 케이블크로스오버 7.5kg 4x15(45초), 슈퍼세트[푸쉬다운+바벨컬] 4세트(1분), 슈퍼세트[라잉익스텐션+해머컬] 3세트(1분)
7/5 (등): 랫풀다운 50-65kg 4x12(1분15초), 시티드로우 40-50kg(드롭) 4x12(1분), 원암덤벨로우 24-28kg 3x10-12(1분), 슈퍼세트[페이스풀+리어델트플라이] 4세트(1분), 행잉레그레이즈 4x15-20, 유산소 25-30분
7/8 (가슴·어깨): 벤치프레스 60-80kg 4x10-12(1분30초), 인클라인덤벨프레스 24kg 4x12(1분15초), 케이블크로스오버 4x15(45초), 덤벨숄더프레스 14-18kg 4x12(1분), 유산소+복근
7/11 (가슴·팔): 벤치프레스 60-80kg(70) 4x10-12(1분30초), 인클라인덤벨프레스 20-24kg 4x12(1분15초), 케이블크로스오버 15-20kg 4x15(45초), 슈퍼세트[푸쉬다운20-25kg+바벨컬25kg] 4세트(1분), 슈퍼세트[라잉익스텐션10kg+해머컬10kg] 3세트, 인클라인런닝 30분
7/15 (등·가슴): 벤치프레스 60-80kg 4x10-12(1분30초), 인클라인덤벨프레스 20-24kg 4x12(1분15초), 케이블크로스오버 3x15(1분), 랫풀다운 50-65kg 4x12-15(1분), 바벨로우 60-80kg 4x10-12(1분30초), 시티드케이블로우 3x12(1분)
""".strip()

SYSTEM_PROMPT_TEMPLATE = """당신은 친절하고 전문적인 퍼스널 트레이너 AI입니다. 사용자의 프로필과 최근 운동 기록을 바탕으로 오늘 할 운동을 추천하고, 대화를 통해 조정합니다.

[사용자 프로필]
키: {height}cm, 체중: {weight}kg
3대 운동 1RM - 스쿼트: {squat}kg, 벤치프레스: {bench}kg, 데드리프트: {deadlift}kg

[추천 원칙]
1. 점진적 과부하: 직전에 같은 종목을 성공(목표 반복수 달성)했다면 다음엔 무게를 2.5~5kg 올려 제안. 실패했다면 같은 무게로 재도전 제안.
2. 같은 부위(가슴/등/하체/어깨)를 이틀 연속 추천하지 않기. 최근 기록에 없는 부위를 우선 추천.
3. 스쿼트와 데드리프트처럼 부담이 큰 압축 운동 두 개를 같은 날에 몰아넣지 않기. 하루 추천 종목 수는 웜업/유산소 제외 4~6개 정도로 적당히 제한하기 (한 부위의 보조운동을 전부 나열하지 말고 그날 할 만한 것만 선별).
4. 같은 무게에서 3회 이상 연속으로 목표 반복수를 채우지 못했다면 디로드(무게 약 10% 감량)를 제안.
5. 추천할 때는 종목명, 무게(또는 무게 범위), 세트수, 반복수, 쉬는 시간을 명확히 알려주기. 3대 운동은 1RM 대비 %도 함께 안내.
6. 필요하면 웜업 세트, 슈퍼세트, 드롭세트, 유산소 마무리 운동도 자연스럽게 포함할 수 있음.
7. 사용자가 컨디션(부상, 시간 부족 등)을 이야기하면 그에 맞게 유연하게 조정.
8. [최근 운동 기록]은 앱에 정식으로 저장된 기록이고, 그 외에 이 대화(위쪽 대화 내용)에서 사용자가 언급한 운동(예: "오늘 수영했어", "등산 다녀왔어" 같은 기록되지 않은 활동)도 반드시 함께 고려하세요. 대화에서 언급된 활동이 있다면 그 부위/피로도를 감안해서 오늘 추천을 조정하고, 필요하면 "지난번에 말씀하신 수영 때문에 오늘은 하체보다는 ~"처럼 근거를 짚어주세요.
9. [사용 가능한 운동 종목]은 이 사용자의 앱에 등록된, 실제로 할 수 있는 종목 목록입니다. 추천은 이 목록 위주로 하고, 같은 부위를 또 추천할 때도 최근 기록에서 자주 쓴 종목만 반복하지 말고 같은 부위 안의 다른 종목(다른 머신·각도·그립)으로 로테이션해서 매번 루틴이 다양해지도록 하세요. 목록에 없는 아주 일반적인 보조 운동(맨몸 스트레칭 등)은 필요하면 곁들여도 되지만, 메인 종목은 목록에서 고르세요.
10. 오늘(또는 다음에) 할 구체적인 루틴을 새로 제안하거나 수정해서 다시 제안할 때만, 답변 맨 끝에 앱이 읽는 루틴 블록을 붙이세요. 사용자가 이 블록으로 종목을 하나씩 바로 기록합니다. 형식은 아래와 같고, 블록 앞뒤에 블록에 대한 설명은 쓰지 마세요(화면에서는 숨겨집니다).
```routine
[{{"part": "가슴", "exercise": "벤치프레스", "weight": 70, "sets": 4, "reps": 10}}, {{"part": "유산소·기타", "exercise": "인클라인 런닝머신", "minutes": 25}}]
```
   - part는 [사용 가능한 운동 종목]의 부위 이름, exercise는 그 목록에 적힌 종목 이름을 글자 그대로 쓰세요. 목록에 없는 종목이면 이름만 자연스럽게 쓰면 됩니다.
   - weight는 kg 숫자 하나(범위를 추천했다면 시작 무게), 맨몸 운동이면 weight를 빼세요. reps는 목표 횟수 숫자 하나(범위면 아래쪽 값), sets는 세트 수입니다.
   - 시간으로 하는 운동은 sets·reps 대신 minutes를 쓰세요. 웜업 세트는 블록에 넣지 마세요. 슈퍼세트는 종목을 각각 따로 넣으세요.
   - 단순 질문·잡담·설명에만 답할 때는 블록을 붙이지 마세요.

[참고: 7월 과거 훈련 스타일 예시 - 실제 완료 여부는 불확실하지만 톤과 구성 참고용]
{july_reference}

[사용자 제공 운동 레퍼런스 — 실제 운동 기록과 구분]
{workout_reference}

[사용 가능한 운동 종목]
{available_exercises}

[지난 대화 요약 메모 — 예전 대화를 정리해 둔 것. 8번 원칙의 대화 내용처럼 함께 고려하세요]
{chat_memo}

[최근 운동 기록]
{history_summary}

친근하고 격려하는 말투로, 한국어로 답변하세요. 답변은 너무 길지 않게, 오늘 할 운동 위주로 명확하게 정리해서 알려주세요."""


COMPACT_SYSTEM_PROMPT = """당신은 퍼스널 트레이너 AI의 기억을 정리하는 비서입니다. 사용자가 보낸 [기존 메모]와 [대화 기록]을 읽고, 다음 대화에서 트레이너가 기억해야 할 내용만 하나의 메모로 정리하세요.

[남길 것]
- 부상·통증·컨디션 (언제부터인지 날짜 포함)
- 앱에 기록하지 않고 대화로만 말한 운동·활동 (예: 수영, 등산 — 날짜 포함)
- 좋아하거나 싫어하는 종목·장비, 운동 가능 시간 같은 제약
- 목표와 트레이너와 합의한 계획

[뺄 것]
- 앱에 저장되는 운동 기록과 겹치는 세트별 무게·횟수
- 인사·잡담, 지나간 하루치 루틴 전체 나열
- 이미 끝났거나 뒤집힌 내용 (기존 메모에 있어도 지우기)

[형식]
- 날짜는 YYYY-MM-DD로 쓰기. "어제"·"오늘"은 대화 기록의 날짜를 보고 실제 날짜로 바꾸기
- "- "로 시작하는 짧은 항목 12개 이하, 전체 600자 이내
- 메모 내용만 쓰고 다른 말은 쓰지 않기. 남길 내용이 없으면 "- 특별히 기억할 내용 없음"이라고만 쓰기"""

MEMO_MAX_CHARS = 2000


def format_history(history):
    if not history:
        return "아직 기록된 운동이 없습니다."

    sorted_history = sorted(
        history, key=lambda e: (e.get("date", ""), e.get("id", 0)), reverse=True
    )

    lines = []
    for entry in sorted_history[:20]:
        entry_type = entry.get("type", "strength")
        date = entry.get("date")
        exercise = entry.get("exercise")

        if entry_type == "distance_time":
            lines.append(
                f"- {date} {exercise} {entry.get('distanceKm')}km "
                f"{entry.get('durationMinutes')}분"
            )
            continue

        if entry_type == "reps_or_duration" and entry.get("mode") == "duration":
            lines.append(f"- {date} {exercise} {entry.get('durationMinutes')}분")
            continue

        # Each set carries its own weight and target reps. A client running a
        # cached build from before that change sends bare rep counts instead,
        # with one weight/target for the whole entry - read both shapes.
        raw_sets = entry.get("sets", [])
        sets = [
            s
            if isinstance(s, dict)
            else {
                "weight": entry.get("weight"),
                "targetReps": entry.get("targetReps"),
                "reps": s,
            }
            for s in raw_sets
        ]

        success = all(
            (s.get("reps") or 0) >= (s.get("targetReps") or 0) for s in sets
        ) if sets else True
        status = "성공" if success else "일부 실패"

        parts = []
        for s in sets:
            weight_text = (
                f"{s.get('weight')}kg " if entry_type == "strength" else ""
            )
            parts.append(f"{weight_text}{s.get('reps')}/{s.get('targetReps')}회")

        lines.append(
            f"- {date} {exercise} {len(sets)}세트({', '.join(parts)}) [{status}]"
        )
    return "\n".join(lines)


def format_available_exercises(available):
    if not available:
        return "등록된 종목 목록이 없습니다 (일반적인 종목으로 추천하세요)."
    lines = []
    for part, exercises in available.items():
        if exercises:
            lines.append(f"- {part}: {', '.join(exercises)}")
    return "\n".join(lines) if lines else "등록된 종목 목록이 없습니다 (일반적인 종목으로 추천하세요)."


@app.after_request
def set_security_headers(response):
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
    )
    return response


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename in (
        "style.css",
        "app.js",
        "marked.min.js",
        "manifest.json",
        "sw.js",
        "favicon.ico",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
        "privacy.html",
    ):
        return send_from_directory(BASE_DIR, filename)
    return "Not Found", 404


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(BASE_DIR / "assets", filename)


def call_claude(api_key, system_prompt, messages):
    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=8192,
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},
            system=system_prompt,
            messages=messages,
        )
    except anthropic.AuthenticationError:
        return None, "Claude API 키가 유효하지 않아요. API 설정에서 키를 확인해주세요.", 401
    except anthropic.APIStatusError as e:
        return None, f"Claude API 오류: {e.message}", 502
    except anthropic.APIConnectionError:
        return None, "Claude API에 연결할 수 없어요. 인터넷 연결을 확인해주세요.", 502
    except Exception as e:
        return None, f"Claude API 호출 중 오류가 발생했어요: {e}", 502

    if response.stop_reason == "refusal":
        return None, "죄송해요, 이 요청에는 답변할 수 없어요. 다르게 물어봐 주세요.", 200

    reply_text = "".join(block.text for block in response.content if block.type == "text")
    return reply_text, None, None


GEMINI_MAX_ATTEMPTS = 3  # 모델 하나당 첫 시도 + 재시도 2번
# 앞의 모델이 계속 과부하면 뒤의 모델로 넘어간다. 환경변수로 교체 가능.
GEMINI_MODELS = [
    m.strip()
    for m in os.environ.get("GEMINI_MODELS", "gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash").split(",")
    if m.strip()
]


def call_gemini(api_key, system_prompt, messages):
    try:
        client = genai.Client(api_key=api_key)
        contents = []
        for m in messages:
            part = genai_types.Part.from_text(text=m.get("content", ""))
            if m.get("role") == "user":
                contents.append(genai_types.UserContent(parts=[part]))
            else:
                contents.append(genai_types.ModelContent(parts=[part]))

        response = None
        for model_index, model in enumerate(GEMINI_MODELS):
            last_model = model_index == len(GEMINI_MODELS) - 1
            for attempt in range(GEMINI_MAX_ATTEMPTS):
                try:
                    response = client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
                    )
                    break
                except genai.errors.ServerError as e:
                    # 503(과부하) 같은 일시적 오류는 지수 백오프로 재시도
                    app.logger.warning("Gemini %s server error (attempt %d): %s", model, attempt + 1, e)
                    if attempt == GEMINI_MAX_ATTEMPTS - 1:
                        if last_model:
                            return None, "Gemini 서버가 계속 혼잡해요. 잠시 후 다시 시도하거나 Claude로 바꿔서 물어봐 주세요.", 503
                        break  # 다음 모델로
                    time.sleep(2**attempt + random.uniform(0, 0.5))
                except genai.errors.ClientError as e:
                    if e.code == 404 and not last_model:
                        # 이 모델을 쓸 수 없는 키/지역이면 다음 모델로
                        app.logger.warning("Gemini %s unavailable: %s", model, e)
                        break
                    if e.code != 429 or attempt == GEMINI_MAX_ATTEMPTS - 1:
                        raise
                    time.sleep(2**attempt + random.uniform(0, 0.5))
            if response is not None:
                break
    except genai.errors.ClientError as e:
        if e.code == 401 or e.code == 403:
            return None, "Gemini API 키가 유효하지 않아요. API 설정에서 키를 확인해주세요.", 401
        if e.code == 429:
            return None, "Gemini API 사용량 한도를 초과했어요. 잠시 후 다시 시도해주세요.", 429
        return None, f"Gemini API 오류: {e.message}", 502
    except Exception as e:
        return None, f"Gemini API 호출 중 오류가 발생했어요: {e}", 502

    if not response.text:
        return None, "Gemini가 응답을 생성하지 못했어요. 다르게 물어봐 주세요.", 200

    return response.text, None, None


@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json(force=True, silent=True) or {}
        profile = data.get("profile") or {}
        history = data.get("history") or []
        available_exercises = data.get("availableExercises") or {}
        messages = data.get("messages") or []
        chat_memo = str(data.get("memo") or "").strip()[:MEMO_MAX_CHARS]
        provider = data.get("provider") or "claude"
        client_api_key = (data.get("apiKey") or "").strip()

        if not profile:
            return jsonify({"error": "프로필 정보가 없습니다."}), 400
        if not messages:
            return jsonify({"error": "메시지가 없습니다."}), 400

        one_rm = profile.get("oneRM") or {}
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            height=profile.get("height"),
            weight=profile.get("weight"),
            squat=one_rm.get("squat"),
            bench=one_rm.get("bench"),
            deadlift=one_rm.get("deadlift"),
            july_reference=JULY_REFERENCE,
            workout_reference=format_workout_reference(),
            available_exercises=format_available_exercises(available_exercises),
            chat_memo=chat_memo or "없음",
            history_summary=format_history(history),
        )

        if not client_api_key:
            return jsonify(
                {"error": "API 키가 없어요. 화면 상단의 'API 설정'에서 본인의 Claude 또는 Gemini API 키를 입력해주세요."}
            ), 400

        if provider == "gemini":
            reply_text, error, status = call_gemini(client_api_key, system_prompt, messages)
        else:
            reply_text, error, status = call_claude(client_api_key, system_prompt, messages)

        if error:
            return jsonify({"error": error}), status

        return jsonify({"reply": reply_text})
    except Exception:
        # Last-resort net: any unhandled exception here would otherwise fall
        # through to Flask's HTML 500 page, which the client can't parse as
        # JSON and shows only a generic fallback message. Log the real
        # traceback server-side and still hand back JSON the client can show.
        traceback.print_exc()
        return jsonify({"error": "서버에서 오류가 발생했어요. 잠시 후 다시 시도해주세요."}), 500


@app.route("/api/compact", methods=["POST"])
def compact():
    """Folds the chat so far (plus any earlier memo) into one short memo.

    The client clears its chat once this succeeds and sends the memo with
    every later /api/chat call, so the trainer keeps what mattered without
    replaying the whole conversation."""
    try:
        data = request.get_json(force=True, silent=True) or {}
        transcript = str(data.get("transcript") or "").strip()
        previous_memo = str(data.get("memo") or "").strip()[:MEMO_MAX_CHARS]
        provider = data.get("provider") or "claude"
        client_api_key = (data.get("apiKey") or "").strip()

        if not transcript:
            return jsonify({"error": "요약할 대화가 없어요."}), 400
        if not client_api_key:
            return jsonify(
                {"error": "API 키가 없어요. 설정 탭의 'API 설정'에서 키를 입력해주세요."}
            ), 400

        request_text = (
            f"[기존 메모]\n{previous_memo or '없음'}\n\n[대화 기록]\n{transcript}"
        )
        messages = [{"role": "user", "content": request_text}]

        if provider == "gemini":
            memo, error, status = call_gemini(client_api_key, COMPACT_SYSTEM_PROMPT, messages)
        else:
            memo, error, status = call_claude(client_api_key, COMPACT_SYSTEM_PROMPT, messages)

        if error:
            return jsonify({"error": error}), status

        return jsonify({"memo": memo.strip()[:MEMO_MAX_CHARS]})
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "서버에서 오류가 발생했어요. 잠시 후 다시 시도해주세요."}), 500


if __name__ == "__main__":
    # host="0.0.0.0" so phones on the same Wi-Fi can reach this via the PC's LAN IP.
    # Debug mode's interactive debugger is exposed on the network this way too -
    # fine on a trusted home network, but don't do this on a public/shared Wi-Fi.
    app.run(host="0.0.0.0", debug=True, port=5000)
