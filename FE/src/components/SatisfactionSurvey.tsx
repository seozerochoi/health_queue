import { useState } from "react";
import { ArrowLeft, Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

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

interface SatisfactionSurveyProps {
  equipment: Equipment;
  actualUsageTime: number; // 실제 사용 시간 (분)
  onBack: () => void;
  onSurveyComplete: () => void;
}

export function SatisfactionSurvey({
  equipment,
  actualUsageTime,
  onBack,
  onSurveyComplete,
}: SatisfactionSurveyProps) {
  const [isSatisfied, setIsSatisfied] = useState<boolean | null>(null);
  const [suggestedTime, setSuggestedTime] = useState(
    equipment.allocatedTime.toString()
  );
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleSatisfactionSelect = (satisfied: boolean) => {
    setIsSatisfied(satisfied);
    if (!satisfied) {
      setShowTimeInput(true);
    } else {
      setShowTimeInput(false);
      setSuggestedTime(equipment.allocatedTime.toString());
    }
  };

  const handleSubmit = () => {
    // 여기서 만족도 데이터를 저장/전송
    console.log({
      equipmentId: equipment.id,
      satisfied: isSatisfied,
      rating,
      actualUsageTime,
      suggestedTime: parseInt(suggestedTime),
      feedback,
    });

    onSurveyComplete();
  };

  const handleReportSubmit = async () => {
    if (!reportReason.trim()) {
      alert("신고 사유를 입력해주세요.");
      return;
    }

    setIsSubmittingReport(true);
    try {
      const token = localStorage.getItem("access_token");

      // 신고할 사용자 ID를 가져와야 하는데, 현재는 장비 ID만 있음
      // 실제로는 equipment.currentUser 같은 필드에서 user ID를 가져와야 함
      // 임시로 자기 자신을 신고하는 것으로 처리 (실제로는 다른 사용자 ID가 필요)
      const response = await fetch("http://43.201.88.27/api/reports/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          equipment: parseInt(equipment.id),
          reason: reportReason,
          report_type: "other", // 만족도 화면에서는 기본값으로 기타 신고 처리
          // reported_user는 실제로는 문제가 있는 사용자의 ID여야 함
          // 현재는 임시로 생략하거나 자신의 ID를 넣을 수 있음
        }),
      });

      if (!response.ok) {
        throw new Error("신고 제출 실패");
      }

      alert("신고가 접수되었습니다.");
      setShowReportModal(false);
      setReportReason("");
      onSurveyComplete();
    } catch (error) {
      console.error("신고 제출 에러:", error);
      alert("신고 제출 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const formatTime = (minutes: number) => {
    return `${minutes}분`;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-gray-800"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl ml-4 text-white">운동 완료</h1>
        </div>

        <div className="space-y-6">
          {/* 운동 완료 요약 */}
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-white text-center">
                운동 완료!
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-blue-400">
                    {equipment.name}
                  </p>
                  <p className="text-sm text-gray-300">사용 기구</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-green-400">
                    {formatTime(actualUsageTime)}
                  </p>
                  <p className="text-sm text-gray-300">사용 시간</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 만족도 평가 */}
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-white">
                이용 시간이 만족스러우셨나요?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => handleSatisfactionSelect(true)}
                  variant={isSatisfied === true ? "default" : "outline"}
                  className={`h-16 flex flex-col space-y-2 ${
                    isSatisfied === true
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "border-gray-600 text-white hover:bg-gray-800"
                  }`}
                >
                  <ThumbsUp className="w-6 h-6" />
                  <span>예, 만족해요</span>
                </Button>

                <Button
                  onClick={() => handleSatisfactionSelect(false)}
                  variant={isSatisfied === false ? "default" : "outline"}
                  className={`h-16 flex flex-col space-y-2 ${
                    isSatisfied === false
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "border-gray-600 text-white hover:bg-gray-800"
                  }`}
                >
                  <ThumbsDown className="w-6 h-6" />
                  <span>아니요</span>
                </Button>
              </div>

              {/* 추천 시간 입력 */}
              {showTimeInput && (
                <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                  <Label
                    htmlFor="suggested-time"
                    className="text-white mb-2 block"
                  >
                    얼마나 할당되었으면 좋겠나요?
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="suggested-time"
                      type="number"
                      value={suggestedTime}
                      onChange={(e) => setSuggestedTime(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white"
                      min="5"
                      max="120"
                    />
                    <span className="text-gray-300">분</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    현재: {equipment.allocatedTime}분 → 제안: {suggestedTime}분
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 별점 평가 */}
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-white">
                기구 상태는 어떠셨나요?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center space-x-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Button
                    key={star}
                    variant="ghost"
                    size="sm"
                    onClick={() => setRating(star)}
                    className="p-1 hover:bg-gray-800"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= rating
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-400"
                      }`}
                    />
                  </Button>
                ))}
              </div>
              <p className="text-center text-gray-300">
                {rating === 0 ? "별점을 선택해주세요" : `${rating}점`}
              </p>
            </CardContent>
          </Card>

          {/* 추가 피드백 */}
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-white">추가 의견 (선택사항)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="기구 상태나 개선사항에 대해 알려주세요..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                rows={3}
              />
            </CardContent>
          </Card>

          {/* 제출 버튼 */}
          <Button
            onClick={handleSubmit}
            disabled={isSatisfied === null || rating === 0}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:text-gray-400"
          >
            평가 완료
          </Button>

          {/* 건너뛰기 버튼 */}
          <Button
            onClick={onSurveyComplete}
            variant="ghost"
            className="w-full text-gray-400 hover:text-white hover:bg-gray-800"
          >
            평가 건너뛰기
          </Button>

          {/* 신고하기 버튼 */}
          <Button
            onClick={() => setShowReportModal(true)}
            variant="outline"
            className="w-full border-red-600 text-red-400 hover:bg-red-900/20"
          >
            기구 또는 사용자 신고
          </Button>
        </div>

        {/* 신고 모달 */}
        {showReportModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md border-gray-600 bg-card">
              <CardHeader>
                <CardTitle className="text-white">신고하기</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label
                    htmlFor="report-reason"
                    className="text-white mb-2 block"
                  >
                    신고 사유를 입력해주세요
                  </Label>
                  <Textarea
                    id="report-reason"
                    placeholder="예: 기구 고장, 사용 시간 초과, 부적절한 사용 등"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    rows={4}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleReportSubmit}
                    disabled={isSubmittingReport || !reportReason.trim()}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-600"
                  >
                    {isSubmittingReport ? "제출 중..." : "신고 제출"}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowReportModal(false);
                      setReportReason("");
                    }}
                    variant="outline"
                    className="flex-1 border-gray-600 text-white hover:bg-gray-800"
                  >
                    취소
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
