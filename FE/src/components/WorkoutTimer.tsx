import { useState, useEffect } from "react";
import { ArrowLeft, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";

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

interface WorkoutTimerProps {
  equipment: Equipment;
  onBack: () => void;
  onWorkoutComplete: () => void;
}

export function WorkoutTimer({ equipment, onBack, onWorkoutComplete }: WorkoutTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(equipment.allocatedTime * 60); // 분을 초로 변환
  const [isRunning, setIsRunning] = useState(true);
  // 요구사항: 이용 시간 중에는 일시정지 기능 제거
  const [isPaused] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRunning && !isPaused && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            onWorkoutComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, isPaused, timeRemaining, onWorkoutComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalTime = equipment.allocatedTime * 60;
  const progress = ((totalTime - timeRemaining) / totalTime) * 100;

  // 일시정지 제거로 핸들러도 비활성화
  const handlePauseResume = () => {};

  const handleStop = () => {
    setIsRunning(false);
    onWorkoutComplete();
  };

  const getMotivationalMessage = () => {
    const remainingPercent = (timeRemaining / totalTime) * 100;
    
    if (remainingPercent > 75) {
      return "좋은 시작입니다! 🔥";
    } else if (remainingPercent > 50) {
      return "절반을 넘었어요! 💪";
    } else if (remainingPercent > 25) {
      return "거의 다 왔습니다! 🏃‍♂️";
    } else {
      return "마지막 스퍼트! 🎯";
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-gray-800"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-lg text-white">{equipment.name}</h1>
          <div></div>
        </div>

        <div className="flex flex-col items-center space-y-8">
          {/* 메인 타이머 */}
          <Card className="border-gray-600 bg-card w-full">
            <CardContent className="p-8 text-center">
              <div className="relative w-48 h-48 mx-auto mb-6">
                {/* 원형 프로그레스 바 */}
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 144 144">
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-gray-700"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 60}`}
                    strokeDashoffset={`${2 * Math.PI * 60 * (1 - progress / 100)}`}
                    className="text-blue-400 transition-all duration-1000 ease-linear"
                    strokeLinecap="round"
                  />
                </svg>
                
                {/* 타이머 텍스트 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-white mb-2">
                    {formatTime(timeRemaining)}
                  </div>
                  <div className="text-sm text-gray-300">
                    {Math.floor(timeRemaining / 60)}분 남음
                  </div>
                </div>
              </div>

              {/* 동기부여 메시지 */}
              <p className="text-lg text-blue-400 mb-4 font-medium">
                {getMotivationalMessage()}
              </p>

              {/* 진행률 바 */}
              <div className="mb-6">
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-sm text-gray-300 mt-2">
                  <span>시작</span>
                  <span>{Math.round(progress)}% 완료</span>
                  <span>종료</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 컨트롤 버튼들 */}
          <div className="flex justify-center w-full">
            <Button
              onClick={handleStop}
              variant="destructive"
              size="lg"
              className="w-full"
            >
              <Square className="w-5 h-5 mr-2" />
              이용 종료
            </Button>
          </div>

          {/* 운동 정보 */}
          <Card className="border-gray-600 bg-card w-full">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{equipment.allocatedTime}</p>
                  <p className="text-sm text-gray-300">할당 시간(분)</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">
                    {Math.floor((totalTime - timeRemaining) / 60)}
                  </p>
                  <p className="text-sm text-gray-300">경과 시간(분)</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-400">
                    {Math.round(progress)}%
                  </p>
                  <p className="text-sm text-gray-300">진행률</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 20% 연장 옵션 (마지막 5분일 때만 표시) */}
          {timeRemaining <= 300 && timeRemaining > 0 && (
            <Card className="border-yellow-600 bg-yellow-900/20 w-full">
              <CardContent className="p-4 text-center">
                <p className="text-yellow-300 mb-3">
                  운동 시간을 20% 연장하시겠습니까?
                </p>
                <Button
                  onClick={() => setTimeRemaining(prev => prev + (equipment.allocatedTime * 60 * 0.2))}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  연장하기 (+{Math.round(equipment.allocatedTime * 0.2)}분)
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}