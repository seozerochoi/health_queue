import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onBack: () => void;
  onLoginComplete: (userId: string) => void;
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
      console.log("로그인 성공:", data); // 토큰 확인용
      onLoginComplete(userId);
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