import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { ArrowLeft, Clock, Play, Square, Nfc, Star } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
const API_BASE = (() => {
  try {
    const meta = import.meta as any;
    return (
      meta?.env?.VITE_API_BASE ||
      meta?.env?.REACT_APP_API_BASE ||
      "https://43.201.88.27"
    );
  } catch {
    return "https://43.201.88.27";
  }
})();

const QUEUE_DEBUG_ENABLED = (() => {
  try {
    const meta = import.meta as any;
    return (
      String(meta?.env?.VITE_DEBUG_QUEUE_STATE || "false").toLowerCase() ===
      "true"
    );
  } catch {
    return false;
  }
})();

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

interface EquipmentReservationProps {
  equipment: Equipment;
  onBack: () => void;
  onStartNFC: () => void;
  onReservationComplete: (
    equipment: Equipment,
    status: "confirmed" | "waiting",
    waitingPosition?: number
  ) => void;
  onQueueUpdate?: () => void | Promise<void>;
}

export function EquipmentReservation({
  equipment,
  onBack,
  onStartNFC,
  onReservationComplete,
  onQueueUpdate,
}: EquipmentReservationProps) {
  const [isReserved, setIsReserved] = useState(false);
  const [isUsing, setIsUsing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(equipment.allocatedTime * 60);
  const [showFeedback, setShowFeedback] = useState(false);
  const [extendedTime, setExtendedTime] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState<number | null>(null);
  const waitingDisplay = queueLength ?? equipment.waitingCount ?? 0;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isUsing && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
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
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const fetchQueueStatus = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/reservations/?equipment_id=${encodeURIComponent(
          equipment.id
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        throw new Error("queue status fetch failed");
      }

      const reservations = await response.json();
      const waitingReservations = reservations.filter(
        (item: any) => item.status === "WAITING" || item.status === "NOTIFIED"
      );

      if (QUEUE_DEBUG_ENABLED) {
        console.debug("[queue-debug] snapshot", {
          equipmentId: equipment.id,
          fetchedAt: new Date().toISOString(),
          entries: waitingReservations.map((item: any) => ({
            id: item.id,
            user: item.user,
            status: item.status,
            position: item.waiting_position ?? item.position,
            notified_at: item.notified_at,
          })),
        });
      }
      const currentUser = localStorage.getItem("current_user");
      const mine = currentUser
        ? waitingReservations.find((item: any) => item.user === currentUser)
        : null;

      if (mine) {
        setIsReserved(true);
        setQueuePosition(mine.waiting_position ?? mine.position ?? null);
      } else {
        setIsReserved(false);
        setQueuePosition(null);
      }

      setQueueLength(
        waitingReservations.length || equipment.waitingCount || null
      );
    } catch (err) {
      console.error("Failed to load queue status", err);
    }
  };

  useEffect(() => {
    fetchQueueStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment.id]);

  const handleReserve = () => {
    const token = localStorage.getItem("access_token");
    if (equipment.status === "available") {
      // try to start session immediately via API
      fetch(`${API_BASE}/api/workouts/start/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ equipment_id: equipment.id }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || "start failed");
          }
          return res.json();
        })
        .then((data) => {
          // server returns UsageSession serializer; allocated_duration_minutes expected
          const allocated =
            data.allocated_duration_minutes || equipment.allocatedTime;
          setTimeLeft(allocated * 60);
          setIsUsing(true);
          setIsReserved(false);
          onReservationComplete(equipment, "confirmed");
        })
        .catch((err) => {
          console.error("Start failed", err);
          alert("시작에 실패했습니다: " + err.message);
        });
    } else {
      // join queue - 줄서기 버튼 클릭 시 바로 예약 현황으로 이동
      const token = localStorage.getItem("access_token");
      fetch(`${API_BASE}/api/workouts/join-queue/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ equipment_id: Number(equipment.id) }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (QUEUE_DEBUG_ENABLED) {
            console.debug("[queue-debug] join-response", {
              equipmentId: equipment.id,
              httpStatus: res.status,
              payload: json,
            });
          }
          if (!res.ok) throw new Error(JSON.stringify(json));
          
          // 예약 완료 후 바로 예약 현황으로 이동
          onReservationComplete(
            equipment,
            "waiting",
            json.position || (equipment.waitingCount || 0) + 1
          );
          
          // 뒤로가기 (예약 현황으로 자동 이동)
          onBack();
        })
        .catch((err) => {
          console.error("Join queue failed", err);
          alert("대기열 등록에 실패했습니다.");
        });
    }
  };

  const handleStartUsing = () => {
    // For NFC simulation in UI: attempt to start via API (if not already started)
    const token = localStorage.getItem("access_token");
    fetch(`${API_BASE}/api/workouts/start/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ equipment_id: equipment.id }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || "start failed");
        }
        return res.json();
      })
      .then((data) => {
        const allocated =
          data.allocated_duration_minutes || equipment.allocatedTime;
        setTimeLeft(allocated * 60);
        setIsUsing(true);
        setIsReserved(false);
      })
      .catch((err) => {
        console.error("Start failed", err);
        alert("사용 시작에 실패했습니다: " + err.message);
      });
  };

  const handleExtendTime = () => {
    setTimeLeft(
      (prev) => prev + Math.floor(equipment.allocatedTime * 60 * 0.2)
    );
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
              <CardTitle className="text-center text-white">
                이용 후 평가
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-300">
                이용시간은 만족스러우셨나요?
              </p>
              <div className="flex space-x-4">
                <Button
                  className="flex-1 bg-green-500 hover:bg-green-600"
                  onClick={() => handleFeedback(true)}
                >
                  <Star className="h-4 w-4 mr-2" />예
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
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-gray-700"
          >
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
                <h2 className="text-xl font-semibold text-white">
                  {equipment.name}
                </h2>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-300" />
                  <span className="text-gray-300">
                    기본 할당시간: {equipment.allocatedTime}분
                  </span>
                </div>
                {equipment.status === "available" && (
                  <Badge className="bg-green-100 text-green-700">
                    바로 사용 가능
                  </Badge>
                )}
                {equipment.status === "in-use" && (
                  <Badge className="bg-yellow-100 text-yellow-700">
                    사용 중 ({(equipment.timeRemaining ?? 0).toFixed(1)}분 남음)
                  </Badge>
                )}
                {equipment.status === "waiting" && (
                  <Badge className="bg-red-100 text-red-700">
                    현재 {waitingDisplay}명 대기중
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {isReserved && !isUsing && !queuePosition && (
          <Card className="border-green-600 bg-green-900/20">
            <CardContent className="p-6 text-center space-y-4">
              <Nfc className="h-12 w-12 text-green-400 mx-auto" />
              <h3 className="text-lg font-semibold text-green-300">
                NFC 태깅 대기중
              </h3>
              <p className="text-green-200">
                기구에 있는 NFC 태그에 휴대폰을 터치해주세요.
              </p>
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
                    // call end API then show feedback
                    const token = localStorage.getItem("access_token");
                    fetch(`${API_BASE}/api/workouts/end/`, {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    })
                      .then(async (res) => {
                        if (!res.ok) {
                          const txt = await res.text();
                          throw new Error(txt || "end failed");
                        }
                        return res.json();
                      })
                      .then(() => {
                        setIsUsing(false);
                        setShowFeedback(true);
                      })
                      .catch((err) => {
                        console.error("End failed", err);
                        alert("사용 종료에 실패했습니다: " + err.message);
                      });
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
