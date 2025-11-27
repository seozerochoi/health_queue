import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
import copy

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
    def __init__(self, equip_id, name, main_part, sub_part):
        self.equip_id = equip_id
        self.name = name
        self.main_part = main_part # 0: Upper(상체), 1: Lower(하체)
        # 세부 타겟 부위 (예: "Chest", "Back", "Legs" 등)
        self.sub_part = sub_part   

# ==============================================================================
# 2. 규칙 기반 엔진 (Rule-Based Formula Engine)
# 운동 생리학적 공식에 근거하여 '기준 운동 시간'을 산출하는 모듈입니다.
# (The Teacher: AI 모델의 초기 학습 기준점이 됩니다.)
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
        # 운동 목적에 따라 초기 세팅값이 다름
        # Diet: (3세트 * 15회 + 휴식 60초) * 3종목 = 약 315초
        # Bulk-up: (3세트 * 10회 + 휴식 90초) * 3종목 = 약 360초
        base_seconds = 360 if user.goal == 1 else 315
        
        # --- [Step 2] 숙련도 지수 (Proficiency Factor: x1) ---
        # 인바디 점수가 80점 이상일수록 숙련자로 간주하여 시간을 늘림
        # 시그모이드 함수 적용: 점수가 높을수록 1.0에 가까워짐
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
            # 비만도가 높으면 근비대 효율을 위해 시간 소폭 감소 (- 가중치)
            # 단, 근육량이 충분하다면 감소폭을 줄임
            purpose_coeff = -0.5 * max(0, rel_obesity - 1.0) * (1 - min(1, muscle_fat_ratio))
            
        situation_coeff = (1 + 0.67 * x1) * (1 + purpose_coeff)
        
        # --- [Step 4] 조정 계수 (Adjustment Coefficient) ---
        # 4-1. 근감소증 위험도 (SMI 지수) 반영
        height_m = ib.height / 100
        smi = ib.muscle_mass / (height_m ** 2)
        
        # SMI 기준(7.0) 미달 시 부상 방지를 위해 시간 감소
        x4 = max(0, (7.0 - smi) / 7.0)
        sarcopenia_coeff = 1.0 - (x4 * 0.75)
        
        # 4-2. 상하체 불균형 지수 반영
        mus = ib.segmental_muscle
        upper_avg = (mus['ra'] + mus['la'] + mus['trunk']) / 3
        lower_avg = (mus['rl'] + mus['ll']) / 2
        imbalance = upper_avg / lower_avg # >1: 상체 발달형, <1: 하체 발달형
        
        alpha = abs(imbalance - 1.0)
        
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
        
        # 안전 범위 클램핑 (최소 5분 ~ 최대 60분)
        return max(5.0, min(60.0, final_minutes))

# ==============================================================================
# 3. AI 신경망 모델 (Adaptive AI Model)
# 사용자 피드백을 학습하여 개인화된 최적 시간을 예측하는 딥러닝 모델입니다.
# (The Student: 경험을 통해 성장합니다.)
# ==============================================================================

class AdaptiveNetwork(nn.Module):
    def __init__(self, input_dim):
        super(AdaptiveNetwork, self).__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, 64),
            # nn.BatchNorm1d(64), # Batch Normalization (배치 사이즈가 작을 경우 비활성화)
            nn.ReLU(),
            # nn.Dropout(0.2),    # Dropout (단일 데이터 추론 시 비활성화 권장)
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)      # Output: 예측 시간 (분)
        )
        
    def forward(self, x):
        return self.layers(x)

class AIEngine:
    def __init__(self):
        # 입력 Feature Dimension 정의 (총 12개 Feature 사용 가정)
        # [점수, 체지방률, 골격근량, 키, BMI, 성별, 목적, 기구부위, 오른팔, 왼팔, 몸통, 다리평균]
        self.input_dim = 12 
        self.model = AdaptiveNetwork(self.input_dim)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.005)
        self.criterion = nn.MSELoss()
        self.formula_engine = FormulaEngine()
        self.is_trained = False # 선행 학습(Pre-training) 여부 플래그

    def _extract_features(self, user, equipment):
        """
        User 및 Equipment 객체 정보를 AI 모델 입력용 텐서(Tensor)로 변환합니다.
        """
        ib = user.inbody
        height_m = ib.height / 100
        bmi = ib.weight / (height_m**2)
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
        모델을 선행 학습시킵니다. 이를 통해 초기에도 안정적인 추천 값을 제공합니다.
        """
        print("⚡ [System] AI 모델 선행 학습(Pre-training) 시작... (Rule-Base 기준)")
        dummy_inputs = []
        dummy_targets = []
        
        for _ in range(sample_size):
            # 랜덤 가상 유저 데이터 생성
            d_inbody = InBodyData(
                score=random.uniform(60, 90), weight=random.uniform(50, 100),
                muscle_mass=random.uniform(20, 40), fat_mass=random.uniform(10, 30),
                height=random.uniform(150, 190), fat_rate=random.uniform(10, 40),
                r_arm=100, l_arm=100, trunk=100, r_leg=100, l_leg=100
            )
            d_user = User(0, "dummy", random.choice([0,1]), random.choice([0,1]), d_inbody)
            d_equip = Equipment(0, "dummy_eq", random.choice([0,1]), "General")
            
            # 수학 공식 엔진을 통해 정답(Label) 생성
            formula_time = self.formula_engine.calculate_time(d_user, d_equip)
            
            dummy_inputs.append(self._extract_features(d_user, d_equip))
            dummy_targets.append([formula_time])

        # Batch 학습 진행
        x_train = torch.stack(dummy_inputs)
        y_train = torch.FloatTensor(dummy_targets)
        
        self.model.train()
        for _ in range(100): # 100 Epochs
            self.optimizer.zero_grad()
            outputs = self.model(x_train)
            loss = self.criterion(outputs, y_train)
            loss.backward()
            self.optimizer.step()
        
        self.is_trained = True
        print("✅ [System] 선행 학습 완료. 초기 추론 준비됨.")

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
        사용자의 피드백을 기반으로 모델을 즉시 재학습(Fine-tuning)시킵니다.
        
        Args:
            feedback_score (int): 1(매우부족) ~ 3(적절) ~ 5(매우과도)
        """
        self.model.train()
        
        # 1. Target Time 재설정: 사용자의 의도를 파악하여 정답 값을 보정
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
            
        # 2. 역전파(Backpropagation)를 통한 가중치 업데이트
        inputs = self._extract_features(user, equipment).unsqueeze(0)
        target_tensor = torch.FloatTensor([[target_time]])
        
        self.optimizer.zero_grad()
        prediction = self.model(inputs)
        loss = self.criterion(prediction, target_tensor)
        loss.backward()
        self.optimizer.step()
        
        return target_time, loss.item()

# ==============================================================================
# 4. 시뮬레이션 실행 (Simulation Scenario)
# 실제 서비스 환경에서의 동작 흐름을 시연합니다.
# ==============================================================================

def run_simulation():
    # [Step 1] 시스템 초기화
    ai_system = AIEngine()
    ai_system.pretrain_with_formula() # 서버 시작 시 Cold Start 방지 학습 수행
    
    # [Step 2] 데이터 등록 (기구 및 사용자)
    bench_press = Equipment(1, "벤치프레스", 0, "Chest") # 상체 운동
    leg_press = Equipment(2, "레그프레스", 1, "Legs")    # 하체 운동
    
    # 사용자: 김헬스 (고숙련자, 근비대 목적, 표준 체형 가정)
    my_inbody = InBodyData(85, 75, 35, 15, 175, 20, 100, 100, 100, 100, 100)
    user_kim = User(101, "김헬스", 0, 1, my_inbody) 
    
    print("\n" + "="*50)
    print(f"🏋️‍♂️ [입장] 회원: {user_kim.name} | 상태: {my_inbody.score}점 (목적: 근비대)")
    print("="*50 + "\n")

    # --- [Scenario 1] 첫 번째 태깅 및 추천 ---
    print(f"📱 [Action] {user_kim.name}님이 '{bench_press.name}' 태깅")
    
    # AI 초기 추천 (선행 학습된 규칙 기반 값과 유사)
    rec_time = ai_system.predict_time(user_kim, bench_press)
    print(f"🤖 [AI 추천] 초기 분석 결과: {rec_time:.1f}분 할당")
    print("   (Note: 초기에는 일반적인 수학 공식 값에 가깝습니다.)\n")
    
    # ... 운동 수행 ...
    
    # --- [Scenario 2] 운동 후 피드백 반영 ---
    # 가정: 숙련자라서 추천 시간이 부족하다고 느낌 (평점 2점: 부족함)
    feedback = 2 
    print(f"📝 [Feedback] 사용자 반응: \"시간이 좀 부족합니다.\" (평점: 2점)")
    
    # 피드백을 통한 실시간 학습 수행
    target_time, loss = ai_system.update_with_feedback(user_kim, bench_press, rec_time, feedback)
    print(f"🧠 [Learning] 피드백 반영 완료 (Loss: {loss:.6f})")
    print(f"   AI Insight: \"사용자의 선호 시간은 약 {target_time:.1f}분으로 추정됨.\"\n")
    
    print("-" * 30)
    print("   ... 며칠 후 재방문 ...")
    print("-" * 30 + "\n")

    # --- [Scenario 3] 재방문 시 변화된 추천 확인 ---
    print(f"📱 [Action] {user_kim.name}님이 다시 '{bench_press.name}' 태깅")
    
    new_rec_time = ai_system.predict_time(user_kim, bench_press)
    print(f"🤖 [AI 추천] 업데이트된 추천 시간: {new_rec_time:.1f}분")
    
    diff = new_rec_time - rec_time
    print(f"✅ [Result] 학습 효과: 이전 대비 {diff:.1f}분 증가된 시간 추천")

    # --- [Scenario 4] 다른 기구(하체) 태깅 시 일반화 성능 확인 ---
    # 사용자의 성향(운동을 길게 하는 편)이 모델 가중치에 반영되었으므로,
    # 새로운 기구에서도 공식보다 긴 시간을 추천할 가능성이 높음
    print(f"\n📱 [Action] {user_kim.name}님이 '{leg_press.name}'(하체) 태깅")
    leg_time = ai_system.predict_time(user_kim, leg_press)
    print(f"🤖 [AI 추천] 하체 운동 추천 시간: {leg_time:.1f}분 (사용자 성향 반영됨)")

if __name__ == "__main__":
    run_simulation()