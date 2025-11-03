import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  reservationTime: string;
  duration: number;
  status: 'confirmed' | 'waiting';
  waitingPosition?: number;
  createdAt: Date;
}

interface ReservationStatusProps {
  onBack: () => void;
  gymName: string;
  reservations: Reservation[];
}

export function ReservationStatus({ onBack, gymName, reservations }: ReservationStatusProps) {
  const getStatusBadge = (status: string, position?: number | null) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-100 text-green-700">예약 확정</Badge>;
      case "waiting":
        return <Badge className="bg-yellow-100 text-yellow-700">대기중 ({position}번째)</Badge>;
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

        <div className="space-y-4">
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
            reservations.map((reservation) => (
              <Card key={reservation.id} className="bg-card border-border">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-foreground">
                        {reservation.equipmentName}
                      </CardTitle>
                      <div className="flex items-center space-x-2 mt-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {reservation.reservationTime}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(reservation.status, reservation.waitingPosition)}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      예약 변경
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-600 text-red-400 hover:bg-red-900/20"
                    >
                      예약 취소
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}