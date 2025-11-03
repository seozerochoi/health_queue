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
        {}
        <div className="flex items-center mb-6 pt-4">
          <button onClick={onBack} className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl text-white ml-4">로그인</h1>
        </div>

        {}
        <div className="space-y-6 mt-8">
          {}
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

          {}
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

          {}
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



/*
import { useState } from "react";

export default function Login({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: (userId: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canSubmit = userId.trim().length > 0 && pw.length > 0;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-800"
            aria-label="뒤로가기"
            title="뒤로가기"
          >
            {}
            <span className="text-2xl leading-none">←</span>
          </button>
          <h1 className="text-2xl font-bold">로그인</h1>
        </div>

        {}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-gray-300">아이디를 입력하십시오</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="아이디"
              className="w-full h-12 rounded-lg bg-[#1f1f1f] border border-gray-700 px-4 outline-none focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-300">비밀번호를 입력하십시오</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호"
                className="w-full h-12 rounded-lg bg-[#1f1f1f] border border-gray-700 px-4 pr-11 outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                aria-label="비밀번호 보기"
                title="비밀번호 보기"
              >
                {}
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            disabled={!canSubmit}
            onClick={() => canSubmit && onSubmit(userId)}
            className={`w-full h-12 rounded-lg transition-colors ${
              canSubmit
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-[#1f1f1f] text-gray-500 cursor-not-allowed border border-gray-700"
            }`}
          >
            로그인하기
          </button>
        </div>
      </div>
    </div>
  );
}
*/