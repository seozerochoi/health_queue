import { ArrowLeft, LogOut, User } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";

interface MyPageProps {
  onBack: () => void;
  onLogout: () => void;
  userName?: string;
  userNickname?: string;
}

export function MyPage({ onBack, onLogout, userName, userNickname }: MyPageProps) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">마이페이지</h1>
        </div>

        {/* 사용자 프로필 카드 */}
        <Card className="border-gray-600 bg-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16 border-2 border-primary">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <User className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {userNickname || userName || "사용자"}
                  </h2>
                  <p className="text-gray-400">회원</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                onClick={onLogout}
              >
                <LogOut className="h-5 w-5 mr-2" />
                로그아웃
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}