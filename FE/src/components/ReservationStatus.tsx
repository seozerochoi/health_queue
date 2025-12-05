import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Clock, MapPin, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Equipment {
  id: number | string;
  name: string;
  equipment_status?: string;
  status?: string;
  waiting_count?: number;
  waitingCount?: number;
}

interface Reservation {
  id: string;
  // support both camelCase and snake_case coming from BE
  equipmentId?: string | number;
  equipment_id?: string | number;
  equipmentName?: string;
  equipment?: string; // BE returns 'equipment' as name
  equipmentImage?: string;
  equipment_image?: string;
  reservationTime?: string;
  duration?: number;
  equipment_allocated_time?: number;
  equipmentAllocatedTime?: number;
  status: "confirmed" | "waiting" | string;
  waitingPosition?: number;
  waiting_position?: number;
  waitingCount?: number;
  waiting_count?: number;
  createdAt?: Date | string;
  isAiRecommended?: boolean;
  aiCanceled?: boolean;
  aiUsed?: boolean;
}

interface ReservationStatusProps {
  onBack: () => void;
  gymName: string;
  reservations: Reservation[];
  onCancelReservation?: (reservationId: string, equipmentId: string | number, waitingCount: number) => void;
  onJoinQueue?: (equipmentId: number, equipmentName: string) => void;
  defaultTab?: "normal" | "ai";
  equipmentList?: Equipment[];
  onMarkAiUsed?: (reservationId: string) => void;
  onStartImmediate?: (equipmentId: number) => void;
  nfcEnabled?: boolean;
  onNFCTagDetected?: (equipmentId: string | number) => void;
  onCreateNewRoutine?: () => void;
}

export function ReservationStatus({
  onBack,
  gymName,
  reservations,
  onCancelReservation,
  onJoinQueue,
  defaultTab = "normal",
  equipmentList = [],
  onMarkAiUsed,
  onStartImmediate,
  nfcEnabled = false,
  onNFCTagDetected,
  onCreateNewRoutine,
}: ReservationStatusProps) {
  // AI 추천 예약과 일반 예약 분리
  const aiReservations = reservations.filter((r) => r.isAiRecommended === true);
  const normalReservations = reservations.filter((r) => !r.isAiRecommended);
  const aiCanceledCount = aiReservations.filter((r) => r.aiCanceled).length;
  const aiUsedCount = aiReservations.filter((r) => r.aiUsed).length;
  const aiTotalEffective = Math.max(aiReservations.length - aiCanceledCount, 0);
  const aiProgressPercent = aiTotalEffective > 0 ? Math.floor((aiUsedCount / aiTotalEffective) * 100) : 0;
  
  // SSE로 받은 equipmentList로부터 상태 계산
  // AI 예약의 equipmentId들을 추출하여 상태 맵 생성
  const equipmentStatuses = useMemo(() => {
    const statusMap: { [key: string]: { status: string; waitingCount: number } } = {};
    
    // AI 예약에 해당하는 기구 ID 추출
    const aiEquipmentIds = aiReservations
      .map((r) => String(r.equipment_id ?? r.equipmentId))
      .filter(Boolean);
    
    console.log("🔄 [ReservationStatus] 상태 맵 생성:", {
      aiReservationsCount: aiReservations.length,
      aiEquipmentIds,
      equipmentListLength: equipmentList.length,
    });
    
    // equipmentList에서 AI 예약 기구들의 상태만 추출
    aiEquipmentIds.forEach((eqId) => {
      const equipment = equipmentList.find((eq) => String(eq.id) === eqId);
      if (equipment) {
        // equipment_status, status 둘 다 확인하고 대문자로 정규화
        const rawStatus = equipment.equipment_status || equipment.status || "AVAILABLE";
        const normalizedStatus = rawStatus.toUpperCase();
        
        statusMap[eqId] = {
          status: normalizedStatus,
          waitingCount: equipment.waiting_count || equipment.waitingCount || 0,
        };
        console.log(`  ✓ 기구 ${eqId} (${equipment.name}): ${normalizedStatus} (원본: ${rawStatus})`);
      } else {
        console.log(`  ✗ 기구 ${eqId}: equipmentList에 없음`);
      }
    });
    
    return statusMap;
  }, [aiReservations, equipmentList]);

  const getStatusBadge = (status: string, position?: number | null) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-100 text-green-700">예약 확정</Badge>;
      case "waiting":
        return (
          <Badge className="bg-yellow-100 text-yellow-700">
            대기중 {position ? `(${position}번째)` : ""}
          </Badge>
        );
      default:
        return null;
    }
  };

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
          <div>
            <h1 className="text-2xl font-bold text-foreground">예약 현황</h1>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{gymName}</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 bg-gray-800">
            <TabsTrigger
              value="normal"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white text-gray-300"
            >
              기구 줄서기 조회
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white text-gray-300"
            >
              AI 추천 기구 조회
            </TabsTrigger>
          </TabsList>

          {/* 예약 내역 탭 */}
          <TabsContent value="normal" className="space-y-4">
            {normalReservations.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    예약된 기구가 없습니다
                  </h3>
                  <p className="text-muted-foreground">
                    기구 목록에서 원하는 기구를 예약해보세요.
                  </p>
                </CardContent>
              </Card>
            ) : (
              normalReservations.map((reservation) => {
                const name =
                  reservation.equipmentName || reservation.equipment || "기구";
                const image =
                  reservation.equipment_image ||
                  reservation.equipmentImage ||
                  null;
                const position =
                  reservation.waitingPosition ??
                  reservation.waiting_position ??
                  null;
                const allocated =
                  reservation.equipment_allocated_time ??
                  reservation.equipmentAllocatedTime ??
                  reservation.duration ??
                  null;
                const eqId =
                  reservation.equipment_id ?? reservation.equipmentId ?? null;
                const waitingCount =
                  reservation.waitingCount ?? reservation.waiting_count ?? 0;

                return (
                  <Card key={reservation.id} className="bg-card border-border">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          {image ? (
                            <img
                              src={image}
                              alt={String(name)}
                              className="h-16 w-16 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                              이미지 없음
                            </div>
                          )}

                          <div>
                            <CardTitle className="text-foreground">
                              {name}
                            </CardTitle>
                            <div className="flex items-center space-x-2 mt-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>{reservation.reservationTime}</span>
                              {allocated ? (
                                <span className="ml-2">
                                  권장 시간: {allocated}분
                                </span>
                              ) : null}
                              {eqId ? (
                                <span className="ml-2">• ID: {eqId}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {getStatusBadge(String(reservation.status), position)}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-600 text-red-400 hover:bg-red-900/20"
                        onClick={() => {
                          if (onCancelReservation && eqId) {
                            onCancelReservation(reservation.id, eqId, waitingCount);
                          }
                        }}
                      >
                        예약 취소
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* AI 추천 기구 내역 탭 */}
          <TabsContent value="ai" className="space-y-4">
            <div className="flex items-center text-sm text-muted-foreground">
              <span className="mr-2">진행률</span>
              <span className="px-2 py-1 rounded bg-secondary text-secondary-foreground">{aiProgressPercent}%</span>
            </div>
            {aiReservations.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    AI 추천 기구 내역이 없습니다
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    AI 루틴 추천을 통해 맞춤형 운동을 시작해보세요.
                  </p>
                  {onCreateNewRoutine && (
                    <Button onClick={onCreateNewRoutine} className="bg-blue-600 hover:bg-blue-700">
                      AI 루틴 생성하기
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {aiReservations.map((reservation) => {
                  const name =
                    reservation.equipmentName || reservation.equipment || "기구";
                  const image =
                    reservation.equipment_image ||
                    reservation.equipmentImage ||
                    null;
                  const position =
                    reservation.waitingPosition ??
                    reservation.waiting_position ??
                    null;
                  const allocated =
                    reservation.equipment_allocated_time ??
                    reservation.equipmentAllocatedTime ??
                    reservation.duration ??
                    null;
                  const eqId =
                    reservation.equipment_id ?? reservation.equipmentId ?? null;
                  const waitingCount =
                    reservation.waitingCount ?? reservation.waiting_count ?? 0;

                  // 실시간 기구 상태 가져오기
                  const equipmentStatus = eqId ? equipmentStatuses[String(eqId)] : null;
                  const status = equipmentStatus?.status || "AVAILABLE";
                  const currentWaitingCount = equipmentStatus?.waitingCount || 0;
                  // 대문자로 정규화하여 비교
                  const isAvailable = status === "AVAILABLE";
                  const isInUse = status === "IN_USE" || status === "IN-USE";
                  const isDimmed = !!(reservation.aiCanceled || reservation.aiUsed);

                  // 디버깅 로그
                  console.log(`🎯 [UI 렌더링] ${name} (ID: ${eqId}):`, {
                    equipmentStatus,
                    status,
                    isAvailable,
                    isInUse,
                  });

                  return (
                    <Card
                      key={reservation.id}
                      className={`bg-card border-border transition ${
                        isDimmed ? "opacity-50 grayscale pointer-events-none" : ""
                      }`}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            {image ? (
                              <img
                                src={image}
                                alt={String(name)}
                                className="h-16 w-16 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                                이미지 없음
                              </div>
                            )}

                            <div>
                              <CardTitle className="text-foreground">
                                {name}
                              </CardTitle>
                              <div className="flex items-center space-x-2 mt-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>{reservation.reservationTime}</span>
                                {allocated ? (
                                  <span className="ml-2">
                                    권장 시간: {allocated}분
                                  </span>
                                ) : null}
                                {eqId ? (
                                  <span className="ml-2">• ID: {eqId}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {/* 실시간 상태 표시 (배지만) */}
                          <div className="flex flex-col items-end gap-2">
                            {isAvailable ? (
                              <Badge className="bg-green-100 text-green-700">바로 이용가능</Badge>
                            ) : isInUse ? (
                              <>
                                <Badge className="bg-red-100 text-red-700">
                                  사용중
                                </Badge>
                              </>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700">
                                대기중
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-600 text-red-400 hover:bg-red-900/20"
                          onClick={() => {
                            if (onCancelReservation && eqId) {
                              onCancelReservation(reservation.id, eqId, waitingCount);
                            }
                          }}
                        >
                          사용 취소
                        </Button>
                        {/* 상태별 액션 버튼: 이용 완료 버튼 제거, 동일 위치에 배치 */}
                        {onStartImmediate && isAvailable && eqId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2 border-green-500 text-green-400 hover:bg-green-900/20"
                            onClick={() => onStartImmediate(Number(eqId))}
                          >
                            바로 시작
                          </Button>
                        )}
                        {onJoinQueue && isInUse && eqId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2 border-blue-500 text-blue-400 hover:bg-blue-900/20"
                            onClick={() => onJoinQueue(Number(eqId), name)}
                          >
                            줄서기
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                
                {onCreateNewRoutine && (
                  <Button 
                    onClick={onCreateNewRoutine} 
                    className="w-full bg-blue-600 hover:bg-blue-700 mt-4"
                  >
                    새로운 AI 루틴 생성하기
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
