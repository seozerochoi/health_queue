import { ArrowLeft, User, Calendar, BarChart3, LogOut, Trophy, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";

interface MyPageProps {
  onBack: () => void;
  onLogout: () => void;
  userName?: string;
  userNickname?: string;
}

export function MyPage({ onBack, onLogout, userName, userNickname }: MyPageProps) {
  const userStats = {
    name: userName || "김헬스",
    membershipType: "프리미엄",
    totalWorkouts: 42,
    thisMonthWorkouts: 12,
    avgWorkoutTime: 75,
    favoriteEquipment: "런닝머신"
  };

  // 아바타 이니셜 - 사용자 이름의 첫 글자
  const avatarInitial = userName ? userName.charAt(0) : "김";

  const recentWorkouts = [
    {
      date: "2024-01-15",
      duration: "80분",
      equipment: "런닝머신, 벤치프레스",
      satisfaction: 4.5
    },
    {
      date: "2024-01-13", 
      duration: "65분",
      equipment: "덤벨, 레그프레스",
      satisfaction: 4.0
    },
    {
      date: "2024-01-11",
      duration: "90분", 
      equipment: "런닝머신, 풀다운",
      satisfaction: 5.0
    }
  ];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">마이페이지</h1>
        </div>

        {/* 프로필 카드 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src="" />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">{userStats.name}</h2>
                <Badge className="bg-blue-100 text-blue-700 mt-1">
                  {userStats.membershipType} 회원
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2 transform rotate-90" />
                로그아웃
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 운동 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold text-foreground">{userStats.totalWorkouts}</p>
              <p className="text-sm text-muted-foreground">총 운동횟수</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold text-foreground">{userStats.thisMonthWorkouts}</p>
              <p className="text-sm text-muted-foreground">이달 운동</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold text-foreground">{userStats.avgWorkoutTime}분</p>
              <p className="text-sm text-muted-foreground">평균 운동시간</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-purple-500" />
              <p className="text-lg font-bold text-foreground">{userStats.favoriteEquipment}</p>
              <p className="text-sm text-muted-foreground">선호 기구</p>
            </CardContent>
          </Card>
        </div>

        {/* 최근 운동 기록 */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">최근 운동 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentWorkouts.map((workout, index) => (
              <div key={index} className="flex justify-between items-center p-4 bg-secondary rounded-lg">
                <div>
                  <p className="font-medium text-foreground">{workout.date}</p>
                  <p className="text-sm text-muted-foreground">{workout.equipment}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-foreground">{workout.duration}</p>
                  <div className="flex items-center space-x-1">
                    <span className="text-yellow-500">★</span>
                    <span className="text-sm text-muted-foreground">{workout.satisfaction}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 빠른 액션 */}
        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" className="h-20 border-gray-600 text-gray-300 hover:bg-gray-700">
            <div className="text-center">
              <BarChart3 className="h-6 w-6 mx-auto mb-1" />
              <span className="text-sm">운동 분석</span>
            </div>
          </Button>
          <Button variant="outline" className="h-20 border-gray-600 text-gray-300 hover:bg-gray-700">
            <div className="text-center">
              <Trophy className="h-6 w-6 mx-auto mb-1" />
              <span className="text-sm">운동 목표</span>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}