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
    role: 'user' | 'admin';
  }>;
}

export function Login({ onBack, onLoginComplete, registeredUsers }: LoginProps) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (userId.trim() === "" || password.trim() === "") {
      setIsValid(false);
      setShowError(false);
      return;
    }

    // 등록된 사용자와 비교
    const user = registeredUsers.find(
      (u) => u.userId === userId && u.password === password
    );

    if (user) {
      setIsValid(true);
      setShowError(false);
    } else {
      setIsValid(false);
      setShowError(true);
    }
  }, [userId, password, registeredUsers]);

  const handleLogin = () => {
    if (!isValid) return;

    const user = registeredUsers.find(
      (u) => u.userId === userId && u.password === password
    );

    if (user) {
      onLoginComplete(userId);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6 pt-4">
          <button onClick={onBack} className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl text-white ml-4">로그인</h1>
        </div>

        {/* Form */}
        <div className="space-y-6 mt-8">
          {/* 아이디 입력 */}
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

          {/* 비밀번호 입력 */}
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
                {showPassword ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
              </button>
            </div>
            {showError && (
              <p className="text-red-500 text-sm">* 아이디 및 비밀번호를 다시 입력해주세요</p>
            )}
          </div>

          {/* 로그인하기 버튼 */}
          <Button
            onClick={handleLogin}
            disabled={!isValid}
            className={`w-full h-14 mt-8 transition-all ${
              isValid 
                ? "bg-white text-black hover:bg-gray-200" 
                : "bg-transparent border border-gray-600 text-gray-600 cursor-not-allowed"
            }`}
          >
            로그인하기
          </Button>
        </div>
      </div>
    </div>
  );
}
