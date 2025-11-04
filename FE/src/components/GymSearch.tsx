import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Search, MapPin, Clock, Users, ArrowLeft } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

import { Gym } from "../types/gym";

interface GymSearchProps {
  onGymSelect: (gym: Gym) => void;
  onBack: () => void;
  favoriteGymIds?: string[];
}

export function GymSearch({ onGymSelect, onBack, favoriteGymIds = [] }: GymSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchGymInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('access_token'); // 'token' → 'access_token'으로 수정
        
        if (!token) {
          setError('로그인이 필요합니다.');
          setLoading(false);
          return;
        }

        console.log("GymSearch: Fetching gym info with token");
        const response = await axios.get(
          'http://43.201.88.27/api/gyms/my-gym/',
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        console.log("GymSearch: API response:", response.data);
        // API가 단일 객체를 반환하므로 배열로 변환
        // 백엔드는 'name', 'address' 필드를 사용하므로 'gym_name', 'gym_address'로 변환
        if (response.data) {
          const gymData = {
            id: response.data.id,
            user: response.data.owner || '',
            gym_name: response.data.name,
            gym_address: response.data.address,
            status: '운영중',
            join_date: new Date().toISOString().split('T')[0],
          };
          console.log("GymSearch: Transformed gym data:", gymData);
          setGyms([gymData]);
        } else {
          setGyms([]);
        }
      } catch (err) {
        console.error("GymSearch: Error fetching gym info:", err);
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          // 아직 가입한 헬스장이 없는 경우
          setGyms([]);
        } else {
          setError('헬스장 정보를 불러오는데 실패했습니다.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchGymInfo();
  }, []);

  const filteredGyms = gyms.filter(gym => 
    gym.gym_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.gym_address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="p-4">로딩 중...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  // 즐겨찾기한 헬스장이 있으면 해당 헬스장들만 표시
  const gymsToShow = favoriteGymIds.length > 0 
    ? filteredGyms.filter(gym => favoriteGymIds.includes(gym.id.toString()))
    : filteredGyms;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">헬스장 찾기</h1>
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
          <h2 className="text-lg font-semibold text-white">
            {favoriteGymIds.length > 0 ? '즐겨찾는 헬스장' : '내 주변 헬스장'}
          </h2>
          {gyms.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white mb-2">등록된 헬스장이 없습니다</p>
              <p className="text-gray-400 text-sm">
                관리자가 헬스장을 등록하면 이곳에 표시됩니다
              </p>
            </div>
          ) : (
            filteredGyms.map((gym) => (
            <Card key={gym.id} className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
                  onClick={() => onGymSelect(gym)}>
              <CardContent className="p-4">
                <div className="flex space-x-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden">
                    <ImageWithFallback
                      src="https://images.unsplash.com/photo-1728486145245-d4cb0c9c3470?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjBsb2NhdGlvbiUyMGJ1aWxkaW5nfGVufDF8fHx8MTc1OTMxMjU0MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                      alt={gym.gym_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-white">{gym.gym_name}</h3>
                        <div className="flex items-center space-x-1 text-sm text-gray-300">
                          <MapPin className="h-3 w-3" />
                          <span>{gym.gym_address}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-gray-700 text-gray-200">
                        {gym.status}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-1 text-gray-300">
                        <Clock className="h-3 w-3" />
                        <span>가입일: {new Date(gym.join_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="h-3 w-3 text-gray-300" />
                        <span className="text-gray-300">
                          {gym.user}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )))}
        </div>
      </div>
    </div>
  );
}