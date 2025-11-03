/*
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

interface SignUpProps {
  onBack: () => void;
  onSignUpComplete: (userId: string, password: string) => void;
}

export function SignUp({ onBack, onSignUpComplete }: SignUpProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUsernameChecked, setIsUsernameChecked] = useState(false);
  const [showUsernameWarning, setShowUsernameWarning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const handleCheckUsername = () => {
    if (username.trim() === "") {
      alert("아이디를 입력해주세요.");
      return;
    }
    // 실제로는 서버에 중복 확인 요청
    // 예시: "admin", "user", "test" 등의 아이디는 이미 사용 중이라고 가정
    const existingUsernames = ["admin", "user", "test", "hong", "kim"];
    
    if (existingUsernames.includes(username.toLowerCase())) {
      setIsDuplicate(true);
      setIsUsernameChecked(false);
    } else {
      setIsDuplicate(false);
      setIsUsernameChecked(true);
    }
    setShowUsernameWarning(false);
  };

  const isPasswordMatch = password !== "" && confirmPassword !== "" && password === confirmPassword;
  const canSubmit = isUsernameChecked && isPasswordMatch;

  const handleSignUp = () => {
    if (!isUsernameChecked) {
      setShowUsernameWarning(true);
      return;
    }
    if (canSubmit) {
      // 실제로는 서버에 회원가입 요청
      onSignUpComplete(username, password);
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
          <h1 className="text-2xl text-white ml-4">회원가입</h1>
        </div>

        {}
        <div className="space-y-6 mt-8">
          {}
          <div className="space-y-2">
            <label className="text-white">아이디를 입력하시오</label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setIsUsernameChecked(false);
                }}
                placeholder="아이디"
                className="flex-[5] bg-card border-gray-600 text-white placeholder:text-gray-500"
              />
              <Button
                onClick={handleCheckUsername}
                className="flex-[2] bg-white text-black hover:bg-gray-200"
              >
                중복 인증하기
              </Button>
            </div>
            {isUsernameChecked && !isDuplicate && (
              <p className="text-blue-500 text-sm">* 사용 가능한 아이디 입니다.</p>
            )}
            {isDuplicate && (
              <p className="text-red-500 text-sm">* 사용 불가능한 아이디 입니다. 다시 입력해주세요.</p>
            )}
            {showUsernameWarning && !isUsernameChecked && (
              <p className="text-red-500 text-sm">* 중복 인증을 완료해주세요.</p>
            )}
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
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {} 
          <div className="space-y-2">
            <label className="text-white">비밀번호를 다시한번 입력하시오</label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 확인"
                className="w-full bg-card border-gray-600 text-white placeholder:text-gray-500"
              />
              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {confirmPassword !== "" && !isPasswordMatch && (
              <p className="text-red-500 text-sm">비밀번호가 일치하지 않습니다.</p>
            )}
            {isPasswordMatch && (
              <p className="text-green-500 text-sm">비밀번호가 일치합니다.</p>
            )}
          </div>

          {}
          <Button
            onClick={handleSignUp}
            className={`w-full h-14 mt-8 transition-all ${
              canSubmit 
                ? "bg-white text-black hover:bg-gray-200" 
                : "bg-transparent border border-gray-600 text-gray-600"
            }`}
          >
            다음 단계 →
          </Button>
        </div>
      </div>
    </div>
  );
}
*/


import { useState } from "react";

interface SignUpProps {
  onBack: () => void;
  onSubmit: (form: { userId: string; password: string }) => void;
}

export default function SignUp({ onBack, onSubmit }: SignUpProps) {
  const [userId, setUserId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canNext = userId.trim().length >= 1 && pw.length >= 1;

  return (
  <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={onBack}
            aria-label="뒤로가기"
            className="text-2xl leading-none px-2 rounded hover:bg-gray-800"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold">회원가입</h1>
        </div>

        {/* 아이디 */}
        <div className="mt-6">
          <label className="block mb-2 text-sm text-gray-300">
            아이디를 입력하십시오
          </label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="아이디"
            className="w-full h-12 rounded-lg bg-[#1f1f1f] border border-gray-700 px-4 placeholder:text-gray-400 outline-none focus:border-blue-400"
          />
        </div>

        {/* 비밀번호 */}
        <div className="mt-6">
          <label className="block mb-2 text-sm text-gray-300">
            비밀번호를 입력하십시오
          </label>
          <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호"
                className="w-full h-12 rounded-lg bg-[#1f1f1f] border border-gray-700 px-4 pr-11 placeholder:text-gray-400 outline-none focus:border-blue-400"
              />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white"
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
              title={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* 다음 단계 */}
        <div className="mt-8">
          <button
            onClick={() => onSubmit({ userId, password: pw })}
            disabled={!canNext}
            className={`w-full h-12 rounded-lg transition-colors ${
              canNext
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            다음 단계 →
          </button>
        </div>
      </div>
    </div>
  );
}
