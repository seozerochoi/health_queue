import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
import copy
from collections import deque  # [핵심] 기억 저장을 위한 큐(Queue) 자료구조

# ==============================================================================
# 1. 데이터 모델 정의 (Data Models)
# 시스템에서 사용되는 핵심 데이터 구조(인바디 정보, 사용자, 기구)를 정의합니다.
# ==============================================================================

class InBodyData:
    """
    사용자의 신체 정보를 담는 클래스입니다.
    """
    def __init__(self, score, weight, muscle_mass, fat_mass, height, fat_rate, 
                 r_arm, l_arm, trunk, r_leg, l_leg):
        self.score = score          # 인바디 점수 (Total Score)
        self.weight = weight        # 체중 (kg)
        self.muscle_mass = muscle_mass # 골격근량 (kg)
        self.fat_mass = fat_mass    # 체지방량 (kg)
        self.height = height        # 키 (cm)
        self.fat_rate = fat_rate    # 체지방률 (%)
        
        # 부위별 근육량 (표준 체중 대비 백분율 %)
        # 상/하체 불균형 및 특정 부위 발달 정도를 계산하기 위해 사용
        self.segmental_muscle = {
            'ra': r_arm,    # Right Arm
            'la': l_arm,    # Left Arm
            'trunk': trunk, # Trunk (Body)
            'rl': r_leg,    # Right Leg
            'll': l_leg     # Left Leg
        }

class User:
    """
    서비스 이용자 정보를 관리하는 클래스입니다.
    """
    def __init__(self, user_id, name, gender, goal, inbody_data):
        self.user_id = user_id
        self.name = name
        self.gender = gender # 0: Male (남성), 1: Female (여성)
        self.goal = goal     # 0: Diet (체중 감량), 1: Bulk-up (근비대)
        self.inbody = inbody_data

class Equipment:
    """
    운동 기구 정보를 관리하는 클래스입니다.
    """
    def __init__(self, equip_id, name, main_part, sub_part, base_time=None, equip_type=None):
        self.equip_id = equip_id
        self.name = name
        self.main_part = main_part # 0: Upper(상체), 1: Lower(하체)
        # 세부 타겟 부위 (예: "Chest", "Back", "Legs" 등)
        self.sub_part = sub_part
        self.base_time = base_time
        self.equip_type = equip_type    

# ==============================================================================
# 2. 규칙 기반 엔진 (Rule-Based Formula Engine) - [The Teacher]
# 운동 생리학적 공식에 근거하여 '기준 운동 시간'을 산출하는 모듈입니다.
# AI 모델의 초기 학습 기준점(Label)을 제공합니다.
# ==============================================================================

class FormulaEngine:
    def __init__(self):
        # 표준 체지방률 기준값 (성별에 따른 평균 상한선 가정)
        # Male(0): 25.0%, Female(1): 30.0%
        self.STD_FAT_RATE = {0: 25.0, 1: 30.0} 

    def calculate_time(self, user, equipment):
        """
        사용자의 신체 정보와 기구 특성을 바탕으로 수학적 공식을 통해 운동 시간을 계산합니다.
        Returns:
            float: 추천 운동 시간 (분 단위)
        """
        ib = user.inbody
        
        # --- [Step 1] 기본 운동 시간 (Base Time) 설정 ---
        # DB의 고정 시간(base_time)은 무시하고, 기구 타입과 운동 목적에 따라 AI가 직접 산출합니다.
        
        # 1-1. 기구 타입에 따른 베이스 설정
        # 유산소(CARDIO)는 기본 호흡량이 필요하므로 길게, 근력 운동은 세트 단위로 짧게 설정
        eq_type = str(equipment.equip_type).upper()
        
        if eq_type == 'CARDIO':
            # 유산소 기본: 20분 (1200초)
            # 다이어트 목적이면 더 길게(30분), 근비대면 웜업 정도로 짧게(15분)
            if user.goal == 0: # Diet
                base_seconds = 1800 # 30분
            else: # Bulk-up
                base_seconds = 900  # 15분
        else:
            # 근력 운동 (Machine, Free Weight 등)
            # Diet: (3세트 * 15회 + 휴식 60초) * 3종목(가정) = 약 315초 (약 5분)
            # Bulk-up: (3세트 * 10회 + 휴식 90초) * 3종목(가정) = 약 360초 (약 6분)
            base_seconds = 360 if user.goal == 1 else 315
        
        # --- [Step 2] 숙련도 지수 (Proficiency Factor: x1) ---
        # 인바디 점수가 80점 이상일수록 숙련자로 간주하여 시간을 늘림 (시그모이드 적용)
        x1 = 1 / (1 + np.exp(-0.1 * (ib.score - 80)))
        
        # --- [Step 3] 상황 계수 (Situation Coefficient) ---
        # 3-1. 상대적 비만도 계산
        std_fat = self.STD_FAT_RATE[user.gender]
        rel_obesity = ib.fat_rate / std_fat
        
        # 3-2. 근육/지방 비율 (간략화: 골격근량 / 체지방량)
        muscle_fat_ratio = ib.muscle_mass / (ib.fat_mass if ib.fat_mass > 0 else 1)
        
        # 3-3. 운동 목적 계수 적용
        if user.goal == 0: # Diet
            # 비만도가 높을수록 유산소성/반복 운동 시간 증가 (+ 가중치)
            purpose_coeff = 0.5 * max(0, rel_obesity - 1.0)
        else: # Bulk-up
            # 비만도가 높으면 관절 부하 등을 고려해 시간 소폭 감소, 단 근육량이 많으면 상쇄
            purpose_coeff = -0.5 * max(0, rel_obesity - 1.0) * (1 - min(1, muscle_fat_ratio))
            
        situation_coeff = (1 + 0.67 * x1) * (1 + purpose_coeff)
        
        # --- [Step 4] 조정 계수 (Adjustment Coefficient) ---
        # 4-1. 근감소증 위험도 (SMI 지수) 반영
        height_m = ib.height / 100
        smi = ib.muscle_mass / (height_m ** 2) if height_m > 0 else 0
        
        # SMI 기준(7.0) 미달 시 부상 방지를 위해 시간 감소
        x4 = max(0, (7.0 - smi) / 7.0)
        sarcopenia_coeff = 1.0 - (x4 * 0.75)
        
        # 4-2. 상하체 불균형 지수 반영
        mus = ib.segmental_muscle
        upper_avg = (mus['ra'] + mus['la'] + mus['trunk']) / 3
        lower_avg = (mus['rl'] + mus['ll']) / 2
        imbalance = upper_avg / lower_avg if lower_avg > 0 else 1.0 # >1: 상체 발달형, <1: 하체 발달형
        
        # 신체 밸런스를 맞추기 위해 약점 부위 운동 시간을 조정
        if equipment.main_part == 0: # 상체 기구 이용 시
            # 상체가 이미 강함(>1) -> 시간 감소 / 상체가 약함(<1) -> 시간 증가
            y = -0.3 * (imbalance - 1.0) 
        else: # 하체 기구 이용 시
            # 하체가 이미 강함(<1) -> 시간 감소 / 하체가 약함(>1) -> 시간 증가
            y = 0.3 * (imbalance - 1.0)
            
        balance_coeff = 1.0 + y

        # --- [Final] 최종 시간 산출 ---
        final_seconds = base_seconds * situation_coeff * sarcopenia_coeff * balance_coeff
        final_minutes = final_seconds / 60.0
        
        # 안전 범위 클램핑 (최소 5분 ~ 최대 90분)
        return max(5.0, min(90.0, final_minutes))

# ==============================================================================
# 3. AI 신경망 모델 (Adaptive AI Model) - [The Student]
# 사용자 피드백을 학습하여 개인화된 최적 시간을 예측하는 딥러닝 모델입니다.
# **심화 개선: Experience Replay & Safety Clamping 적용**
# ==============================================================================

class AdaptiveNetwork(nn.Module):
    def __init__(self, input_dim):
        super(AdaptiveNetwork, self).__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)      # Output: 예측 시간 (분)
        )
        
    def forward(self, x):
        return self.layers(x)

class AIEngine:
    def __init__(self):
        # 입력 Feature Dimension 정의 (총 12개 Feature 사용)
        self.input_dim = 12 
        self.model = AdaptiveNetwork(self.input_dim)
        
        # [개선] 학습률(Learning Rate)을 0.001로 낮추어 급격한 변화를 방지하고 안정성을 높임
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        self.criterion = nn.MSELoss()
        self.formula_engine = FormulaEngine()
        self.is_trained = False

        # [핵심 추가 1] Replay Buffer (기억 저장소)
        # 최신 데이터 2,000개만 유지하며 파국적 망각(Catastrophic Forgetting) 방지
        self.memory = deque(maxlen=2000)
        
        # [핵심 추가 2] Mini-batch Size
        # 피드백 반영 시 32개의 데이터를 묶어서 학습
        self.batch_size = 32
    def save_checkpoint(self, filepath="ai_checkpoint.pth"):
        """학습된 모델 가중치를 파일로 저장"""
        torch.save(self.model.state_dict(), filepath)
        print(f"💾 모델 저장 완료: {filepath}")

    def load_checkpoint(self, filepath="ai_checkpoint.pth"):
        """저장된 모델 불러오기"""
        try:
            self.model.load_state_dict(torch.load(filepath))
            self.model.eval()
            self.is_trained = True
            print(f"📂 모델 불러오기 성공: {filepath}")
        except FileNotFoundError:
            print("⚠️ 저장된 모델이 없습니다. 새로 시작합니다.")

    def _extract_features(self, user, equipment):
        """
        User 및 Equipment 객체 정보를 AI 모델 입력용 텐서(Tensor)로 변환합니다.
        """
        ib = user.inbody
        height_m = ib.height / 100
        bmi = ib.weight / (height_m**2) if height_m > 0 else 0
        leg_avg = (ib.segmental_muscle['rl'] + ib.segmental_muscle['ll']) / 2
        
        features = [
            ib.score, ib.fat_rate, ib.muscle_mass, ib.height, bmi,
            user.gender, user.goal,
            equipment.main_part, # 0:Upper, 1:Lower
            ib.segmental_muscle['ra'],
            ib.segmental_muscle['la'],
            ib.segmental_muscle['trunk'],
            leg_avg
        ]
        return torch.FloatTensor(features)

    def pretrain_with_formula(self, sample_size=1000):
        """
        [Cold Start 문제 해결]
        초기 학습 데이터가 없을 때, 가상 유저 데이터를 생성하여 규칙 기반(Formula) 값으로 
        모델을 선행 학습시킵니다.
        """
        print("⚡ [System] AI 모델 선행 학습(Pre-training) 시작... (Rule-Base 기준)")
        
        for _ in range(sample_size):
            # 랜덤 가상 유저 데이터 생성
            # [수정] 실제 데이터(kg)와 유사한 스케일로 랜덤 값 생성
            w = random.uniform(50, 100) # 체중
            m = random.uniform(20, 40)  # 골격근량
            
            # 부위별 근육량 (kg) - 대략적인 비율 가정
            # 팔: 근육량의 5~7%, 다리: 15~20%, 몸통: 45~55%
            r_a = m * random.uniform(0.05, 0.08)
            l_a = m * random.uniform(0.05, 0.08)
            trunk = m * random.uniform(0.45, 0.55)
            r_l = m * random.uniform(0.15, 0.20)
            l_l = m * random.uniform(0.15, 0.20)

            d_inbody = InBodyData(
                score=random.uniform(60, 90), weight=w,
                muscle_mass=m, fat_mass=random.uniform(10, 30),
                height=random.uniform(150, 190), fat_rate=random.uniform(10, 40),
                r_arm=r_a, l_arm=l_a, trunk=trunk, r_leg=r_l, l_leg=l_l
            )
            d_user = User(0, "dummy", random.choice([0,1]), random.choice([0,1]), d_inbody)
            d_equip = Equipment(0, "dummy_eq", random.choice([0,1]), "General")
            
            # 수학 공식 엔진을 통해 정답(Label) 생성
            formula_time = self.formula_engine.calculate_time(d_user, d_equip)
            features = self._extract_features(d_user, d_equip)
            
            # [중요] 가상 데이터도 메모리에 추가하여 초기 지식으로 활용
            self.memory.append((features, formula_time))

        # 초기 메모리에 있는 데이터로 1차 학습 (Batch Training)
        self._replay_train(epochs=50)
        
        self.is_trained = True
        print("✅ [System] 선행 학습 및 메모리 초기화 완료. 초기 추론 준비됨.")

    def predict_time(self, user, equipment):
        """
        현재 학습된 모델을 사용하여 추천 운동 시간을 예측합니다.
        """
        self.model.eval()
        with torch.no_grad():
            inputs = self._extract_features(user, equipment).unsqueeze(0)
            pred = self.model(inputs).item()
        # 안전 범위 적용 (5분 ~ 90분)
        return max(5.0, min(90.0, pred))

    def update_with_feedback(self, user, equipment, recommended_time, feedback_score):
        """
        [Core Learning Logic] 
        사용자의 피드백을 기반으로 모델을 학습시킵니다.
        **Experience Replay와 Safety Clamping이 적용됨**
        
        Args:
            feedback_score (int): 1(매우부족) ~ 3(적절) ~ 5(매우과도)
        """
        # 1. Target Time 재설정: 사용자의 의도를 파악
        if feedback_score == 3:   # 적절함
            target_time = recommended_time 
        elif feedback_score == 4: # 약간 많음 -> 10% 감소
            target_time = recommended_time * 0.9
        elif feedback_score == 5: # 매우 많음 -> 30% 감소
            target_time = recommended_time * 0.7
        elif feedback_score == 2: # 약간 부족 -> 15% 증가
            target_time = recommended_time * 1.15
        elif feedback_score == 1: # 매우 부족 -> 40% 증가
            target_time = recommended_time * 1.4
        else:
            target_time = recommended_time

        # 2. [핵심 추가 3] Safety Clamping (안전 장치)
        # 피드백을 반영하되, 기존 추천 시간의 ±50%를 벗어나지 못하게 하여 데이터 오염(Poisoning) 방지
        min_limit = recommended_time * 0.5
        max_limit = recommended_time * 1.5
        target_time = max(min_limit, min(max_limit, target_time))

        # 3. [핵심 추가 4] 메모리에 저장 (Experience Replay)
        features = self._extract_features(user, equipment)
        self.memory.append((features, target_time))

        # 4. [핵심 추가 5] 배치 학습 (Batch Training)
        # 현재 데이터 하나만 학습하는 것이 아니라, 과거의 기억을 꺼내 함께 복습
        loss = self._replay_train(epochs=1) # 사용자 응답 속도를 위해 Epoch은 1회만 수행

        # 5. [핵심 추가 6] 모델 자동 저장 (Auto-Save)
        # 학습된 뇌(가중치)를 파일로 저장하여 서버 재시작 시에도 유지되도록 함
        try:
            self.save_checkpoint("time_ai_checkpoint.pth")
        except Exception as e:
            print(f"⚠️ 모델 자동 저장 실패: {e}")

        return target_time, loss

    def _replay_train(self, epochs=1):
        """
        [내부 함수] 메모리에서 배치를 꺼내 학습하는 함수
        """
        if len(self.memory) < self.batch_size:
            return 0.0 # 데이터가 너무 적으면 학습 스킵

        self.model.train()
        total_loss = 0

        for _ in range(epochs):
            # 메모리에서 랜덤하게 batch_size만큼 샘플링 (과거 데이터 복습)
            batch = random.sample(self.memory, self.batch_size)
            
            # Tensor 변환
            batch_features = torch.stack([item[0] for item in batch])
            batch_targets = torch.FloatTensor([[item[1]] for item in batch])

            # 역전파 학습 (Backpropagation)
            self.optimizer.zero_grad()
            predictions = self.model(batch_features)
            loss = self.criterion(predictions, batch_targets)
            loss.backward()
            self.optimizer.step()
            
            total_loss += loss.item()

        return total_loss / epochs
