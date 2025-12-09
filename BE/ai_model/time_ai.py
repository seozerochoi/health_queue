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
    def __init__(self, equip_id, name, main_part, sub_part, equip_type='MACHINE'):
        self.equip_id = equip_id
        self.name = name
        self.main_part = main_part # 0: Upper(상체), 1: Lower(하체)
        # 세부 타겟 부위 (예: "Chest", "Back", "Legs" 등)
        self.sub_part = sub_part
        self.equip_type = equip_type # 'CARDIO', 'MACHINE', 'FREE_WEIGHT' 등

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
        
        # --- [Step 1] 변수 표준화 및 지표 계산 ---
        
        # 1. 숙련도 지수 (x1) - 인바디 점수 정규화 (시그모이드)
        # 80점을 표준 0.5로 매핑
        x1 = 1 / (1 + np.exp(-0.1 * (ib.score - 80)))
        
        # 2. 상대적 비만도 (rel_obesity)
        # WHO 아시아-태평양 비만기준: 남자 25%, 여자 30%
        std_fat = self.STD_FAT_RATE[user.gender]
        rel_obesity = ib.fat_rate / std_fat
        
        # 3. 근지방 비율 (muscle_fat_ratio)
        # 마른 비만과 근육형 과체중 구분용
        muscle_fat_ratio = ib.muscle_mass / (ib.fat_mass if ib.fat_mass > 0 else 1)
        
        # 4. 근감소증 위험도 (x4) - AWGS 기준
        # 골격근량 지수 = 골격근량 / (키^2)
        # 기준치 7.0 미만일 경우 부족률 계산
        height_m = ib.height / 100
        smi = ib.muscle_mass / (height_m ** 2) if height_m > 0 else 0
        x4 = max(0, (7.0 - smi) / 7.0)
        
        # 5. 상하체 불균형 지수 (imbalance)
        # 상체 평균 % / 하체 평균 %
        mus = ib.segmental_muscle
        upper_avg = (mus['ra'] + mus['la'] + mus['trunk']) / 3
        lower_avg = (mus['rl'] + mus['ll']) / 2
        imbalance = upper_avg / lower_avg if lower_avg > 0 else 1.0
        
        # --- [New Logic] Cardio Handling (유산소 전용 로직) ---
        if equipment.equip_type == 'CARDIO':
            # 기본 시간: 20분
            base_minutes = 20.0
            
            # 1. 숙련도 보정 (체력이 좋을수록 오래)
            # x1 (0.0 ~ 1.0) -> 1.0 ~ 1.5배
            proficiency_factor = 1.0 + (0.5 * x1)
            
            # 2. 목적 보정
            if user.goal == 0: # Diet
                # 다이어트면 기본적으로 1.5배 (30분 기준)
                goal_factor = 1.5
                # 비만도가 높으면 더 추가 (최대 2.0배까지)
                if rel_obesity > 1.0:
                    goal_factor += 0.5 * min(1.0, rel_obesity - 1.0)
            else: # Bulk-up
                # 근비대면 유산소는 웜업/쿨다운 정도로 (0.6배)
                goal_factor = 0.6
                
            final_minutes = base_minutes * proficiency_factor * goal_factor
            
            # 안전 범위 (10분 ~ 60분)
            return max(10.0, min(60.0, final_minutes))
        
        # --- [Step 2] 기본 운동 시간 (Base Time) 설정 ---
        # 미국스포츠의학회(ACSM) 기준
        
        if user.goal == 1: # Bulk-up (근비대)
            # 1세트당 6~12회, 휴식 60~90초 -> 3세트 기준 (1회 3초 가정)
            # (3*10회 + 90초) * 3세트 = 360초 = 6분
            base_seconds = 360.0
        else: # Diet (다이어트)
            # 1세트당 15회 이상, 휴식 60초 미만 -> 3세트 기준
            # (3*15회 + 60초) * 3세트 = 315초 = 5.25분
            base_seconds = 315.0
            
        # 유산소 기구일 경우 기본 시간 재설정 (PDF에는 명시 없으나 통상적 기준 적용 필요)
        # 여기서는 PDF 로직의 일관성을 위해 근력 운동 기준으로 계산된 base_seconds를 
        # 유산소에도 적용하되, 유산소 특성상 배수를 적용하는 것이 타당해 보임.
        # 일단 PDF 공식 그대로 적용.
        
        
        # --- [Step 3] 상황 계수 (Situation Coefficient) ---
        # 상황계수 = (1 + 0.67*x1) * (1 + 신체운동목적계수)
        
        # 0.67*x1: 숙련자(5세트) 보정 (초보자 3세트 대비 약 1.67배)
        proficiency_factor = 1 + 0.67 * x1
        
        # 신체운동목적계수
        if user.goal == 0: # Diet
            # 다이어트: 시간 증가 (칼로리 소모)
            purpose_coeff = 0.5 * max(0, rel_obesity - 1.0)
        else: # Bulk-up
            # 근비대: 시간 감소 (관절 부하 감소), 단 근육형 과체중은 패널티 상쇄
            purpose_coeff = -0.5 * max(0, rel_obesity - 1.0) * (1 - min(1, muscle_fat_ratio))
            
        situation_coeff = proficiency_factor * (1 + purpose_coeff)
        
        
        # --- [Step 4] 조정 계수 (Adjustment Coefficient) ---
        # 조정계수 = 근감소증보정계수 * 상하체균형보정계수
        
        # 근감소증 보정계수
        sarcopenia_coeff = 1.0 - (x4 * 0.75)
        
        # 상하체 균형 보정계수
        # alpha = 상하체불균형지수 - 1.0
        alpha = imbalance - 1.0
        
        if equipment.main_part == 0: # 상체 기구
            # 상체가 약하면(imbalance < 1.0 -> alpha < 0) 시간 증가 (gamma > 0)
            # 상체가 강하면(imbalance > 1.0 -> alpha > 0) 시간 감소 (gamma < 0)
            gamma = -0.30 * alpha
        else: # 하체 기구
            # 하체가 약하면(imbalance > 1.0 -> alpha > 0) 시간 증가 (gamma > 0)
            # 하체가 강하면(imbalance < 1.0 -> alpha < 0) 시간 감소 (gamma < 0)
            gamma = 0.30 * alpha
            
        balance_coeff = 1.0 + gamma
        
        
        # --- [Final] 최종 시간 산출 ---
        final_seconds = base_seconds * situation_coeff * sarcopenia_coeff * balance_coeff
        final_minutes = final_seconds / 60.0
        
        # 안전 범위 클램핑 (최소 3분 ~ 최대 60분)
        return max(3.0, min(60.0, final_minutes))


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
        # 입력 Feature Dimension 정의 (총 13개 Feature 사용)
        # Raw(7) + Equip(1) + Derived(5) = 13
        self.input_dim = 13 
        self.model = AdaptiveNetwork(self.input_dim)
        
        # [개선] 학습률(Learning Rate)을 0.01로 높여 피드백 반영 속도를 높임
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.01)
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
        [Update] PDF 공식에서 사용된 핵심 파생 변수들을 Feature로 추가하여
        AI가 '비슷한 유형의 사람'을 더 잘 식별하도록 개선했습니다.
        """
        ib = user.inbody
        height_m = ib.height / 100
        bmi = ib.weight / (height_m**2) if height_m > 0 else 0
        
        # 1. PDF 핵심 지표 계산
        # 숙련도 지수 (x1)
        x1 = 1 / (1 + np.exp(-0.1 * (ib.score - 80)))
        
        # 상대적 비만도
        std_fat = 25.0 if user.gender == 0 else 30.0
        rel_obesity = ib.fat_rate / std_fat
        
        # 근지방 비율
        muscle_fat_ratio = ib.muscle_mass / (ib.fat_mass if ib.fat_mass > 0 else 1)
        
        # 근감소증 위험도 (x4)
        smi = ib.muscle_mass / (height_m ** 2) if height_m > 0 else 0
        x4 = max(0, (7.0 - smi) / 7.0)
        
        # 상하체 불균형 지수
        mus = ib.segmental_muscle
        upper_avg = (mus['ra'] + mus['la'] + mus['trunk']) / 3
        lower_avg = (mus['rl'] + mus['ll']) / 2
        imbalance = upper_avg / lower_avg if lower_avg > 0 else 1.0
        
        # 공식 계산 시간 (Formula Time) - AI가 기준점을 알 수 있도록 제공
        # (순환 참조 방지를 위해 FormulaEngine 인스턴스를 새로 만들지 않고 로직만 간단히 참조하거나, 
        #  여기서는 복잡도를 줄이기 위해 생략하고 위 파생 변수들로 충분하다고 판단함)
        
        features = [
            # Raw Data
            ib.score, ib.fat_rate, ib.muscle_mass, ib.height, bmi,
            user.gender, user.goal,
            
            # Equipment Info
            equipment.main_part, # 0:Upper, 1:Lower
            
            # [New] Derived Features (PDF Logic) - AI의 '통찰력'을 높여주는 핵심 힌트
            x1,               # 숙련도
            rel_obesity,      # 상대적 비만도
            muscle_fat_ratio, # 근지방 비율
            x4,               # 근감소증 위험도
            imbalance         # 상하체 불균형
        ]
        return torch.FloatTensor(features)

    def pretrain_with_formula(self, sample_size=1000):
        """
        [Cold Start 문제 해결]
        초기 학습 데이터가 없을 때, 가상 유저 데이터를 생성하여 규칙 기반(Formula) 값으로 
        모델을 선행 학습시킵니다.
        
        [Hybrid AI Update]
        이제 AI는 '공식 값'과 '실제 값'의 차이(Residual)를 학습합니다.
        초기 상태에서는 공식이 완벽하다고 가정하므로, AI가 0(보정 없음)을 출력하도록 학습합니다.
        """
        print("⚡ [System] AI 모델 선행 학습(Pre-training) 시작... (Residual Learning: Target=0)")
        
        for _ in range(sample_size):
            # 랜덤 가상 유저 데이터 생성
            # [수정] 실제 데이터(kg)와 유사한 스케일로 랜덤 값 생성
            w = random.uniform(50, 100) # 체중
            m = random.uniform(20, 40)  # 골격근량
            
            # 부위별 근육량 (%) - 표준 체중 대비 백분율 (보통 80~130% 범위)
            # [수정] kg 단위가 아닌 % 단위로 생성
            r_a = random.uniform(80, 120)
            l_a = random.uniform(80, 120)
            trunk = random.uniform(90, 110)
            r_l = random.uniform(80, 120)
            l_l = random.uniform(80, 120)

            d_inbody = InBodyData(
                score=random.uniform(60, 90), weight=w,
                muscle_mass=m, fat_mass=random.uniform(10, 30),
                height=random.uniform(150, 190), fat_rate=random.uniform(10, 40),
                r_arm=r_a, l_arm=l_a, trunk=trunk, r_leg=r_l, l_leg=l_l
            )
            d_user = User(0, "dummy", random.choice([0,1]), random.choice([0,1]), d_inbody)
            # [수정] 가상 기구 생성 시 랜덤한 기본 시간(10~30분) 부여하여 다양성 학습
            d_equip = Equipment(0, "dummy_eq", random.choice([0,1]), "General", base_time=random.randint(10, 30))
            
            # 수학 공식 엔진을 통해 정답(Label) 생성
            # Hybrid 방식이므로 AI의 목표값은 0 (공식 그대로 사용)
            target_residual = 0.0
            features = self._extract_features(d_user, d_equip)
            
            # [중요] 가상 데이터도 메모리에 추가하여 초기 지식으로 활용
            self.memory.append((features, target_residual))

        # 초기 메모리에 있는 데이터로 1차 학습 (Batch Training)
        self._replay_train(epochs=50)
        
        self.is_trained = True
        print("✅ [System] 선행 학습 및 메모리 초기화 완료. 초기 추론 준비됨.")

    def predict_time(self, user, equipment):
        """
        현재 학습된 모델을 사용하여 추천 운동 시간을 예측합니다.
        [Hybrid AI Logic]
        최종 시간 = (공식 계산 시간) + (AI 보정 시간)
        """
        # 1. 공식 기반 계산 (Base Logic) - 즉시 적용됨
        base_time = self.formula_engine.calculate_time(user, equipment)

        # 2. AI 보정값 예측 (Residual Learning)
        self.model.eval()
        with torch.no_grad():
            inputs = self._extract_features(user, equipment).unsqueeze(0)
            adjustment = self.model(inputs).item()
        
        # 3. 최종 시간 산출
        final_time = base_time + adjustment

        # 안전 범위 적용 (5분 ~ 90분)
        return max(5.0, min(90.0, final_time))

    def update_with_feedback(self, user, equipment, recommended_time, feedback_score):
        """
        [Core Learning Logic] 
        사용자의 피드백을 기반으로 모델을 학습시킵니다.
        **개선된 로직: 단순 비율(%)이 아닌 운동 생리학적 '세트(Set)' 단위 보정 적용**
        
        Args:
            feedback_score (int): 1(매우부족) ~ 3(적절) ~ 5(매우과도)
        """
        # 1. 기구 타입에 따른 '단위 시간(Unit Time)' 설정
        # - 웨이트: 1세트(수행+휴식) ≈ 3.0분
        # - 유산소: 1블록 ≈ 5.0분
        if equipment.equip_type == 'CARDIO':
            unit_time = 5.0
        else:
            unit_time = 3.0

        # 2. 피드백 점수에 따른 시간 보정 (Delta Calculation)
        if feedback_score == 3:   # 적절함
            delta = 0.0
        elif feedback_score == 4: # 약간 과도 -> 1단위 감소
            delta = -unit_time * 1.0
        elif feedback_score == 5: # 매우 과도 -> 2단위 감소
            delta = -unit_time * 2.0
        elif feedback_score == 2: # 약간 부족 -> 1단위 증가
            delta = unit_time * 1.0
        elif feedback_score == 1: # 매우 부족 -> 2단위 증가 (유산소는 3단위)
            # 매우 부족할 때 유산소는 시간을 더 넉넉히 줌 (+15분)
            scale = 3.0 if equipment.equip_type == 'CARDIO' else 2.0
            delta = unit_time * scale
        else:
            delta = 0.0

        # 3. 숙련도에 따른 가중치 적용 (Proficiency Weighting)
        # 숙련자(InBody 점수 높음)일수록 자신의 한계를 잘 알기에 피드백을 더 신뢰(증폭)함
        proficiency_bonus = 1.0
        if user.inbody.score >= 80:
            proficiency_bonus = 1.2 # 숙련자는 변화폭을 20% 더 크게
        
        final_delta = delta * proficiency_bonus
        target_time = recommended_time + final_delta

        print(f"🧠 [TimeAI] Feedback Analysis: Score={feedback_score}, Type={equipment.equip_type}")
        print(f"   └─ Unit={unit_time}m, Delta={final_delta:.1f}m (Proficiency={proficiency_bonus})")
        print(f"   └─ Rec={recommended_time:.1f}m -> Target={target_time:.1f}m")

        # 4. [Safety Clamping] 안전 장치
        # 피드백을 반영하되, 최소 3분 / 최대 120분, 그리고 기존 시간의 0.5~2.0배 범위 유지
        min_limit = max(3.0, recommended_time * 0.5)
        max_limit = min(120.0, recommended_time * 2.0)
        target_time = max(min_limit, min(max_limit, target_time))

        # [Hybrid AI Update]
        # AI는 (목표 시간 - 공식 시간)의 차이를 학습해야 함
        formula_time = self.formula_engine.calculate_time(user, equipment)
        target_residual = target_time - formula_time
        
        print(f"🎯 [TimeAI] 학습 목표: Formula={formula_time:.1f}, UserTarget={target_time:.1f} -> Residual={target_residual:.1f}")

        # 3. [핵심 추가 4] 메모리에 저장 (Experience Replay)
        features = self._extract_features(user, equipment)
        recent_sample = (features, target_residual)
        self.memory.append(recent_sample)

        # [수정] 강력한 즉시 반영을 위한 2단계 학습
        
        # Phase 1: 단기 집중 학습 (Short-term Intensive Training)
        # 방금 들어온 데이터만 가지고 모델을 과적합(Overfitting) 시켜서 즉각적인 변화를 유도함
        self.model.train()
        recent_features = features.unsqueeze(0) # (1, InputDim)
        recent_target = torch.FloatTensor([[target_residual]]) # (1, 1)
        
        print("🔥 [TimeAI] 단기 집중 학습 시작 (Instant Adaptation)...")
        for _ in range(20): # 20번 반복 학습하여 강제로 주입
            self.optimizer.zero_grad()
            pred = self.model(recent_features)
            loss = self.criterion(pred, recent_target)
            loss.backward()
            self.optimizer.step()

        # Phase 2: 경험 재생 (Experience Replay)
        # 과거 데이터와 섞어서 일반화 성능 유지 (Epochs 10 -> 5로 조정)
        loss = self._replay_train(epochs=5, recent_sample=recent_sample)

        # 5. [핵심 추가 6] 모델 자동 저장 (Auto-Save)
        # 학습된 뇌(가중치)를 파일로 저장하여 서버 재시작 시에도 유지되도록 함
        try:
            self.save_checkpoint("time_ai_checkpoint.pth")
        except Exception as e:
            print(f"⚠️ 모델 자동 저장 실패: {e}")

        return target_time, loss

    def _replay_train(self, epochs=1, recent_sample=None):
        """
        [내부 함수] 메모리에서 배치를 꺼내 학습하는 함수
        """
        # [개선] 최신 샘플이 있다면 메모리가 부족해도 학습 진행 (Cold Start 문제 해결)
        if len(self.memory) < self.batch_size and recent_sample is None:
            return 0.0 # 데이터가 너무 적으면 학습 스킵

        self.model.train()
        total_loss = 0

        for _ in range(epochs):
            # [개선] 최신 피드백 Oversampling (배치의 50% 할당)
            if recent_sample:
                n_recent = 16 # 32개 중 16개 (50%)
                batch = [recent_sample] * n_recent
                
                n_needed = self.batch_size - n_recent
                if len(self.memory) >= n_needed:
                    batch += random.sample(self.memory, n_needed)
                else:
                    # 메모리가 부족하면 있는 것 다 넣고 나머지는 최신 샘플로 채움
                    batch += list(self.memory)
                    while len(batch) < self.batch_size:
                        batch.append(recent_sample)
            else:
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
