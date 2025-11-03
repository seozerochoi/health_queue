import { useState, useEffect } from "react";
import { ArrowLeft, Wifi } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface NFCTaggingProps {
  equipmentName: string;
  onBack: () => void;
  onTaggingComplete: () => void;
}

export function NFCTagging({ equipmentName, onBack, onTaggingComplete }: NFCTaggingProps) {
  const [isTagging, setIsTagging] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    // 자동으로 태깅 시뮬레이션 시작
    const timer = setTimeout(() => {
      setIsTagging(true);
      // 3초 후 태깅 완료
      setTimeout(() => {
        setIsTagging(false);
        setCountdown(5);
      }, 3000);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !isTagging) {
      // 카운트다운 완료 후 타이머로 이동
      const timer = setTimeout(() => {
        onTaggingComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [countdown, isTagging, onTaggingComplete]);

  const handleManualComplete = () => {
    setIsTagging(false);
    setCountdown(3);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-gray-800"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl ml-4 text-white">{equipmentName} 사용</h1>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          {countdown > 0 ? (
            // 카운트다운 화면
            <div className="text-center">
              <div className="text-8xl font-bold text-white mb-4 animate-pulse">
                {countdown}
              </div>
              <p className="text-lg text-gray-300">잠시 후 운동이 시작됩니다</p>
            </div>
          ) : (
            // NFC 태깅 화면
            <Card className="border-gray-600 bg-card w-full max-w-sm">
              <CardContent className="p-8 text-center">
                <div className="relative mb-6">
                  <div className={`w-24 h-24 mx-auto rounded-full border-4 ${isTagging ? 'border-blue-400 animate-pulse' : 'border-gray-600'} flex items-center justify-center`}>
                    <Wifi className={`w-12 h-12 ${isTagging ? 'text-blue-400 animate-bounce' : 'text-gray-400'}`} />
                  </div>
                  
                  {/* WiFi 신호 애니메이션 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-32 h-32 rounded-full border-2 border-blue-400/30 animate-ping ${isTagging ? 'block' : 'hidden'}`}></div>
                    <div className={`w-40 h-40 rounded-full border-2 border-blue-400/20 animate-ping ${isTagging ? 'block' : 'hidden'}`} style={{ animationDelay: '0.5s' }}></div>
                    <div className={`w-48 h-48 rounded-full border-2 border-blue-400/10 animate-ping ${isTagging ? 'block' : 'hidden'}`} style={{ animationDelay: '1s' }}></div>
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-white mb-4">
                  {isTagging ? 'NFC 태깅 중...' : 'NFC를 태깅해주세요'}
                </h2>
                
                <p className="text-gray-300 mb-6">
                  {isTagging 
                    ? '기구와 연결하고 있습니다' 
                    : '스마트폰을 기구의 NFC 태그에 가까이 대어주세요'}
                </p>

                {!isTagging && (
                  <Button 
                    onClick={handleManualComplete}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    테스트용 태깅 완료
                  </Button>
                )}

                {isTagging && (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}