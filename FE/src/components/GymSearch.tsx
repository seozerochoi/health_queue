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

interface GymSearchProps {
  onGymSelect: (gym: Gym) => void;
  onBack: () => void;
  favoriteGymIds?: string[];
}

export function GymSearch({ onGymSelect, onBack, favoriteGymIds = [] }: GymSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
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

  // 즐겨찾기한 헬스장이 있으면 해당 헬스장들만 표시
  const gymsToShow = favoriteGymIds.length > 0 
    ? nearbyGyms.filter(gym => favoriteGymIds.includes(gym.id))
    : nearbyGyms;

  const filteredGyms = gymsToShow.filter(gym => 
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          {filteredGyms.map((gym) => (
            <Card key={gym.id} className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
                  onClick={() => onGymSelect(gym)}>
              <CardContent className="p-4">
                <div className="flex space-x-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden">
                    <ImageWithFallback
                      src="https://images.unsplash.com/photo-1728486145245-d4cb0c9c3470?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjBsb2NhdGlvbiUyMGJ1aWxkaW5nfGVufDF8fHx8MTc1OTMxMjU0MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                      alt={gym.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-white">{gym.name}</h3>
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
      </div>
    </div>
  );
}




/*
import { useMemo, useState } from "react";

export interface Gym {
  id: string;
  name: string;
  address: string;
  distanceKm: number;
  hours: string;
  currentUsers: number;
  maxUsers: number;
  rating: number;
  imageUrl?: string; // 없으면 플레이스홀더
}

export default function GymSearch({
  gyms,
  onBack,
  onSelect,
}: {
  gyms: Gym[];
  onBack: () => void;
  onSelect: (gym: Gym) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const key = q.trim();
    if (!key) return gyms;
    return gyms.filter(
      (g) =>
        g.name.includes(key) ||
        g.address.includes(key) ||
        String(g.distanceKm).includes(key)
    );
  }, [q, gyms]);

  return (
    <div className="min-h-screen bg-black text-white flex justify-center p-4">
      <div className="w-full max-w-md">
        {}
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur supports-backdrop-blur:bg-black/70">
          <div className="flex items-center gap-3 py-4">
            <button
              aria-label="뒤로가기"
              onClick={onBack}
              className="text-2xl leading-none px-2 rounded hover:bg-gray-800"
            >
              ←
            </button>
            <h1 className="text-2xl font-bold">헬스장 찾기</h1>
          </div>

          {}
          <div className="pb-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">🔎</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="헬스장 이름 또는 주소를 검색하세요"
                className="w-full h-10 bg-[#1f1f1f] border border-gray-700 rounded px-9 text-sm placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="text-sm text-gray-300 mt-3 mb-2">내 주변 헬스장</div>

        {}
        <div className="space-y-4 pb-8">
          {filtered.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="w-full text-left rounded-xl border border-gray-700 bg-[#1a1a1a] hover:bg-[#232323] transition-colors p-3 flex gap-3"
            >
              {}
              <div className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0 border border-gray-700">
                {g.imageUrl ? (
                  <img
                    src={g.imageUrl}
                    alt={g.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800/60 grid place-items-center text-gray-300 text-xs">
                    이미지
                  </div>
                )}
              </div>

              {}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold truncate">{g.name}</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
                    {g.distanceKm.toFixed(1)}km
                  </span>
                </div>

                <div className="mt-1 text-sm text-gray-300 truncate">
                  <span className="mr-1">📍</span>
                  {g.address}
                </div>

                <div className="mt-2 flex items-center gap-4 text-sm text-gray-300">
                  <span>⏰ {g.hours}</span>
                  <span>👥 {g.currentUsers}/{g.maxUsers}</span>
                  <span>⭐ {g.rating.toFixed(1)}</span>
                </div>
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-10">검색 결과가 없어요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
*/