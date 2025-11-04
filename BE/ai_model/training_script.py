import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.layers import Input, Conv1D, MaxPooling1D, Concatenate, Dense, Flatten, Normalization
from tensorflow.keras.models import Model
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, MinMaxScaler
import os

# ==============================================================================
# PART 1: 데이터 생성 (Data Simulation)
# ==============================================================================
print("="*60)
print("PART 1: 데이터 생성 시작")
print("="*60)

def generate_mock_wisdm_data(num_samples=5000):
    """
    논문의 WISDM 데이터셋을 모방한 가상 센서 데이터를 생성합니다.
    - num_samples: 생성할 데이터 샘플의 수
    - 반환값: (가속도 데이터, 자이로 데이터), 라벨
    """
    print(f"모델 1을 위한 가상 센서 데이터 {num_samples}개를 생성합니다...")
    # 시계열 데이터의 형태: (샘플 수, 시간 스텝, 피처 수)
    timesteps = 128  # 각 샘플의 시간 길이
    features = 3     # x, y, z 축

    # 가속도계와 자이로스코프 데이터 무작위 생성
    mock_acc_data = np.random.randn(num_samples, timesteps, features)
    mock_gyro_data = np.random.randn(num_samples, timesteps, features)

    # 18개의 활동 라벨 무작위 생성 (0~17)
    mock_labels = np.random.randint(0, 18, size=num_samples)
    print("가상 센서 데이터 생성 완료.\n")
    return (mock_acc_data, mock_gyro_data), mock_labels

def generate_mock_recommendation_data(num_samples=5000):
    """
    모델 2(시간 추천) 학습을 위한 가상 개인화 데이터를 생성합니다.
    - num_samples: 생성할 데이터 샘플의 수
    - 반환값: Pandas DataFrame
    """
    print(f"모델 2를 위한 가상 개인화 추천 데이터 {num_samples}개를 생성합니다...")
    data = {
        'age': np.random.randint(18, 65, size=num_samples),
        'gender': np.random.randint(0, 2, size=num_samples),  # 0: 남성, 1: 여성
        'height': np.random.randint(150, 190, size=num_samples),
        'weight': np.random.randint(50, 100, size=num_samples),
        'goal': np.random.randint(0, 2, size=num_samples),  # 0: 근력, 1: 다이어트
        'career': np.random.randint(0, 3, size=num_samples), # 0: 초급, 1: 중급, 2: 고급
        'upper_ratio': np.random.rand(num_samples), # 오늘의 상체 활동 비율
        'lower_ratio': np.random.rand(num_samples), # 오늘의 하체 활동 비율
        'machine': np.random.randint(0, 5, size=num_samples) # 0:벤치, 1:러닝머신, 2:스쿼트랙 등
    }
    df = pd.DataFrame(data)

    # 규칙 기반으로 '최적 운동 시간' (정답 데이터) 생성
    # 예: 나이가 적고, 근력 목표, 고급자일수록 운동 시간이 길어지는 경향
    df['time_in_minutes'] = 20 \
        - (df['age'] - 40) * 0.1 \
        + df['goal'].apply(lambda x: 5 if x == 0 else -5) \
        + df['career'] * 5 \
        - df['upper_ratio'] * 10 * (df['machine'].isin([0])) \
        + df['lower_ratio'] * 10 * (df['machine'].isin([1, 2])) \
        + np.random.randn(num_samples) * 3 # 노이즈 추가

    df['time_in_minutes'] = df['time_in_minutes'].clip(5, 60) # 시간 범위를 5분~60분으로 제한
    print("가상 개인화 추천 데이터 생성 완료.\n")
    return df

# ==============================================================================
# PART 2: 모델 1 - 활동 분류 모델 (1D CNN)
# ==============================================================================
print("="*60)
print("PART 2: 모델 1 - 활동 분류 모델 구축 및 학습")
print("="*60)

def build_activity_recognition_model(input_shape, num_classes):
    """
    논문을 기반으로 병렬 구조의 1D CNN 모델을 구축합니다.
    - input_shape: 입력 데이터의 형태 (timesteps, features)
    - num_classes: 분류할 클래스(활동)의 수 (18개)
    - 반환값: Keras Model
    """
    def cnn_block(input_tensor, kernel_size):
        x = Conv1D(filters=24, kernel_size=kernel_size, activation='relu', padding='same')(input_tensor)
        x = MaxPooling1D(pool_size=2)(x)
        x = Conv1D(filters=48, kernel_size=kernel_size, activation='relu', padding='same')(x)
        x = MaxPooling1D(pool_size=2)(x)
        x = Conv1D(filters=96, kernel_size=kernel_size, activation='relu', padding='same')(x)
        x = MaxPooling1D(pool_size=2)(x)
        return x

    # 두 개의 입력: 가속도, 자이로
    acc_input = Input(shape=input_shape, name='acceleration_input')
    gyro_input = Input(shape=input_shape, name='gyro_input')

    # 병렬 구조: 각 입력에 대해 다른 커널 크기로 특징 추출
    acc_block1 = cnn_block(acc_input, kernel_size=3)
    acc_block2 = cnn_block(acc_input, kernel_size=5)
    gyro_block3 = cnn_block(gyro_input, kernel_size=3)
    gyro_block4 = cnn_block(gyro_input, kernel_size=5)

    # 모든 블록의 출력을 하나로 결합
    concatenated = Concatenate()([
        Flatten()(acc_block1), Flatten()(acc_block2),
        Flatten()(gyro_block3), Flatten()(gyro_block4)
    ])

    # 최종 분류기
    dense_layer = Dense(128, activation='relu')(concatenated)
    output = Dense(num_classes, activation='softmax')(dense_layer)

    model = Model(inputs=[acc_input, gyro_input], outputs=output, name="ActivityRecognitionModel")
    print("모델 1: 활동 분류 모델 아키텍처")
    model.summary()
    return model

# ==============================================================================
# PART 3: 모델 2 - 운동 시간 추천 모델 (DNN)
# ==============================================================================
print("\n" + "="*60)
print("PART 3: 모델 2 - 운동 시간 추천 모델 구축 및 학습")
print("="*60)

def build_time_recommendation_model(normalizer):
    """
    개인화된 운동 시간을 추천하는 DNN 회귀 모델을 구축합니다.
    - normalizer: 입력 데이터 정규화를 위한 Keras Normalization 레이어
    - 반환값: Keras Model
    """
    input_features = Input(shape=(9,)) # 9개 피처
    normalized_input = normalizer(input_features)
    
    x = Dense(64, activation='relu')(normalized_input)
    x = Dense(32, activation='relu')(x)
    output_time = Dense(1)(x)  # 회귀 문제이므로 마지막 활성화 함수는 없음

    model = Model(inputs=input_features, outputs=output_time, name="TimeRecommendationModel")
    print("모델 2: 운동 시간 추천 모델 아키텍처")
    model.summary()
    return model

# ==============================================================================
# PART 4: 메인 실행 흐름 (Main Workflow)
# ==============================================================================
def main():
    """ 전체 데이터 생성, 모델 학습, 통합 예측 과정을 실행합니다. """

    # --- 모델 저장 경로 설정 ---
    # (prediction_utils.py가 찾을 수 있도록 ai_model 폴더 내에 저장)
    SAVE_DIR = os.path.join('ai_model', 'saved_models')
    if not os.path.exists(SAVE_DIR):
        os.makedirs(SAVE_DIR)
        print(f"'{SAVE_DIR}' 폴더를 생성했습니다.")

    
    # --- 모델 1 학습 과정 ---
    print("\n--- 모델 1 학습 시작 ---")
    (mock_acc_data, mock_gyro_data), mock_labels = generate_mock_wisdm_data()
    
    # 라벨을 원-핫 인코딩으로 변환 (e.g., 3 -> [0,0,0,1,0...])
    one_hot_encoder = OneHotEncoder(sparse_output=False)
    mock_labels_one_hot = one_hot_encoder.fit_transform(mock_labels.reshape(-1, 1))
    
    # 데이터셋을 학습용과 테스트용으로 분리
    acc_train, acc_test, gyro_train, gyro_test, labels_train, labels_test = train_test_split(
        mock_acc_data, mock_gyro_data, mock_labels_one_hot, test_size=0.2, random_state=42
    )

    model1 = build_activity_recognition_model(input_shape=(128, 3), num_classes=18)
    model1.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    
    print("\n모델 1 학습을 시작합니다...")
    model1.fit(
        [acc_train, gyro_train], labels_train,
        epochs=5,  # 데모용으로 epoch 수를 줄임
        batch_size=64,
        validation_split=0.1,
        verbose=1
    )
    
    print("\n모델 1 성능 평가:")
    loss, accuracy = model1.evaluate([acc_test, gyro_test], labels_test)
    print(f"테스트 정확도: {accuracy*100:.2f}%")
    
    # 학습된 모델 저장
    model1_save_path = os.path.join(SAVE_DIR, "activity_recognition_model.keras")
    model1.save(model1_save_path)
    print(f"모델 1이 '{model1_save_path}' 파일로 저장되었습니다.")


    # --- 모델 2 학습 과정 ---
    print("\n\n--- 모델 2 학습 시작 ---")
    df = generate_mock_recommendation_data()
    
    X = df.drop('time_in_minutes', axis=1)
    y = df['time_in_minutes']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # 입력 데이터 정규화
    normalizer = Normalization()
    normalizer.adapt(np.array(X_train)) # 학습 데이터의 통계에 맞게 정규화 레이어 조정

    model2 = build_time_recommendation_model(normalizer)
    model2.compile(optimizer='adam', loss='mean_absolute_error') # MAE: 평균 절대 오차

    print("\n모델 2 학습을 시작합니다...")
    model2.fit(
        X_train, y_train,
        epochs=10, # 데모용으로 epoch 수를 줄임
        batch_size=32,
        validation_split=0.1,
        verbose=1
    )
    
    print("\n모델 2 성능 평가:")
    mae_loss = model2.evaluate(X_test, y_test)
    print(f"테스트 평균 절대 오차(MAE): {mae_loss:.2f} 분 (예측 시간이 평균적으로 이만큼 차이남)")
    
    # 학습된 모델 저장 (이 파일이 우리가 실제로 사용할 'AI 두뇌'입니다)
    model2_save_path = os.path.join(SAVE_DIR, "time_recommendation_model.keras")
    model2.save(model2_save_path)
    print(f"모델 2가 '{model2_save_path}' 파일로 저장되었습니다.")


    # --- 통합 예측 시뮬레이션 ---
    print("\n\n" + "="*60)
    print("PART 5: 통합 예측 시뮬레이션")
    print("="*60)
    
    # 시뮬레이션할 가상 사용자 프로필
    user_profile = {
        'age': 28, 'gender': 0, 'height': 178, 'weight': 75,
        'goal': 0, 'career': 1, 'machine': 0 # 벤치프레스
    }
    print("시나리오: 28세 남성, 근력 목표, 운동 경력 중급. 벤치프레스를 하려고 함.")

    # 이 사용자의 하루 활동을 모델 1로 분석했다고 가정
    # 예: 가상의 센서 데이터 1개 생성
    sample_acc = np.random.randn(1, 128, 3)
    sample_gyro = np.random.randn(1, 128, 3)

    # 모델 1로 활동 예측
    predicted_activities = model1.predict([sample_acc, sample_gyro])
    
    # 논문에 따라 활동을 상/하체/전신으로 그룹핑
    # A(하체): 0,1,2,3,4,12 | B(전신): 5,13,14,15,16,17 | C(상체): 6,7,8,9,10,11
    lower_body_indices = [0, 1, 2, 3, 4, 12]
    upper_body_indices = [6, 7, 8, 9, 10, 11]
    
    # 예측된 확률을 바탕으로 상/하체 활동 비율 계산
    lower_ratio = np.sum(predicted_activities[0][lower_body_indices])
    upper_ratio = np.sum(predicted_activities[0][upper_body_indices])
    
    print(f"\n모델 1 분석 결과: 오늘의 활동은 하체 비율({lower_ratio:.2f}), 상체 비율({upper_ratio:.2f})로 분석됨.")

    # 모델 2 입력을 위해 사용자 프로필과 활동 분석 결과 결합
    model2_input = pd.DataFrame([{
        **user_profile,
        'upper_ratio': upper_ratio,
        'lower_ratio': lower_ratio,
    }])
    # machine은 이미 user_profile에 포함됨
    
    print("\n모델 2에 사용자 정보와 활동 분석 결과를 입력하여 최종 운동 시간 추천...")
    predicted_time = model2.predict(model2_input)
    
    print("\n" + "-"*30)
    print(f"✨ 최종 추천 결과 ✨")
    print(f"AI가 추천하는 최적의 벤치프레스 운동 시간은 약 {predicted_time[0][0]:.1f} 분입니다.")
    print("-"*30)


if __name__ == '__main__':
    main()
