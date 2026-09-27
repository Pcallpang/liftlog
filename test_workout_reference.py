import unittest
from unittest.mock import patch

import server


class WorkoutReferenceTests(unittest.TestCase):
    def test_reference_reaches_both_providers_without_becoming_history(self):
        client = server.app.test_client()
        expected = [
            ('인클라인 벤치 프레스', '4세트 × 8~10회'),
            ('체스트 프레스 머신', '3세트 × 8~10회'),
            ('아놀드 프레스', '3세트 × 8~10회'),
            ('케이블 레터럴 레이즈', '3세트 × 12~15회'),
            ('펙 덱 플라이', '3세트 × 12~15회'),
            ('클로즈 그립 벤치프레스', '3세트 × 8~10회'),
            ('로프 트라이셉스 푸쉬 다운', '3세트 × 10~12회'),
        ]
        for provider in ('claude', 'gemini'):
            with self.subTest(provider=provider):
                with patch.object(server, f'call_{provider}', return_value=('추천', None, None)) as api:
                    response = client.post('/api/chat', json={
                        'provider': provider, 'apiKey': 'test-key-not-real',
                        'profile': {'height': 175, 'weight': 75},
                        'history': [],
                        'messages': [{'role': 'user', 'content': '밀기 운동 추천해줘'}],
                    })
                self.assertEqual(response.status_code, 200)
                prompt = api.call_args.args[1]
                for name, prescription in expected:
                    self.assertIn(f'{name}: {prescription}', prompt)
                self.assertIn('militaryfriends_official', prompt)
                self.assertIn('실제 수행 기록이 아님', prompt)
                self.assertIn('4~6종목', prompt)
                self.assertIn('무게·휴식 시간은 원본에 없음', prompt)
                self.assertIn('아직 기록된 운동이 없습니다.', prompt)

    def test_reference_does_not_replace_recent_activity(self):
        with patch.object(server, 'call_claude', return_value=('추천', None, None)) as api:
            response = server.app.test_client().post('/api/chat', json={
                'apiKey': 'test-key-not-real', 'profile': {'weight': 75},
                'history': [{'date': '2026-09-26', 'id': 1, 'exercise': '벤치프레스',
                             'sets': [{'weight': 60, 'targetReps': 10, 'reps': 10}]}],
                'messages': [{'role': 'user', 'content': '오늘은 수영했어'}],
            })
        self.assertEqual(response.status_code, 200)
        prompt = api.call_args.args[1]
        self.assertIn('2026-09-26 벤치프레스', prompt)
        self.assertIn('케이블 레터럴 레이즈', prompt)
        self.assertEqual(api.call_args.args[2][0]['content'], '오늘은 수영했어')


if __name__ == '__main__':
    unittest.main()
