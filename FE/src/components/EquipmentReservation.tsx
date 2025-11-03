import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { ArrowLeft, Clock, Play, Square, Nfc, Star } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'in-use' | 'waiting';
  waitingCount?: number;
  currentUser?: string;
  timeRemaining?: number;
  image: string;
  allocatedTime: number;
}

interface EquipmentReservationProps {
  equipment: Equipment;
  onBack: () => void;
  onStartNFC: () => void;
  onReservationComplete: (equipment: Equipment, status: 'confirmed' | 'waiting', waitingPosition?: number) => void;
}

export function EquipmentReservation({ equipment, onBack, onStartNFC, onReservationComplete }: EquipmentReservationProps) {
  const [isReserved, setIsReserved] = useState(false);
  const [isUsing, setIsUsing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(equipment.allocatedTime * 60);
  const [showFeedback, setShowFeedback] = useState(false);
  const [extendedTime, setExtendedTime] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isUsing && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsUsing(false);
            setShowFeedback(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isUsing, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReserve = () => {
    if (equipment.status === 'available') {
      setIsReserved(true);
      onStartNFC();
      onReservationComplete(equipment, 'confirmed');
    } else {
      setIsReserved(true);
      setQueuePosition((equipment.waitingCount || 0) + 1);
      onReservationComplete(equipment, 'waiting', (equipment.waitingCount || 0) + 1);
    }
  };

  const handleStartUsing = () => {
    setIsUsing(true);
    setIsReserved(false);
  };

  const handleExtendTime = () => {
    setTimeLeft(prev => prev + Math.floor(equipment.allocatedTime * 60 * 0.2));
    setExtendedTime(true);
  };

  const handleFeedback = (satisfied: boolean, desiredTime?: number) => {
    setShowFeedback(false);
    // 피드백 데이터 저장 로직
    onBack();
  };

  if (showFeedback) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto mt-20">
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-center text-white">이용 후 평가</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-300">이용시간은 만족스러우셨나요?</p>
              <div className="flex space-x-4">
                <Button 
                  className="flex-1 bg-green-500 hover:bg-green-600"
                  onClick={() => handleFeedback(true)}
                >
                  <Star className="h-4 w-4 mr-2" />
                  예
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 border-red-600 text-red-400 hover:bg-red-900/20"
                  onClick={() => handleFeedback(false)}
                >
                  아니요
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">기구 예약</h1>
        </div>

        <Card className="border-gray-600 bg-card">
          <CardContent className="p-6">
            <div className="flex space-x-6">
              <div className="w-32 h-32 rounded-lg overflow-hidden">
                <ImageWithFallback
                  src={equipment.image}
                  alt={equipment.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-3">
                <h2 className="text-xl font-semibold text-white">{equipment.name}</h2>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-300" />
                  <span className="text-gray-300">기본 할당시간: {equipment.allocatedTime}분</span>
                </div>
                {equipment.status === 'available' && (
                  <Badge className="bg-green-100 text-green-700">바로 사용 가능</Badge>
                )}
                {equipment.status === 'in-use' && (
                  <Badge className="bg-yellow-100 text-yellow-700">
                    사용 중 ({equipment.timeRemaining}분 남음)
                  </Badge>
                )}
                {equipment.status === 'waiting' && (
                  <Badge className="bg-red-100 text-red-700">
                    현재 {equipment.waitingCount}명 대기중
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {!isReserved && !isUsing && (
          <Card className="border-gray-600 bg-card">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <h3 className="text-lg font-semibold text-white">
                  {equipment.status === 'available' ? '지금 바로 사용하기' : '예약하기'}
                </h3>
                <p className="text-gray-300">
                  {equipment.status === 'available' 
                    ? 'NFC 태깅으로 즉시 시작할 수 있습니다.'
                    : `현재 ${equipment.waitingCount}명이 대기 중입니다.`
                  }
                </p>
                <Button 
                  onClick={handleReserve}
                  className="bg-blue-500 hover:bg-blue-600"
                  size="lg"
                >
                  {equipment.status === 'available' ? '바로 사용하기' : '예약하기'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isReserved && !isUsing && queuePosition && (
          <Card className="border-yellow-600 bg-yellow-900/20">
            <CardContent className="p-6 text-center space-y-4">
              <h3 className="text-lg font-semibold text-yellow-300">예약 완료</h3>
              <p className="text-yellow-200">대기 순서: {queuePosition}번째</p>
              <p className="text-sm text-yellow-100">
                내 차례까지 약 {(queuePosition - 1) * equipment.allocatedTime}분 예상
              </p>
            </CardContent>
          </Card>
        )}

        {isReserved && !isUsing && !queuePosition && (
          <Card className="border-green-600 bg-green-900/20">
            <CardContent className="p-6 text-center space-y-4">
              <Nfc className="h-12 w-12 text-green-400 mx-auto" />
              <h3 className="text-lg font-semibold text-green-300">NFC 태깅 대기중</h3>
              <p className="text-green-200">기구에 있는 NFC 태그에 휴대폰을 터치해주세요.</p>
              <Button 
                onClick={handleStartUsing}
                className="bg-green-500 hover:bg-green-600"
              >
                <Play className="h-4 w-4 mr-2" />
                사용 시작 (시뮬레이션)
              </Button>
            </CardContent>
          </Card>
        )}

        {isUsing && (
          <Card className="border-gray-600 bg-card">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white">이용 중</h3>
                <div className="text-3xl font-mono text-blue-400 mt-2">
                  {formatTime(timeLeft)}
                </div>
              </div>
              
              <Progress 
                value={(timeLeft / (equipment.allocatedTime * 60)) * 100} 
                className="h-3"
              />
              
              <div className="flex justify-center space-x-4">
                {!extendedTime && timeLeft > 0 && (
                  <Button 
                    onClick={handleExtendTime}
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    20% 연장하기
                  </Button>
                )}
                <Button 
                  onClick={() => {
                    setIsUsing(false);
                    setShowFeedback(true);
                  }}
                  variant="destructive"
                  className="bg-red-500 hover:bg-red-600"
                >
                  <Square className="h-4 w-4 mr-2" />
                  사용 종료
                </Button>
              </div>
              
              {timeLeft <= 300 && timeLeft > 60 && (
                <div className="text-center text-yellow-400 text-sm">
                  ⚠️ 5분 후 이용시간이 종료됩니다.
                </div>
              )}
              
              {timeLeft <= 60 && timeLeft > 0 && (
                <div className="text-center text-red-400 text-sm font-semibold">
                  🚨 1분 후 이용시간이 종료됩니다!
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}