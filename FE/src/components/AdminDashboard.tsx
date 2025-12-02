import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  ArrowLeft,
  Users,
  AlertTriangle,
  Clock,
  Settings,
  BarChart3,
  LogOut,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import {
  BarChart as RBarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface Report {
  id: string;
  type: "malfunction" | "violation" | "other";
  equipment: string;
  reporter: string;
  description: string;
  status: "pending" | "resolved";
  timestamp: string;
  createdAt: Date;
}

interface Usage {
  equipment: string;
  totalUsage: number;
  averageTime: number;
  satisfaction: number;
}

interface EquipmentItem {
  id: number;
  name: string;
  type: string;
  status: string;
  operational_state: "NORMAL" | "MAINTENANCE" | "BROKEN";
  image?: string;
}

interface AdminDashboardProps {
  onBack: () => void;
  gymName?: string;
  onLogout?: () => void;
}

export function AdminDashboard({
  onBack,
  gymName,
  onLogout,
}: AdminDashboardProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [isLoadingEquipment, setIsLoadingEquipment] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddEquipmentDialog, setShowAddEquipmentDialog] = useState(false);
  const [newEquipment, setNewEquipment] = useState({
    name: "",
    type: "",
    subcategory: "",
    difficulty: "MID",
  });
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [usageStats, setUsageStats] = useState<Usage[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // 현재 이용률 상태 (폴링용)
  const [currentUtilization, setCurrentUtilization] = useState({
    active_sessions: 0,
    utilization_percent: 0,
  });
  const [hourlyUsageData, setHourlyUsageData] = useState<
    { hour: string; rate: number }[]
  >([]);

  // 신고 목록 가져오기
  const fetchReports = async (silent = false) => {
    if (!silent) {
      setIsLoadingReports(true);
    }
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch("http://43.201.88.27/api/reports/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("신고 목록 조회 실패");
      }

      const data = await response.json();
      console.log("신고 목록 API 응답:", data);

      // BE 데이터를 FE 형식으로 변환
      const transformedReports: Report[] = data.map((report: any) => ({
        id: report.id.toString(),
        type:
          (report.report_type as "malfunction" | "violation" | "other") ||
          (report.equipment ? "malfunction" : "violation"),
        equipment: report.equipment_name || "기구 없음",
        reporter: report.reporter,
        description: report.reason,
        status: report.status.toLowerCase() as "pending" | "resolved",
        timestamp: new Date(report.created_at).toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAt: new Date(report.created_at), // 정렬용 Date 객체 추가
      }));

      // 1) pending 우선 2) 각 그룹 내에서 최신순 정렬
      const sortedReports = transformedReports.sort((a, b) => {
        // 먼저 상태별로 정렬 (pending이 먼저)
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;

        // 같은 상태 내에서는 최신순 정렬 (최근 것이 먼저)
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      setReports(sortedReports);
    } catch (error) {
      console.error("신고 목록 조회 에러:", error);
    } finally {
      setIsLoadingReports(false);
    }
  };

  // 신고 처리하기
  const handleResolveReport = async (reportId: string) => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(
        `http://43.201.88.27/api/reports/${reportId}/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "RESOLVED" }),
        }
      );

      if (!response.ok) {
        throw new Error("신고 처리 실패");
      }

      console.log(`신고 ${reportId} 처리 완료`);

      // 목록 새로고침
      fetchReports();
    } catch (error) {
      console.error("신고 처리 에러:", error);
      alert("신고 처리 중 오류가 발생했습니다.");
    }
  };

  // 기구 목록 가져오기
  const fetchEquipment = async () => {
    setIsLoadingEquipment(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch("http://43.201.88.27/api/equipment/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("기구 목록 조회 실패");
      }

      const data = await response.json();
      console.log("기구 목록 API 응답:", data);
      setEquipmentList(data);
    } catch (error) {
      console.error("기구 목록 조회 에러:", error);
    } finally {
      setIsLoadingEquipment(false);
    }
  };

  // 기구 상태 변경
  const handleChangeEquipmentStatus = async (
    equipmentId: number,
    newStatus: "NORMAL" | "MAINTENANCE" | "BROKEN",
    equipmentName?: string
  ) => {
    try {
      const token = localStorage.getItem("access_token");

      // 현재 기구의 상태 확인
      const currentEquipment = equipmentList.find((e) => e.id === equipmentId);
      const oldStatus = currentEquipment?.operational_state;

      let gymId = 1; // 기본값

      // 운영 상태 변경 (백엔드 표준 경로 사용)
      const response = await fetch(
        `http://43.201.88.27/api/equipment/${equipmentId}/operational-state/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gym_id: gymId,
            operational_state: newStatus,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "기구 상태 변경 실패");
      }
      console.log(`기구 ${equipmentId} 상태를 ${newStatus}로 변경 완료`);

      // MAINTENANCE에서 BROKEN으로 변경 시 해당 기구의 모든 예약 취소
      if (oldStatus === "MAINTENANCE" && newStatus === "BROKEN") {
        console.log(`⚠️ 기구 ${equipmentId} 고장 처리 - 모든 예약 취소 시작`);

        try {
          // 해당 기구의 모든 예약 가져오기
          const reservationsResponse = await fetch(
            `http://43.201.88.27/api/reservations/?equipment_id=${equipmentId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (reservationsResponse.ok) {
            const reservations = await reservationsResponse.json();
            console.log(`기구 ${equipmentId}의 예약 목록:`, reservations);

            // 모든 예약 취소 (IN_USE, WAITING, NOTIFIED 상태 모두)
            const cancelPromises = reservations
              .filter(
                (r: any) =>
                  r.status === "IN_USE" ||
                  r.status === "WAITING" ||
                  r.status === "NOTIFIED"
              )
              .map(async (reservation: any) => {
                try {
                  const cancelResponse = await fetch(
                    `http://43.201.88.27/api/reservations/${reservation.id}/`,
                    {
                      method: "DELETE",
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );

                  if (cancelResponse.ok) {
                    console.log(
                      `✅ 예약 ${reservation.id} (사용자: ${reservation.user}) 취소 완료`
                    );
                  } else {
                    console.error(
                      `❌ 예약 ${reservation.id} 취소 실패:`,
                      await cancelResponse.text()
                    );
                  }
                } catch (err) {
                  console.error(`❌ 예약 ${reservation.id} 취소 중 오류:`, err);
                }
              });

            await Promise.all(cancelPromises);
            console.log(`✅ 기구 ${equipmentId}의 모든 예약 취소 완료`);
          }
        } catch (err) {
          console.error("예약 취소 중 오류:", err);
        }
      }

      // BROKEN에서 NORMAL로 변경 시 기구 상태를 AVAILABLE로 리셋
      if (oldStatus === "BROKEN" && newStatus === "NORMAL") {
        console.log(`✅ 기구 ${equipmentId} 정상 복구 - AVAILABLE 상태로 변경`);

        try {
          // 기구 상태를 AVAILABLE로 변경
          const statusResponse = await fetch(
            `http://43.201.88.27/api/equipment/${equipmentId}/`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: "AVAILABLE" }),
            }
          );

          if (statusResponse.ok) {
            console.log(
              `✅ 기구 ${equipmentId} 상태가 AVAILABLE로 변경되어 즉시 사용 가능합니다`
            );
          }
        } catch (err) {
          console.error("기구 상태 변경 중 오류:", err);
        }
      }

      // MAINTENANCE에서 NORMAL 또는 BROKEN으로 변경 시 해당 기구의 pending 신고 자동 처리
      if (
        oldStatus === "MAINTENANCE" &&
        (newStatus === "NORMAL" || newStatus === "BROKEN")
      ) {
        // 해당 기구의 pending 상태 신고 찾기
        const pendingReport = reports.find(
          (r) =>
            r.equipment === (equipmentName || currentEquipment?.name) &&
            r.status === "pending"
        );

        if (pendingReport) {
          console.log(`자동으로 신고 ${pendingReport.id} 처리 중...`);
          await handleResolveReport(pendingReport.id);
        }
      }

      // 목록 새로고침 (기구 목록과 신고 목록 모두)
      await fetchEquipment();
      await fetchReports();
    } catch (error) {
      console.error("기구 상태 변경 에러:", error);
      alert("기구 상태 변경 중 오류가 발생했습니다.");
    }
  };

  // 컴포넌트 마운트 시 신고 목록 및 기구 목록 가져오기
  useEffect(() => {
    fetchReports();
    fetchEquipment();
    fetchUsageStats();
    fetchCurrentUtilization();
    fetchHourlyUtilization();
  }, []);

  // 현재 이용률 10초마다 폴링
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCurrentUtilization();
    }, 10000); // 10초

    return () => clearInterval(interval);
  }, []);

  // 운영자 알림 SSE 구독
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    console.log("🔔 [AdminDashboard] 운영자 알림 SSE 연결 시작");

    const eventSource = new EventSource(
      `http://43.201.88.27/api/operator-notifications/?access_token=${encodeURIComponent(
        token
      )}`
    );

    eventSource.onopen = () => {
      console.log("✅ [AdminDashboard] 운영자 알림 SSE 연결 성공");
    };

    eventSource.addEventListener("connected", (event: MessageEvent) => {
      console.log("🎉 [AdminDashboard] 운영자 알림 스트림 연결됨:", event.data);
    });

    eventSource.addEventListener("report_created", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📢 [AdminDashboard] 새 신고 알림:", data);

        // 신고 목록 새로고침
        fetchReports(true);

        // 알림 표시 (선택사항)
        if (Notification.permission === "granted") {
          new Notification("새 신고 접수", {
            body: `${data.reporter_username}님이 ${
              data.equipment_name || "기구"
            } 신고를 제출했습니다.`,
            icon: "/icon.png",
          });
        }
      } catch (err) {
        console.error("신고 알림 파싱 오류:", err);
      }
    });

    eventSource.addEventListener("equipment_created", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log("🆕 [AdminDashboard] 새 기구 등록:", data);

        // 기구 목록 새로고침
        fetchEquipment();
      } catch (err) {
        console.error("기구 등록 알림 파싱 오류:", err);
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      // heartbeat는 조용히 처리
    });

    eventSource.onerror = (error: Event) => {
      console.error("❌ [AdminDashboard] 운영자 알림 SSE 오류:", error);
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("🔌 [AdminDashboard] SSE 연결 종료됨");
      }
    };

    return () => {
      console.log("🔌 [AdminDashboard] 운영자 알림 SSE 연결 종료");
      eventSource.close();
    };
  }, []);

  // 수동 새로고침 함수
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchReports(), fetchEquipment()]);
      console.log("✅ 수동 새로고침 완료");
    } finally {
      setIsRefreshing(false);
    }
  };

  // 기구 이름 기반 이미지 URL 자동 생성
  const generateEquipmentImage = (name: string): string => {
    const imageMap: { [key: string]: string } = {
      벤치프레스:
        "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400",
      스쿼트:
        "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400",
      데드리프트:
        "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=400",
      레그프레스:
        "https://images.unsplash.com/photo-1434682772747-f16d3ea162c3?w=400",
      렛풀다운:
        "https://images.unsplash.com/photo-1584863231364-2edc166de576?w=400",
      케이블:
        "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400",
      덤벨: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400",
      런닝머신:
        "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400",
      사이클:
        "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=400",
    };

    // 이름에 포함된 키워드로 매칭
    for (const [keyword, url] of Object.entries(imageMap)) {
      if (name.includes(keyword)) {
        return url;
      }
    }

    // 기본 이미지
    return "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400";
  };

  // 기구 등록 처리
  const handleAddEquipment = async () => {
    if (
      !newEquipment.name ||
      !newEquipment.type ||
      !newEquipment.subcategory ||
      !newEquipment.difficulty
    ) {
      alert("모든 필수 항목을 입력해주세요.");
      return;
    }

    setIsAddingEquipment(true);
    try {
      const token = localStorage.getItem("access_token");
      console.log("🔑 [기구 등록] access_token:", token ? "존재" : "없음");

      if (!token) {
        alert("로그인 정보가 없습니다. 다시 로그인해주세요.");
        return;
      }

      const imageUrl = generateEquipmentImage(newEquipment.name);

      // 백엔드에서 gym을 자동 할당하므로 gym 필드를 보내지 않습니다
      const requestBody = {
        name: newEquipment.name,
        type: newEquipment.type,
        subcategory: newEquipment.subcategory,
        difficulty: newEquipment.difficulty,
        status: "AVAILABLE",
        operational_state: "NORMAL",
        image_url: imageUrl,
      };

      console.log("📤 [기구 등록] Request body:", requestBody);

      const response = await fetch("http://43.201.88.27/api/equipment/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📥 [기구 등록] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [기구 등록] Error response:", errorData);
        throw new Error(errorData.detail || "기구 등록 실패");
      }

      const data = await response.json();
      console.log("✅ 기구 등록 성공:", data);

      // 다이얼로그 닫기 및 폼 초기화
      setShowAddEquipmentDialog(false);
      setNewEquipment({
        name: "",
        type: "",
        subcategory: "",
        difficulty: "MID",
      });

      // SSE로 자동 업데이트되지만, 확실하게 수동으로도 새로고침
      await fetchEquipment();
      alert(`${data.name} 기구가 등록되었습니다!`);
    } catch (error) {
      console.error("기구 등록 에러:", error);
      alert(
        error instanceof Error
          ? error.message
          : "기구 등록 중 오류가 발생했습니다."
      );
    } finally {
      setIsAddingEquipment(false);
    }
  };

  // KST(Asia/Seoul) 기준 YYYY-MM-DD 포맷 헬퍼
  const todayKST = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  // 이용 통계 가져오기
  const fetchUsageStats = async () => {
    setIsLoadingStats(true);
    try {
      const token = localStorage.getItem("access_token");
      const today = todayKST(); // YYYY-MM-DD (Asia/Seoul)
      const response = await fetch(
        `http://43.201.88.27/api/equipment/daily-stats/?date=${today}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("이용 통계 조회 실패");
      }

      const data = await response.json();
      console.log("일일 통계 API 응답:", data);

      // API 응답에서 records 배열 추출 (호환성: 배열 혹은 객체.records)
      const records = Array.isArray(data) ? data : data.records || [];
      const transformedStats: Usage[] = records.map((stat: any) => ({
        equipment: stat.equipment_name,
        totalUsage: stat.usage_count,
        averageTime: Math.round(stat.average_time_minutes),
        satisfaction: 0, // 만족도는 현재 미사용
      }));

      setUsageStats(transformedStats);
    } catch (error) {
      console.error("이용 통계 조회 에러:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // 현재 이용률 가져오기 (폴링용)
  const fetchCurrentUtilization = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(
        "http://43.201.88.27/api/utilization/current/",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("현재 이용률 조회 실패");
      }

      const data = await response.json();
      console.log("현재 이용률 API 응답:", data);

      setCurrentUtilization({
        active_sessions: data.active_sessions,
        utilization_percent: data.utilization_percent,
      });
    } catch (error) {
      console.error("현재 이용률 조회 에러:", error);
    }
  };

  // 시간대별 이용률 가져오기
  const fetchHourlyUtilization = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const today = todayKST(); // YYYY-MM-DD (Asia/Seoul)
      const response = await fetch(
        `http://43.201.88.27/api/utilization/hourly/?date=${today}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("시간대별 이용률 조회 실패");
      }

      const data = await response.json();
      console.log("시간대별 이용률 API 응답:", data);

      // API 응답의 hours 배열을 차트 데이터로 변환
      const chartData = data.hours.map(
        (rate: number | null, index: number) => ({
          hour: String(index), // 숫자 문자열로 ("0", "1", "2", ...)
          rate: rate === null ? 0 : Math.round(rate), // null을 0으로
        })
      );

      setHourlyUsageData(chartData);
    } catch (error) {
      console.error("시간대별 이용률 조회 에러:", error);
    }
  };

  const pendingReports = reports.filter((r) => r.status === "pending");

  // Show usage charts panel when clicking the usage metric card
  const [showUsagePanel, setShowUsagePanel] = useState(false);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">운영자 대시보드</h1>
            {gymName && <p className="text-gray-300">{gymName}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowAddEquipmentDialog(true)}
              variant="outline"
              className="border-blue-600 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              기구 등록
            </Button>
            {onLogout && (
              <Button
                onClick={onLogout}
                variant="outline"
                className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
              >
                <LogOut className="h-4 w-4 mr-2" />
                로그아웃
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="border-gray-600 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {currentUtilization.active_sessions}
                  </p>
                  <p className="text-sm text-gray-300">현재 이용자</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600 bg-card">
            <CardContent
              className="p-4 cursor-pointer hover:bg-gray-800/60 transition-colors"
              onClick={() => setShowUsagePanel((v) => !v)}
            >
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {currentUtilization.utilization_percent}%
                  </p>
                  <p className="text-sm text-gray-300">이용률</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {showUsagePanel && (
          <Card className="border-gray-600 bg-card mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">
                  시간대별 이용률 통계
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  onClick={() => setShowUsagePanel(false)}
                >
                  닫기
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ width: "100%", height: "450px" }}>
                <HourlyUsageChart data={hourlyUsageData} />
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="reports" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800">
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white text-gray-300"
            >
              신고 관리
            </TabsTrigger>
            <TabsTrigger
              value="equipment"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white text-gray-300"
            >
              기구 관리
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white text-gray-300"
            >
              이용 통계
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            <Card className="border-gray-600 bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">신고 목록</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${
                        isRefreshing ? "animate-spin" : ""
                      }`}
                    />
                    {isRefreshing ? "새로고침 중..." : "새로고침"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingReports ? (
                  <div className="text-center text-gray-400 py-8">
                    신고 목록을 불러오는 중...
                  </div>
                ) : reports.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    신고 내역이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="p-4 border border-gray-700 rounded-lg bg-gray-800 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <Badge
                              className={
                                report.type === "malfunction"
                                  ? "bg-red-900/50 text-red-300 border-red-700"
                                  : report.type === "violation"
                                  ? "bg-orange-900/50 text-orange-300 border-orange-700"
                                  : "bg-gray-700 text-gray-300 border-gray-600"
                              }
                            >
                              {report.type === "malfunction"
                                ? "기구 고장"
                                : report.type === "violation"
                                ? "사용자 신고"
                                : "기타"}
                            </Badge>
                            <Badge
                              className={
                                report.status === "pending"
                                  ? "bg-yellow-900/50 text-yellow-300 border-yellow-700"
                                  : "bg-green-900/50 text-green-300 border-green-700"
                              }
                            >
                              {report.status === "pending"
                                ? "처리 대기"
                                : "처리 완료"}
                            </Badge>
                          </div>
                          {report.status === "pending" && (
                            <div className="flex items-center gap-2">
                              <Select
                                value={
                                  equipmentList.find(
                                    (e) => e.name === report.equipment
                                  )?.operational_state
                                }
                                onValueChange={(value) => {
                                  const equipment = equipmentList.find(
                                    (e) => e.name === report.equipment
                                  );
                                  if (equipment) {
                                    handleChangeEquipmentStatus(
                                      equipment.id,
                                      value as
                                        | "NORMAL"
                                        | "MAINTENANCE"
                                        | "BROKEN",
                                      report.equipment
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger className="w-[120px] h-9 bg-gray-700 border-gray-600 text-gray-300">
                                  <SelectValue placeholder="상태 변경" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-600">
                                  <SelectItem
                                    value="NORMAL"
                                    className="text-green-400"
                                  >
                                    정상
                                  </SelectItem>
                                  <SelectItem
                                    value="MAINTENANCE"
                                    className="text-yellow-400"
                                  >
                                    점검중
                                  </SelectItem>
                                  <SelectItem
                                    value="BROKEN"
                                    className="text-red-400"
                                  >
                                    고장
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="bg-blue-500 hover:bg-blue-600 text-sm px-3 py-1.5 whitespace-nowrap flex-shrink-0 h-9"
                                onClick={() => handleResolveReport(report.id)}
                              >
                                처리하기
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-semibold text-white">
                            {report.equipment}
                          </h4>
                          <p className="text-gray-300 break-words">
                            {report.description}
                          </p>
                          <p className="text-sm text-gray-400">
                            신고자: {report.reporter} | {report.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-4">
            <Card className="border-gray-600 bg-card">
              <CardHeader>
                <CardTitle className="text-white">기구 상태 관리</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingEquipment ? (
                  <div className="text-center text-gray-400 py-8">
                    기구 목록을 불러오는 중...
                  </div>
                ) : equipmentList.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    등록된 기구가 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {equipmentList.map((equipment) => (
                      <div
                        key={equipment.id}
                        className="p-4 border border-gray-700 rounded-lg bg-gray-800"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-white">
                              {equipment.name}
                            </h4>
                            <Badge
                              className={
                                equipment.operational_state === "NORMAL"
                                  ? "bg-green-900/50 text-green-300 border-green-700 mt-1"
                                  : equipment.operational_state ===
                                    "MAINTENANCE"
                                  ? "bg-yellow-900/50 text-yellow-300 border-yellow-700 mt-1"
                                  : "bg-red-900/50 text-red-300 border-red-700 mt-1"
                              }
                            >
                              {equipment.operational_state === "NORMAL"
                                ? "정상"
                                : equipment.operational_state === "MAINTENANCE"
                                ? "점검중"
                                : "고장"}
                            </Badge>
                          </div>
                          <div className="space-x-2">
                            <Select
                              value={equipment.operational_state}
                              onValueChange={(value) =>
                                handleChangeEquipmentStatus(
                                  equipment.id,
                                  value as "NORMAL" | "MAINTENANCE" | "BROKEN",
                                  equipment.name
                                )
                              }
                            >
                              <SelectTrigger className="w-[120px] bg-gray-700 border-gray-600 text-gray-300">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-gray-800 border-gray-600">
                                <SelectItem
                                  value="NORMAL"
                                  className="text-green-400"
                                >
                                  정상
                                </SelectItem>
                                <SelectItem
                                  value="MAINTENANCE"
                                  className="text-yellow-400"
                                >
                                  점검중
                                </SelectItem>
                                <SelectItem
                                  value="BROKEN"
                                  className="text-red-400"
                                >
                                  고장
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card className="border-gray-600 bg-card">
              <CardHeader>
                <CardTitle className="text-white">기구별 이용 통계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {usageStats.map((u) => (
                    <div
                      key={u.equipment}
                      className="p-4 border border-blue-900/40 bg-blue-950/50 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="rounded-md bg-blue-900/40 px-4 py-2 text-white font-medium inline-block">
                          {u.equipment}
                        </div>
                        <div className="text-gray-200 text-sm space-y-1 text-right">
                          <div>오늘 이용: {u.totalUsage}회</div>
                          <div>평균 시간: {u.averageTime}분</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 기구 등록 다이얼로그 */}
        <Dialog
          open={showAddEquipmentDialog}
          onOpenChange={setShowAddEquipmentDialog}
        >
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">새 기구 등록</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* 기구 이름 */}
              <div className="space-y-2">
                <Label htmlFor="equipment-name" className="text-gray-300">
                  기구 이름 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="equipment-name"
                  placeholder="예: 벤치프레스, 스쿼트 랙"
                  value={newEquipment.name}
                  onChange={(e) =>
                    setNewEquipment({ ...newEquipment, name: e.target.value })
                  }
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>

              {/* 기구 타입 */}
              <div className="space-y-2">
                <Label htmlFor="equipment-type" className="text-gray-300">
                  기구 타입 <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={newEquipment.type}
                  onValueChange={(value) =>
                    setNewEquipment({ ...newEquipment, type: value })
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue placeholder="타입 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="FREE_WEIGHT" className="text-white">
                      프리웨이트
                    </SelectItem>
                    <SelectItem value="MACHINE" className="text-white">
                      머신
                    </SelectItem>
                    <SelectItem value="PLATE_LOADED" className="text-white">
                      플레이트로디드
                    </SelectItem>
                    <SelectItem value="CABLE" className="text-white">
                      케이블
                    </SelectItem>
                    <SelectItem value="SMITH_MACHINE" className="text-white">
                      스미스머신
                    </SelectItem>
                    <SelectItem value="CARDIO" className="text-white">
                      유산소
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 세부 카테고리 */}
              <div className="space-y-2">
                <Label
                  htmlFor="equipment-subcategory"
                  className="text-gray-300"
                >
                  세부 카테고리 <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={newEquipment.subcategory}
                  onValueChange={(value) =>
                    setNewEquipment({ ...newEquipment, subcategory: value })
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue placeholder="세부 카테고리 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="CHEST_PRESS_MAIN" className="text-white">
                      가슴 프레스 메인
                    </SelectItem>
                    <SelectItem
                      value="CHEST_PRESS_UPPER"
                      className="text-white"
                    >
                      가슴 프레스 상부
                    </SelectItem>
                    <SelectItem value="CHEST_FLY" className="text-white">
                      가슴 플라이
                    </SelectItem>
                    <SelectItem
                      value="BACK_PULL_VERTICAL"
                      className="text-white"
                    >
                      등 풀다운/풀업
                    </SelectItem>
                    <SelectItem
                      value="BACK_ROW_HORIZONTAL"
                      className="text-white"
                    >
                      등 로우
                    </SelectItem>
                    <SelectItem value="LEG_PRESS_MAIN" className="text-white">
                      하체 프레스/스쿼트
                    </SelectItem>
                    <SelectItem value="LEG_EXTENSION" className="text-white">
                      다리 익스텐션
                    </SelectItem>
                    <SelectItem value="LEG_CURL" className="text-white">
                      다리 컬
                    </SelectItem>
                    <SelectItem value="SHOULDER_PRESS" className="text-white">
                      어깨 프레스
                    </SelectItem>
                    <SelectItem value="SHOULDER_SIDE" className="text-white">
                      어깨 사이드
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 난이도 */}
              <div className="space-y-2">
                <Label htmlFor="equipment-difficulty" className="text-gray-300">
                  난이도 <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={newEquipment.difficulty}
                  onValueChange={(value) =>
                    setNewEquipment({ ...newEquipment, difficulty: value })
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="HIGH" className="text-white">
                      상
                    </SelectItem>
                    <SelectItem value="MID" className="text-white">
                      중
                    </SelectItem>
                    <SelectItem value="LOW" className="text-white">
                      하
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddEquipmentDialog(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                disabled={isAddingEquipment}
              >
                취소
              </Button>
              <Button
                onClick={handleAddEquipment}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isAddingEquipment}
              >
                {isAddingEquipment ? "등록 중..." : "등록하기"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ----- Charts -----
type HourlyDatum = { hour: string; rate: number };
function HourlyUsageChart({ data }: { data: HourlyDatum[] }) {
  const config = { rate: { label: "이용률", color: "#10b981" } } as const;

  return (
    <ChartContainer config={config} className="w-full h-full">
      <LineChart
        data={data}
        margin={{ top: 20, right: 40, left: 60, bottom: 50 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#374151"
          vertical={false}
        />
        <XAxis
          dataKey="hour"
          type="number"
          domain={[0, 23]}
          tick={{ fill: "#9ca3af", fontSize: 14 }}
          stroke="#6b7280"
          ticks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
          tickMargin={10}
          label={{
            value: "시간",
            position: "insideBottom",
            offset: -15,
            fill: "#9ca3af",
          }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#9ca3af", fontSize: 14 }}
          stroke="#6b7280"
          tickMargin={5}
          label={{
            value: "이용률",
            angle: -90,
            position: "insideLeft",
            offset: 0,
            fill: "#9ca3af",
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `${label}시`}
              formatter={(value) => [`이용률 : ${value}%`]}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#10b981"
          strokeWidth={3}
          dot={{ fill: "#10b981", r: 5 }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
