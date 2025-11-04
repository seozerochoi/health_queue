import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Search, MapPin, Clock, Users, ArrowLeft, AlertCircle } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface Gym {
  id: string;
  name: string;
  address: string;
  distance?: string;
  hours?: string;
  currentUsers?: number;
  maxUsers?: number;
  rating?: number;
}

interface SignUpGymFavoritesProps {
  onBack: () => void;
  onComplete: (favoriteGymIds: string[]) => void;
}

export function SignUpGymFavorites({ onBack, onComplete }: SignUpGymFavoritesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 컴포넌트 마운트 시 백엔드에서 헬스장 목록 가져오기
  useEffect(() => {
    const fetchGyms = async () => {
      try {
        setLoading(true);
        const response = await fetch("http://43.201.88.27/api/gyms/gyms/");
        
        if (!response.ok) {
          throw new Error("헬스장 목록을 불러올 수 없습니다.");
        }
        
        const data = await response.json();
        // 백엔드 응답을 프론트엔드 형식으로 변환
        const formattedGyms = data.map((gym: any) => ({
          id: gym.id.toString(),
          name: gym.name,
          address: gym.address,
          distance: "0.0km", // 기본값
          hours: "06:00-24:00", // 기본값
          currentUsers: 0, // 기본값
          maxUsers: 100, // 기본값
          rating: 4.5, // 기본값
        }));
        
        setGyms(formattedGyms);
        setError(null);
      } catch (err) {
        console.error("헬스장 목록 로딩 실패:", err);
        setError("헬스장 목록을 불러오는데 실패했습니다.");
        setGyms([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchGyms();
  }, []);
  
  const filteredGyms = gyms.filter(gym => 
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFavorite = (gymId: string) => {
    // single-selection behavior: select or deselect the clicked gym
    setSelectedGymId((prev) => (prev === gymId ? null : gymId));
  };

  const handleComplete = () => {
    // 선택된 헬스장 ID로 다음 단계 진행
    onComplete(selectedGymId ? [selectedGymId] : []);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl text-white">헬스장 지정하기</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="헬스장 이름 또는 주소를 검색하세요"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-gray-600 focus:border-blue-400 bg-input-background text-white placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-4">
          <h2 className="text-lg text-white">내 주변 헬스장</h2>
          
          {loading && (
            <div className="text-center py-8 text-gray-400">
              헬스장 목록을 불러오는 중...
            </div>
          )}
          
          {error && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">오류가 발생했습니다</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
                <p className="text-gray-400 text-sm mt-2">
                  관리자에게 헬스장 등록을 요청하거나, 나중에 다시 시도해주세요.
                </p>
              </div>
            </div>
          )}
          
          {!loading && !error && filteredGyms.length === 0 && (
            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-6 text-center">
              <AlertCircle className="h-12 w-12 text-blue-400 mx-auto mb-3" />
              <h3 className="text-white font-medium mb-2">등록된 헬스장이 없습니다</h3>
              <p className="text-gray-400 text-sm mb-4">
                {searchQuery 
                  ? "검색 결과가 없습니다. 다른 검색어를 시도해보세요."
                  : "관리자에게 헬스장 등록을 요청해주세요."}
              </p>
              <Button
                onClick={onBack}
                variant="outline"
                className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
              >
                이전 단계로 돌아가기
              </Button>
            </div>
          )}
          
          {!loading && !error && filteredGyms.map((gym) => (
            <Card
              key={gym.id}
              className={`hover:shadow-lg transition-shadow border-gray-600 bg-card ${
                selectedGymId === gym.id ? 'border-2 border-white bg-white/5 transition-colors' : ''
              }`}
              onClick={() => toggleFavorite(gym.id)}
            >
              <CardContent className="p-4">
                <div className="flex space-x-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                    <ImageWithFallback
                      src="https://images.unsplash.com/photo-1728486145245-d4cb0c9c3470?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjBsb2NhdGlvbiUyMGJ1aWxkaW5nfGVufDF8fHx8MTc1OTMxMjU0MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                      alt={gym.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white">{gym.name}</h3>
                        <div className="flex items-center space-x-1 text-sm text-gray-300">
                          <MapPin className="h-3 w-3" />
                          <span>{gym.address}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-gray-700 text-gray-200">
                        {gym.distance || "0.0km"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-1 text-gray-300">
                        <Clock className="h-3 w-3" />
                        <span>{gym.hours || "06:00-24:00"}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="h-3 w-3 text-gray-300" />
                        <span className="text-gray-300">
                          {gym.currentUsers || 0}/{gym.maxUsers || 100}
                        </span>
                        <div className="ml-2">
                          <span className="text-yellow-500">★</span>
                          <span className="text-gray-300 ml-1">{gym.rating || 4.5}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 회원 가입 완료 버튼 - 하나 선택해야 활성화 */}
        <Button
          onClick={handleComplete}
          disabled={!selectedGymId}
          className="w-full h-14 mt-8"
        >
          회원 가입 완료
        </Button>
      </div>
    </div>
  );
}