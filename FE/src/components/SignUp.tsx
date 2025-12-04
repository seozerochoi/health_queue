import { useState } from "react";

interface SignUpProps {
  onBack: () => void;
  onSubmit: (form: { userId: string; password: string }) => void;
}

export default function SignUp({ onBack, onSubmit }: SignUpProps) {
  const [userId, setUserId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canNext = userId.trim().length >= 1 && pw.length >= 1;

  const handleSignUp = async () => {
    if (!canNext) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("https://43.201.88.27/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: userId,
          password: pw,
          email: `${userId}@example.com`, // 이메일은 임시로 생성
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "회원가입에 실패했습니다.");
        setIsLoading(false);
        return;
      }

      // 회원가입 성공 시 부모 컴포넌트로 데이터 전달
      onSubmit({ userId, password: pw });
    } catch (err) {
      setError("서버와의 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* 에러 메시지 */}
        {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}

        {/* 다음 단계 */}
        <div className="mt-8">
          <button
            onClick={handleSignUp}
            disabled={!canNext || isLoading}
            className={`w-full h-12 rounded-lg transition-colors ${
              canNext && !isLoading
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLoading ? "처리 중..." : "다음 단계 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
