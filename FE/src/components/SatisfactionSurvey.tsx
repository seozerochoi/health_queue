import { useState } from "react";
import { ArrowLeft, CheckSquare, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
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
  // 1~5 선택: 매우 부족, 부족, 적절, 과도, 매우 과도
  const [timeSufficiency, setTimeSufficiency] = useState<number>(0);
  const [feedback, setFeedback] = useState("");

  const handleSubmit = () => {
    // 여기서 만족도 데이터를 저장/전송
    console.log({
      equipmentId: equipment.id,
      timeSufficiency,
      actualUsageTime,
      feedback,
    });

    onSurveyComplete();
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

          {/* 이용 시간 만족도 (5점 척도) */}
          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="text-white">
                이용시간이 충분하셨나요?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-center gap-4">
                {[
                  { val: 1, label: "매우 부족" },
                  { val: 2, label: "부족" },
                  { val: 3, label: "적절" },
                  { val: 4, label: "과도" },
                  { val: 5, label: "매우 과도" },
                ].map(({ val, label }) => (
                  <div
                    key={val}
                    className={`flex flex-col items-center w-16 p-2 rounded-lg transition-colors ${
                      timeSufficiency === val
                        ? "bg-blue-600/20 border border-blue-500"
                        : "bg-transparent hover:bg-gray-800/30"
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTimeSufficiency(val)}
                      className="p-1 hover:bg-transparent"
                    >
                      {timeSufficiency === val ? (
                        <CheckSquare className="w-8 h-8 text-blue-400" />
                      ) : (
                        <Square className="w-8 h-8 text-gray-400" />
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setTimeSufficiency(val)}
                      className={`mt-1 text-xs transition-colors ${
                        timeSufficiency === val
                          ? "text-blue-400 font-semibold"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 기구 상태 별점 섹션 제거됨 */}

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
            disabled={timeSufficiency === 0}
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
          {/* 신고 기능 삭제 */}
        </div>
        {/* 신고 모달 제거 */}
      </div>
    </div>
  );
}
