export interface Equipment {
  id: string;
  name: string;
  type: string;
  status: "available" | "in-use" | "waiting";
  waitingCount?: number;
  currentUser?: string;
  timeRemaining?: number;
  image: string;
  allocatedTime: number;
  estimatedEndTime?: Date;
  operational_state?: "NORMAL" | "MAINTENANCE" | "BROKEN";
}