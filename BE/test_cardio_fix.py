"""Test cardio type fix"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ai_model.time_ai import AIEngine, Equipment as AIEquipment, User as AIUser, InBodyData

ai = AIEngine()

# body_part='CARDIO'이지만 type='MACHINE'인 경우 (AWS 상황 시뮬레이션)
class FakeEquip:
    id = 99
    name = 'Treadmill'
    body_part = 'CARDIO'  # body_part는 CARDIO
    type = 'MACHINE'      # type은 잘못 MACHINE
    subcategory = 'Treadmill'

# 수정된 로직 테스트
main_part = 1 if FakeEquip.body_part == 'LOWER' else 0
if FakeEquip.body_part == 'CARDIO' or FakeEquip.type == 'CARDIO':
    equip_type = 'CARDIO'
else:
    equip_type = FakeEquip.type

print(f"body_part={FakeEquip.body_part}, type={FakeEquip.type}")
print(f"=> 결정된 equip_type: {equip_type}")

equip = AIEquipment(
    equip_id=FakeEquip.id,
    name=FakeEquip.name,
    main_part=main_part,
    sub_part=FakeEquip.subcategory,
    equip_type=equip_type
)

# 다이어트 유저 (gender: 0=Male, 1=Female, goal: 0=Diet, 1=Bulk)
inbody = InBodyData(
    score=70, weight=75, muscle_mass=30, fat_mass=15, height=175, fat_rate=20,
    r_arm=100, l_arm=100, trunk=100, r_leg=100, l_leg=100
)
user = AIUser(user_id=1, name='Test', gender=0, goal=0, inbody_data=inbody)

time_result = ai.predict_time(user, equip)
print(f"\n=== 결과 ===")
print(f"예측 시간: {time_result:.1f}분 (유산소 기대값: 25-40분)")
print(f"✅ 성공!" if time_result > 25 else "❌ 시간이 너무 짧음")
