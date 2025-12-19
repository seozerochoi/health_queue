import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
import copy
from collections import deque  # [핵심] 기억 저장을 위한 큐(Queue) 자료구조

# ==============================================================================
# 설정 상수 (Configuration)
# ==============================================================================
SIMILARITY_THRESHOLD = 0.85  # 유사 사용자로 판단하는 코사인 유사도 임계값
SIMILAR_USER_K = 5           # 참조할 유사 사용자 최대 수

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
        
        # 디버깅 출력
        print(f"📊 [FormulaEngine] Debug:")
        print(f"   └─ base_seconds={base_seconds}, x1={x1:.3f}, rel_obesity={rel_obesity:.3f}")
        print(f"   └─ situation_coeff={situation_coeff:.3f}, sarcopenia_coeff={sarcopenia_coeff:.3f}, balance_coeff={balance_coeff:.3f}")
        print(f"   └─ final_seconds={final_seconds:.1f} -> final_minutes={final_minutes:.1f}분")
        
        # 안전 범위 클램핑 (최소 3분 ~ 최대 60분)
        return max(3.0, min(60.0, final_minutes))


# ==============================================================================
# 3. AI 신경망 모델 (Continuous Regression Network)
# 사용자 피드백을 기반으로 최적의 시간 조정값을 학습합니다.
# 연속적인 값(-10분 ~ +10분)을 직접 출력합니다.
# ==============================================================================

# 조정 가능한 범위 (분 단위)
ADJUSTMENT_RANGE = (-10.0, 10.0)  # 최소 -10분, 최대 +10분

class TimeAdjustmentNetwork(nn.Module):
    """
    시간 조정값을 연속적으로 출력하는 회귀 신경망
    Input: State (User InBody + Equipment Features) - 17차원
    Output: 조정 시간 (분 단위, 연속값) - 1차원
    """
    def __init__(self, input_dim):
        super(TimeAdjustmentNetwork, self).__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),  # 연속적인 조정값 1개 출력
            nn.Tanh()  # -1 ~ +1 범위로 제한
        )
        self.scale = (ADJUSTMENT_RANGE[1] - ADJUSTMENT_RANGE[0]) / 2  # 10
        self.bias = (ADJUSTMENT_RANGE[1] + ADJUSTMENT_RANGE[0]) / 2   # 0
        
    def forward(self, x):
        # Tanh 출력 (-1 ~ +1)을 조정 범위 (-10 ~ +10)로 스케일링
        raw_output = self.layers(x)
        scaled_output = raw_output * self.scale + self.bias
        return scaled_output.squeeze(-1)

class AIEngine:
    def __init__(self):
        # 입력 Feature Dimension 정의 (총 17개 Feature 사용)
        # 기존 14개 + 유사 사용자 정보 3개
        self.base_feature_dim = 14
        self.input_dim = 17  # 14 + 3 (similar_exists, similar_avg_time, similar_avg_adjustment)
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = TimeAdjustmentNetwork(self.input_dim).to(self.device)
        
        # 학습 설정
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        self.criterion = nn.MSELoss()  # 회귀 손실 함수
        
        self.formula_engine = FormulaEngine()
        self.is_trained = False

        # Replay Buffer (기억 저장소)
        # (State, Target_Adjustment) 튜플 저장 - 연속 학습용
        self.memory = deque(maxlen=2000)
        self.batch_size = 32
        
        # 마지막 예측 정보 저장 (피드백 시 사용)
        self.last_prediction_info = {}

    def save_checkpoint(self, filepath="time_ai_checkpoint.pth"):
        """학습된 모델 가중치를 파일로 저장"""
        torch.save(self.model.state_dict(), filepath)
        print(f"💾 모델 저장 완료: {filepath}")

    def load_checkpoint(self, filepath="time_ai_checkpoint.pth"):
        """저장된 모델 불러오기"""
        try:
            self.model.load_state_dict(torch.load(filepath, weights_only=False))
            self.model.eval()
            self.is_trained = True
            print(f"📂 모델 불러오기 성공: {filepath}")
        except FileNotFoundError:
            print(f"⚠️ 모델 파일 없음 (새로 시작): {filepath}")
            self.is_trained = False
        except Exception as e:
            print(f"⚠️ 모델 로드 실패 (새로 시작): {e}")
            self.is_trained = False

    # ==========================================================================
    # 유사도 계산 및 검색 메서드 (Similarity Search)
    # ==========================================================================
    
    def _calculate_cosine_similarity(self, features1, features2):
        """
        두 Feature 벡터 간의 코사인 유사도를 계산합니다.
        Returns:
            float: 유사도 (0.0 ~ 1.0)
        """
        vec1 = np.array(features1)
        vec2 = np.array(features2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    def find_similar_records(self, features, equipment_id, k=SIMILAR_USER_K, threshold=SIMILARITY_THRESHOLD):
        """
        DB에서 비슷한 사용자의 기록을 검색합니다.
        
        Args:
            features: 현재 사용자의 기본 Feature 벡터 (14개)
            equipment_id: 기구 ID
            k: 반환할 최대 기록 수
            threshold: 유사도 임계값
            
        Returns:
            list: [(similarity, record), ...] - 유사도 높은 순으로 정렬
        """
        try:
            from .models import UserTimeRecord
            
            # 해당 기구에 대한 피드백이 있는 기록만 조회
            # ForeignKey 필드이므로 equipment_id 사용
            records = UserTimeRecord.objects.filter(
                equipment_id=equipment_id,
                feedback_score__isnull=False
            ).order_by('-created_at')[:200]  # 최근 200개만 검색 (성능)
            
            if not records.exists():
                return []
            
            similar_records = []
            current_features = np.array(features[:self.base_feature_dim])  # 기본 14개만 사용
            
            for record in records:
                try:
                    stored_features = np.array(record.features[:self.base_feature_dim])
                    similarity = self._calculate_cosine_similarity(current_features, stored_features)
                    
                    if similarity >= threshold:
                        similar_records.append((similarity, record))
                except Exception as e:
                    continue
            
            # 유사도 높은 순 정렬
            similar_records.sort(key=lambda x: -x[0])
            
            print(f"🔍 [SimilaritySearch] 기구 {equipment_id}: {len(similar_records)}명의 유사 사용자 발견 (threshold={threshold})")
            
            return similar_records[:k]
            
        except Exception as e:
            print(f"⚠️ [SimilaritySearch] DB 검색 실패: {e}")
            return []
    
    def _get_similar_user_features(self, base_features, equipment_id):
        """
        유사 사용자 정보를 Feature에 추가합니다.
        
        Returns:
            tuple: (extended_features, similar_records)
        """
        similar_records = self.find_similar_records(base_features, equipment_id)
        
        if len(similar_records) == 0:
            # 유사 사용자 없음 - 기본값 사용
            similar_exists = 0.0
            similar_avg_time = 0.0
            similar_avg_adjustment = 0.0
        else:
            similar_exists = 1.0
            
            # 가중 평균 계산 (유사도를 가중치로 사용)
            total_weight = sum(sim for sim, _ in similar_records)
            similar_avg_time = sum(sim * rec.recommended_time for sim, rec in similar_records) / total_weight
            similar_avg_adjustment = sum(sim * rec.adjustment for sim, rec in similar_records) / total_weight
            
            print(f"📊 [SimilarUsers] 유사 사용자 평균 시간: {similar_avg_time:.1f}분, 평균 조정: {similar_avg_adjustment:.1f}분")
        
        # 기존 14개 Feature + 유사 사용자 정보 3개
        extended_features = list(base_features) + [similar_exists, similar_avg_time, similar_avg_adjustment]
        
        return extended_features, similar_records

    def _extract_features(self, user, equipment):
        """
        User 및 Equipment 객체 정보를 AI 모델 입력용 Feature 리스트로 변환합니다.
        이 벡터가 '비슷한 사람'을 판단하는 기준(State)이 됩니다.
        
        Returns:
            list: 14개의 기본 Feature 리스트
        """
        ib = user.inbody
        height_m = ib.height / 100
        bmi = ib.weight / (height_m**2) if height_m > 0 else 0
        
        # PDF 핵심 지표 계산
        x1 = 1 / (1 + np.exp(-0.1 * (ib.score - 80)))
        std_fat = 25.0 if user.gender == 0 else 30.0
        rel_obesity = ib.fat_rate / std_fat if std_fat > 0 else 0
        muscle_fat_ratio = ib.muscle_mass / (ib.fat_mass if ib.fat_mass > 0 else 1)
        smi = ib.muscle_mass / (height_m ** 2) if height_m > 0 else 0
        x4 = max(0, (7.0 - smi) / 7.0)
        
        mus = ib.segmental_muscle
        upper_avg = (mus['ra'] + mus['la'] + mus['trunk']) / 3
        lower_avg = (mus['rl'] + mus['ll']) / 2
        imbalance = upper_avg / lower_avg if lower_avg > 0 else 1.0
        
        is_cardio = 1.0 if equipment.equip_type == 'CARDIO' else 0.0

        # 기본 14개 Feature (유사도 계산용)
        features = [
            ib.score, ib.fat_rate, ib.muscle_mass, ib.height, bmi,
            user.gender, user.goal,
            equipment.main_part, is_cardio,
            x1, rel_obesity, muscle_fat_ratio, x4, imbalance
        ]
        return features

    def pretrain_with_formula(self, sample_size=500):
        """
        [Cold Start] 공식 기반 시간을 정답으로 삼아 모델을 사전 학습합니다.
        조정값 0.0(공식 그대로)이 최적이라고 가정하고 학습합니다.
        """
        print("⚡ [System] 공식 기반 선행 학습(Pre-training) 시작...")
        
        # 다양한 가상 사용자/기구 데이터 생성하여 '조정값 0'으로 학습
        for i in range(sample_size):
            # 다양한 InBody 데이터 생성
            inbody = InBodyData(
                score=random.uniform(55, 95),
                weight=random.uniform(50, 100),
                muscle_mass=random.uniform(18, 45),
                fat_mass=random.uniform(8, 35),
                height=random.uniform(150, 190),
                fat_rate=random.uniform(8, 40),
                r_arm=random.uniform(75, 125),
                l_arm=random.uniform(75, 125),
                trunk=random.uniform(75, 125),
                r_leg=random.uniform(75, 125),
                l_leg=random.uniform(75, 125)
            )
            
            user = User(
                user_id=i,
                name=f'PretrainUser{i}',
                gender=random.randint(0, 1),
                goal=random.randint(0, 1),
                inbody_data=inbody
            )
            
            equip_types = ['MACHINE', 'FREE_WEIGHT', 'CARDIO', 'CABLE']
            equip = Equipment(
                equip_id=random.randint(1, 30),
                name=f'PretrainEquip{i}',
                main_part=random.randint(0, 1),
                sub_part='GENERAL',
                equip_type=random.choice(equip_types)
            )
            
            # Feature 추출
            base_features = self._extract_features(user, equip)
            
            # 공식 기반 시간 계산
            formula_time = self.formula_engine.calculate_time(user, equip)
            
            # 유사 사용자 Feature (사전학습이므로 없다고 가정)
            extended_features = base_features + [0.0, formula_time, 0.0]  # similar_exists=0, avg_time, avg_adj=0
            state = torch.FloatTensor(extended_features)
            
            # 목표: 조정값 0 (공식이 정답)
            # 약간의 랜덤성 추가하여 다양한 상황 학습
            target_adjustment = random.uniform(-1.0, 1.0)  # 공식 근처값
            weight = 1.0
            
            self.memory.append((state, target_adjustment, weight))
        
        # 배치 학습 수행 (여러 번 반복)
        print(f"   └─ 메모리 크기: {len(self.memory)}, 배치 학습 시작...")
        total_loss = 0.0
        num_batches = min(50, len(self.memory) // self.batch_size)
        
        for _ in range(num_batches):
            loss = self._regression_train()
            total_loss += loss
        
        avg_loss = total_loss / max(1, num_batches)
        
        self.is_trained = True
        self.save_checkpoint()
        print(f"✅ [System] 선행 학습 완료! (평균 Loss: {avg_loss:.4f})")

    def predict_time(self, user, equipment):
        """
        [RL + Similarity-Based Inference]
        1. 기본 Feature 추출
        2. DB에서 비슷한 사용자 검색
        3. 비슷한 사용자 있으면: 그들의 경험을 참조하여 DQN 입력에 반영
        4. 비슷한 사용자 없으면: 수학 공식 기반으로 계산
        5. DQN 모델이 최적의 Action(조정 시간)을 선택
        6. 최종 시간 = Base + Action
        """
        # 1. 기본 Feature 추출 (14개)
        base_features = self._extract_features(user, equipment)
        
        # 2. 공식 기반 계산 (Base Time)
        formula_time = self.formula_engine.calculate_time(user, equipment)
        
        # 3. 유사 사용자 검색 및 Feature 확장 (17개)
        equipment_id = equipment.equip_id if hasattr(equipment, 'equip_id') else equipment.id
        extended_features, similar_records = self._get_similar_user_features(base_features, equipment_id)
        
        # 4. Base Time 결정 (유사 사용자가 있으면 그들의 경험 반영)
        if len(similar_records) > 0:
            # 유사 사용자들의 최적 시간 가중 평균
            total_weight = sum(sim for sim, _ in similar_records)
            similar_avg_time = sum(sim * rec.recommended_time for sim, rec in similar_records) / total_weight
            
            # 공식 시간과 유사 사용자 시간을 블렌딩 (유사도가 높을수록 유사 사용자 가중치 ↑)
            avg_similarity = total_weight / len(similar_records)
            blend_weight = min(0.7, avg_similarity)  # 최대 70%까지 유사 사용자 반영
            
            base_time = (1 - blend_weight) * formula_time + blend_weight * similar_avg_time
            print(f"🔀 [Blend] 공식({formula_time:.1f}분) + 유사사용자({similar_avg_time:.1f}분) → {base_time:.1f}분")
        else:
            base_time = formula_time
            print(f"📐 [Formula] 유사 사용자 없음, 공식 사용: {base_time:.1f}분")

        # 5. 신경망이 조정값 예측 (연속값)
        state = torch.FloatTensor(extended_features).to(self.device)
        
        self.model.eval()
        with torch.no_grad():
            # 신경망이 직접 조정값(-10 ~ +10)을 출력
            adjustment = self.model(state).item()
        
        # 학습 초기에는 조정값을 0으로 고정 (학습되지 않은 모델의 불안정한 출력 방지)
        if not self.is_trained:
            print(f"⚠️ [AI] 모델 미학습 상태 - 조정값 0으로 설정 (원래 예측: {adjustment:+.1f})")
            adjustment = 0.0
        
        # 6. 최종 시간 산출
        final_time = base_time + adjustment
        
        # 예측 정보 저장 (피드백 시 사용)
        self.last_prediction_info = {
            'user_id': user.user_id,
            'equipment_id': equipment_id,
            'base_features': base_features,
            'extended_features': extended_features,
            'formula_time': formula_time,
            'base_time': base_time,
            'adjustment': adjustment,
            'final_time': max(5.0, min(90.0, final_time)),
            'had_similar_users': len(similar_records) > 0
        }
        
        print(f"🤖 [AI] 조정값: {adjustment:+.1f}분 → 최종: {max(5.0, min(90.0, final_time)):.1f}분")

        # 안전 범위 적용 (최소 5분은 너무 짧음, 8분으로 상향)
        return max(8.0, min(90.0, final_time))

    def update_with_feedback(self, user, equipment, recommended_time, feedback_score):
        """
        [Continuous Learning + DB 저장]
        사용자 피드백을 기반으로 "이상적인 조정값"을 계산하고 모델을 학습시킵니다.
        
        피드백 기반 조정값 계산:
        - 매우부족(1): 현재 조정값에서 +5분 더 필요
        - 부족(2): 현재 조정값에서 +2분 더 필요
        - 적절(3): 현재 조정값이 정답 (그대로 학습)
        - 과도(4): 현재 조정값에서 -2분 줄여야 함
        - 매우과도(5): 현재 조정값에서 -5분 줄여야 함
        
        Args:
            feedback_score (int): 1(매우부족) ~ 3(적절) ~ 5(매우과도)
        """
        # 1. 피드백에 따른 "이상적인 조정값" 계산
        pred_info = self.last_prediction_info
        
        # 기본 Feature 추출
        base_features = self._extract_features(user, equipment)
        equipment_id = equipment.equip_id if hasattr(equipment, 'equip_id') else equipment.id
        
        # 이전 조정값 가져오기
        if pred_info and pred_info.get('equipment_id') == equipment_id:
            prev_adjustment = pred_info.get('adjustment', 0.0)
            formula_time = pred_info.get('formula_time', recommended_time)
        else:
            prev_adjustment = 0.0
            formula_time = self.formula_engine.calculate_time(user, equipment)
        
        # 피드백에 따른 조정값 수정량 계산
        # 부족하다 = 시간을 더 늘려야 한다 = 조정값을 더 +해야 한다
        feedback_delta = {
            1: +5.0,   # 매우 부족 → 5분 더 늘려야 함
            2: +2.0,   # 부족 → 2분 더 늘려야 함
            3: 0.0,    # 적절 → 조정 불필요
            4: -2.0,   # 과도 → 2분 줄여야 함
            5: -5.0    # 매우 과도 → 5분 줄여야 함
        }
        
        delta = feedback_delta.get(int(feedback_score), 0.0)
        target_adjustment = prev_adjustment + delta
        
        # 조정값 범위 제한
        target_adjustment = max(ADJUSTMENT_RANGE[0], min(ADJUSTMENT_RANGE[1], target_adjustment))
        
        # 숙련자의 피드백은 더 정확하다고 가정 (가중치 부여)
        weight = 1.5 if user.inbody.score >= 80 else 1.0
        
        # 2. Extended features 생성 (17개)
        extended_features, _ = self._get_similar_user_features(base_features, equipment_id)
        state = torch.FloatTensor(extended_features)

        # 3. 메모리에 저장 (State, Target_Adjustment, Weight)
        self.memory.append((state, target_adjustment, weight))
        
        # 유사 사용자의 경험도 메모리에 로드 (Transfer Learning)
        similar_records = self.find_similar_records(base_features, equipment_id, k=3)
        for sim, record in similar_records:
            if record.feedback_score is not None:
                try:
                    stored_features = record.features + [1.0, record.recommended_time, record.adjustment]
                    stored_state = torch.FloatTensor(stored_features)
                    # 유사 사용자의 경험에서 학습한 조정값
                    self.memory.append((stored_state, record.adjustment, sim))
                except:
                    pass

        # 4. 학습 (Regression Training)
        loss = self._regression_train()

        print(f"🤖 [AI-Learning] 피드백: {feedback_score}점")
        print(f"   └─ 이전 조정: {prev_adjustment:+.1f}분 → 목표 조정: {target_adjustment:+.1f}분 (delta: {delta:+.1f})")
        
        # 5. DB에 기록 저장 (향후 유사 사용자 검색용)
        self._save_record_to_db(
            user=user,
            equipment_id=equipment_id,
            base_features=base_features,
            formula_time=formula_time,
            adjustment=target_adjustment,  # 학습된 최적 조정값 저장
            recommended_time=recommended_time,
            feedback_score=feedback_score
        )
        
        # 6. 모델 저장
        self.save_checkpoint()

        return recommended_time, loss
    
    def _save_record_to_db(self, user, equipment_id, base_features, formula_time,
                           adjustment, recommended_time, feedback_score):
        """
        운동 기록을 DB에 저장합니다.
        """
        try:
            from .models import UserTimeRecord
            from django.contrib.auth.models import User as DjangoUser
            from equipment.models import Equipment as EquipmentModel
            
            django_user = DjangoUser.objects.get(id=user.user_id)
            equipment_obj = EquipmentModel.objects.get(id=equipment_id)
            
            UserTimeRecord.objects.create(
                user=django_user,
                equipment=equipment_obj,  # ForeignKey이므로 객체 전달
                features=base_features,
                formula_time=formula_time,
                action_idx=0,  # 레거시 호환 (연속값에서는 사용 안 함)
                adjustment=adjustment,
                recommended_time=recommended_time,
                feedback_score=feedback_score,
                reward=None  # 연속 학습에서는 사용 안 함
            )
            print(f"💾 [DB] 기록 저장 완료: User={user.user_id}, Equip={equipment_id}, Adj={adjustment:+.1f}분")
        except Exception as e:
            print(f"⚠️ [DB] 기록 저장 실패: {e}")

    def _regression_train(self):
        """
        회귀 학습 (Supervised Learning)
        - 입력: State (17차원)
        - 출력: 조정값 (연속, -10 ~ +10분)
        - 목표: 사용자 피드백을 통해 학습된 최적 조정값에 가까워지기
        """
        if len(self.memory) < self.batch_size:
            return 0.0

        batch = random.sample(self.memory, self.batch_size)
        
        states = torch.stack([x[0] for x in batch]).to(self.device)
        targets = torch.FloatTensor([x[1] for x in batch]).to(self.device)
        weights = torch.FloatTensor([x[2] for x in batch]).to(self.device)

        # 모델 예측
        self.model.train()
        predictions = self.model(states)
        
        # 가중 MSE Loss
        losses = (predictions - targets) ** 2
        weighted_loss = (losses * weights).mean()
        
        # 역전파
        self.optimizer.zero_grad()
        weighted_loss.backward()
        self.optimizer.step()
        
        self.is_trained = True
        
        return weighted_loss.item()
