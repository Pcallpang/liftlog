from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
import anthropic
from google import genai
from google.genai import types as genai_types

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

[참고: 7월 과거 훈련 스타일 예시 - 실제 완료 여부는 불확실하지만 톤과 구성 참고용]
{july_reference}

[최근 운동 기록]
{history_summary}

친근하고 격려하는 말투로, 한국어로 답변하세요. 답변은 너무 길지 않게, 오늘 할 운동 위주로 명확하게 정리해서 알려주세요."""


def format_history(history):
    if not history:
        return "아직 기록된 운동이 없습니다."

    sorted_history = sorted(
        history, key=lambda e: (e.get("date", ""), e.get("id", 0)), reverse=True
    )

    lines = []
    for entry in sorted_history[:20]:
        sets = entry.get("sets", [])
        target = entry.get("targetReps", 0)
        success = all(r >= target for r in sets) if sets else True
        status = "성공" if success else "일부 실패"
        sets_text = ", ".join(str(r) for r in sets)
        lines.append(
            f"- {entry.get('date')} {entry.get('exercise')} {entry.get('weight')}kg "
            f"{len(sets)}세트({sets_text}회) 목표{target}회 [{status}]"
        )
    return "\n".join(lines)


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
        "icon.svg",
    ):
        return send_from_directory(BASE_DIR, filename)
    return "Not Found", 404


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

    if response.stop_reason == "refusal":
        return None, "죄송해요, 이 요청에는 답변할 수 없어요. 다르게 물어봐 주세요.", 200

    reply_text = "".join(block.text for block in response.content if block.type == "text")
    return reply_text, None, None


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

        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=contents,
            config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
        )
    except genai.errors.ClientError as e:
        if e.code == 401 or e.code == 403:
            return None, "Gemini API 키가 유효하지 않아요. API 설정에서 키를 확인해주세요.", 401
        return None, f"Gemini API 오류: {e.message}", 502
    except Exception as e:
        return None, f"Gemini API 호출 중 오류가 발생했어요: {e}", 502

    if not response.text:
        return None, "Gemini가 응답을 생성하지 못했어요. 다르게 물어봐 주세요.", 200

    return response.text, None, None


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True, silent=True) or {}
    profile = data.get("profile") or {}
    history = data.get("history") or []
    messages = data.get("messages") or []
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


if __name__ == "__main__":
    # host="0.0.0.0" so phones on the same Wi-Fi can reach this via the PC's LAN IP.
    # Debug mode's interactive debugger is exposed on the network this way too -
    # fine on a trusted home network, but don't do this on a public/shared Wi-Fi.
    app.run(host="0.0.0.0", debug=True, port=5000)
