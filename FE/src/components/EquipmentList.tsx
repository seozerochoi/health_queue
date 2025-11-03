import { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { ArrowLeft, Clock, Users, Zap, AlertTriangle, Flag } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

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

interface EquipmentListProps {
  gymName: string;
  onBack: () => void;
  onEquipmentSelect: (equipment: Equipment) => void;
}

export function EquipmentList({ gymName, onBack, onEquipmentSelect }: EquipmentListProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedEquipmentForReport, setSelectedEquipmentForReport] = useState<string>("");
  const [reportType, setReportType] = useState<string>("");
  const [reportDescription, setReportDescription] = useState("");

  const equipment: Equipment[] = [
    {
      id: "1",
      name: "러닝머신 1",
      type: "cardio",
      status: "available",
      image: "https://images.unsplash.com/photo-1716367840427-4c148eb7bf15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmVhZG1pbGwlMjBneW18ZW58MXx8fHwxNzU5MjE2MjY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 30
    },
    {
      id: "2",
      name: "러닝머신 2",
      type: "cardio",
      status: "in-use",
      currentUser: "헬린이123",
      timeRemaining: 15,
      image: "https://images.unsplash.com/photo-1716367840427-4c148eb7bf15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmVhZG1pbGwlMjBneW18ZW58MXx8fHwxNzU5MjE2MjY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 30
    },
    {
      id: "3",
      name: "벤치프레스",
      type: "strength",
      status: "waiting",
      waitingCount: 2,
      currentUser: "근육맨88",
      timeRemaining: 8,
      image: "https://images.unsplash.com/photo-1652363722833-509b3aac287b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZW5jaCUyMHByZXNzJTIwZ3ltfGVufDF8fHx8MTc1OTIxNjI3MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 25
    },
    {
      id: "4",
      name: "스쿼트 랙",
      type: "strength",
      status: "available",
      image: "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 25
    },
    {
      id: "5", 
      name: "덤벨",
      type: "strength",
      status: "available",
      image: "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 20
    },
    {
      id: "6",
      name: "스텝밀",
      type: "cardio", 
      status: "available",
      image: "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBneW0lMjBlcXVpcG1lbnR8ZW58MXx8fHwxNzU5MjkwNjA4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      allocatedTime: 30
    }
  ];

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

  const handleReportSubmit = () => {
    // 실제 앱에서는 여기서 서버로 신고 정보를 전송
    console.log("신고 접수:", {
      equipmentId: selectedEquipmentForReport,
      type: reportType,
      description: reportDescription,
    });
    
    // 폼 초기화
    setSelectedEquipmentForReport("");
    setReportType("");
    setReportDescription("");
    setIsReportModalOpen(false);
    
    // 사용자에게 알림 (실제 앱에서는 토스트나 알림 사용)
    alert("신고가 정상적으로 접수되었습니다. 빠른 시일 내에 처리하겠습니다.");
  };

  const filteredEquipment = selectedCategory === "all" 
    ? equipment 
    : equipment.filter(eq => eq.type === selectedCategory);

  const getStatusBadge = (eq: Equipment) => {
    switch (eq.status) {
      case "available":
        return <Badge className="bg-green-100 text-green-700">바로 사용 가능</Badge>;
      case "in-use":
        return <Badge className="bg-yellow-100 text-yellow-700">사용 중 ({eq.timeRemaining}분 남음)</Badge>;
      case "waiting":
        return <Badge className="bg-red-100 text-red-700">현재 {eq.waitingCount}명 대기중</Badge>;
      default:
        return null;
    }
  };



  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
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
              className={selectedCategory === category.id ? 
                "bg-blue-500 hover:bg-blue-600" : 
                "border-gray-600 text-gray-300 hover:bg-gray-700"
              }
            >
              {category.name}
            </Button>
          ))}
        </div>



        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEquipment.map((eq) => (
            <Card key={eq.id} className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
                  onClick={() => onEquipmentSelect(eq)}>
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
                <label className="text-sm font-medium text-gray-300">신고할 기구 선택</label>
                <Select value={selectedEquipmentForReport} onValueChange={setSelectedEquipmentForReport}>
                  <SelectTrigger className="bg-input-background border-gray-600 text-white">
                    <SelectValue placeholder="기구를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-gray-600">
                    {equipment.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id} className="text-white hover:bg-gray-700">
                        {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">신고 유형</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="bg-input-background border-gray-600 text-white">
                    <SelectValue placeholder="신고 유형을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-gray-600">
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-white hover:bg-gray-700">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">상세 설명 (선택사항)</label>
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
                  disabled={!selectedEquipmentForReport || !reportType}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  신고 접수
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}