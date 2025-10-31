import { useState } from "react";
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
} from "lucide-react";
import React from "react";

interface Report {
  id: string;
  type: "equipment" | "user";
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
}

export function AdminDashboard({ onBack, gymName }: AdminDashboardProps) {
  const [reports] = useState<Report[]>([
    {
      id: "1",
      type: "equipment",
      equipment: "러닝머신 2",
      reporter: "김철수",
      description: "벨트가 미끄러져서 위험합니다",
      status: "pending",
      timestamp: "2024-01-15 14:30",
    },
    {
      id: "2",
      type: "user",
      equipment: "벤치프레스",
      reporter: "박영희",
      description: "시간 초과했는데 계속 사용 중",
      status: "pending",
      timestamp: "2024-01-15 15:45",
    },
    {
      id: "3",
      type: "equipment",
      equipment: "덤벨 세트",
      reporter: "이민수",
      description: "20kg 덤벨이 없어짐",
      status: "resolved",
      timestamp: "2024-01-15 10:20",
    },
  ]);

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
        <div className="flex items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">운영자 대시보드</h1>
            {gymName && <p className="text-gray-300">{gymName}</p>}
          </div>
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
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="p-4 border border-gray-700 rounded-lg bg-gray-800"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Badge
                              className={
                                report.type === "equipment"
                                  ? "bg-red-900/50 text-red-300 border-red-700"
                                  : "bg-orange-900/50 text-orange-300 border-orange-700"
                              }
                            >
                              {report.type === "equipment"
                                ? "기구 고장"
                                : "사용자 신고"}
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
                          <h4 className="font-semibold text-white">
                            {report.equipment}
                          </h4>
                          <p className="text-gray-300">{report.description}</p>
                          <p className="text-sm text-gray-400">
                            신고자: {report.reporter} | {report.timestamp}
                          </p>
                        </div>
                        {report.status === "pending" && (
                          <div className="space-x-2">
                            <Button
                              size="sm"
                              className="bg-blue-500 hover:bg-blue-600"
                            >
                              처리하기
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
