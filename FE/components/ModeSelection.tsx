import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { User, Settings } from "lucide-react";
import React from "react";

interface ModeSelectionProps {
  onModeSelect: (mode: "user" | "admin") => void;
}

export function ModeSelection({ onModeSelect }: ModeSelectionProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontSize: "calc(1.875rem + 16px)" }}
          >
            Health Queue
          </h1>
          <p className="text-gray-300">서비스 이용 모드 선택</p>
        </div>

        <div className="space-y-4">
          <Card
            className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
            onClick={() => onModeSelect("user")}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">사용자 모드</h3>
                  <p className="text-sm text-gray-300">
                    헬스장 기구를 예약하고 이용하세요
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="hover:shadow-lg transition-shadow cursor-pointer border-gray-600 bg-card"
            onClick={() => onModeSelect("admin")}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">운영자 모드</h3>
                  <p className="text-sm text-gray-300">
                    헬스장을 관리하고 운영하세요
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
