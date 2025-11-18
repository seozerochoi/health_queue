import React, { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
  ArrowLeft,
  Clock,
  Users,
  Zap,
  AlertTriangle,
  Flag,
  Loader2,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

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

interface EquipmentListProps {
  gymName: string;
  onBack: () => void;
  onEquipmentSelect: (equipment: Equipment) => void;
}

// Memoized equipment item to avoid unnecessary re-renders.
interface EquipmentItemProps {
  eq: Equipment;
  onSelect: (eq: Equipment) => void;
  flashing?: boolean;
}

const EquipmentItemInner = ({ eq, onSelect, flashing }: EquipmentItemProps) => {
  const getStatusBadgeLocal = (eq: Equipment) => {
    switch (eq.status) {
      case "available":
        return (
          <Badge className="bg-green-100 text-green-700">바로 사용 가능</Badge>
        );
      case "in-use":
        return (
          <Badge className="bg-yellow-100 text-yellow-700">
            사용 중 ({eq.timeRemaining}분 남음)
          </Badge>
        );
      case "waiting":
        return (
          <Badge className="bg-red-100 text-red-700">
            현재 {eq.waitingCount}명 대기중
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
      onClick={() => onSelect(eq)}
    >
      <CardContent className="p-4">
        <div className="flex space-x-4">
          <div className="w-24 h-24 rounded-lg overflow-hidden">
            <ImageWithFallback
              src={eq.image}
              alt={eq.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <h3
                className={`font-semibold text-white`}
                style={{
                  transition: "filter 0.7s ease",
                  filter: flashing ? "brightness(2)" : "none",
                }}
              >
                {eq.name}
              </h3>
              {getStatusBadgeLocal(eq)}
            </div>

            <div className="flex items-center space-x-1 text-sm text-gray-300">
              <Clock className="h-3 w-3" />
              <span>기본 할당시간: {eq.allocatedTime}분</span>
            </div>

            {(eq.status === "in-use" || eq.status === "waiting") && (
              <div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(eq);
                  }}
                  className="mt-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 px-3 py-1"
                >
                  <Users className="h-4 w-4" />
                  줄서기
                  {typeof eq.waitingCount === "number" &&
                    eq.waitingCount > 0 && (
                      <span className="text-xs ml-1">
                        ({eq.waitingCount}명)
                      </span>
                    )}
                </Button>
              </div>
            )}

            {eq.currentUser && (
              <div className="flex items-center space-x-1 text-sm text-gray-300">
                <Users className="h-3 w-3" />
                <span>사용자: {eq.currentUser}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const EquipmentItem = React.memo(EquipmentItemInner, (prev, next) => {
  // Skip re-render if eq object reference is equal and flashing flag unchanged
  return (
    prev.eq === next.eq && (prev.flashing ?? false) === (next.flashing ?? false)
  );
});

export function EquipmentList({
  gymName,
  onBack,
  onEquipmentSelect,
}: EquipmentListProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedEquipmentForReport, setSelectedEquipmentForReport] =
    useState<string>("");
  const [reportType, setReportType] = useState<string>("");
  const [reportDescription, setReportDescription] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // 디버깅: gymName 확인
  console.log("EquipmentList gymName:", gymName);

  // 컴포넌트 마운트 시 운동기구 목록 가져오기
  // flashing state for item highlight (id -> boolean)
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  const timeoutsRef = useRef<number[]>([]);
  // ref to store SSE cleanup function so effect cleanup can call it
  const sseCleanupRef = useRef<(() => void) | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const sseEnabled = useMemo(() => {
    try {
      const raw = (import.meta as any)?.env?.VITE_ENABLE_EQUIPMENT_SSE;
      return raw === "true";
    } catch (e) {
      return false;
    }
  }, []);

  const pollIntervalMs = useMemo(() => {
    try {
      const raw = (import.meta as any)?.env?.VITE_EQUIPMENT_POLL_INTERVAL_MS;
      if (raw) return Math.max(parseInt(raw, 10) || 0, 3000);
    } catch (e) {
      /* ignore */
    }
    return 5000;
  }, []);

  useEffect(() => {
    const base = (() => {
      // Vite exposes env vars on import.meta.env (VITE_...); guard process for other bundlers
      try {
        const vite = (import.meta as any)?.env?.VITE_API_BASE;
        if (vite) return vite;
      } catch (e) {
        /* ignore */
      }
      try {
        if (typeof process !== "undefined" && process?.env?.REACT_APP_API_BASE)
          return process.env.REACT_APP_API_BASE;
      } catch (e) {
        /* ignore */
      }
      return "http://43.201.88.27";
    })();

    const getEquipmentImage = (name: string, type: string): string => {
      const nameLower = (name || "").toLowerCase();
      if (
        nameLower.includes("러닝") ||
        nameLower.includes("런닝") ||
        nameLower.includes("treadmill")
      )
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (
        nameLower.includes("사이클") ||
        nameLower.includes("cycle") ||
        nameLower.includes("bike")
      )
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("일립티컬") || nameLower.includes("elliptical"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("로잉") || nameLower.includes("rowing"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("벤치") || nameLower.includes("bench"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("스쿼트") || nameLower.includes("squat"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("덤벨") || nameLower.includes("dumbbell"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if (nameLower.includes("스텝") || nameLower.includes("step"))
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      if ((type || "").toLowerCase() === "cardio")
        return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    };

    const normalizeEquipment = (eq: any): Equipment => {
      if (!eq) {
        return {
          id: "unknown",
          name: "기구",
          type: "cardio",
          status: "available",
          image: getEquipmentImage("기구", "cardio"),
          allocatedTime: 30,
          waitingCount: 0,
        };
      }

      const status =
        eq.status === "AVAILABLE"
          ? "available"
          : eq.status === "IN_USE"
          ? "in-use"
          : eq.status === "WAITING"
          ? "waiting"
          : "available";

      const imageUrl =
        eq.image_url ||
        eq.image ||
        eq.imageUrl ||
        eq.photo ||
        eq.picture_url ||
        getEquipmentImage(eq.name || "기구", eq.type || "cardio");

      return {
        id: String(eq.id ?? eq.equipment_id ?? eq.pk ?? eq.equipmentId ?? ""),
        name: eq.name || eq.equipment || "기구",
        type: (eq.type || "cardio").toLowerCase(),
        status,
        image: imageUrl,
        allocatedTime: eq.base_session_time_minutes || eq.allocatedTime || 30,
        waitingCount:
          eq.waiting_count ?? eq.waitingCount ?? eq.queue_length ?? undefined,
        currentUser: eq.current_user ?? eq.currentUser ?? undefined,
        timeRemaining: eq.time_remaining ?? eq.timeRemaining ?? undefined,
      };
    };

    const mergeEquipmentFromServer = (
      rawItems: any[] | any,
      opts?: { suppressFlash?: boolean }
    ) => {
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      const formatted = items
        .map(normalizeEquipment)
        .filter((item) => item.id !== "");

      setEquipment((prev) => {
        const prevById = new Map(prev.map((item) => [String(item.id), item]));
        const changedIds: string[] = [];
        const next = formatted.map((item) => {
          const prevItem = prevById.get(item.id);
          if (!prevItem) {
            changedIds.push(item.id);
            return item;
          }
          const hasChange =
            prevItem.status !== item.status ||
            (prevItem.waitingCount ?? 0) !== (item.waitingCount ?? 0) ||
            prevItem.currentUser !== item.currentUser ||
            prevItem.timeRemaining !== item.timeRemaining;
          if (hasChange) {
            changedIds.push(item.id);
            return { ...prevItem, ...item };
          }
          return prevItem;
        });

        if (!opts?.suppressFlash && changedIds.length > 0) {
          setFlashing((prevFlash) => {
            const updated = { ...prevFlash };
            changedIds.forEach((id) => {
              updated[id] = true;
            });
            return updated;
          });
          const timeoutId = window.setTimeout(() => {
            setFlashing((prevFlash) => {
              const updated = { ...prevFlash };
              changedIds.forEach((id) => {
                updated[id] = false;
              });
              return updated;
            });
          }, 700);
          timeoutsRef.current.push(timeoutId);
        }

        return next;
      });
    };

    const startPolling = (initialToken: string | null) => {
      const fetchSnapshot = async () => {
        let access = accessTokenRef.current ?? initialToken;
        const refresh = localStorage.getItem("refresh_token");

        const callFetch = async (token: string | null) => {
          const headers: any = { "Content-Type": "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;
          return await fetch(`${base}/api/equipment/`, { headers });
        };

        try {
          let res = await callFetch(access);
          if (res.status === 401 && refresh) {
            const rres = await fetch(`${base}/api/token/refresh/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh }),
            });
            if (rres.ok) {
              const rdata = await rres.json();
              if (rdata.access) {
                access = rdata.access;
                accessTokenRef.current = access;
                localStorage.setItem("access_token", access);
                res = await callFetch(access);
              }
            } else {
              console.warn("Access token refresh failed during polling");
              return;
            }
          }

          if (!res.ok) {
            console.warn("Equipment polling failed", res.status);
            return;
          }

          const data = await res.json();
          mergeEquipmentFromServer(data);
        } catch (err) {
          console.warn("Equipment polling error", err);
        }
      };

      fetchSnapshot();
      const timer = window.setInterval(fetchSnapshot, pollIntervalMs);
      return () => {
        window.clearInterval(timer);
      };
    };

    const openSSE = (accessToken: string | null) => {
      let es: EventSource | null = null;
      try {
        const tokenParam = accessToken
          ? `?access_token=${encodeURIComponent(accessToken)}`
          : "";
        // avoid accidental double-slash before query
        es = new EventSource(`${base}/api/equipment/stream${tokenParam}`);
        console.log("SSE: connecting to equipment stream...");

        // Listen to default message events (if server emits plain messages)
        es.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            mergeEquipmentFromServer(payload);
          } catch (err) {
            console.error("SSE message parse error", err);
          }
        };

        // Some servers emit a named event for the initial snapshot ("initial").
        // Add a listener so we correctly receive that payload and initialize the list.
        es.addEventListener("initial", (ev: MessageEvent) => {
          try {
            const payload = JSON.parse((ev as any).data);
            if (payload) {
              mergeEquipmentFromServer(payload, { suppressFlash: true });
            }
          } catch (err) {
            console.error("SSE initial event parse error", err);
          }
        });

        es.onerror = (err) => {
          console.warn("SSE error", err);
        };
      } catch (err) {
        console.warn("SSE not available", err);
      }

      // return cleanup
      return () => {
        if (es) es.close();
      };
    };

    const doInitial = async () => {
      // mock shortcut for example gym
      if (gymName === "헬스장 예제" || !gymName) {
        console.log("헬스장 예제: 하드코딩 데이터 사용");
        const mockEquipment: Equipment[] = [
          {
            id: "1",
            name: "러닝머신 1",
            type: "cardio",
            status: "available",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
            allocatedTime: 30,
          },
          {
            id: "2",
            name: "러닝머신 2",
            type: "cardio",
            status: "in-use",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
            allocatedTime: 45,
            timeRemaining: 25,
          },
        ];
        setEquipment(mockEquipment);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        let access = localStorage.getItem("access_token");
        const refresh = localStorage.getItem("refresh_token");

        const callFetch = async (token: string | null) => {
          const headers: any = { "Content-Type": "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;
          return await fetch(`${base}/api/equipment/`, { headers });
        };

        console.debug("doInitial: starting equipment fetch", {
          access: !!access,
          refresh: !!refresh,
        });
        let res = await callFetch(access);
        console.debug("doInitial: initial fetch response status", res.status);
        if (res.status === 401 && refresh) {
          // try refresh
          const rres = await fetch(`${base}/api/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          });
          console.debug("doInitial: refresh response status", rres.status);
          if (rres.ok) {
            const rdata = await rres.json();
            if (rdata.access) {
              access = rdata.access;
              localStorage.setItem("access_token", access);
              res = await callFetch(access);
              console.debug(
                "doInitial: fetch after refresh status",
                res.status
              );
            }
          } else {
            throw new Error("인증 필요: 로그인 후 다시 시도하세요.");
          }
        }

        if (!res.ok) throw new Error("운동기구 목록을 불러올 수 없습니다.");

        const data = await res.json();
        console.debug(
          "doInitial: fetched equipment count",
          Array.isArray(data) ? data.length : typeof data
        );
        const formattedEquipment: Equipment[] = data.map((eq: any) => {
          const imageUrl =
            eq.image_url ||
            eq.image ||
            eq.imageUrl ||
            eq.photo ||
            eq.picture_url ||
            getEquipmentImage(eq.name, eq.type);
          return {
            id: eq.id.toString(),
            name: eq.name,
            type: (eq.type || "").toLowerCase(),
            status:
              eq.status === "AVAILABLE"
                ? "available"
                : eq.status === "IN_USE"
                ? "in-use"
                : eq.status === "WAITING"
                ? "waiting"
                : "available",
            image: imageUrl,
            allocatedTime: eq.base_session_time_minutes || 30,
            waitingCount: eq.waiting_count ?? 0,
            currentUser: eq.current_user ?? undefined,
            timeRemaining: eq.time_remaining ?? undefined,
          };
        });

        setEquipment(formattedEquipment);
        setError(null);
        setLoading(false);

        // open SSE only after successful initial fetch
        accessTokenRef.current = access;

        if (sseEnabled) {
          const cleanup = openSSE(access);
          sseCleanupRef.current = cleanup;
        } else {
          const cleanup = startPolling(access);
          pollCleanupRef.current = cleanup;
        }
      } catch (err) {
        console.error("Initial equipment fetch failed:", err);
        setError(err instanceof Error ? err.message : String(err));
        setEquipment([]);
        setLoading(false);
      }
    };

    doInitial();

    return () => {
      // cleanup SSE and timeouts
      if (sseCleanupRef.current) sseCleanupRef.current();
      if (pollCleanupRef.current) pollCleanupRef.current();
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      sseCleanupRef.current = null;
      pollCleanupRef.current = null;
    };
  }, [gymName, pollIntervalMs, sseEnabled]);

  const categories = [
    { id: "all", name: "전체" },
    { id: "cardio", name: "유산소" },
    { id: "strength", name: "근력" },
  ];

  const reportTypes = [
    { value: "malfunction", label: "기기 고장" },
    { value: "violation", label: "사용자 규정 위반" },
    { value: "other", label: "기타" },
  ];

  const handleReportSubmit = async () => {
    if (!selectedEquipmentForReport || !reportType) return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      alert("로그인이 필요합니다.");
      return;
    }

    // SatisfactionSurvey.tsx와 동일한 API 경로/방식으로 신고 전송
    setIsSubmittingReport(true);
    try {
      const label =
        reportTypes.find((t) => t.value === reportType)?.label || "신고";
      const reason = reportDescription
        ? `${label}: ${reportDescription}`
        : label;

      const response = await fetch("http://43.201.88.27/api/reports/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          equipment: parseInt(selectedEquipmentForReport, 10),
          reason,
          report_type: reportType, // malfunction | violation | other
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("신고 제출 실패:", response.status, text);
        throw new Error("신고 제출 실패");
      }

      // 폼 초기화 및 닫기
      setSelectedEquipmentForReport("");
      setReportType("");
      setReportDescription("");
      setIsReportModalOpen(false);

      // 사용자 알림 (기존 메시지 유지)
      alert("신고가 정상적으로 접수되었습니다. 빠른 시일 내에 처리하겠습니다.");
    } catch (e) {
      console.error("신고 제출 중 오류:", e);
      alert("신고 제출 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const filteredEquipment =
    selectedCategory === "all"
      ? equipment
      : equipment.filter((eq) => eq.type === selectedCategory);

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white">{gymName}</h1>
            <p className="text-gray-300">운동기구 현황</p>
          </div>
          <Button
            onClick={() => setIsReportModalOpen(true)}
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-900/20 px-2"
          >
            <Flag className="h-4 w-4 mr-1" />
            신고하기
          </Button>
        </div>

        <div className="flex space-x-2">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className={
                selectedCategory === category.id
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "border-gray-600 text-gray-300 hover:bg-gray-700"
              }
            >
              {category.name}
            </Button>
          ))}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-12 w-12 animate-spin mb-4" />
            <p>운동기구 목록을 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 font-medium">오류가 발생했습니다</p>
              <p className="text-red-300 text-sm mt-1">{error}</p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="mt-3 border-red-500 text-red-400 hover:bg-red-500/10"
              >
                새로고침
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && filteredEquipment.length === 0 && (
          <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-blue-400 mx-auto mb-3" />
            <h3 className="text-white font-medium mb-2">
              등록된 운동기구가 없습니다
            </h3>
            <p className="text-gray-400 text-sm">
              {selectedCategory === "all"
                ? "헬스장에 등록된 운동기구가 없습니다."
                : "해당 카테고리에 운동기구가 없습니다."}
            </p>
          </div>
        )}

        {!loading && !error && filteredEquipment.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEquipment.map((eq) => (
              <EquipmentItem
                key={eq.id}
                eq={eq}
                onSelect={onEquipmentSelect}
                flashing={!!flashing[String(eq.id)]}
              />
            ))}
          </div>
        )}

        {/* 신고하기 다이얼로그 */}
        <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
          <DialogContent className="bg-card border-gray-600 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2 text-red-400">
                <Flag className="h-5 w-5" />
                <span>기기/사용자 신고</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  신고할 기구 선택
                </label>
                <Select
                  value={selectedEquipmentForReport}
                  onValueChange={setSelectedEquipmentForReport}
                >
                  <SelectTrigger className="bg-input-background border-gray-600 text-white">
                    <SelectValue placeholder="기구를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-gray-600">
                    {equipment.map((eq) => (
                      <SelectItem
                        key={eq.id}
                        value={eq.id}
                        className="text-white hover:bg-gray-700"
                      >
                        {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  신고 유형
                </label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="bg-input-background border-gray-600 text-white">
                    <SelectValue placeholder="신고 유형을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-gray-600">
                    {reportTypes.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        className="text-white hover:bg-gray-700"
                      >
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  상세 설명 (선택사항)
                </label>
                <Textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="신고 내용을 자세히 설명해주세요..."
                  className="bg-input-background border-gray-600 text-white placeholder-gray-400 min-h-[80px]"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsReportModalOpen(false)}
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  취소
                </Button>
                <Button
                  onClick={handleReportSubmit}
                  disabled={
                    isSubmittingReport ||
                    !selectedEquipmentForReport ||
                    !reportType
                  }
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isSubmittingReport ? "접수 중..." : "신고 접수"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
