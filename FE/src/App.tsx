import { useState } from "react";
import { AuthInitial } from "./components/AuthInitial";
import SignUp from "./components/SignUp";
import { SignUpUserInfo } from "./components/SignUpUserInfo";
import { Gym } from "./types/gym";
import { Equipment } from "./types/equipment";
import axios from "axios";
import { SignUpGymFavorites } from "./components/SignUpGymFavorites";
import { SignUpComplete } from "./components/SignUpComplete";
import { Login } from "./components/Login";
import { ModeSelection } from "./components/ModeSelection";
import { GymSearch } from "./components/GymSearch";
import { EquipmentList } from "./components/EquipmentList";
import { EquipmentReservation } from "./components/EquipmentReservation";
import { AIRoutineRecommendation } from "./components/AIRoutineRecommendation";
import { AdminDashboard } from "./components/AdminDashboard";
import { NFCTagging } from "./components/NFCTagging";
import { WorkoutTimer } from "./components/WorkoutTimer";
import { SatisfactionSurvey } from "./components/SatisfactionSurvey";
import { ReservationStatus } from "./components/ReservationStatus";
import { MyPage } from "./components/MyPage";
import { BottomNavigation } from "./components/BottomNavigation";

// Types moved to separate files
interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  reservationTime: string;
  duration: number;
  status: "confirmed" | "waiting";
  waitingPosition?: number;
  createdAt: Date;
}

interface RegisteredUser {
  userId: string;
  password: string;
  name: string;
  nickname: string;
  role: "user" | "admin";
}

// Login 컴포넌트에서 전달하는 결과 타입
type LoginResult = {
  userId: string;
  access?: string;
  refresh?: string;
  name?: string;
  nickname?: string;
  role?: "user" | "admin";
};

type AppView =
  | "auth-initial"
  | "signup"
  | "signup-user-info"
  | "signup-gym-favorites"
  | "signup-complete"
  | "login"
  | "mode-selection"
  | "gym-search"
  | "equipment-list"
  | "equipment-reservation"
  | "ai-recommendation"
  | "admin-dashboard"
  | "nfc-tagging"
  | "workout-timer"
  | "satisfaction-survey"
  | "reservation-status"
  | "my-page";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("auth-initial");
  const [selectedMode, setSelectedMode] = useState<"user" | "admin" | null>(
    null
  );
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(
    null
  );
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [favoriteGymIds, setFavoriteGymIds] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<"user" | "admin" | null>(null);
  const [userNickname, setUserNickname] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [userGym, setUserGym] = useState<string>("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tempUserId, setTempUserId] = useState<string>("");
  const [tempPassword, setTempPassword] = useState<string>("");

  const handleAuthNavigate = (view: "signup" | "login") => {
    setCurrentView(view);
  };

  const handleSignUpStep1Complete = (userId: string, password: string) => {
    setTempUserId(userId);
    setTempPassword(password);
    setCurrentView("signup-user-info");
  };

  const handleSignUpStep2Complete = (name: string, role: "user" | "admin") => {
    setUserRole(role);
    // nickname field removed; use name as display nickname to keep downstream components stable
    setUserNickname(name);
    setUserName(name);

    // NOTE: signup components are responsible for calling the backend.
    // App should NOT keep a local registeredUsers list. We keep the local
    // name/role state for routing after signup completes.

    setCurrentView("signup-gym-favorites");
  };

  const handleSignUpStep3Complete = async (gymIds: string[]) => {
    setFavoriteGymIds(gymIds);
    
    // 선택한 헬스장을 백엔드에 저장
    if (gymIds.length > 0 && tempUserId && tempPassword) {
      try {
        console.log("=== 회원가입 완료: 헬스장 저장 시작 ===");
        
        // 1. 먼저 로그인하여 토큰 받기
        const loginResponse = await fetch("http://43.201.88.27/api/login/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: tempUserId,
            password: tempPassword,
          }),
        });

        if (!loginResponse.ok) {
          console.error("자동 로그인 실패");
          setCurrentView("signup-complete");
          return;
        }

        const loginData = await loginResponse.json();
        const token = loginData.access;
        
        // 토큰 저장
        localStorage.setItem("access_token", token);
        if (loginData.refresh) {
          localStorage.setItem("refresh_token", loginData.refresh);
        }
        
        console.log("자동 로그인 성공, 토큰:", token);
        
        // 2. 백엔드에 헬스장 멤버십 생성
        const gymId = gymIds[0];
        
        console.log("선택한 헬스장 ID:", gymId);
        
        const membershipResponse = await fetch("http://43.201.88.27/api/gyms/memberships/", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gym: parseInt(gymId),
          }),
        });
        
        if (membershipResponse.ok) {
          console.log("✅ 헬스장 멤버십 저장 성공!");
        } else {
          const errorText = await membershipResponse.text();
          console.error("❌ 헬스장 멤버십 저장 실패:", membershipResponse.status, errorText);
        }
      } catch (error) {
        console.error("헬스장 저장 중 에러:", error);
      }
    }
    
    setCurrentView("signup-complete");
  };

  const handleSignUpComplete = async () => {
    // 회원가입 후 API를 통해 헬스장 정보 가져오기
    try {
      const token = localStorage.getItem("access_token");
      if (token) {
        const res = await fetch("http://43.201.88.27/api/gyms/my-gym/", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const gymData = await res.json();
          const gymInfo = {
            id: gymData.id,
            user: tempUserId,
            gym_name: gymData.name || "",
            gym_address: gymData.address || "",
            status: "운영중",
            join_date: new Date().toISOString().split('T')[0],
          };
          setSelectedGym(gymInfo);
          console.log("회원가입 후 헬스장 정보 설정:", gymInfo);
        }
      }
    } catch (error) {
      console.error("회원가입 후 헬스장 정보 가져오기 실패:", error);
    }

    // 역할에 따라 화면 이동
    if (userRole === "admin") {
      setCurrentView("admin-dashboard");
    } else {
      setCurrentView("equipment-list");
    }
  };

  const handleLoginComplete = async (userId: string, additionalData?: any) => {
    console.log("============ App.handleLoginComplete ============");
    console.log("로그인 ID:", userId);
    console.log("추가 데이터:", additionalData);

    // 사용자 정보 설정
    setUserName(userId);
    setUserNickname(userId);
    setUserRole("user");

    // 헬스장 정보가 있으면 상태 업데이트
    if (additionalData?.gymInfo && additionalData.gymInfo.name) {
      const gymInfo = {
        id: additionalData.gymInfo.id,
        user: userId,
        gym_name: additionalData.gymInfo.name,
        gym_address: additionalData.gymInfo.address,
        status: additionalData.gymInfo.status,
        join_date: additionalData.gymInfo.joinDate,
      };
      setSelectedGym(gymInfo);
      console.log("헬스장 정보 설정 (from login payload):", gymInfo);
    } else {
      // 추가 데이터에 gymInfo가 없으면 저장된 토큰으로 직접 API 호출 시도
      try {
        const token = localStorage.getItem("access_token");
        if (token) {
          console.log("No gym in login payload. Fetching /api/gyms/my-gym/ with token.");
          const res = await fetch("http://43.201.88.27/api/gyms/my-gym/", {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (res.ok) {
            const gymData = await res.json();
            console.log("Fetched gym data:", gymData);
            if (gymData) {
              const gymInfo = {
                id: gymData.id,
                user: userId,
                gym_name: gymData.gym_name || gymData.name || "",
                gym_address: gymData.gym_address || gymData.address || "",
                status: gymData.status || "",
                join_date: gymData.join_date || gymData.joinDate || "",
              };
              setSelectedGym(gymInfo);
              console.log("헬스장 정보 설정 (from API):", gymInfo);
            }
          } else if (res.status === 404) {
            console.warn("User has no gym associated (API returned 404).");
            // 404인 경우 기본 헬스장 설정 (첫 번째 mock gym)
            const defaultGym = {
              id: 1,
              user: userId,
              gym_name: "헬스장 예제",
              gym_address: "서울시 강남구 테헤란로 123",
              status: "운영중",
              join_date: new Date().toISOString().split('T')[0],
            };
            setSelectedGym(defaultGym);
            console.log("기본 헬스장 설정 (404 fallback):", defaultGym);
          } else {
            const text = await res.text();
            console.error("Failed fetching gym API:", res.status, text);
          }
        } else {
          console.warn("No access token in localStorage to fetch gym info.");
        }
      } catch (err) {
        console.error("Error fetching gym in handleLoginComplete:", err);
      }
    }

    // 화면 전환
    console.log("→ equipment-list로 이동");
    setCurrentView("equipment-list");
    console.log("=================================================");
  };

  const handleLogout = () => {
    // clear user-related state and go back to auth-initial
    setUserName("");
    setUserNickname("");
    setUserRole(null);
    setSelectedGym(null);
    setSelectedMode(null);
    setReservations([]);
    setCurrentView("auth-initial");
  };

  const handleModeSelect = (mode: "user" | "admin") => {
    setSelectedMode(mode);
    if (mode === "admin") {
      setCurrentView("admin-dashboard");
    } else {
      setCurrentView("gym-search");
    }
  };

  const handleGymSelect = (gym: Gym) => {
    setSelectedGym(gym);
    // 운영자 모드면 운영자 대시보드로, 사용자 모드면 기구 목록으로
    if (userRole === "admin") {
      setCurrentView("admin-dashboard");
    } else {
      setCurrentView("equipment-list");
    }
  };

  const handleEquipmentSelect = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setCurrentView("equipment-reservation");
  };

  const handleStartNFC = () => {
    setCurrentView("nfc-tagging");
  };

  const handleTaggingComplete = () => {
    setWorkoutStartTime(new Date());
    setCurrentView("workout-timer");
  };

  const handleWorkoutComplete = () => {
    setCurrentView("satisfaction-survey");
  };

  const handleSurveyComplete = () => {
    setCurrentView("equipment-list");
    setSelectedEquipment(null);
    setWorkoutStartTime(null);
  };

  const handleReservationComplete = (newReservations: Reservation[]) => {
    setReservations((prev) => [...prev, ...newReservations]);
  };

  const handleSingleReservation = (
    equipment: Equipment,
    status: "confirmed" | "waiting",
    waitingPosition?: number
  ) => {
    const now = new Date();
    const reservationTime = now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endTime = new Date(
      now.getTime() + equipment.allocatedTime * 60000
    ).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

    const newReservation: Reservation = {
      id: Date.now().toString(),
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      reservationTime: `${reservationTime} - ${endTime}`,
      duration: equipment.allocatedTime,
      status: status,
      waitingPosition: waitingPosition,
      createdAt: new Date(),
    };

    setReservations((prev) => [...prev, newReservation]);
  };

  const navigateBack = () => {
    switch (currentView) {
      case "signup":
      case "login":
        setCurrentView("auth-initial");
        break;
      case "gym-search":
        setCurrentView("mode-selection");
        setSelectedMode(null);
        break;
      case "equipment-list":
        setCurrentView("gym-search");
        setSelectedGym(null);
        break;
      case "equipment-reservation":
        setCurrentView("equipment-list");
        setSelectedEquipment(null);
        break;
      case "ai-recommendation":
        setCurrentView("equipment-list");
        break;
      case "reservation-status":
        setCurrentView("equipment-list");
        break;
      case "my-page":
        setCurrentView("equipment-list");
        break;
      case "admin-dashboard":
        setCurrentView("mode-selection");
        setSelectedMode(null);
        break;
      case "nfc-tagging":
        setCurrentView("equipment-reservation");
        break;
      case "workout-timer":
        setCurrentView("nfc-tagging");
        break;
      case "satisfaction-survey":
        setCurrentView("equipment-list");
        setSelectedEquipment(null);
        setWorkoutStartTime(null);
        break;
      default:
        setCurrentView("mode-selection");
    }
  };

  const handleBottomNavigation = (view: string) => {
    setCurrentView(view as AppView);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case "auth-initial":
        return <AuthInitial onNavigate={handleAuthNavigate} />;

      case "signup":
        return (
          <SignUp
            onBack={navigateBack}
            onSubmit={(form) =>
              handleSignUpStep1Complete(form.userId, form.password)
            }
          />
        );

      case "signup-user-info":
        return (
          <SignUpUserInfo
            onBack={navigateBack}
            onNext={handleSignUpStep2Complete}


          />
        );

      case "signup-gym-favorites":
        return (
          <SignUpGymFavorites
            onBack={navigateBack}
            onComplete={handleSignUpStep3Complete}
          />
        );

      case "signup-complete":
        return <SignUpComplete onStart={handleSignUpComplete} />;

      case "login":
        return (
          <Login onBack={navigateBack} onLoginComplete={handleLoginComplete} />
        );

      case "mode-selection":
        return <ModeSelection onModeSelect={handleModeSelect} />;

      case "gym-search":
        return (
          <GymSearch
            onGymSelect={handleGymSelect}
            onBack={navigateBack}
            favoriteGymIds={favoriteGymIds}
          />
        );

      case "equipment-list":
        console.log("Rendering EquipmentList with selectedGym:", selectedGym);
        return (
          <EquipmentList
            gymName={selectedGym?.gym_name || ""}
            onBack={navigateBack}
            onEquipmentSelect={handleEquipmentSelect}
          />
        );

      case "equipment-reservation":
        return selectedEquipment ? (
          <EquipmentReservation
            equipment={selectedEquipment}
            onBack={navigateBack}
            onStartNFC={handleStartNFC}
            onReservationComplete={handleSingleReservation}
          />
        ) : null;

      case "ai-recommendation":
        return (
          <AIRoutineRecommendation
            onBack={navigateBack}
            onReservationComplete={handleReservationComplete}
          />
        );

      case "admin-dashboard":
        return (
          <AdminDashboard onBack={navigateBack} gymName={selectedGym?.gym_name} />
        );

      case "nfc-tagging":
        return selectedEquipment ? (
          <NFCTagging
            equipmentName={selectedEquipment.name}
            onBack={navigateBack}
            onTaggingComplete={handleTaggingComplete}
          />
        ) : null;

      case "workout-timer":
        return selectedEquipment ? (
          <WorkoutTimer
            equipment={selectedEquipment}
            onBack={navigateBack}
            onWorkoutComplete={handleWorkoutComplete}
          />
        ) : null;

      case "satisfaction-survey":
        return selectedEquipment && workoutStartTime ? (
          <SatisfactionSurvey
            equipment={selectedEquipment}
            actualUsageTime={Math.floor(
              (new Date().getTime() - workoutStartTime.getTime()) / 60000
            )}
            onBack={navigateBack}
            onSurveyComplete={handleSurveyComplete}
          />
        ) : null;

      case "reservation-status":
        return (
          <ReservationStatus
            onBack={navigateBack}
            gymName={selectedGym?.gym_name || ""}
            reservations={reservations}
          />
        );

      case "my-page":
        console.log("Rendering MyPage with selectedGym:", selectedGym);
        return (
          <MyPage
            onBack={navigateBack}
            onLogout={handleLogout}
            userName={userName}
            userNickname={userNickname}
            userGym={selectedGym?.gym_name}
          />
        );

      default:
        return <ModeSelection onModeSelect={handleModeSelect} />;
    }
  };

  const showBottomNavigation = [
    "equipment-list",
    "reservation-status",
    "my-page",
    "ai-recommendation",
  ].includes(currentView);

  return (
    <div className="min-h-screen">
      <div className={showBottomNavigation ? "pb-16" : ""}>
        {renderCurrentView()}
      </div>
      {showBottomNavigation && (
        <BottomNavigation
          currentView={currentView}
          onNavigate={handleBottomNavigation}
        />
      )}
    </div>
  );
}
