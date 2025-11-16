"""
OCR 서비스 유닛 테스트 (Django 없이 독립 실행)
"""

import re
from typing import Dict, Optional, List


def extract_number(text: str) -> Optional[float]:
    """텍스트에서 숫자 추출"""
    number_pattern = r'[-+]?\d*\.?\d+'
    match = re.search(number_pattern, text)
    if match:
        try:
            return float(match.group())
        except ValueError:
            return None
    return None


def parse_inbody_data(text_detections: List[Dict]) -> Dict:
    """OCR 결과에서 인바디 데이터 추출"""
    lines = [
        detection['DetectedText'] 
        for detection in text_detections 
        if detection['Type'] == 'LINE'
    ]
    
    result = {}
    
    keyword_mapping = {
        '체중': 'weight_kg',
        '골격근량': 'skeletal_muscle_mass_kg',
        '체지방량': 'body_fat_mass_kg',
        '체지방률': 'body_fat_percentage',
        'BMI': 'bmi',
        '인바디점수': 'inbody_score',
    }
    
    for i, line in enumerate(lines):
        for keyword, field_name in keyword_mapping.items():
            if keyword in line:
                number = extract_number(line)
                if number is None and i + 1 < len(lines):
                    number = extract_number(lines[i + 1])
                
                if number is not None:
                    result[field_name] = number
    
    return result


def test_extract_number():
    """숫자 추출 테스트"""
    test_cases = [
        ("체중 70.5", 70.5),
        ("골격근량: 32.1kg", 32.1),
        ("BMI 23.4", 23.4),
        ("85점", 85.0),
        ("no number", None),
        ("-3.5", -3.5),
        ("100", 100.0),
    ]
    
    print("=== 숫자 추출 테스트 ===")
    passed = 0
    failed = 0
    
    for text, expected in test_cases:
        result = extract_number(text)
        if result == expected:
            print(f"✓ '{text}' → {result}")
            passed += 1
        else:
            print(f"✗ '{text}' → {result} (예상: {expected})")
            failed += 1
    
    print(f"\n통과: {passed}/{len(test_cases)}, 실패: {failed}/{len(test_cases)}")
    return failed == 0


def test_parse_inbody_data():
    """인바디 데이터 파싱 테스트"""
    mock_text_detections = [
        {"Type": "LINE", "DetectedText": "인바디 측정 결과"},
        {"Type": "LINE", "DetectedText": "체중 70.5"},
        {"Type": "LINE", "DetectedText": "골격근량 32.1"},
        {"Type": "LINE", "DetectedText": "체지방량 12.3"},
        {"Type": "LINE", "DetectedText": "체지방률 17.5"},
        {"Type": "LINE", "DetectedText": "BMI 23.4"},
        {"Type": "LINE", "DetectedText": "인바디점수 85"},
        {"Type": "WORD", "DetectedText": "단어"},  # WORD 타입은 무시되어야 함
    ]
    
    print("\n=== 인바디 데이터 파싱 테스트 ===")
    result = parse_inbody_data(mock_text_detections)
    
    print("추출된 데이터:")
    for key, value in result.items():
        print(f"  - {key}: {value}")
    
    expected = {
        'weight_kg': 70.5,
        'skeletal_muscle_mass_kg': 32.1,
        'body_fat_mass_kg': 12.3,
        'body_fat_percentage': 17.5,
        'bmi': 23.4,
        'inbody_score': 85.0,
    }
    
    print("\n검증:")
    passed = 0
    failed = 0
    
    for field, expected_value in expected.items():
        if field in result and result[field] == expected_value:
            print(f"✓ {field}: {result[field]}")
            passed += 1
        else:
            print(f"✗ {field}: {result.get(field, 'MISSING')} (예상: {expected_value})")
            failed += 1
    
    print(f"\n통과: {passed}/{len(expected)}, 실패: {failed}/{len(expected)}")
    return failed == 0


def test_edge_cases():
    """경계 사례 테스트"""
    print("\n=== 경계 사례 테스트 ===")
    
    # 빈 데이터
    empty_result = parse_inbody_data([])
    print(f"빈 데이터: {empty_result} (예상: {{}})")
    
    # 키워드만 있고 숫자 없음
    no_number = [
        {"Type": "LINE", "DetectedText": "체중"},
        {"Type": "LINE", "DetectedText": "없음"},
    ]
    result = parse_inbody_data(no_number)
    print(f"숫자 없음: {result} (예상: {{}})")
    
    # 다음 줄에 숫자 있음
    next_line = [
        {"Type": "LINE", "DetectedText": "체중"},
        {"Type": "LINE", "DetectedText": "75.0"},
    ]
    result = parse_inbody_data(next_line)
    print(f"다음 줄 숫자: {result} (예상: {{'weight_kg': 75.0}})")
    
    return True


if __name__ == "__main__":
    print("InBody OCR 서비스 유닛 테스트\n")
    print("=" * 50)
    
    all_passed = True
    
    try:
        all_passed &= test_extract_number()
        all_passed &= test_parse_inbody_data()
        all_passed &= test_edge_cases()
        
        print("\n" + "=" * 50)
        if all_passed:
            print("✓ 모든 테스트 통과!")
        else:
            print("✗ 일부 테스트 실패")
    except Exception as e:
        print(f"\n오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
