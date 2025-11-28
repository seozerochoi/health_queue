"""
Custom middleware for handling CORS on media files
"""

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
