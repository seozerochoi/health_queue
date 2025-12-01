import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

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
}

interface ReservationStatusProps {
  onBack: () => void;
  gymName: string;
  reservations: Reservation[];
  onCancelReservation?: (reservationId: string, equipmentId: string | number, waitingCount: number) => void;
  defaultTab?: "normal" | "ai";
}

export function ReservationStatus({
  onBack,
  gymName,
  reservations,
  onCancelReservation,
  defaultTab = "normal",
}: ReservationStatusProps) {
  // AI 추천 예약과 일반 예약 분리
  const aiReservations = reservations.filter((r) => r.isAiRecommended === true);
  const normalReservations = reservations.filter((r) => !r.isAiRecommended);

  // 디버깅용 로그
  console.log("=== ReservationStatus Debug ===");
  console.log("Total reservations:", reservations.length);
  console.log("AI reservations:", aiReservations.length);
  console.log("Normal reservations:", normalReservations.length);
  console.log("Default tab:", defaultTab);
  console.log("All reservations:", reservations);
  console.log("AI reservations detail:", aiReservations);

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
            {aiReservations.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    AI 추천 기구 내역이 없습니다
                  </h3>
                  <p className="text-muted-foreground">
                    AI 루틴 추천을 통해 맞춤형 운동을 시작해보세요.
                  </p>
                </CardContent>
              </Card>
            ) : (
              aiReservations.map((reservation) => {
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
        </Tabs>

        <div className="space-y-4 hidden">
          {reservations.length === 0 ? (
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
            reservations.map((reservation) => {
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
        </div>
      </div>
    </div>
  );
}
