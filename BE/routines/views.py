from django.shortcuts import render
# routines/views.py
from django.conf import settings # settings import 추가
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from openai import OpenAI
from equipment.models import Equipment
from gyms.models import GymMembership

class GenerateRoutineView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        # 앱에서 사용자가 원하는 운동 시간, 집중 부위 등을 요청 바디에 담아 보냅니다.
        # 예: {"duration": 60, "focus": "가슴, 삼두"}
        duration = request.data.get('duration')
        focus = request.data.get('focus')

        # 1. 사용자가 등록된 헬스장 찾기
        try:
            membership = GymMembership.objects.get(user=user, status='APPROVED')
            gym = membership.gym
        except GymMembership.DoesNotExist:
            return Response({'error': '등록된 헬스장이 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. 해당 헬스장에서 현재 '사용 가능'한 기구 목록 가져오기
        available_equipment = Equipment.objects.filter(gym=gym, status='AVAILABLE')
        equipment_list = [eq.name for eq in available_equipment]
        
        if not equipment_list:
            return Response({'error': '현재 사용 가능한 기구가 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 3. GPT API에 보낼 프롬프트(요청 메시지) 생성
        prompt = f"""
        사용 가능한 운동 기구: {', '.join(equipment_list)}
        사용자 정보: 성별({user.userprofile.gender}), 나이({user.userprofile.age}), 경력({user.userprofile.experience_level})
        운동 목표: {focus} 부위 집중, 총 운동 시간 {duration}분
        
        위 정보를 바탕으로, 주어진 기구들만 활용하여 운동 순서, 세트, 횟수, 휴식 시간을 포함한 상세한 개인 맞춤형 운동 루틴을 추천해줘.
        결과는 JSON 형식으로 다음과 같은 구조로 답변해줘:
        {{
          "routine": [
            {{ "name": "기구이름", "sets": 3, "reps": 12, "rest": 60 }},
            {{ "name": "다른 기구이름", "sets": 3, "reps": 10, "rest": 60 }}
          ]
        }}
        """

        # 4. OpenAI API 호출 (실제 구현)
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        routine_data = response.choices[0].message.content

        
        # 실제 API 응답을 반환하도록 수정
        return Response(routine_data, status=status.HTTP_200_OK)