import { Calendar, User, Zap, Dumbbell } from "lucide-react";
import { Button } from "./ui/button";

interface BottomNavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export function BottomNavigation({ currentView, onNavigate }: BottomNavigationProps) {
  const navItems = [
    {
      id: "equipment-list",
      label: "기구 목록",
      icon: Dumbbell,
    },
    {
      id: "reservation-status", 
      label: "예약현황",
      icon: Calendar,
    },
    {
      id: "ai-recommendation",
      label: "AI 추천",
      icon: Zap,
    },
    {
      id: "my-page",
      label: "마이페이지", 
      icon: User,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border">
      <div className="flex justify-around items-center h-16 max-w-4xl mx-auto">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          
          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center space-y-1 h-full px-2 rounded-none ${
                isActive 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}