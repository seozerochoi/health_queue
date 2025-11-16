"""
간단한 OCR 서비스 테스트
"""

import sys
import os

# Django 설정 불러오기
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from users.ocr_service import InBodyOCRService


def test_extract_number():
    """숫자 추출 테스트"""
    service = InBodyOCRService()
    
    test_cases = [
        ("체중 70.5", 70.5),
        ("골격근량: 32.1kg", 32.1),
        ("BMI 23.4", 23.4),
        ("85점", 85.0),
        ("no number", None),
    ]
    
    print("=== 숫자 추출 테스트 ===")
    for text, expected in test_cases:
        result = service.extract_number(text)
        status = "✓" if result == expected else "✗"
        print(f"{status} '{text}' → {result} (예상: {expected})")


def test_parse_inbody_data():
    """인바디 데이터 파싱 테스트"""
    service = InBodyOCRService()
    
    # 모의 OCR 결과 (AWS Rekognition 형식)
    mock_text_detections = [
        {"Type": "LINE", "DetectedText": "인바디 측정 결과"},
        {"Type": "LINE", "DetectedText": "체중 70.5"},
        {"Type": "LINE", "DetectedText": "골격근량 32.1"},
        {"Type": "LINE", "DetectedText": "체지방량 12.3"},
        {"Type": "LINE", "DetectedText": "체지방률 17.5"},
        {"Type": "LINE", "DetectedText": "BMI 23.4"},
        {"Type": "LINE", "DetectedText": "인바디점수 85"},
    ]
    
    print("\n=== 인바디 데이터 파싱 테스트 ===")
    result = service.parse_inbody_data(mock_text_detections)
    
    print(f"추출된 데이터:")
    for key, value in result.items():
        print(f"  - {key}: {value}")
    
    # 기대 결과 확인
    expected_fields = ['weight_kg', 'skeletal_muscle_mass_kg', 'body_fat_mass_kg', 
                      'body_fat_percentage', 'bmi', 'inbody_score']
    
    for field in expected_fields:
        if field in result:
            print(f"✓ {field} 추출 성공")
        else:
            print(f"✗ {field} 추출 실패")


if __name__ == "__main__":
    print("InBody OCR 서비스 테스트\n")
    
    try:
        test_extract_number()
        test_parse_inbody_data()
        print("\n테스트 완료!")
    except Exception as e:
        print(f"\n오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
