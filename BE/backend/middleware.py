"""
Custom middleware for handling CORS on media files
"""
import logging

logger = logging.getLogger(__name__)

class MediaCorsMiddleware:
    """
    Middleware to add CORS headers to media file responses
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Add CORS headers to media file responses
        if request.path.startswith('/media/'):
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            response['Cross-Origin-Resource-Policy'] = 'cross-origin'
        
        return response


class RequestLoggingMiddleware:
    """
    🔍 [디버깅] 모든 API 요청/응답을 로깅하는 미들웨어
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 요청 정보 로깅 (API 경로에만)
        if request.path.startswith('/api/'):
            logger.info(f"🌐 [REQUEST] {request.method} {request.path}")
            if request.query_params:
                logger.info(f"   쿼리: {dict(request.query_params)}")
            logger.info(f"   사용자: {request.user}")

        response = self.get_response(request)

        # 응답 정보 로깅 (API 경로에만)
        if request.path.startswith('/api/'):
            logger.info(f"📤 [RESPONSE] {request.method} {request.path} → {response.status_code}")

        return response
