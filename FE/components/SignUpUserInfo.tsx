import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, User, Settings } from "lucide-react";
import { Card, CardContent } from "./ui/card";

interface SignUpUserInfoProps {
  onBack: () => void;
  onNext: (name: string, nickname: string, role: 'user' | 'admin') => void;
}

export function SignUpUserInfo({ onBack, onNext }: SignUpUserInfoProps) {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [isNicknameChecked, setIsNicknameChecked] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [showNicknameWarning, setShowNicknameWarning] = useState(false);

  const handleCheckNickname = () => {
    if (nickname.trim() === "") {
      alert("닉네임을 입력해주세요.");
      return;
    }
    // 실제로는 서버에 중복 확인 요청
    // 예시: "운동왕", "헬린이", "근육맨" 등의 닉네임은 이미 사용 중이라고 가정
    const existingNicknames = ["운동왕", "헬린이", "근육맨", "철수", "영희"];
    
    if (existingNicknames.includes(nickname)) {
      setIsDuplicate(true);
      setIsNicknameChecked(false);
    } else {
      setIsDuplicate(false);
      setIsNicknameChecked(true);
    }
    setShowNicknameWarning(false);
  };

  const canProceed = name.trim() !== "" && isNicknameChecked && role !== null;

  const handleNext = () => {
    if (!isNicknameChecked) {
      setShowNicknameWarning(true);
      return;
    }
    if (canProceed && role) {
      onNext(name, nickname, role);
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
          <h1 className="text-2xl text-white ml-4">사용자 정보</h1>
        </div>

        {/* Form */}
        <div className="space-y-6 mt-8">
          {/* 이름 입력 */}
          <div className="space-y-2">
            <label className="text-white">이름</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full bg-card border-gray-600 text-white placeholder:text-gray-500"
            />
          </div>

          {/* 닉네임 입력 */}
          <div className="space-y-2">
            <label className="text-white">닉네임</label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setIsNicknameChecked(false);
                }}
                placeholder="닉네임을 입력하세요"
                className="flex-[5] bg-card border-gray-600 text-white placeholder:text-gray-500"
              />
              <Button
                onClick={handleCheckNickname}
                className="flex-[2] bg-white text-black hover:bg-gray-200"
              >
                중복 인증하기
              </Button>
            </div>
            <p className="text-sm text-gray-400">* 기구 예약 시 다른 사용자에게 표시됩니다</p>
            {isNicknameChecked && !isDuplicate && (
              <p className="text-blue-500 text-sm">* 사용 가능한 닉네임 입니다.</p>
            )}
            {isDuplicate && (
              <p className="text-red-500 text-sm">* 사용 불가능한 닉네임 입니다. 다시 입력해주세요.</p>
            )}
            {showNicknameWarning && !isNicknameChecked && (
              <p className="text-red-500 text-sm">* 중복 인증을 완료해주세요.</p>
            )}
          </div>

          {/* 역할 선택 */}
          <div className="space-y-2">
            <label className="text-white">역할 선택</label>
            <div className="space-y-3">
              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === 'user'
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-600 bg-card hover:border-gray-500'
                }`}
                onClick={() => setRole('user')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 사용자</h3>
                      <p className="text-sm text-gray-300">기구를 예약하고 이용합니다</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === 'admin'
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-600 bg-card hover:border-gray-500'
                }`}
                onClick={() => setRole('admin')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center">
                      <Settings className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 운영자</h3>
                      <p className="text-sm text-gray-300">헬스장을 관리하고 운영합니다</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 다음 단계 버튼 */}
          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className={`w-full h-14 mt-8 transition-all ${
              canProceed
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-transparent border border-gray-600 text-gray-600 cursor-not-allowed"
            }`}
          >
            다음 단계 →
          </Button>
        </div>
      </div>
    </div>
  );
}