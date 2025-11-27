import torch
import torch.nn as nn
import torch.optim as optim

# ==============================================================================
# Routine Ranking AI (Routine Satisfaction Model)
# 역할: User State + Equipment -> Predicted Star Rating (1.0 ~ 5.0)
# ==============================================================================

class RankNet(nn.Module):
    def __init__(self, input_dim):
        super(RankNet, self).__init__()
        # 입력: 유저정보 + 기구정보 -> 출력: 예상 별점
        self.layers = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1), 
            nn.Sigmoid() # 0~1 사이 값으로 변환
        )
        
    def forward(self, x):
        # 0~1 출력을 1~5점 스케일로 변환
        return self.layers(x) * 4.0 + 1.0 

class RoutineRanker:
    def __init__(self):
        # 입력 차원: 사용자특징(9개) + 기구특징(3개) = 12개 (예시)
        self.input_dim = 12
        self.model = RankNet(self.input_dim)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.01)
        self.criterion = nn.MSELoss()

    def _extract_features(self, user_profile, equipment):
        """DB 데이터를 AI가 이해하는 텐서(숫자 배열)로 변환
        
        기존 DB 구조에 맞춰 매핑:
        - user_profile: users.models.UserProfile
        - equipment: equipment.models.Equipment
        """
        # gender: MALE=0, FEMALE=1로 변환
        gender_numeric = 1 if user_profile.gender == 'FEMALE' else 0
        
        # goal: DIET=0, BULK_UP=1로 변환
        goal_numeric = 1 if user_profile.goal == 'BULK_UP' else 0
        
        # body_part: UPPER=0, LOWER=1, 나머지=2로 변환
        body_part_upper = 1.0 if equipment.body_part == 'UPPER' else 0.0
        body_part_lower = 1.0 if equipment.body_part == 'LOWER' else 0.0
        
        features = [
            # User Features (InBody 데이터)
            user_profile.inbody_score / 100.0 if user_profile.inbody_score else 0.5,
            user_profile.body_fat_percentage / 50.0 if user_profile.body_fat_percentage else 0.5,
            user_profile.skeletal_muscle_mass / 50.0 if user_profile.skeletal_muscle_mass else 0.5,
            gender_numeric,
            goal_numeric,
            user_profile.right_arm_muscle / 100.0 if user_profile.right_arm_muscle else 0.5,
            user_profile.trunk_muscle / 100.0 if user_profile.trunk_muscle else 0.5,
            user_profile.right_leg_muscle / 100.0 if user_profile.right_leg_muscle else 0.5,
            
            # Equipment Features
            body_part_upper,
            body_part_lower,
            1.0 if equipment.difficulty == 'HIGH' else 0.0,
            1.0 if equipment.difficulty == 'LOW' else 0.0,
        ]
        return torch.FloatTensor(features)

    def predict_satisfaction(self, user_profile, equipment):
        """
        [추천 단계] 이 기구를 추천하면 사용자가 몇 점을 줄지 예측
        """
        self.model.eval()
        with torch.no_grad():
            inputs = self._extract_features(user_profile, equipment).unsqueeze(0)
            score = self.model(inputs).item()
        return score # 예상 별점 (Example: 4.2)

    def train_routine(self, user_profile, equipment, actual_star_rating):
        """
        [학습 단계] 사용자가 실제로 준 별점으로 AI 학습
        """
        self.model.train()
        self.optimizer.zero_grad()
        
        inputs = self._extract_features(user_profile, equipment).unsqueeze(0)
        target = torch.FloatTensor([[actual_star_rating]]) # 실제 별점
        
        predicted = self.model(inputs)
        loss = self.criterion(predicted, target)
        
        loss.backward()
        self.optimizer.step()
        
        return loss.item()