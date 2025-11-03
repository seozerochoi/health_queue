import { useState } from "react";
import { AuthInitial } from "./components/AuthInitial";
import SignUp from "./components/SignUp";
import { SignUpUserInfo } from "./components/SignUpUserInfo";
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

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'in-use' | 'waiting';
  waitingCount?: number;
  currentUser?: string;
  timeRemaining?: number;
  image: string;
  allocatedTime: number;
}

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

interface RegisteredUser {
  userId: string;
  password: string;
  name: string;
  nickname: string;
  role: 'user' | 'admin';
}

type AppView = 
  | 'auth-initial'
  | 'signup'
  | 'signup-user-info'
  | 'signup-gym-favorites'
  | 'signup-complete'
  | 'login'
  | 'mode-selection'
  | 'gym-search'
  | 'equipment-list'
  | 'equipment-reservation'
  | 'ai-recommendation'
  | 'admin-dashboard'
  | 'nfc-tagging'
  | 'workout-timer'
  | 'satisfaction-survey'
  | 'reservation-status'
  | 'my-page';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('auth-initial');
  const [selectedMode, setSelectedMode] = useState<'user' | 'admin' | null>(null);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [favoriteGymIds, setFavoriteGymIds] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<'user' | 'admin' | null>(null);
  const [userNickname, setUserNickname] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([
    {
      userId: "user1",
      password: "1234",
      name: "홍길동",
      nickname: "운동왕",
      role: "user"
    },
    {
      userId: "admin1",
      password: "admin",
      name: "김관리",
      nickname: "헬스지기",
      role: "admin"
    },
    {
      userId: "test",
      password: "test",
      name: "테스트",
      nickname: "테스터",
      role: "user"
    }
  ]);
  const [tempUserId, setTempUserId] = useState<string>("");
  const [tempPassword, setTempPassword] = useState<string>("");

  const mockGyms: Gym[] = [
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

  const handleAuthNavigate = (view: 'signup' | 'login') => {
    setCurrentView(view);
  };

  const handleSignUpStep1Complete = (userId: string, password: string) => {
    setTempUserId(userId);
    setTempPassword(password);
    setCurrentView('signup-user-info');
  };

  const handleSignUpStep2Complete = (name: string, role: 'user' | 'admin') => {
    setUserRole(role);
    // nickname field removed; use name as display nickname to keep downstream components stable
    setUserNickname(name);
    setUserName(name);
    
    // 회원가입 데이터를 registeredUsers에 추가
    const newUser: RegisteredUser = {
      userId: tempUserId,
      password: tempPassword,
      name: name,
      nickname: name,
      role: role
    };
    setRegisteredUsers(prev => [...prev, newUser]);
    
    setCurrentView('signup-gym-favorites');
  };

  const handleSignUpStep3Complete = (gymIds: string[]) => {
    setFavoriteGymIds(gymIds);
    setCurrentView('signup-complete');
  };

  const handleSignUpComplete = () => {
    // 즐겨찾기가 1개인 경우
    if (favoriteGymIds.length === 1) {
      const gym = mockGyms.find(g => g.id === favoriteGymIds[0]);
      if (gym) {
        setSelectedGym(gym);
        // 운영자 모드면 운영자 대시보드로, 사용자 모드면 기구 목록으로
        if (userRole === 'admin') {
          setCurrentView('admin-dashboard');
        } else {
          setCurrentView('equipment-list');
        }
      }
    } 
    // 즐겨찾기가 2개 이상인 경우
    else if (favoriteGymIds.length > 1) {
      // If multiple gyms were selected (shouldn't happen with single-selection UI), default to first gym and go to equipment list
      const first = mockGyms[0];
      setSelectedGym(first);
      setCurrentView('equipment-list');
    }
    // 즐겨찾기가 없는 경우
    else {
      // No gym selected - default to first gym and go to equipment list
      const first = mockGyms[0];
      setSelectedGym(first);
      setCurrentView('equipment-list');
    }
  };

  const handleLoginComplete = (userId: string) => {
    // 로그인한 사용자 정보 찾기
    const user = registeredUsers.find(u => u.userId === userId);
    if (user) {
      setUserName(user.name);
      setUserNickname(user.nickname);
      setUserRole(user.role);
      
      // 사용자 역할에 따라 헬스장 검색 또는 관리자 대시보드로 이동
      // 기본적으로 첫 번째 헬스장을 선택하여 바로 기구 목록으로 이동
      const firstGym = mockGyms[0];
      setSelectedGym(firstGym);
      
      if (user.role === 'admin') {
        setCurrentView('admin-dashboard');
      } else {
        setCurrentView('equipment-list');
      }
    }
  };

  const handleLogout = () => {
    // clear user-related state and go back to auth-initial
    setUserName("");
    setUserNickname("");
    setUserRole(null);
    setSelectedGym(null);
    setSelectedMode(null);
    setReservations([]);
    setCurrentView('auth-initial');
  };

  const handleModeSelect = (mode: 'user' | 'admin') => {
    setSelectedMode(mode);
    if (mode === 'admin') {
      setCurrentView('admin-dashboard');
    } else {
      setCurrentView('gym-search');
    }
  };

  const handleGymSelect = (gym: Gym) => {
    setSelectedGym(gym);
    // 운영자 모드면 운영자 대시보드로, 사용자 모드면 기구 목록으로
    if (userRole === 'admin') {
      setCurrentView('admin-dashboard');
    } else {
      setCurrentView('equipment-list');
    }
  };

  const handleEquipmentSelect = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setCurrentView('equipment-reservation');
  };

  const handleStartNFC = () => {
    setCurrentView('nfc-tagging');
  };

  const handleTaggingComplete = () => {
    setWorkoutStartTime(new Date());
    setCurrentView('workout-timer');
  };

  const handleWorkoutComplete = () => {
    setCurrentView('satisfaction-survey');
  };

  const handleSurveyComplete = () => {
    setCurrentView('equipment-list');
    setSelectedEquipment(null);
    setWorkoutStartTime(null);
  };

  const handleReservationComplete = (newReservations: Reservation[]) => {
    setReservations(prev => [...prev, ...newReservations]);
  };

  const handleSingleReservation = (equipment: Equipment, status: 'confirmed' | 'waiting', waitingPosition?: number) => {
    const now = new Date();
    const reservationTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(now.getTime() + equipment.allocatedTime * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    const newReservation: Reservation = {
      id: Date.now().toString(),
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      reservationTime: `${reservationTime} - ${endTime}`,
      duration: equipment.allocatedTime,
      status: status,
      waitingPosition: waitingPosition,
      createdAt: new Date()
    };
    
    setReservations(prev => [...prev, newReservation]);
  };

  const navigateBack = () => {
    switch (currentView) {
      case 'signup':
      case 'login':
        setCurrentView('auth-initial');
        break;
      case 'gym-search':
        setCurrentView('mode-selection');
        setSelectedMode(null);
        break;
      case 'equipment-list':
        setCurrentView('gym-search');
        setSelectedGym(null);
        break;
      case 'equipment-reservation':
        setCurrentView('equipment-list');
        setSelectedEquipment(null);
        break;
      case 'ai-recommendation':
        setCurrentView('equipment-list');
        break;
      case 'reservation-status':
        setCurrentView('equipment-list');
        break;
      case 'my-page':
        setCurrentView('equipment-list');
        break;
      case 'admin-dashboard':
        setCurrentView('mode-selection');
        setSelectedMode(null);
        break;
      case 'nfc-tagging':
        setCurrentView('equipment-reservation');
        break;
      case 'workout-timer':
        setCurrentView('nfc-tagging');
        break;
      case 'satisfaction-survey':
        setCurrentView('equipment-list');
        setSelectedEquipment(null);
        setWorkoutStartTime(null);
        break;
      default:
        setCurrentView('mode-selection');
    }
  };

  const handleBottomNavigation = (view: string) => {
    setCurrentView(view as AppView);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'auth-initial':
        return <AuthInitial onNavigate={handleAuthNavigate} />;
      
      case 'signup':
  return <SignUp onBack={navigateBack} onSubmit={(form) => handleSignUpStep1Complete(form.userId, form.password)} />;
      
      case 'signup-user-info':
        return <SignUpUserInfo onBack={navigateBack} onNext={handleSignUpStep2Complete} />;
      
      case 'signup-gym-favorites':
        return <SignUpGymFavorites onBack={navigateBack} onComplete={handleSignUpStep3Complete} />;
      
      case 'signup-complete':
        return <SignUpComplete onStart={handleSignUpComplete} />;
      
      case 'login':
        return <Login onBack={navigateBack} onLoginComplete={handleLoginComplete} registeredUsers={registeredUsers} />;
      
      case 'mode-selection':
        return <ModeSelection onModeSelect={handleModeSelect} />;
      
      case 'gym-search':
        return (
          <GymSearch 
            onGymSelect={handleGymSelect}
            onBack={navigateBack}
            favoriteGymIds={favoriteGymIds}
          />
        );
      
      case 'equipment-list':
        return (
          <EquipmentList
            gymName={selectedGym?.name || ''}
            onBack={navigateBack}
            onEquipmentSelect={handleEquipmentSelect}
          />
        );
      
      case 'equipment-reservation':
        return selectedEquipment ? (
          <EquipmentReservation
            equipment={selectedEquipment}
            onBack={navigateBack}
            onStartNFC={handleStartNFC}
            onReservationComplete={handleSingleReservation}
          />
        ) : null;
      
      case 'ai-recommendation':
        return (
          <AIRoutineRecommendation
            onBack={navigateBack}
            onReservationComplete={handleReservationComplete}
          />
        );
      
      case 'admin-dashboard':
        return (
          <AdminDashboard
            onBack={navigateBack}
            gymName={selectedGym?.name}
          />
        );
      
      case 'nfc-tagging':
        return selectedEquipment ? (
          <NFCTagging
            equipmentName={selectedEquipment.name}
            onBack={navigateBack}
            onTaggingComplete={handleTaggingComplete}
          />
        ) : null;
      
      case 'workout-timer':
        return selectedEquipment ? (
          <WorkoutTimer
            equipment={selectedEquipment}
            onBack={navigateBack}
            onWorkoutComplete={handleWorkoutComplete}
          />
        ) : null;
      
      case 'satisfaction-survey':
        return selectedEquipment && workoutStartTime ? (
          <SatisfactionSurvey
            equipment={selectedEquipment}
            actualUsageTime={Math.floor((new Date().getTime() - workoutStartTime.getTime()) / 60000)}
            onBack={navigateBack}
            onSurveyComplete={handleSurveyComplete}
          />
        ) : null;
      
      case 'reservation-status':
        return (
          <ReservationStatus
            onBack={navigateBack}
            gymName={selectedGym?.name || ''}
            reservations={reservations}
          />
        );
      
      case 'my-page':
        return (
          <MyPage
            onBack={navigateBack}
            onLogout={handleLogout}
            userName={userName}
            userNickname={userNickname}
          />
        );
      
      default:
        return <ModeSelection onModeSelect={handleModeSelect} />;
    }
  };

  const showBottomNavigation = [
    'equipment-list', 
    'reservation-status', 
    'my-page', 
    'ai-recommendation'
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
/*
import { useState } from "react";
import AuthInitial from "./components/AuthInitial";
 
/*
import { useState } from "react";
import AuthInitial from "./components/AuthInitial";

type AppView = "auth-initial" | "signup" | "login";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("auth-initial");

  const handleAuthNavigate = (view: "signup" | "login") => {
    setCurrentView(view);
  };

  // 지금은 어떤 view로 바꿔도 AuthInitial만 보여줌 (빌드 안정화 목적)
  return (
    <div className="min-h-screen">
      <AuthInitial onNavigate={handleAuthNavigate} />
    </div>
  );
}


/*
import { useState } from "react";
import AuthInitial from "./components/AuthInitial";
import SignUp from "./components/SignUp";
import Login from "./components/Login"; // 이미 있다면 사용, 없으면 제거 가능

type AppView = "auth-initial" | "signup" | "login";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("auth-initial");

  const goAuth = (view: "signup" | "login") => setCurrentView(view);

  return (
    <div className="min-h-screen">
      {currentView === "auth-initial" && <AuthInitial onNavigate={goAuth} />}

      {currentView === "signup" && (
        <SignUp
          onBack={() => setCurrentView("auth-initial")}
          onSubmit={(form) => {
            console.log("회원가입 폼 데이터:", form);
            // TODO: 여기서 다음 화면으로 이동하거나 API 호출
            // setCurrentView("login")
          }}
        />
      )}

      {currentView === "login" && (
        <Login
          onBack={() => setCurrentView("auth-initial")}
          onSubmit={(userId) => {
          console.log("logged in:", userId);
          // TODO: 로그인 성공 후 다음 화면으로 이동
          // setCurrentView("gym-search") 등
          }}
        />
      )}
    </div>
  );
}
*/