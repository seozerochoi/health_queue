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
  return "https://43.201.88.27";
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
  const [isBroken, setIsBroken] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);

  const heartbeatIntervalRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const usingWorkerRef = useRef<boolean>(false);
  const consecutiveHeartbeatFailures = useRef(0);
  const sseRef = useRef<EventSource | null>(null);

  // 뒤로가기 핸들러 - 운동 종료 API 호출
  const handleBack = async () => {
    if (isEnding) return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      console.warn("토큰 없음 - 뒤로가기만 처리");
      onBack();
      return;
    }

    console.log("⬅️ 뒤로가기 - 자동 운동 종료 처리");
    setIsEnding(true);
    setIsRunning(false);

    try {
      // 운동 종료 API 호출
      const response = await fetch(`${getApiBase()}/api/workouts/end/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        console.log("✅ 운동 종료 성공 (뒤로가기)");
      } else {
        console.warn("운동 종료 실패 (뒤로가기):", response.status);
      }

      // heartbeat 중지
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "stop" });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    } catch (error) {
      console.error("운동 종료 중 오류 (뒤로가기):", error);
    } finally {
      setIsEnding(false);
      onBack();
    }
  };

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

  // 기구 고장 SSE 감지
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    // SSE 연결
    // 서버는 쿼리 파라미터 이름으로 access_token을 기대하므로 정확히 맞춥니다.
    const eventSource = new EventSource(
      `${getApiBase()}/api/equipment/stream/?access_token=${encodeURIComponent(
        token
      )}`
    );
    sseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("🔔 [WorkoutTimer] SSE 메시지:", data);

        // 현재 사용 중인 기구가 BROKEN 으로 변경된 경우
        if (
          data.equipment_id === equipment.id &&
          data.operational_state === "BROKEN"
        ) {
          console.log("⚠️ 기구 고장 감지 - 운동 강제 종료");
          setIsBroken(true);
          setIsRunning(false);

          // heartbeat 중지
          if (heartbeatIntervalRef.current) {
            window.clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          if (workerRef.current) {
            workerRef.current.postMessage({ type: "stop" });
            workerRef.current.terminate();
            workerRef.current = null;
          }
        }

        // 현재 사용 중인 기구가 MAINTENANCE 로 변경된 경우
        if (
          data.equipment_id === equipment.id &&
          data.operational_state === "MAINTENANCE"
        ) {
          console.log("🛠️ 기구 점검중 감지 - 운동 강제 종료");
          setIsMaintenance(true);
          setIsRunning(false);

          // heartbeat 중지
          if (heartbeatIntervalRef.current) {
            window.clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          if (workerRef.current) {
            workerRef.current.postMessage({ type: "stop" });
            workerRef.current.terminate();
            workerRef.current = null;
          }
        }
      } catch (err) {
        console.error("SSE 파싱 오류:", err);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE 연결 오류");
      eventSource.close();
    };

    return () => {
      eventSource.close();
      sseRef.current = null;
    };
  }, [equipment.id]);

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
          errorMessage =
            errorData.error || errorData.message || JSON.stringify(errorData);
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

  // Heartbeat logic with Web Worker + visibility + beacon fallback
  useEffect(() => {
    const apiBase = getApiBase();
    const token = localStorage.getItem("access_token");
    if (!token) return; // no authenticated heartbeat

    const sendHeartbeatDirect = async () => {
      try {
        const res = await fetch(`${apiBase}/api/workouts/heartbeat/`, {
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
      } catch (e) {
        consecutiveHeartbeatFailures.current += 1;
        console.error("Heartbeat network error", e);
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
    };

    // Try Web Worker first
    try {
      if (typeof Worker !== "undefined") {
        const w = new Worker(
          new URL("../workers/heartbeatWorker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current = w;
        usingWorkerRef.current = true;
        w.onmessage = (ev) => {
          if (ev?.data?.type === "error") {
            console.warn("Heartbeat worker error fallback", ev.data?.message);
          }
          if (ev?.data?.type === "failure") {
            // propagate failure counting to same logic
            consecutiveHeartbeatFailures.current = ev.data.consecutiveFailures;
            if (consecutiveHeartbeatFailures.current >= 2) {
              (async () => {
                try {
                  await endSession();
                } catch (e) {
                  console.error("Forced end failed (worker)", e);
                } finally {
                  onWorkoutComplete();
                }
              })();
            }
          }
        };
        w.postMessage({
          type: "start",
          intervalMs: 20000,
          apiBase,
          token,
          equipmentId: Number(equipment.id),
        });
      }
    } catch (e) {
      console.warn("Failed to start heartbeat worker, using fallback", e);
      usingWorkerRef.current = false;
    }

    // Fallback interval if worker not used
    if (!usingWorkerRef.current) {
      sendHeartbeatDirect(); // immediate
      heartbeatIntervalRef.current = window.setInterval(
        sendHeartbeatDirect,
        20000
      );
    }

    // Visibility change: on becoming visible send immediate heartbeat
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (usingWorkerRef.current && workerRef.current) {
          workerRef.current.postMessage({ type: "pulse" });
        } else {
          sendHeartbeatDirect();
        }
      } else if (document.visibilityState === "hidden") {
        // On hide attempt lightweight beacon heartbeat (token via query param endpoint)
        const access = localStorage.getItem("access_token");
        if (access && navigator.sendBeacon) {
          const url = `${apiBase}/api/workouts/heartbeat_beacon/?access_token=${encodeURIComponent(
            access
          )}&equipment_id=${encodeURIComponent(equipment.id)}`;
          try {
            navigator.sendBeacon(url, "{}");
          } catch (_) {
            // ignore
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Page unload/pagehide beacon end attempt (best-effort)
    const handlePageHide = () => {
      const access = localStorage.getItem("access_token");
      if (access && navigator.sendBeacon) {
        const url = `${apiBase}/api/workouts/end_beacon/?access_token=${encodeURIComponent(
          access
        )}`;
        try {
          navigator.sendBeacon(url, "{}");
        } catch (_) {
          // ignore
        }
      } else {
        // fallback to fetch keepalive
        try {
          fetch(`${apiBase}/api/workouts/end/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
            keepalive: true as any,
          });
        } catch (_) {
          /* ignore */
        }
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (workerRef.current) {
        try {
          workerRef.current.postMessage({ type: "stop" });
          workerRef.current.terminate();
        } catch (_) {
          /* ignore */
        }
        workerRef.current = null;
      }
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
      {isBroken && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="border-red-600 bg-card max-w-md w-full">
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-3">
                <div className="text-6xl">⚠️</div>
                <h2 className="text-xl font-bold text-red-400">
                  기구 고장 안내
                </h2>
                <p className="text-gray-300 leading-relaxed">
                  이 기구는 고장 접수가 되었습니다.
                  <br />
                  더 이상 기구를 사용할 수 없습니다.
                  <br />
                  이용에 불편을 드려 죄송합니다.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsBroken(false);
                  onBack();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                확인
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {isMaintenance && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="border-orange-600 bg-card max-w-md w-full">
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-3">
                <div className="text-6xl">🛠️</div>
                <h2 className="text-xl font-bold text-orange-400">
                  기구 점검 안내
                </h2>
                <p className="text-gray-300 leading-relaxed">
                  이 기구는 현재 점검 중입니다.
                  <br />
                  더 이상 기구를 사용할 수 없습니다.
                  <br />
                  이용에 불편을 드려 죄송합니다.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsMaintenance(false);
                  onBack();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                확인
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
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
