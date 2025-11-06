import { ArrowLeft, LogOut, User } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface MyPageProps {
  onBack: () => void;
  onLogout: () => void;
  userName?: string;
  userNickname?: string;
  userGym?: string;
}

export function MyPage({
  onBack,
  onLogout,
  userName,
  userNickname,
  userGym,
}: MyPageProps) {
  // 디버깅: props 확인
  console.log("MyPage props:", { userName, userNickname, userGym });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [exerciseGoal, setExerciseGoal] = useState<string>("");
  const [inbodyScore, setInbodyScore] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [skeletalKg, setSkeletalKg] = useState<string>("");
  const [fatMassKg, setFatMassKg] = useState<string>("");
  const [bodyFatPct, setBodyFatPct] = useState<string>("");
  const [bmi, setBmi] = useState<string>("");
  const [segRightArm, setSegRightArm] = useState<string>("");
  const [segLeftArm, setSegLeftArm] = useState<string>("");
  const [segTrunk, setSegTrunk] = useState<string>("");
  const [segRightLeg, setSegRightLeg] = useState<string>("");
  const [segLeftLeg, setSegLeftLeg] = useState<string>("");

  // 공통: 토큰 만료 시 자동 갱신 후 재시도하는 fetch 래퍼
  const fetchWithAuth = async (
    url: string,
    options: RequestInit = {},
    retry: boolean = true
  ): Promise<Response> => {
    const access = localStorage.getItem("access_token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${access}`,
    } as HeadersInit;

    let res = await fetch(url, { ...options, headers });
    if (res.status === 401 && retry) {
      try {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) throw new Error("No refresh token");

        const refreshRes = await fetch(
          "http://43.201.88.27/api/token/refresh/",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          }
        );

        if (!refreshRes.ok) throw new Error("Refresh failed");
        const refreshData = await refreshRes.json();
        if (refreshData?.access) {
          localStorage.setItem("access_token", refreshData.access);
        }

        const newHeaders: HeadersInit = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshData.access}`,
        } as HeadersInit;
        res = await fetch(url, { ...options, headers: newHeaders });
      } catch (e) {
        // 새 토큰 발급 실패 → 세션 만료 처리
        alert("세션이 만료되어 로그아웃됩니다. 다시 로그인해주세요.");
        onLogout();
      }
    }
    return res;
  };

  // 프로필 로드
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth(
          "http://43.201.88.27/api/users/profile/",
          { method: "GET" }
        );
        if (!res.ok) return;
        const data = await res.json();
        setExerciseGoal(data.exercise_goal || "");
        setInbodyScore(data.inbody_score?.toString() || "");
        setWeightKg(data.weight_kg?.toString() || "");
        setSkeletalKg(data.skeletal_muscle_mass_kg?.toString() || "");
        setFatMassKg(data.body_fat_mass_kg?.toString() || "");
        setBodyFatPct(data.body_fat_percentage?.toString() || "");
        setBmi(data.bmi?.toString() || "");
        setSegRightArm(data.segment_right_arm_kg?.toString() || "");
        setSegLeftArm(data.segment_left_arm_kg?.toString() || "");
        setSegTrunk(data.segment_trunk_kg?.toString() || "");
        setSegRightLeg(data.segment_right_leg_kg?.toString() || "");
        setSegLeftLeg(data.segment_left_leg_kg?.toString() || "");
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const saveProfile = async () => {
    try {
      setSaving(true);
      const body: any = {
        exercise_goal: exerciseGoal || null,
        inbody_score: inbodyScore ? parseFloat(inbodyScore) : null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        skeletal_muscle_mass_kg: skeletalKg ? parseFloat(skeletalKg) : null,
        body_fat_mass_kg: fatMassKg ? parseFloat(fatMassKg) : null,
        body_fat_percentage: bodyFatPct ? parseFloat(bodyFatPct) : null,
        bmi: bmi ? parseFloat(bmi) : null,
        segment_right_arm_kg: segRightArm ? parseFloat(segRightArm) : null,
        segment_left_arm_kg: segLeftArm ? parseFloat(segLeftArm) : null,
        segment_trunk_kg: segTrunk ? parseFloat(segTrunk) : null,
        segment_right_leg_kg: segRightLeg ? parseFloat(segRightLeg) : null,
        segment_left_leg_kg: segLeftLeg ? parseFloat(segLeftLeg) : null,
      };

      const res = await fetchWithAuth(
        "http://43.201.88.27/api/users/profile/",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("프로필 저장 실패:", res.status, text);
        alert("저장에 실패했습니다.");
        return;
      }
      alert("마이페이지 정보가 저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 헤더: 좌측 뒤로가기, 중앙 제목, 우측 로그아웃 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-foreground hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">마이페이지</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300 active:bg-red-800/30 active:text-red-200 active:border-red-500 transition-transform duration-150 ease-out active:scale-105"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 mr-2 transform rotate-90" />
            로그아웃
          </Button>
        </div>

        {/* 프로필 카드: 우측 버튼은 "마이페이지"(편집)로 변경 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <User className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">
                  {userNickname || userName || "사용자"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {userGym ? userGym : "소속 헬스장 없음"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 프로필/인바디 폼: 항상 표시 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-6">
            {/* 운동 목적 */}
            <div className="space-y-2">
              <Label className="text-foreground">운동 목적</Label>
              <Select value={exerciseGoal} onValueChange={setExerciseGoal}>
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="운동 목적을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUSCLE_GAIN">근육량 증가</SelectItem>
                  <SelectItem value="DIET">다이어트</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 인바디 핵심 지표 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-foreground">인바디 점수</Label>
                <Input
                  type="number"
                  value={inbodyScore}
                  onChange={(e) => setInbodyScore(e.target.value)}
                  placeholder="예: 82"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
              <div>
                <Label className="text-foreground">체중(kg)</Label>
                <Input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="예: 72.5"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
              <div>
                <Label className="text-foreground">BMI</Label>
                <Input
                  type="number"
                  value={bmi}
                  onChange={(e) => setBmi(e.target.value)}
                  placeholder="예: 23.1"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
            </div>

            {/* 체성분 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-foreground">골격근량(kg)</Label>
                <Input
                  type="number"
                  value={skeletalKg}
                  onChange={(e) => setSkeletalKg(e.target.value)}
                  placeholder="예: 31.2"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
              <div>
                <Label className="text-foreground">체지방량(kg)</Label>
                <Input
                  type="number"
                  value={fatMassKg}
                  onChange={(e) => setFatMassKg(e.target.value)}
                  placeholder="예: 16.8"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
              <div>
                <Label className="text-foreground">체지방률(%)</Label>
                <Input
                  type="number"
                  value={bodyFatPct}
                  onChange={(e) => setBodyFatPct(e.target.value)}
                  placeholder="예: 18.5"
                  className="border-gray-600 bg-input-background text-white"
                />
              </div>
            </div>

            {/* 부위별 근육 분석 */}
            <div className="space-y-2">
              <Label className="text-foreground">부위별 근육 분석(kg)</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">
                    오른팔
                  </Label>
                  <Input
                    type="number"
                    value={segRightArm}
                    onChange={(e) => setSegRightArm(e.target.value)}
                    className="border-gray-600 bg-input-background text-white"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">왼팔</Label>
                  <Input
                    type="number"
                    value={segLeftArm}
                    onChange={(e) => setSegLeftArm(e.target.value)}
                    className="border-gray-600 bg-input-background text-white"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">몸통</Label>
                  <Input
                    type="number"
                    value={segTrunk}
                    onChange={(e) => setSegTrunk(e.target.value)}
                    className="border-gray-600 bg-input-background text-white"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">
                    오른다리
                  </Label>
                  <Input
                    type="number"
                    value={segRightLeg}
                    onChange={(e) => setSegRightLeg(e.target.value)}
                    className="border-gray-600 bg-input-background text-white"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">
                    왼다리
                  </Label>
                  <Input
                    type="number"
                    value={segLeftLeg}
                    onChange={(e) => setSegLeftLeg(e.target.value)}
                    className="border-gray-600 bg-input-background text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                onClick={saveProfile}
                disabled={saving}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
