import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ArrowLeft, Zap, Clock, CheckCircle } from "lucide-react";
import React from "react";

interface RoutineStep {
  equipment: string;
  duration: number;
  status: "available" | "waiting";
  waitTime?: number;
}

interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  reservationTime: string;
  duration: number;
  status: "confirmed" | "waiting";
  waitingPosition?: number;
  createdAt: Date;
}

interface AIRoutineRecommendationProps {
  onBack: () => void;
  onReservationComplete: (reservations: Reservation[]) => void;
}

export function AIRoutineRecommendation({
  onBack,
  onReservationComplete,
}: AIRoutineRecommendationProps) {
  const [step, setStep] = useState<"form" | "recommendation" | "reserved">(
    "form"
  );
  const [formData, setFormData] = useState({
    gender: "",
    workoutTime: "",
    focusArea: "",
    experience: "",
  });
  const [recommendedRoutine, setRecommendedRoutine] = useState<RoutineStep[]>(
    []
  );

  const generateRoutine = () => {
    // AI 루틴 생성 시뮬레이션
    const routines: RoutineStep[] = [
      { equipment: "러닝머신", duration: 15, status: "available" },
      {
        equipment: "벤치프레스",
        duration: 20,
        status: "waiting",
        waitTime: 10,
      },
      { equipment: "스쿼트 랙", duration: 15, status: "available" },
      { equipment: "덤벨", duration: 15, status: "available" },
      { equipment: "렛풀다운", duration: 10, status: "available" },
    ];

    setRecommendedRoutine(routines);
    setStep("recommendation");
  };

  const reserveRoutine = () => {
    const now = new Date();
    let currentTime = now.getTime();

    const reservations: Reservation[] = recommendedRoutine.map(
      (step, index) => {
        const startTime = new Date(currentTime);
        const endTime = new Date(currentTime + step.duration * 60000);

        // 대기 시간이 있으면 추가
        if (step.waitTime) {
          currentTime += step.waitTime * 60000;
        }

        // 다음 기구를 위해 현재 기구의 시간만큼 더하기
        currentTime += step.duration * 60000;

        const timeString = `${startTime.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })} - ${endTime.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

        return {
          id: `${Date.now()}-${index}`,
          equipmentId: `equipment-${index}`,
          equipmentName: step.equipment,
          reservationTime: timeString,
          duration: step.duration,
          status: step.status === "available" ? "confirmed" : "waiting",
          waitingPosition: step.status === "waiting" ? 1 : undefined,
          createdAt: new Date(),
        };
      }
    );

    onReservationComplete(reservations);
    setStep("reserved");
  };

  if (step === "reserved") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto mt-20">
          <Card className="border-green-600 bg-green-900/20">
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
              <h2 className="text-xl font-semibold text-green-300">
                예약 완료!
              </h2>
              <p className="text-green-200">
                AI 추천 루틴이 모두 예약되었습니다.
                <br />
                운동 순서에 따라 알림을 받으실 수 있습니다.
              </p>
              <Button
                onClick={onBack}
                className="bg-green-500 hover:bg-green-600"
              >
                기구 목록으로 돌아가기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "recommendation") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStep("form")}
              className="text-white hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-white">AI 추천 루틴</h1>
          </div>

          <Card className="border-gray-600 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white">
                <Zap className="h-5 w-5" />
                <span>맞춤형 운동 루틴</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-2">운동 요약</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-300">총 운동시간: </span>
                    <span className="text-white font-semibold">
                      {recommendedRoutine.reduce(
                        (sum, step) => sum + step.duration,
                        0
                      )}
                      분
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-300">예상 대기시간: </span>
                    <span className="text-white font-semibold">
                      {recommendedRoutine.reduce(
                        (sum, step) => sum + (step.waitTime || 0),
                        0
                      )}
                      분
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {recommendedRoutine.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">
                          {step.equipment}
                        </h4>
                        <div className="flex items-center space-x-2 text-sm text-gray-300">
                          <Clock className="h-3 w-3" />
                          <span>{step.duration}분</span>
                          {step.waitTime && (
                            <span className="text-yellow-400">
                              • {step.waitTime}분 대기
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge
                      className={
                        step.status === "available"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }
                    >
                      {step.status === "available" ? "사용가능" : "대기필요"}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex space-x-4">
                <Button
                  onClick={generateRoutine}
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  다시 생성하기
                </Button>
                <Button
                  onClick={reserveRoutine}
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                >
                  이 루틴으로 예약하기
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
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">AI 루틴 추천</h1>
        </div>

        <Card className="border-gray-600 bg-card">
          <CardHeader>
            <CardTitle className="text-white">운동 정보 입력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-white">
                성별
              </Label>
              <Select
                value={formData.gender}
                onValueChange={(value) =>
                  setFormData({ ...formData, gender: value })
                }
              >
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="성별을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">남성</SelectItem>
                  <SelectItem value="female">여성</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workoutTime" className="text-white">
                총 운동시간
              </Label>
              <Select
                value={formData.workoutTime}
                onValueChange={(value) =>
                  setFormData({ ...formData, workoutTime: value })
                }
              >
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="운동시간을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30분</SelectItem>
                  <SelectItem value="60">1시간</SelectItem>
                  <SelectItem value="90">1시간 30분</SelectItem>
                  <SelectItem value="120">2시간</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="focusArea" className="text-white">
                집중하고 싶은 부위
              </Label>
              <Select
                value={formData.focusArea}
                onValueChange={(value) =>
                  setFormData({ ...formData, focusArea: value })
                }
              >
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="운동 부위를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chest">가슴</SelectItem>
                  <SelectItem value="back">등</SelectItem>
                  <SelectItem value="legs">하체</SelectItem>
                  <SelectItem value="arms">팔</SelectItem>
                  <SelectItem value="cardio">유산소</SelectItem>
                  <SelectItem value="full">전신</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience" className="text-white">
                운동 경력
              </Label>
              <Select
                value={formData.experience}
                onValueChange={(value) =>
                  setFormData({ ...formData, experience: value })
                }
              >
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="운동 경력을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">초급 (6개월 미만)</SelectItem>
                  <SelectItem value="intermediate">중급 (6개월-2년)</SelectItem>
                  <SelectItem value="advanced">고급 (2년 이상)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={generateRoutine}
              className="w-full bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600"
              disabled={
                !formData.gender ||
                !formData.workoutTime ||
                !formData.focusArea ||
                !formData.experience
              }
            >
              <Zap className="h-4 w-4 mr-2" />
              AI 루틴 생성하기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
