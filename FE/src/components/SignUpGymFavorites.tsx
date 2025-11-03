import { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Search, MapPin, Clock, Users, ArrowLeft } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface Gym {
  id: string;
  name: string;
  address: string;
  distance: string;
  hours: string;
  currentUsers: number;
  maxUsers: number;
  rating: number;
}

interface SignUpGymFavoritesProps {
  onBack: () => void;
  onComplete: (favoriteGymIds: string[]) => void;
}

export function SignUpGymFavorites({ onBack, onComplete }: SignUpGymFavoritesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  
  const nearbyGyms: Gym[] = [
    {
      id: "1",
      name: "피트니스 센터 강남점",
      address: "서울시 강남구 테헤란로 123",
      distance: "0.2km",
      hours: "06:00-24:00",
      currentUsers: 45,
      maxUsers: 80,
      rating: 4.8
    },
    {
      id: "2", 
      name: "헬스 클럽 역삼점",
      address: "서울시 강남구 역삼동 456",
      distance: "0.5km",
      hours: "05:00-23:00",
      currentUsers: 32,
      maxUsers: 60,
      rating: 4.6
    },
    {
      id: "3",
      name: "스포츠 센터 선릉점",
      address: "서울시 강남구 선릉로 789",
      distance: "0.8km", 
      hours: "06:30-22:30",
      currentUsers: 28,
      maxUsers: 70,
      rating: 4.5
    }
  ];

  const filteredGyms = nearbyGyms.filter(gym => 
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFavorite = (gymId: string) => {
    // single-selection behavior: select or deselect the clicked gym
    setSelectedGymId((prev) => (prev === gymId ? null : gymId));
  };

  const handleComplete = () => {
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
          {filteredGyms.map((gym) => (
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
                        {gym.distance}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-1 text-gray-300">
                        <Clock className="h-3 w-3" />
                        <span>{gym.hours}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="h-3 w-3 text-gray-300" />
                        <span className="text-gray-300">
                          {gym.currentUsers}/{gym.maxUsers}
                        </span>
                        <div className="ml-2">
                          <span className="text-yellow-500">★</span>
                          <span className="text-gray-300 ml-1">{gym.rating}</span>
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
          className={`w-full h-14 ${selectedGymId ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
        >
          회원 가입 완료
        </Button>
      </div>
    </div>
  );
}
