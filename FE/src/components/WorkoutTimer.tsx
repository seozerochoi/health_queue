import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: "available" | "in-use" | "waiting";
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

const getApiBase = () => {
  if (typeof import.meta !== "undefined") {
    const viteBase = (import.meta as any)?.env?.VITE_API_BASE;
    if (viteBase) return viteBase;
  }
  if (typeof process !== "undefined") {
    const envBase = process?.env?.REACT_APP_API_BASE;
    if (envBase) return envBase;
  }
  return "http://43.201.88.27";
};

export function WorkoutTimer({
  equipment,
  onBack,
  onWorkoutComplete,
}: WorkoutTimerProps) {
  const [isEnding, setIsEnding] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(
    equipment.allocatedTime * 60
  ); // 분을 초로 변환
  const [isRunning, setIsRunning] = useState(true);
  // 요구사항: 이용 시간 중에는 일시정지 기능 제거
  const [isPaused] = useState(false);

  const heartbeatIntervalRef = useRef<number | null>(null);
  const consecutiveHeartbeatFailures = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRunning && !isPaused && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            // When timer runs out, call end API then notify parent
            endSession().finally(() => onWorkoutComplete());
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, isPaused, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const totalTime = equipment.allocatedTime * 60;
  const progress = ((totalTime - timeRemaining) / totalTime) * 100;

  // 일시정지 제거로 핸들러도 비활성화
  const handlePauseResume = () => {};

  const handleStop = async () => {
    if (isEnding) return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      alert("로그인이 필요합니다.");
      return;
    }

    setIsEnding(true);
    setIsRunning(false);

    try {
      await endSession();
    } catch (error) {
      console.error("운동 종료 실패:", error);
      // 백엔드 에러여도 프론트엔드에서는 계속 진행
    } finally {
      setIsEnding(false);
      // 항상 평가 화면으로 이동
      onWorkoutComplete();
    }
  };

  // endSession is used by manual stop, timer expiry, and forced stop on heartbeat failure
  const endSession = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw new Error("no-token");

    try {
      const response = await fetch(`${getApiBase()}/api/workouts/end/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // 백엔드는 user의 활성 세션을 자동으로 찾으므로 body는 빈 객체
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        let errorMessage = "알 수 없는 오류";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
        } catch {
          errorMessage = await response.text();
        }
        
        console.error("운동 종료 API 실패:", response.status, errorMessage);
        
        // 404 에러 (세션이 없음)는 이미 종료되었을 가능성이 있으므로 무시하고 계속 진행
        if (response.status === 404) {
          console.warn("세션이 이미 종료되었거나 존재하지 않음 - 계속 진행");
        } else {
          // 다른 에러는 로그만 남기고 계속 진행
          console.warn("백엔드 에러 무시하고 계속 진행");
        }
      } else {
        const data = await response.json();
        console.log("운동 종료 성공:", data.message);
      }

      // stop heartbeat when ended
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    } catch (err) {
      console.error("endSession 네트워크 에러:", err);
      // 네트워크 에러여도 프론트엔드에서는 계속 진행
      console.warn("네트워크 에러 무시하고 계속 진행");
    }
  };

  // Heartbeat logic: send every 60s, on 2 consecutive failures -> force end
  useEffect(() => {
    const sendHeartbeat = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) return;

      try {
        const res = await fetch(`${getApiBase()}/api/workouts/heartbeat/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ equipment_id: Number(equipment.id) }),
          keepalive: true as any,
        });

        if (!res.ok) {
          consecutiveHeartbeatFailures.current += 1;
          console.warn("Heartbeat failed", res.status);
        } else {
          consecutiveHeartbeatFailures.current = 0;
        }

        if (consecutiveHeartbeatFailures.current >= 2) {
          console.warn("Consecutive heartbeat failures - forcing session end");
          try {
            await endSession();
          } catch (e) {
            console.error("Forced end failed", e);
          } finally {
            onWorkoutComplete();
          }
        }
      } catch (e) {
        consecutiveHeartbeatFailures.current += 1;
        console.error("Heartbeat network error", e);
        if (consecutiveHeartbeatFailures.current >= 2) {
          try {
            await endSession();
          } catch (err) {
            console.error("Forced end failed", err);
          } finally {
            onWorkoutComplete();
          }
        }
      }
    };

    // start immediately then every 20s
    sendHeartbeat();
    heartbeatIntervalRef.current = window.setInterval(sendHeartbeat, 20 * 1000);

    // try to end session on unload (best-effort)
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      const token = localStorage.getItem("access_token");
      if (!token) return;

      try {
        fetch(`${getApiBase()}/api/workouts/end/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
          keepalive: true as any,
        });
      } catch (_) {
        // ignore best-effort failure
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                <svg
                  className="w-48 h-48 transform -rotate-90"
                  viewBox="0 0 144 144"
                >
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
                    strokeDashoffset={`${
                      2 * Math.PI * 60 * (1 - progress / 100)
                    }`}
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
              disabled={isEnding}
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
                  <p className="text-2xl font-bold text-white">
                    {equipment.allocatedTime}
                  </p>
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
                  onClick={() =>
                    setTimeRemaining(
                      (prev) => prev + equipment.allocatedTime * 60 * 0.2
                    )
                  }
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
