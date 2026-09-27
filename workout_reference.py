"""Render the user-supplied workout reference separately from training history."""

import json
from pathlib import Path


REFERENCE_PATH = Path(__file__).resolve().parent / 'docs' / 'reference-day4-push.json'


def format_workout_reference():
    reference = json.loads(REFERENCE_PATH.read_text(encoding='utf-8'))
    lines = [
        f"{reference['title']} ({'·'.join(reference['muscles'])})",
        f"출처: {reference['source']['account']} / 사용자 제공 이미지 {reference['source']['slide']}",
        '외부 루틴 참고 자료이며 사용자의 실제 수행 기록이 아님.',
        '무게·휴식 시간은 원본에 없음. 장비 설명은 이미지에서 식별한 종류임.',
    ]
    for exercise in reference['exercises']:
        lines.append(
            f"- {exercise['name']}: {exercise['sets']}세트 × "
            f"{exercise['reps_min']}~{exercise['reps_max']}회 "
            f"(장비: {exercise['equipment']})"
        )
    lines.extend([
        '적용: 밀기 또는 가슴·어깨·삼두 요청에 종목 후보와 세트·반복 범위로 참고한다. '
        '다른 부위 요청에 이 루틴을 억지로 넣지 않는다.',
        '원본의 7종목 전체를 기본 처방으로 복사하지 말고, 기존 추천 원칙에 따라 '
        '4~6종목을 선별한다. 운동 시간·경험·사용 가능한 장비·컨디션·최근 기록을 우선한다.',
        '가슴 프레스와 삼두 운동, 어깨 프레스의 피로 중복을 고려하고, '
        '최근 밀기 운동으로 회복이 필요하면 다른 부위나 휴식을 제안한다.',
        '무게와 휴식 시간은 개인 기록을 바탕으로 별도로 제안하고 원본 수치인 것처럼 말하지 않는다. '
        '기록이 없는 종목의 무게를 과거 수행 무게로 단정하지 않는다. '
        '장비가 없으면 가능한 대체 종목을 안내한다.',
        '참고 자료를 활용했다면 DAY 4 밀기 루틴을 참고해 조정했다고 짧게 알린다.',
    ])
    return '\n'.join(lines)
