import { useState, useEffect } from "react";
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
  useEffect(() => {
    const fetchEquipment = async () => {
      // "헬스장 예제"인 경우 하드코딩 데이터 사용
      if (gymName === "헬스장 예제" || !gymName) {
        console.log("헬스장 예제: 하드코딩 데이터 사용");
        const mockEquipment: Equipment[] = [
          {
            id: "1",
            name: "러닝머신 1",
            type: "cardio",
            status: "available",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 30,
          },
          {
            id: "2",
            name: "러닝머신 2",
            type: "cardio",
            status: "in-use",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 45,
            timeRemaining: 25,
          },
          {
            id: "3",
            name: "벤치프레스",
            type: "strength",
            status: "available",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 30,
          },
          {
            id: "4",
            name: "스쿼트 랙",
            type: "strength",
            status: "in-use",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 60,
            timeRemaining: 40,
          },
          {
            id: "5",
            name: "덤벨",
            type: "strength",
            status: "available",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 20,
          },
          {
            id: "6",
            name: "스텝밀",
            type: "cardio",
            status: "waiting",
            image:
              "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
            allocatedTime: 30,
            waitingCount: 2,
          },
        ];
        setEquipment(mockEquipment);
        setLoading(false);
        return;
      }

      // 실제 헬스장인 경우 API에서 데이터 가져오기
      console.log("실제 헬스장: API에서 운동기구 데이터 가져오기");
      try {
        setLoading(true);
        const token = localStorage.getItem("access_token");

        if (!token) {
          throw new Error("로그인이 필요합니다.");
        }

        const response = await fetch("http://43.201.88.27/api/equipment/", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("운동기구 목록을 불러올 수 없습니다.");
        }

        const data = await response.json();
        console.log("Fetched equipment data:", data);

        // 운동기구 이름 또는 타입에 따라 이미지 URL 매핑하는 함수
        const getEquipmentImage = (name: string, type: string): string => {
          const nameLower = name.toLowerCase();

          // 이름 기반 매칭
          if (
            nameLower.includes("러닝") ||
            nameLower.includes("런닝") ||
            nameLower.includes("treadmill")
          ) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (
            nameLower.includes("사이클") ||
            nameLower.includes("cycle") ||
            nameLower.includes("bike")
          ) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (
            nameLower.includes("일립티컬") ||
            nameLower.includes("elliptical")
          ) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (nameLower.includes("로잉") || nameLower.includes("rowing")) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (nameLower.includes("벤치") || nameLower.includes("bench")) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (nameLower.includes("스쿼트") || nameLower.includes("squat")) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (nameLower.includes("덤벨") || nameLower.includes("dumbbell")) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }
          if (nameLower.includes("스텝") || nameLower.includes("step")) {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }

          // 타입 기반 기본 이미지
          if (type.toLowerCase() === "cardio") {
            return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
          }

          // 기본 이미지
          return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080";
        };

        // 백엔드 응답을 프론트엔드 형식으로 변환
        const formattedEquipment: Equipment[] = data.map((eq: any) => {
          // 백엔드에서 이미지 URL 가져오기 (여러 가능한 필드명 체크)
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
            type: eq.type.toLowerCase(), // CARDIO -> cardio, STRENGTH -> strength
            status:
              eq.status === "AVAILABLE"
                ? "available"
                : eq.status === "IN_USE"
                ? "in-use"
                : "available",
            image: imageUrl,
            allocatedTime: eq.base_session_time_minutes || 30,
            waitingCount: 0, // TODO: 백엔드에서 대기열 정보 가져오기
            currentUser: undefined, // TODO: 백엔드에서 현재 사용자 정보 가져오기
            timeRemaining: undefined, // TODO: 백엔드에서 남은 시간 정보 가져오기
          };
        });

        setEquipment(formattedEquipment);
        setError(null);
      } catch (err) {
        console.error("운동기구 목록 로딩 실패:", err);
        setError(
          err instanceof Error
            ? err.message
            : "운동기구 목록을 불러오는데 실패했습니다."
        );
        setEquipment([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEquipment();
    // 5초마다 자동 새로고침 (실시간 상태 반영)
    const interval = setInterval(() => {
      console.log("🔄 기구 목록 자동 새로고침 (3초)");
      fetchEquipment();
    }, 3000);

    return () => clearInterval(interval);
  }, [gymName]);

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

  const getStatusBadge = (eq: Equipment) => {
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
              <Card
                key={eq.id}
                className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
                onClick={() => onEquipmentSelect(eq)}
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
                        <h3 className="font-semibold text-white">{eq.name}</h3>
                        {getStatusBadge(eq)}
                      </div>

                      <div className="flex items-center space-x-1 text-sm text-gray-300">
                        <Clock className="h-3 w-3" />
                        <span>기본 할당시간: {eq.allocatedTime}분</span>
                      </div>

                      {/* 이용 중 또는 대기 중일 때 줄서기 버튼 표시 */}
                      {(eq.status === "in-use" || eq.status === "waiting") && (
                        <div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEquipmentSelect(eq);
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
