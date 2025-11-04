import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, User, Settings } from "lucide-react";
import { Card, CardContent } from "./ui/card";

interface SignUpUserInfoProps {
  onBack: () => void;
  onNext: (name: string, role: "user" | "admin") => void;
}

export function SignUpUserInfo({ onBack, onNext }: SignUpUserInfoProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin" | null>(null);

  const canProceed = name.trim() !== "" && role !== null;

  const handleNext = () => {
    if (canProceed && role) {
      onNext(name, role);
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

          {/* 역할 선택 */}
          <div className="space-y-2">
            <label className="text-white">역할 선택</label>
            <div className="space-y-3">
              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === "user"
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-600 bg-card hover:border-gray-500"
                }`}
                onClick={() => setRole("user")}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 사용자</h3>
                      <p className="text-sm text-gray-300">
                        기구를 예약하고 이용합니다
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === "admin"
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-600 bg-card hover:border-gray-500"
                }`}
                onClick={() => setRole("admin")}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center">
                      <Settings className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 운영자</h3>
                      <p className="text-sm text-gray-300">
                        헬스장을 관리하고 운영합니다
                      </p>
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