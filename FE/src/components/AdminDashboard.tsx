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
} from "lucide-react";

interface Report {
  id: string;
  type: "malfunction" | "violation" | "other";
  equipment: string;
  reporter: string;
  description: string;
  status: "pending" | "resolved";
  timestamp: string;
}

interface Usage {
  equipment: string;
  totalUsage: number;
  averageTime: number;
  satisfaction: number;
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

  // 신고 목록 가져오기
  const fetchReports = async () => {
    setIsLoadingReports(true);
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
      }));

      setReports(transformedReports);
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

  // 컴포넌트 마운트 시 신고 목록 가져오기
  useEffect(() => {
    fetchReports();
  }, []);

  const [usageStats] = useState<Usage[]>([
    {
      equipment: "러닝머신 1",
      totalUsage: 45,
      averageTime: 28,
      satisfaction: 4.2,
    },
    {
      equipment: "러닝머신 2",
      totalUsage: 38,
      averageTime: 32,
      satisfaction: 3.8,
    },
    {
      equipment: "벤치프레스",
      totalUsage: 32,
      averageTime: 22,
      satisfaction: 4.5,
    },
    {
      equipment: "스쿼트 랙",
      totalUsage: 28,
      averageTime: 25,
      satisfaction: 4.3,
    },
    { equipment: "덤벨", totalUsage: 52, averageTime: 18, satisfaction: 4.1 },
  ]);

  const pendingReports = reports.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">운영자 대시보드</h1>
            {gymName && <p className="text-gray-300">{gymName}</p>}
          </div>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-gray-600 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">67</p>
                  <p className="text-sm text-gray-300">현재 이용자</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-8 w-8 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {pendingReports.length}
                  </p>
                  <p className="text-sm text-gray-300">미처리 신고</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">85%</p>
                  <p className="text-sm text-gray-300">이용률</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-8 w-8 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">4.2</p>
                  <p className="text-sm text-gray-300">평균 만족도</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
                <CardTitle className="text-white">신고 목록</CardTitle>
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
                            <Button
                              size="sm"
                              className="bg-blue-500 hover:bg-blue-600 text-sm px-3 py-1.5 whitespace-nowrap flex-shrink-0"
                              onClick={() => handleResolveReport(report.id)}
                            >
                              처리하기
                            </Button>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    "러닝머신 1",
                    "러닝머신 2",
                    "벤치프레스",
                    "스쿼트 랙",
                    "덤벨",
                    "스텝밀",
                  ].map((equipment) => (
                    <div
                      key={equipment}
                      className="p-4 border border-gray-700 rounded-lg bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-white">
                            {equipment}
                          </h4>
                          <Badge className="bg-green-900/50 text-green-300 border-green-700 mt-1">
                            정상
                          </Badge>
                        </div>
                        <div className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            설정
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card className="border-gray-600 bg-card">
              <CardHeader>
                <CardTitle className="text-white">기구별 이용 통계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {usageStats.map((stat) => (
                    <div
                      key={stat.equipment}
                      className="p-4 border border-gray-700 rounded-lg bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-white">
                          {stat.equipment}
                        </h4>
                        <div className="text-right space-y-1">
                          <div className="text-sm text-gray-300">
                            오늘 이용: {stat.totalUsage}회
                          </div>
                          <div className="text-sm text-gray-300">
                            평균 시간: {stat.averageTime}분
                          </div>
                          <div className="text-sm text-gray-300">
                            만족도: ⭐ {stat.satisfaction}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
