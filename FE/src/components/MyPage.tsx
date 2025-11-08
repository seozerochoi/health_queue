// 아이콘 최소화 요청: 불필요 아이콘 제거
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Camera } from "lucide-react";

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
  // 단순화: 운동 목적만 유지

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
        exercise_goal: exerciseGoal || null
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
              size="sm"
              onClick={onBack}
              className="text-foreground hover:bg-secondary"
            >
              뒤로
            </Button>
            <h1 className="text-2xl font-bold text-foreground">마이페이지</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300 active:bg-red-800/30 active:text-red-200 active:border-red-500 transition-transform duration-150 ease-out active:scale-105"
            onClick={onLogout}
          >
            로그아웃
          </Button>
        </div>

        {/* 프로필 카드: 우측 버튼은 "마이페이지"(편집)로 변경 */}
        {/* 프로필 카드 제거 */}

        {/* 단순화된 폼: 운동 목적만 */}
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

            {/* 인바디 사진 촬영 CTA */}
            <button
              type="button"
              onClick={() => alert('카메라/앨범 열기(구현 예정)')}
              className="w-full border-2 border-dotted border-gray-600 rounded-xl bg-gray-900/40 hover:bg-gray-800/50 transition-colors"
              style={{ height: '280px' }}
            >
              <div className="h-full w-full flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-300">
                  <Camera className="h-6 w-6" />
                  <span className="text-lg font-medium">인바디 사진 촬영</span>
                </div>
              </div>
            </button>

            <div className="flex justify-end">
              <Button onClick={saveProfile} disabled={saving} className="bg-blue-500 hover:bg-blue-600">
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
