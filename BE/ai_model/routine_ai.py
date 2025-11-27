import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque

# ==============================================================================
# Dependency: time_ai 모듈 불러오기
# (User, InBodyData 클래스 및 Time Prediction AI 활용)
# ==============================================================================
try:
    from ai_model.time_ai import AIEngine, User, Equipment, InBodyData
except ImportError:
    # 경로 문제 발생 시 현재 경로에서 import 시도
    from time_ai import AIEngine, User, Equipment, InBodyData

# ==============================================================================
# 1. 딥러닝 모델: 선호도 예측기 (Preference Predictor)
# 사용자와 기구의 특징을 입력받아 "이 사람이 이 기구를 얼마나 좋아할지"(0~1) 예측
# ==============================================================================
class PreferenceNetwork(nn.Module):
    def __init__(self, input_dim):
        super(PreferenceNetwork, self).__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid() # 0~1 사이의 확률값(선호도) 출력
        )
        
    def forward(self, x):
        return self.layers(x)

# ==============================================================================
# 2. 메인 엔진: Routine AI Engine
# ==============================================================================
class RoutineAIEngine:
    def __init__(self, db_equipments):
        """
        Args:
            db_equipments: DB에서 가져온 Equipment 객체 리스트.
                           객체는 DB 컬럼명과 동일한 속성(type, body_part, subcategory, difficulty)을 가져야 함.
        """
        self.equipments = db_equipments
        
        # Input Feature Dimension: User(12개) + Equipment(Metadata 5개) = 17개
        self.input_dim = 17 
        self.model = PreferenceNetwork(self.input_dim)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        self.criterion = nn.BCELoss() # 이진 분류 손실함수 (좋다/싫다 유사)
        
        # 시간 예측 AI 엔진 연결 (소요 시간 계산용)
        self.time_ai = AIEngine()
        # 주의: 실제 서버에서는 이미 학습된 전역 time_ai 객체를 주입받는 것이 권장됨
        if not self.time_ai.is_trained:
            self.time_ai.pretrain_with_formula()

        # Experience Replay Buffer (학습 데이터 기억 저장소)
        self.memory = deque(maxlen=2000)

    def update_equipments_list(self, new_equipments_list):
        """운영자가 기구를 추가/수정했을 때 리스트 갱신"""
        self.equipments = new_equipments_list
        print(f"🔄 AI 기구 데이터베이스 업데이트 완료 (총 {len(self.equipments)}개)")

    def _get_user_tensor(self, user):
        """time_ai의 로직을 재사용하여 User Feature 추출 (12차원)"""
        # 임시 기구 객체를 넣어 User 정보만 뽑아냄
        return self.time_ai._extract_features(user, self.equipments[0])[:12]

    def _get_equip_tensor(self, equipment):
        """
        [DB 호환성 변환]
        DB 컬럼 값(String)을 AI가 이해하는 수치(Float)로 변환 (5차원)
        """
        # 1. Type Mapping (DB: type 컬럼)
        # MACHINE, FREE_WEIGHT, CABLE, CARDIO
        eq_type_str = str(getattr(equipment, 'type', 'MACHINE')).upper()
        type_map = {
            'FREE_WEIGHT': 1.0, 
            'MACHINE': 0.0, 
            'CABLE': 0.5, 
            'CARDIO': 0.2
        }
        eq_type_val = type_map.get(eq_type_str, 0.0)

        # 2. Difficulty Mapping (DB: difficulty 컬럼)
        # HIGH, MID, LOW
        diff_str = str(getattr(equipment, 'difficulty', 'MID')).upper()
        diff_map = {'HIGH': 1.0, 'MID': 0.5, 'LOW': 0.0}
        difficulty_val = diff_map.get(diff_str, 0.5)

        # 3. Body Part Mapping (DB: body_part 컬럼)
        # UPPER, LOWER, CORE, CARDIO
        part_str = str(getattr(equipment, 'body_part', 'UPPER')).upper()
        part_map = {'UPPER': 1.0, 'LOWER': 0.0, 'CORE': 0.5, 'CARDIO': 0.0}
        part_val = part_map.get(part_str, 0.5)
        
        # 4. Substitution Group Hash (DB: subcategory 컬럼)
        # 그룹핑 학습을 위해 subcategory 문자열을 해시값으로 변환
        subcat_str = str(getattr(equipment, 'subcategory', 'NONE')).upper()
        if subcat_str == 'NONE' or subcat_str == '':
            # subcategory가 비어있으면 이름으로 대체 (예: 덤벨 컬)
            subcat_str = str(equipment.name).upper()
        group_hash = (hash(subcat_str) % 100) / 100.0 

        # 5. Main Lift Indicator (메인 운동 여부)
        is_main = 1.0 if "MAIN" in subcat_str else 0.0

        return torch.FloatTensor([eq_type_val, difficulty_val, part_val, group_hash, is_main])

    # ==========================================================================
    # 3. 지능형 루틴 생성 알고리즘 (The Core Logic)
    # ==========================================================================
    def generate_routine(self, user, target_parts, intensity, availability_mode, current_occupancy):
        """
        사용자 요청에 맞춰 최적의 운동 루틴을 생성합니다.
        
        Args:
            user: User 객체
            target_parts: ['가슴', '등', '하체'...]
            intensity: '상', '중', '하'
            availability_mode: 'ALL' or 'AVAILABLE_ONLY'
            current_occupancy: {equip_id: bool} (True=사용중)
        """
        
        # --- [Logic 1] 사용자 분석 ---
        # InBody 점수 70점 미만이면 초보자(Beginner) -> 머신 위주 추천
        is_beginner = user.inbody.score < 70
        
        # 강도에 따른 난이도 허용 범위 설정
        allowed_difficulties = ['LOW', 'MID', 'HIGH']
        if intensity == '중':
            allowed_difficulties = ['LOW', 'MID']
        elif intensity == '하':
            allowed_difficulties = ['LOW']

        # --- [Logic 2] 후보군 필터링 (Filtering) ---
        candidates = []
        for eq in self.equipments:
            # 2-1. 타겟 부위 매칭 (DB 데이터 기반)
            if not self._is_target_match(eq, target_parts):
                continue
                
            # 2-2. 난이도 필터링
            eq_diff = getattr(eq, 'difficulty', 'MID')
            if eq_diff not in allowed_difficulties:
                continue

            # 2-3. 초보자 보호 로직
            # 초보자에게 FREE_WEIGHT는 가급적 제외 (단, 덤벨 컬 같은 단순 관절은 허용 가능)
            eq_type = getattr(eq, 'type', 'MACHINE')
            if is_beginner and eq_type == 'FREE_WEIGHT':
                # 난이도가 LOW인 프리웨이트는 허용, HIGH(벤치프레스 등)는 제외
                if eq_diff == 'HIGH':
                    continue
            
            # 2-4. 가용성 모드 체크
            if availability_mode == 'AVAILABLE_ONLY':
                # 사용 중이면 1차 필터링에서 제외 (나중에 대체제로 찾을 수 있음)
                if current_occupancy.get(eq.equip_id, False): 
                    continue 
            
            candidates.append(eq)
            
        if not candidates: return []

        # --- [Logic 3] AI 스코어링 (Scoring) ---
        scored_candidates = []
        user_tensor = self._get_user_tensor(user)
        
        self.model.eval()
        with torch.no_grad():
            for eq in candidates:
                eq_tensor = self._get_equip_tensor(eq)
                if len(eq_tensor) + len(user_tensor) != self.input_dim: continue
                
                input_vec = torch.cat([user_tensor, eq_tensor], dim=0)
                score = self.model(input_vec).item()
                
                # [Rule-based Boosting] 초보자에게는 쉬운 기구에 가산점 부여
                if is_beginner:
                    if getattr(eq, 'difficulty', 'MID') == 'LOW': score += 0.2
                    if eq_type == 'MACHINE': score += 0.1

                scored_candidates.append({'score': score, 'equip': eq})
        
        # 점수 높은 순 정렬 (내가 가장 선호/적합한 기구 순서)
        scored_candidates.sort(key=lambda x: x['score'], reverse=True)

        # --- [Logic 4] 대체 그룹 추천 (Substitution Logic) ---
        final_selection = []
        used_groups = set()
        
        # 목표 종목 개수 설정
        target_count = 6 if intensity == '상' else (4 if intensity == '중' else 3)
        
        for item in scored_candidates:
            if len(final_selection) >= target_count: break
            
            candidate = item['equip']
            # DB의 subcategory를 그룹 코드로 사용
            group_code = getattr(candidate, 'subcategory', '')
            if not group_code: group_code = candidate.name # 비어있으면 이름 사용
            
            # 중복 운동 방지 (이미 같은 그룹의 기구가 들어갔다면 Skip)
            # 단, group_code 자체가 이름인 경우(Unique)는 허용
            if group_code in used_groups and group_code != candidate.name:
                continue

            # 점유 상태 확인
            is_occupied = current_occupancy.get(candidate.equip_id, False)
            
            if not is_occupied:
                final_selection.append(candidate)
                used_groups.add(group_code)
            
            elif availability_mode == 'AVAILABLE_ONLY':
                # 자리가 없으면 같은 subcategory의 다른 '빈' 기구 찾기
                substitute = self._find_substitute(group_code, current_occupancy, self.equipments)
                
                if substitute:
                    print(f"💡 [Smart AI] '{candidate.name}' 대기 중 -> '{substitute.name}' 대체 추천")
                    final_selection.append(substitute)
                    used_groups.add(group_code)
                else:
                    # 대체제도 없으면... 현재는 Skip (혹은 대기 추천)
                    pass 

        # --- [Logic 5] 과학적 정렬 (Scientific Sorting) ---
        final_routine = self._sort_routine_scientifically(final_selection, is_beginner)
        
        # --- [Logic 6] 시간 계산 (time_ai 연동) ---
        routine_result = []
        for eq in final_routine:
            # time_ai를 통해 개인화된 수행 시간 예측
            rec_time = self.time_ai.predict_time(user, eq)
            is_active = current_occupancy.get(eq.equip_id, False)
            wait_time = random.randint(5, 15) if is_active else 0
            
            routine_result.append({
                'equipment': eq,
                'time': rec_time,
                'wait_time': wait_time
            })
            
        return routine_result

    # ==========================================================================
    # 4. Helper Functions (보조 로직)
    # ==========================================================================
    def _find_substitute(self, group_code, current_occupancy, all_equipments):
        """DB subcategory가 같은 기구 중 사용 가능한 것 검색"""
        if not group_code: return None
        
        avail_subs = [
            eq for eq in all_equipments 
            if getattr(eq, 'subcategory', '') == group_code 
            and not current_occupancy.get(eq.equip_id, False)
        ]
        # 발견된 것 중 첫 번째 반환 (추후 점수순 정렬 가능)
        return avail_subs[0] if avail_subs else None

    def _is_target_match(self, equipment, target_parts):
        """
        [DB 호환 수정]
        DB의 subcategory와 body_part를 분석하여 타겟 부위 매칭
        """
        sub = str(getattr(equipment, 'subcategory', '')).upper()
        b_part = str(getattr(equipment, 'body_part', '')).upper()
        name = str(equipment.name).upper() # 예외 처리를 위해 이름도 확인

        # 매핑 로직 (UI 입력 -> DB 데이터 키워드)
        keyword_map = {
            '가슴': ['CHEST', 'BENCH', 'FLY', 'PEC'],
            '등': ['BACK', 'LAT', 'ROW', 'PULL'],
            '하체': ['LEG', 'SQUAT', 'CALF', 'HIP', 'EXTENSION', 'CURL'],
            '어깨': ['SHOULDER', 'OHP', 'DELT'],
            '팔': ['ARM', 'CURL', 'TRICEP', 'BICEP'],
            '복근': ['CORE', 'ABS', 'CRUNCH'],
            '유산소': ['CARDIO', 'RUNNING', 'CYCLE']
        }
        
        for user_target in target_parts:
            # 1. 유산소 특수 처리
            if user_target == '유산소' and (b_part == 'CARDIO' or equipment.type == 'CARDIO'):
                return True
            
            # 2. 키워드 매칭 (subcategory -> name 순으로 검사)
            db_keywords = keyword_map.get(user_target, [])
            for key in db_keywords:
                if key in sub: return True   # subcategory 매칭 (1순위)
                if key in name: return True  # 이름 매칭 (2순위 - subcategory 비어있을 때)
                
            # 3. body_part 매칭 (보조)
            if user_target == '상체' and b_part == 'UPPER': return True
            if user_target == '하체' and b_part == 'LOWER': return True
            if user_target == '복근' and b_part == 'CORE': return True

        return False

    def _sort_routine_scientifically(self, routine_list, is_beginner):
        """
        [운동 순서 정렬]
        DB의 type, subcategory 정보를 활용하여 최적의 운동 순서 배치
        """
        main_compounds = [] 
        sub_machines = []   
        isolations = []     
        cardios = []

        for eq in routine_list:
            typ = str(getattr(eq, 'type', 'MACHINE')).upper()
            sub = str(getattr(eq, 'subcategory', '')).upper()
            name = str(eq.name)

            if typ == 'CARDIO' or sub == 'CARDIO':
                cardios.append(eq)
                continue
            
            # 메인 운동 판단 (프리웨이트이거나 MAIN 태그가 있거나 3대 운동 이름 포함)
            is_main = (typ == 'FREE_WEIGHT' or 'MAIN' in sub or 
                       any(k in name for k in ['벤치프레스', '스쿼트', '데드리프트']))

            # 고립 운동 판단 (단관절 키워드)
            is_iso = ('FLY' in sub or 'CURL' in sub or 'EXTENSION' in sub or 
                      'RAISE' in sub or 'CALF' in sub or typ == 'CABLE')

            if is_main:
                main_compounds.append(eq)
            elif is_iso:
                isolations.append(eq)
            else:
                sub_machines.append(eq) # 나머지는 보조 머신으로 간주

        final_order = []
        
        if is_beginner:
            # 초보자 전략: 머신(안전) -> 메인(학습) -> 고립
            final_order.extend(sub_machines)
            final_order.extend(main_compounds)
            final_order.extend(isolations)
        else:
            # 숙련자 전략: 메인(고중량) -> 머신 -> 고립
            final_order.extend(main_compounds)
            final_order.extend(sub_machines)
            final_order.extend(isolations)
            
        # 유산소는 항상 마지막(Cool-down)
        final_order.extend(cardios)
        
        return final_order

    # ==========================================================================
    # 5. 피드백 학습 (Learning from Feedback)
    # ==========================================================================
    def learn_from_feedback(self, user, routine_list, star_rating):
        """
        사용자의 별점(0~5)을 바탕으로 모델을 업데이트합니다.
        
        Args:
            user: User 객체
            routine_list: 생성했던 루틴 리스트 (Equipment 객체 리스트)
            star_rating: 사용자 별점 (Float, 0.0 ~ 5.0)
        """
        # 별점을 학습 목표값(Target)으로 변환 (0.0 ~ 1.0)
        target_val = 0.5 # Default neutral
        if star_rating >= 4.5: target_val = 1.0   # 매우 만족
        elif star_rating >= 4.0: target_val = 0.8 # 만족
        elif star_rating <= 1.0: target_val = 0.0 # 매우 불만족
        elif star_rating <= 2.0: target_val = 0.2 # 불만족
        else: return # 3점대(보통)는 학습 데이터로 쓰기 애매하므로 Skip
        
        self.model.train()
        total_loss = 0
        
        user_tensor = self._get_user_tensor(user)
        
        # 1. 현재 루틴의 모든 기구에 대해 학습 수행
        for eq in routine_list:
            eq_tensor = self._get_equip_tensor(eq)
            
            # Input Vector
            input_vec = torch.cat([user_tensor, eq_tensor], dim=0)
            target = torch.FloatTensor([target_val])
            
            # Forward & Backward
            self.optimizer.zero_grad()
            pred = self.model(input_vec)
            loss = self.criterion(pred, target)
            loss.backward()
            self.optimizer.step()
            
            total_loss += loss.item()
            
            # 메모리 저장 (Experience Replay용)
            self.memory.append((input_vec.detach(), target))
            
        # 2. Replay Learning (과거 기억 복습 - 배치 학습)
        if len(self.memory) > 32:
            batch = random.sample(self.memory, 32)
            batch_loss = 0
            for b_in, b_target in batch:
                self.optimizer.zero_grad()
                pred = self.model(b_in)
                loss = self.criterion(pred, b_target)
                loss.backward()
                self.optimizer.step()
                batch_loss += loss.item()
            
            print(f"🧠 [Routine AI] 피드백 학습 완료 (Rating: {star_rating} -> Loss: {batch_loss/32:.4f})")
                
        return total_loss