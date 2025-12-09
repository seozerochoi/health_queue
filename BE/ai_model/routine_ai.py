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
    def __init__(self, db_equipments, time_ai_engine=None):
        """
        Args:
            db_equipments: DB에서 가져온 Equipment 객체 리스트.
            time_ai_engine: (Optional) 이미 학습된 TimeAI 엔진 인스턴스
        """
        self.equipments = db_equipments
        
        # Input Feature Dimension: User(12개) + Equipment(Metadata 5개) = 17개
        self.input_dim = 17 
        self.model = PreferenceNetwork(self.input_dim)
        # [Update] 학습률(LR) 상향 조정 (0.001 -> 0.01) : 피드백 즉각 반영을 위해
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.01)
        self.criterion = nn.BCELoss() # 이진 분류 손실함수 (좋다/싫다 유사)
        
        # 시간 예측 AI 엔진 연결 (소요 시간 계산용)
        if time_ai_engine:
            self.time_ai = time_ai_engine
        else:
            self.time_ai = AIEngine()
            # 주의: 실제 서버에서는 이미 학습된 전역 time_ai 객체를 주입받는 것이 권장됨
            if not self.time_ai.is_trained:
                self.time_ai.pretrain_with_formula()

        # Experience Replay Buffer (학습 데이터 기억 저장소)
        self.memory = deque(maxlen=2000)

    def save_checkpoint(self, filepath="routine_ai_checkpoint.pth"):
        """학습된 모델 가중치를 파일로 저장"""
        torch.save(self.model.state_dict(), filepath)
        print(f"💾 루틴 모델 저장 완료: {filepath}")

    def load_checkpoint(self, filepath="routine_ai_checkpoint.pth"):
        """저장된 모델 불러오기"""
        try:
            self.model.load_state_dict(torch.load(filepath))
            self.model.eval()
            print(f"📂 루틴 모델 불러오기 성공: {filepath}")
        except FileNotFoundError:
            print("⚠️ 저장된 루틴 모델이 없습니다. 새로 시작합니다.")
        except RuntimeError as e:
            print(f"⚠️ 루틴 모델 구조 불일치로 로드 실패 (새로 시작): {e}")
            # 구조가 바뀌었으므로 기존 체크포인트는 무시하고 새로 학습해야 함
        except Exception as e:
            print(f"⚠️ 루틴 모델 로드 중 알 수 없는 오류 발생: {e}")

    def update_equipments_list(self, new_equipments_list):
        """운영자가 기구를 추가/수정했을 때 리스트 갱신"""
        self.equipments = new_equipments_list
        print(f"🔄 AI 기구 데이터베이스 업데이트 완료 (총 {len(self.equipments)}개)")

    def _get_user_tensor(self, user):
        """time_ai의 로직을 재사용하여 User Feature 추출 (12차원)"""
        # time_ai의 feature 추출은 equipment.main_part 등을 요구하므로
        # DB Equipment가 없거나 호환 객체가 아니면 안전한 더미를 사용
        if not self.equipments:
            dummy = Equipment(0, "DUMMY", 0, "GENERAL")
            full_features = self.time_ai._extract_features(user, dummy)
        else:
            # DB Equipment를 time_ai.Equipment로 변환해 사용
            db_eq = self.equipments[0]
            ai_eq = self._to_ai_equipment(db_eq)
            full_features = self.time_ai._extract_features(user, ai_eq)
            
        # [Update] time_ai._extract_features가 14차원(User 12 + Equip 2)을 반환하므로
        # User Feature(0~6, 9~13)만 추출하여 12차원으로 구성
        # Indices: 0-6(Raw User), 7(Equip Main), 8(Equip Cardio), 9-13(Derived User)
        user_features = torch.cat((full_features[:7], full_features[9:]))
        return user_features

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
        # 입력값 정규화 (공백 제거)
        intensity = str(intensity).strip()

        # [Advanced Logic] Total Workload Strategy (Fatigue Capacity System)
        # 사용자의 체력과 강도에 따라 '운동 용량(Capacity)'을 산정하고,
        # 기구별 '비용(Cost)'을 계산하여 용량이 찰 때까지 담는 방식.
        
        # 1. 사용자 일일 운동 용량 계산 (Daily Capacity)
        base_capacity = 100
        # UserProfile에서 inbody_score 가져오기 (없으면 기본값)
        try:
            inbody_score = getattr(user.userprofile, 'inbody_score', None)
        except:
            inbody_score = None

        if inbody_score:
            if inbody_score >= 80: base_capacity += 20
            elif inbody_score >= 70: base_capacity += 10
            elif inbody_score < 60: base_capacity -= 10
        
        allowed_difficulties = ['LOW', 'MID', 'HIGH']
        
        # 강도에 따른 용량 및 시간 배율 설정
        if intensity == '상':
            capacity_multiplier = 1.3
            time_multiplier = 1.2
            allowed_difficulties = ['LOW', 'MID', 'HIGH']
        elif intensity == '중':
            capacity_multiplier = 1.0
            time_multiplier = 1.0
            allowed_difficulties = ['LOW', 'MID', 'HIGH']
        else: # '하'
            capacity_multiplier = 0.7
            time_multiplier = 0.8
            allowed_difficulties = ['LOW', 'MID']
            
        total_capacity = base_capacity * capacity_multiplier
        
        # 2. 기구별 비용 계산 함수 (Equipment Cost)
        def get_equipment_cost(eq):
            cost = 10 # 기본 비용
            e_type = str(getattr(eq, 'type', 'MACHINE')).upper()
            e_diff = getattr(eq, 'difficulty', 'MID')
            
            if e_type == 'FREE_WEIGHT':
                cost += 5
            elif e_type == 'MACHINE':
                cost += 2
                
            if e_diff == 'HIGH':
                cost += 10
            elif e_diff == 'MID':
                cost += 5
            # LOW는 추가 비용 없음
            
            return cost

        # --- [Logic 2] 후보군 필터링 (Filtering) ---
        def filter_candidates(allowed_diffs):
            filtered = []
            for eq in self.equipments:
                # 2-1. 타겟 부위 매칭 (DB 데이터 기반)
                if not self._is_target_match(eq, target_parts):
                    continue
                    
                # 2-2. 난이도 필터링 (대소문자 무시)
                eq_diff = str(getattr(eq, 'difficulty', 'MID')).upper()
                if eq_diff not in allowed_diffs:
                    continue

                # 2-3. 초보자 보호 로직
                # 초보자에게 FREE_WEIGHT는 가급적 제외 (단, 덤벨 컬 같은 단순 관절은 허용 가능)
                eq_type = str(getattr(eq, 'type', 'MACHINE')).upper()
                if is_beginner and eq_type == 'FREE_WEIGHT':
                    # 난이도가 LOW인 프리웨이트는 허용, HIGH(벤치프레스 등)는 제외
                    if eq_diff == 'HIGH':
                        continue
                
                # 2-4. 가용성 모드 체크
                if availability_mode == 'AVAILABLE_ONLY':
                    # 사용 중이면 1차 필터링에서 제외 (나중에 대체제로 찾을 수 있음)
                    # occupancy key can be DB id or ai_model.Equipment.equip_id
                    occ_key = getattr(eq, 'equip_id', getattr(eq, 'id', None))
                    if current_occupancy.get(occ_key, False): 
                        continue 
                
                filtered.append(eq)
            return filtered

        candidates = filter_candidates(allowed_difficulties)
        
        # [Fallback System] 결과가 없을 경우 난이도 범위를 단계적으로 넓혀서 재검색
        if not candidates:
            # 1. '하' 선택 시 -> '중' 난이도까지 확장
            if intensity == '하':
                print("⚠️ '하' 난이도 기구 없음 -> '중' 난이도 포함 재검색")
                candidates = filter_candidates(['LOW', 'MID'])
            
            # 2. 여전히 없거나, '중' 선택 시 -> 전체 난이도('상' 포함)로 확장
            if not candidates and (intensity == '하' or intensity == '중'):
                print("⚠️ 기구 부족 -> 전체 난이도(상/중/하) 포함 재검색")
                candidates = filter_candidates(['LOW', 'MID', 'HIGH'])
            
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
                
                # [Exploration] 점수에 약간의 무작위성 추가 (다양성 확보)
                # 학습 초기나 점수가 비슷할 때 매번 다른 결과가 나오도록 유도
                score += random.uniform(-0.05, 0.05)

                # [Advanced Logic] 사용자 수준별 맞춤형 가산점 로직 (Rule-based Boosting)
                eq_type = str(getattr(eq, 'type', 'MACHINE')).upper()
                eq_diff = getattr(eq, 'difficulty', 'MID')
                eq_sub = str(getattr(eq, 'subcategory', '')).upper()
                
                if is_beginner:
                    # [초보자 전략] 안전 제일 + 머신 위주 + 쉬운 프리웨이트 입문
                    if eq_type == 'MACHINE':
                        score += 0.25 # 머신 강력 추천
                        # 대근육 머신은 더 추천 (성장 효율)
                        if getattr(eq, 'body_part', '') in ['UPPER', 'LOWER']:
                            score += 0.1
                    elif eq_type == 'FREE_WEIGHT':
                        if eq_diff == 'HIGH':
                            score -= 0.3 # 3대 운동 등 고난이도는 감점 (부상 방지)
                        elif eq_diff == 'LOW':
                            score += 0.15 # 덤벨 컬 등 쉬운 프리웨이트는 권장
                
                else:
                    # [숙련자 전략] 고중량 프리웨이트 + 타겟 고립 + 다양성
                    if eq_type == 'FREE_WEIGHT':
                        if eq_diff == 'HIGH':
                            score += 0.3 # 3대 운동 강력 추천
                        else:
                            score += 0.1
                    elif eq_type == 'CABLE':
                        score += 0.15 # 케이블 운동 선호 (자극 위주)
                    
                    # 메인 운동(프레스, 스쿼트 등)에 가산점
                    if 'MAIN' in eq_sub or 'PRESS' in eq_sub or 'SQUAT' in eq_sub:
                        score += 0.1

                scored_candidates.append({'score': score, 'equip': eq})
        
        # 점수 높은 순 정렬 (내가 가장 선호/적합한 기구 순서)
        scored_candidates.sort(key=lambda x: x['score'], reverse=True)

        # [Smart Expansion] 
        # 단순히 1등 기구의 점수만 보는 것이 아니라, 
        # '추천할만한(점수 0.4 이상)' 기구가 충분히 확보되었는지 확인합니다.
        # 확보되지 않았다면 범위를 넓혀서라도 좋은 기구를 찾아옵니다.
        
        usable_count = sum(1 for item in scored_candidates if item['score'] >= 0.4)
        
        if usable_count < 3: # 최소 3개는 좋은 기구여야 함
            print(f"⚠️ 쓸만한 기구 부족({usable_count}개) -> 필터링 완화 및 재검색")
            # 난이도 제한 해제
            expanded_candidates = filter_candidates(['LOW', 'MID', 'HIGH'])
            
            # 기존 후보군에 없는 새로운 기구만 추가
            existing_ids = {getattr(item['equip'], 'id', 0) for item in scored_candidates}
            
            for eq in expanded_candidates:
                if getattr(eq, 'id', 0) not in existing_ids:
                    # 점수 계산
                    eq_tensor = self._get_equip_tensor(eq)
                    input_vec = torch.cat([user_tensor, eq_tensor], dim=0)
                    with torch.no_grad():
                        score = self.model(input_vec).item()
                    # (Rule-based Boosting은 생략하거나 약하게 적용하여 순수 선호도 반영)
                    scored_candidates.append({'score': score, 'equip': eq})
            
            # 다시 정렬
            scored_candidates.sort(key=lambda x: x['score'], reverse=True)

        # --- [Logic 4] 대체 그룹 추천 (Substitution Logic) with Capacity System ---
        final_selection = []
        used_groups = set()
        current_cost = 0
        
        # 최소/최대 개수 안전장치
        MIN_ITEMS = 3
        MAX_ITEMS = 8
        
        for item in scored_candidates:
            # 용량 초과 체크 (단, 최소 개수는 보장)
            if current_cost >= total_capacity and len(final_selection) >= MIN_ITEMS:
                break
            # 최대 개수 초과 체크
            if len(final_selection) >= MAX_ITEMS:
                break
                
            candidate = item['equip']
            equip_cost = get_equipment_cost(candidate)
            
            # 남은 용량이 기구 비용보다 현저히 적으면 스킵 (단, 아직 최소 개수 못 채웠으면 무시)
            if (total_capacity - current_cost) < (equip_cost * 0.5) and len(final_selection) >= MIN_ITEMS:
                continue

            # DB의 subcategory를 그룹 코드로 사용
            group_code = getattr(candidate, 'subcategory', '')
            if not group_code: group_code = candidate.name # 비어있으면 이름 사용
            
            # 중복 운동 방지 (이미 같은 그룹의 기구가 들어갔다면 Skip)
            # 단, group_code 자체가 이름인 경우(Unique)는 허용
            if group_code in used_groups and group_code != candidate.name:
                continue

            # 점유 상태 확인
            occ_key = getattr(candidate, 'equip_id', getattr(candidate, 'id', None))
            is_occupied = current_occupancy.get(occ_key, False)
            
            if not is_occupied:
                final_selection.append(candidate)
                used_groups.add(group_code)
                current_cost += equip_cost
            
            elif availability_mode == 'AVAILABLE_ONLY':
                # 자리가 없으면 같은 subcategory의 다른 '빈' 기구 찾기
                substitute = self._find_substitute(group_code, current_occupancy, self.equipments)
                
                if substitute:
                    print(f"💡 [Smart AI] '{candidate.name}' 대기 중 -> '{substitute.name}' 대체 추천")
                    final_selection.append(substitute)
                    used_groups.add(group_code)
                    current_cost += equip_cost # 대체 기구 비용 추가
                else:
                    # 대체제도 없으면... 현재는 Skip (혹은 대기 추천)
                    pass 

        # --- [Logic 5] 과학적 정렬 (Scientific Sorting) ---
        final_routine = self._sort_routine_scientifically(final_selection, is_beginner)
        
        # --- [Logic 6] 시간 계산 (time_ai 연동) ---
        routine_result = []
        for eq in final_routine:
            # time_ai는 AIEquipment 형태를 기대하므로 변환 후 예측
            ai_eq = self._to_ai_equipment(eq)
            
            # [Advanced Logic] 강도별 시간 배수 적용
            base_rec_time = self.time_ai.predict_time(user, ai_eq)
            rec_time = base_rec_time * time_multiplier
            
            # 너무 짧거나 길지 않게 안전 범위 재조정 (최소 3분 ~ 최대 90분)
            rec_time = max(3.0, min(90.0, rec_time))

            occ_key = getattr(eq, 'equip_id', getattr(eq, 'id', None))
            is_active = current_occupancy.get(occ_key, False)
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
            and not current_occupancy.get(getattr(eq, 'equip_id', getattr(eq, 'id', None)), False)
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

    def _to_ai_equipment(self, db_eq):
        """DB Equipment -> time_ai.Equipment 변환"""
        try:
            main_part = 0 if str(getattr(db_eq, 'body_part', 'UPPER')).upper() == 'UPPER' else 1
            sub_part = getattr(db_eq, 'subcategory', None) or str(getattr(db_eq, 'name', 'GENERAL'))
            equip_type = str(getattr(db_eq, 'type', 'MACHINE')).upper() # [Fix] 타입 전달
            
            return Equipment(
                getattr(db_eq, 'id', getattr(db_eq, 'equip_id', 0)),
                getattr(db_eq, 'name', 'Unknown'),
                main_part,
                sub_part,
                equip_type=equip_type # [Fix] 타입 전달
            )
        except Exception:
            # 실패 시 안전한 기본값 반환
            return Equipment(0, "DUMMY", 0, "GENERAL")

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
        
        # 1. 현재 루틴의 모든 기구에 대해 [집중 학습] 수행 (Oversampling Effect)
        # 피드백을 즉시 반영하기 위해 동일 데이터를 5회 반복 학습
        current_batch = []
        for eq in routine_list:
            eq_tensor = self._get_equip_tensor(eq)
            input_vec = torch.cat([user_tensor, eq_tensor], dim=0)
            target = torch.FloatTensor([target_val])
            current_batch.append((input_vec, target))
            
            # 메모리 저장 (Experience Replay용)
            self.memory.append((input_vec.detach(), target))

        # 집중 학습 (5 Epochs)
        for _ in range(5):
            for input_vec, target in current_batch:
                self.optimizer.zero_grad()
                pred = self.model(input_vec)
                loss = self.criterion(pred, target)
                loss.backward()
                self.optimizer.step()
                total_loss += loss.item()
            
        # 2. Replay Learning (과거 기억 복습 - 배치 학습)
        # 과거 데이터와 현재 데이터를 섞어서 학습 (Catastrophic Forgetting 방지)
        if len(self.memory) > 32:
            # 현재 피드백 데이터도 배치에 일부 포함되도록 유도할 수 있음
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