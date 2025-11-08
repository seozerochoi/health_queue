import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ArrowLeft, Zap, Clock, CheckCircle, Dumbbell, Users } from "lucide-react";

type BodyPart = "등" | "가슴" | "복근" | "힙" | "허벅지" | "종아리" | "유산소" | "어깨";
type Intensity = "상" | "중" | "하";
type RecommendMethod = "전체 기구" | "비어있는 기구";

interface RoutineStep {
  equipment: string;
  duration: number;
  status: 'available' | 'waiting';
  waitTime?: number;
}

interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  reservationTime: string;
  duration: number;
  status: 'confirmed' | 'waiting';
  waitingPosition?: number;
  createdAt: Date;
}

interface AIRoutineRecommendationProps {
  onBack: () => void;
  onReservationComplete: (reservations: Reservation[]) => void;
}

export function AIRoutineRecommendation({ onBack, onReservationComplete }: AIRoutineRecommendationProps) {
  const [step, setStep] = useState<'form' | 'recommendation'>('form');
  const [selectedBodyParts, setSelectedBodyParts] = useState<BodyPart[]>([]);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [recommendMethod, setRecommendMethod] = useState<RecommendMethod | null>(null);
  const [recommendedRoutine, setRecommendedRoutine] = useState<RoutineStep[]>([]);

  const bodyParts: BodyPart[] = ["등", "가슴", "복근", "힙", "허벅지", "종아리", "유산소", "어깨"];
  const intensities: Intensity[] = ["상", "중", "하"];
  const recommendMethods: RecommendMethod[] = ["전체 기구", "비어있는 기구"];

  const toggleBodyPart = (part: BodyPart) => {
    setSelectedBodyParts(prev => 
      prev.includes(part) 
        ? prev.filter(p => p !== part)
        : [...prev, part]
    );
  };

  const generateRoutine = () => {
    // AI 루틴 생성 시뮬레이션
    const routines: RoutineStep[] = [
      { equipment: '러닝머신', duration: 15, status: 'available' },
      { equipment: '벤치프레스', duration: 20, status: 'waiting', waitTime: 10 },
      { equipment: '스쿼트 랙', duration: 15, status: 'available' },
      { equipment: '덤벨', duration: 15, status: 'available' },
      { equipment: '렛풀다운', duration: 10, status: 'available' }
    ];
    
    setRecommendedRoutine(routines);
    setStep('recommendation');
  };

  const reserveRoutine = () => {
    const now = new Date();
    let currentTime = now.getTime();
    
    const reservations: Reservation[] = recommendedRoutine.map((step, index) => {
      const startTime = new Date(currentTime);
      const endTime = new Date(currentTime + step.duration * 60000);
      
      // 대기 시간이 있으면 추가
      if (step.waitTime) {
        currentTime += step.waitTime * 60000;
      }
      
      // 다음 기구를 위해 현재 기구의 시간만큼 더하기
      currentTime += step.duration * 60000;
      
      const timeString = `${startTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      
      return {
        id: `${Date.now()}-${index}`,
        equipmentId: `equipment-${index}`,
        equipmentName: step.equipment,
        reservationTime: timeString,
        duration: step.duration,
        status: step.status === 'available' ? 'confirmed' : 'waiting',
        waitingPosition: step.status === 'waiting' ? 1 : undefined,
        createdAt: new Date()
      };
    });
    
    onReservationComplete(reservations);
  };

  if (step === 'recommendation') {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setStep('form')} className="text-white hover:bg-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-white">AI 추천 루틴</h1>
          </div>

          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white">
                <Zap className="h-5 w-5" />
                <span>맞춤형 운동 루틴</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-2">운동 요약</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-300">총 운동시간: </span>
                    <span className="text-white font-semibold">
                      {recommendedRoutine.reduce((sum, step) => sum + step.duration, 0)}분
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-300">예상 대기시간: </span>
                    <span className="text-white font-semibold">
                      {recommendedRoutine.reduce((sum, step) => sum + (step.waitTime || 0), 0)}분
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {recommendedRoutine.map((step, index) => (
                  <div key={index} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                          {index + 1}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">{step.equipment}</h4>
                          <div className="flex items-center space-x-2 text-sm text-gray-300">
                            <Clock className="h-3 w-3" />
                            <span>{step.duration}분</span>
                            {step.waitTime && (
                              <span className="text-yellow-400">• {step.waitTime}분 대기</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge 
                          className={`${step.status === 'available' ? 
                            'bg-green-100 text-green-700' : 
                            'bg-yellow-100 text-yellow-700'} w-20 text-center`}
                        >
                          {step.status === 'available' ? '사용가능' : '대기필요'}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-blue-500 text-blue-400 hover:bg-blue-500/10 h-6 text-xs px-2 w-20 justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            // 줄서기 로직 (필요시 추가)
                            console.log(`줄서기: ${step.equipment}`);
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          줄서기
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex space-x-4">
                <Button 
                  onClick={generateRoutine} 
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  다시 생성하기
                </Button>
                <Button 
                  onClick={reserveRoutine}
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                >
                  이 루틴으로 예약하기
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
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">AI 루틴 추천</h1>
        </div>

        <Card className="border-gray-600 bg-card">
          <CardHeader>
            <CardTitle className="text-white">운동 정보 입력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 운동 부위 선택 */}
            <div className="space-y-3">
              <h3 className="text-white font-semibold">운동 부위 선택 (중복 선택 가능)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {bodyParts.map((part) => (
                  <button
                    key={part}
                    onClick={() => toggleBodyPart(part)}
                    className={`py-3 px-2 rounded-lg border-2 transition-all text-sm font-medium ${
                      selectedBodyParts.includes(part)
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {part}
                  </button>
                ))}
              </div>
            </div>

            {/* 운동 강도 선택 */}
            <div className="space-y-3">
              <h3 className="text-white font-semibold">운동 강도 선택</h3>
              <div className="flex gap-2">
                {intensities.map((level) => (
                  <button
                    key={level}
                    onClick={() => setIntensity(level)}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all text-base ${
                      intensity === level
                        ? "bg-blue-500 border-blue-500 text-white font-bold"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* 추천 방법 선택 */}
            <div className="space-y-3">
              <h3 className="text-white font-semibold">추천 방법</h3>
              <div className="flex gap-4">
                {recommendMethods.map((method) => (
                  <button
                    key={method}
                    onClick={() => setRecommendMethod(method)}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all text-sm ${
                      recommendMethod === method
                        ? "bg-blue-500 border-blue-500 text-white font-bold"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={generateRoutine}
              className="w-full bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 h-12"
              disabled={selectedBodyParts.length === 0 || !intensity || !recommendMethod}
            >
              <Zap className="h-4 w-4 mr-2" />
              AI 루틴 생성하기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}