import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onBack: () => void;
  onLoginComplete: (userId: string) => void;
  registeredUsers: Array<{
    userId: string;
    password: string;
    name: string;
    nickname: string;
    role: "user" | "admin";
  }>;
}

export function Login({ onBack, onLoginComplete }: LoginProps) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (userId.trim() === "" || password.trim() === "") {
      setIsValid(false);
      setShowError(false);
    } else {
      setIsValid(true);
    }
  }, [userId, password]);

  const handleLogin = async () => {
    try {
      const response = await fetch("http:///api/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: userId, password }),
      });

      if (!response.ok) {
        throw new Error("로그인 실패: 사용자 이름 또는 비밀번호를 확인하세요.");
      }

      const data = await response.json();
      localStorage.setItem("accessToken", data.access); // JWT 토큰 저장
      localStorage.setItem("refreshToken", data.refresh);

      onLoginComplete(userId); // 로그인 완료 콜백 호출
    } catch (err: any) {
      setShowError(true);
    }
  };

  return (
    <div className="login-container">
      <div className="header">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          뒤로가기
        </Button>
      </div>
      <div className="content">
        <h1 className="text-2xl font-bold mb-4">로그인</h1>
        <div className="form-group">
          <label htmlFor="userId">아이디</label>
          <Input
            id="userId"
            type="text"
            placeholder="아이디를 입력하세요"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <div className="password-input">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              variant="ghost"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>
        {showError && (
          <p className="text-red-500 mt-2">
            로그인에 실패했습니다. 다시 시도하세요.
          </p>
        )}
        <Button
          className="w-full mt-4"
          onClick={handleLogin}
          disabled={!isValid}
        >
          로그인하기
        </Button>
      </div>
    </div>
  );
}
