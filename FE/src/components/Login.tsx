import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onBack: () => void;
  onLoginComplete: (userId: string, userData?: any) => void;
}

export function Login({ onBack, onLoginComplete }: LoginProps) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!userId || !password) return;

    setIsLoading(true);
    setShowError(false);

    try {
      const response = await fetch("http://43.201.88.27/api/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: userId,
          password: password,
        }),
      });

      if (!response.ok) {
        setShowError(true);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      console.log("============ Login.tsx 로그인 성공 ============");
      console.log("전체 응답 데이터:", data);
      console.log("data.role:", data.role);
      console.log("data.access:", data.access);
      console.log("data.refresh:", data.refresh);
      console.log("============================================");

      // access 토큰 저장
      if (data.access) {
        localStorage.setItem("access_token", data.access);
      }

      // refresh 토큰 저장
      if (data.refresh) {
        localStorage.setItem("refresh_token", data.refresh);
      }

      // role 매핑: OPERATOR -> admin, MEMBER -> user
      const mappedRole = data.role === "OPERATOR" ? "admin" : "user";
      console.log("============ Role 매핑 ============");
      console.log("원본 role:", data.role);
      console.log("매핑된 role:", mappedRole);
      console.log("==================================");

      try {
        // 사용자의 헬스장 정보 가져오기
        const accessToken = data.access;
        const gymResponse = await fetch(
          "http://43.201.88.27/api/gyms/my-gym/",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (gymResponse.ok) {
          const gymData = await gymResponse.json();
          console.log("===== 헬스장 API 응답 =====");
          console.log("Full gymData:", JSON.stringify(gymData, null, 2));
          console.log("gymData.id:", gymData.id);
          console.log("gymData.name:", gymData.name);
          console.log("gymData.gym_name:", gymData.gym_name);
          console.log("========================");

          // 로그인 성공과 함께 헬스장 정보 및 role 전달
          const gymInfo = {
            id: gymData.id,
            name: gymData.gym_name || gymData.name,
            address: gymData.gym_address || gymData.address,
            status: gymData.status,
            joinDate: gymData.join_date || gymData.joinDate,
          };
          console.log("전달할 gymInfo:", gymInfo);
          console.log("전달할 role:", mappedRole);
          console.log("============ onLoginComplete 호출 ============");

          onLoginComplete(userId, {
            gymInfo,
            role: mappedRole,
            name: data.name || data.username,
          });

          console.log("onLoginComplete 호출 완료");
          console.log("==========================================");
        } else if (gymResponse.status === 404) {
          // 헬스장 정보가 없는 경우도 로그인은 성공 처리
          console.log("등록된 헬스장 정보가 없습니다.");
          onLoginComplete(userId, {
            role: mappedRole,
            name: data.name || data.username,
          });
        } else {
          console.error("헬스장 정보 가져오기 실패");
          onLoginComplete(userId, {
            role: mappedRole,
            name: data.name || data.username,
          });
        }
      } catch (error) {
        console.error("헬스장 정보 가져오기 에러:", error);
        // 에러가 발생해도 로그인은 성공 처리
        onLoginComplete(userId, {
          role: mappedRole,
          name: data.name || data.username,
        });
      }
    } catch (err) {
      setShowError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6 pt-4">
          <button onClick={onBack} className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl text-white ml-4">로그인</h1>
        </div>

        <div className="space-y-6 mt-8">
          <div className="space-y-2">
            <label className="text-white">아이디를 입력하시오</label>
            <Input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="아이디"
              className="w-full bg-card border-gray-600 text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-white">비밀번호를 입력하시오</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full bg-card border-gray-600 text-white placeholder:text-gray-500"
              />
              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            {showError && (
              <p className="text-red-500 text-sm">
                * 아이디 및 비밀번호를 다시 입력해주세요
              </p>
            )}
          </div>

          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className={`w-full h-14 mt-8 transition-all ${
              !isLoading
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-transparent border border-gray-600 text-gray-600 cursor-not-allowed"
            }`}
          >
            {isLoading ? "로그인 중..." : "로그인하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
