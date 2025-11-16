# users/ocr_service.py
"""
AWS Rekognition을 사용한 인바디 사진 OCR 서비스
"""

import boto3
import os
import re
from typing import Dict, Optional, List
from decimal import Decimal


class InBodyOCRService:
    """AWS Rekognition을 사용하여 인바디 이미지에서 텍스트를 추출하고 파싱하는 서비스"""
    
    def __init__(self):
        """AWS Rekognition 클라이언트 초기화"""
        # 환경변수에서 AWS 자격증명 읽기
        self.client = boto3.client(
            'rekognition',
            region_name=os.environ.get('AWS_REGION', 'ap-northeast-2'),
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
        )
    
    def detect_text(self, image_bytes: bytes) -> List[Dict]:
        """
        AWS Rekognition을 사용하여 이미지에서 텍스트 감지
        
        Args:
            image_bytes: 이미지 바이트 데이터
            
        Returns:
            감지된 텍스트 정보 리스트
        """
        try:
            response = self.client.detect_text(
                Image={'Bytes': image_bytes}
            )
            return response.get('TextDetections', [])
        except Exception as e:
            raise Exception(f"AWS Rekognition 텍스트 감지 실패: {str(e)}")
    
    def extract_number(self, text: str) -> Optional[float]:
        """
        텍스트에서 숫자 추출 (소수점 포함)
        
        Args:
            text: 파싱할 텍스트
            
        Returns:
            추출된 숫자 또는 None
        """
        # 숫자와 소수점만 추출
        number_pattern = r'[-+]?\d*\.?\d+'
        match = re.search(number_pattern, text)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return None
        return None
    
    def parse_inbody_data(self, text_detections: List[Dict]) -> Dict:
        """
        OCR 결과에서 인바디 데이터 추출
        
        Args:
            text_detections: AWS Rekognition 텍스트 감지 결과
            
        Returns:
            파싱된 인바디 데이터 딕셔너리
        """
        # LINE 타입만 필터링 (단어가 아닌 전체 라인)
        lines = [
            detection['DetectedText'] 
            for detection in text_detections 
            if detection['Type'] == 'LINE'
        ]
        
        # 결과 딕셔너리 초기화
        result = {}
        
        # 키워드 매핑 (인바디 용어 -> 필드명)
        keyword_mapping = {
            '체중': 'weight_kg',
            '골격근량': 'skeletal_muscle_mass_kg',
            '체지방량': 'body_fat_mass_kg',
            '체지방률': 'body_fat_percentage',
            'BMI': 'bmi',
            '인바디점수': 'inbody_score',
            # 부위별 근육량
            '오른팔': 'segment_right_arm_kg',
            '왼팔': 'segment_left_arm_kg',
            '몸통': 'segment_trunk_kg',
            '오른다리': 'segment_right_leg_kg',
            '왼다리': 'segment_left_leg_kg',
        }
        
        # 각 라인을 순회하며 데이터 추출
        for i, line in enumerate(lines):
            for keyword, field_name in keyword_mapping.items():
                if keyword in line:
                    # 같은 라인 또는 다음 라인에서 숫자 찾기
                    number = self.extract_number(line)
                    if number is None and i + 1 < len(lines):
                        number = self.extract_number(lines[i + 1])
                    
                    if number is not None:
                        result[field_name] = number
        
        return result
    
    def process_inbody_image(self, image_bytes: bytes) -> Dict:
        """
        인바디 이미지를 처리하여 데이터 추출
        
        Args:
            image_bytes: 이미지 바이트 데이터
            
        Returns:
            추출된 인바디 데이터
        """
        # 1. AWS Rekognition으로 텍스트 감지
        text_detections = self.detect_text(image_bytes)
        
        # 2. 감지된 텍스트에서 인바디 데이터 파싱
        inbody_data = self.parse_inbody_data(text_detections)
        
        # 3. 전체 감지된 텍스트도 함께 반환 (디버깅 및 확인용)
        detected_texts = [
            detection['DetectedText'] 
            for detection in text_detections 
            if detection['Type'] == 'LINE'
        ]
        
        return {
            'data': inbody_data,
            'detected_texts': detected_texts,
            'raw_detections': text_detections
        }
