import { useState, useEffect, useRef } from "react";
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
import { AIRoutineRecommendation } from "./components/AIRoutineRecommendation";
import { AdminDashboard } from "./components/AdminDashboard";
import { WorkoutTimer } from "./components/WorkoutTimer";
import { SatisfactionSurvey } from "./components/SatisfactionSurvey";
import { ReservationStatus } from "./components/ReservationStatus";
import { MyPage } from "./components/MyPage";
import { BottomNavigation } from "./components/BottomNavigation";

// Types moved to separate files
interface Reservation {
  id: string;
  equipmentId?: string | number;
  equipment_id?: string | number;
  equipmentName?: string;
  equipment?: string;
  equipment_image?: string;
  equipmentImage?: string;
  reservationTime?: string;
  duration?: number;
  equipment_allocated_time?: number;
  equipmentAllocatedTime?: number;
  status: "confirmed" | "waiting" | string;
  waitingPosition?: number;
  waiting_position?: number;
  waitingCount?: number;
  waiting_count?: number;
  createdAt?: Date;
  notified_at?: string | null;
  notification_expires_at?: string | null;
  notification_timeout_seconds?: number | null;
  isAiRecommended?: boolean;
  aiCanceled?: boolean;
  aiUsed?: boolean;
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

type ReservationNotification = {
  reservationId: string;
  equipmentName: string;
  expiresAt: string | null;
  secondsLeft: number;
  type?: "queue-success"; // 줄서기 성공 알림용
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
  | "ai-recommendation"
  | "admin-dashboard"
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
  const [reservationTab, setReservationTab] = useState<"normal" | "ai">(
    "normal"
  );
  const [notifications, setNotifications] = useState<ReservationNotification[]>(
    []
  );
  const shownNotificationsRef = useRef<Record<string, boolean>>({});
  const reservationSSEConnectedRef = useRef<boolean>(false);
  const equipmentSSEConnectedRef = useRef<boolean>(false);

  // 전역 equipment 상태 (모든 컴포넌트에서 공유)
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  const [tempUserId, setTempUserId] = useState<string>("");
  const [tempPassword, setTempPassword] = useState<string>("");
  // 사용자가 NFC 과정을 거치지 않고 바로 타이머로 진입했는지 여부
  const [directWorkout, setDirectWorkout] = useState<boolean>(false);
  // NFC 스캔 활성화 여부
  const [nfcEnabled, setNfcEnabled] = useState(false);
  // NFC 태그 읽은 값 표시용
  const [nfcTagValue, setNfcTagValue] = useState<string>("");
  // NFC 중복 호출 방지용 (마지막 태그 ID + 타임스탬프)
  const lastNFCTagRef = useRef<{ tagId: string; timestamp: number } | null>(null);

  const getApiBase = () => {
    try {
      const viteBase = (import.meta as any)?.env?.VITE_API_BASE;
      if (viteBase) return viteBase;
    } catch (e) {
      /* ignore */
    }
    try {
      if (typeof process !== "undefined" && process?.env?.REACT_APP_API_BASE)
        return process.env.REACT_APP_API_BASE;
    } catch (e) {
      /* ignore */
    }
    return "https://43.201.88.27";
  };

  const sendImmediateHeartbeat = async (equipmentId?: string | number) => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const payload: Record<string, number> = {};
    if (equipmentId !== undefined && equipmentId !== null) {
      payload.equipment_id = Number(equipmentId);
    }

    try {
      await fetch(`${getApiBase()}/api/workouts/heartbeat/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive: true as any,
      });
    } catch (err) {
      console.warn("initial heartbeat failed", err);
    }
  };

  const handleAuthNavigate = (view: "signup" | "login") => {
    setCurrentView(view);
  };

  const handleSignUpStep1Complete = async (
    userId: string,
    password: string
  ) => {
    setTempUserId(userId);
    setTempPassword(password);

    // [Auto-Login] InBody 분석 API 사용을 위해 미리 토큰 발급
    try {
      const loginResponse = await fetch("https://43.201.88.27/api/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userId, password: password }),
      });
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        localStorage.setItem("access_token", loginData.access);
        localStorage.setItem("refresh_token", loginData.refresh);
        console.log("✅ 회원가입 직후 자동 로그인 성공 (토큰 발급)");
      } else {
        console.warn("⚠️ 회원가입 직후 자동 로그인 실패");
      }
    } catch (e) {
      console.error("Auto-login failed during signup", e);
    }

    setCurrentView("signup-user-info");
  };

  const handleSignUpStep2Complete = async (
    name: string,
    role: "user" | "admin",
    inbodyData?: any
  ) => {
    setUserRole(role);
    setUserNickname(name);
    setUserName(name);

    // [Profile Update] 회원가입 시 입력받은 인바디 정보가 있다면 저장
    if (inbodyData) {
      try {
        const token = localStorage.getItem("access_token");
        if (token) {
          console.log("💾 [SignUp] 인바디 정보 저장 시도:", inbodyData);
          const res = await fetch("https://43.201.88.27/api/users/profile/", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(inbodyData),
          });
          if (res.ok) {
            console.log("✅ [SignUp] 인바디 정보 저장 성공");
          } else {
            console.warn("⚠️ [SignUp] 인바디 정보 저장 실패:", res.status);
          }
        }
      } catch (e) {
        console.error("Error saving inbody data during signup:", e);
      }
    }

    // 헬스장 선택 건너뛰고 자동으로 스마트짐(id=1)에 연결
    await handleSignUpStep3Complete(["1"]);
  };

  const handleSignUpStep3Complete = async (gymIds: string[]) => {
    setFavoriteGymIds(gymIds);

    // 선택한 헬스장을 백엔드에 저장
    if (gymIds.length > 0 && tempUserId && tempPassword) {
      try {
        console.log("=== 회원가입 완료: 헬스장 저장 시작 ===");

        // 1. 먼저 로그인하여 토큰 받기
        const loginResponse = await fetch("https://43.201.88.27/api/login/", {
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

        const membershipResponse = await fetch(
          "https://43.201.88.27/api/gyms/memberships/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              gym: parseInt(gymId),
            }),
          }
        );

        if (membershipResponse.ok) {
          console.log("✅ 헬스장 멤버십 저장 성공!");
        } else {
          const errorText = await membershipResponse.text();
          console.error(
            "❌ 헬스장 멤버십 저장 실패:",
            membershipResponse.status,
            errorText
          );
        }
      } catch (error) {
        console.error("헬스장 저장 중 에러:", error);
      }
    }

    setCurrentView("signup-complete");
  };

  const handleSignUpComplete = async () => {
    // 회원가입 후 기본 헬스장을 "스마트짐"으로 설정
    const defaultGym = {
      id: 1,
      user: tempUserId || userName,
      gym_name: "스마트짐",
      gym_address: "서울시 강남구 테헤란로 123",
      status: "운영중",
      join_date: new Date().toISOString().split("T")[0],
    };

    setSelectedGym(defaultGym);
    console.log("회원가입 완료 - 기본 헬스장(스마트짐) 설정:", defaultGym);

    // 추가로 API를 통해 헬스장 정보가 있는지 확인
    try {
      const token = localStorage.getItem("access_token");
      if (token) {
        const res = await fetch("https://43.201.88.27/api/gyms/my-gym/", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const gymData = await res.json();
          if (gymData && gymData.name) {
            const gymInfo = {
              id: gymData.id,
              user: tempUserId || userName,
              gym_name: gymData.name || "",
              gym_address: gymData.address || "",
              status: "운영중",
              join_date: new Date().toISOString().split("T")[0],
            };
            setSelectedGym(gymInfo);
            console.log("회원가입 후 API 헬스장 정보 업데이트:", gymInfo);
          }
        }
      }
    } catch (error) {
      console.error("회원가입 후 헬스장 정보 가져오기 실패:", error);
      // 에러 발생 시에도 기본 헬스장 유지
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
    const name = additionalData?.name || userId;
    const role = additionalData?.role || "user";

    console.log("받은 role:", additionalData?.role);
    console.log("최종 설정할 role:", role);

    setUserName(name);
    setUserNickname(name);
    setUserRole(role);
    localStorage.setItem("current_user", userId);

    console.log("설정된 role:", role);
    console.log("설정된 name:", name);

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
          console.log(
            "No gym in login payload. Fetching /api/gyms/my-gym/ with token."
          );
          const res = await fetch("https://43.201.88.27/api/gyms/my-gym/", {
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
            // 404인 경우 기본 헬스장을 "스마트짐"으로 설정
            const defaultGym = {
              id: 1,
              user: userId,
              gym_name: "스마트짐",
              gym_address: "서울시 강남구 테헤란로 123",
              status: "운영중",
              join_date: new Date().toISOString().split("T")[0],
            };
            setSelectedGym(defaultGym);
            console.log(
              "기본 헬스장(스마트짐) 설정 (404 fallback):",
              defaultGym
            );
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

    // 화면 전환 - role에 따라 다른 페이지로 이동
    console.log("============ 화면 전환 시작 ============");
    console.log("현재 role 값:", role);
    console.log("role === 'admin' ?", role === "admin");
    console.log("typeof role:", typeof role);

    // 로그인 시 초기 equipment 데이터 로드
    console.log("🔄 [App] 로그인 완료 - 초기 equipment 데이터 로드");
    await fetchEquipment();

    if (role === "admin") {
      console.log("→ admin-dashboard로 이동 (role=admin)");
      setCurrentView("admin-dashboard");
    } else {
      console.log("→ equipment-list로 이동 (role=user)");
      setCurrentView("equipment-list");
    }
    console.log("화면 전환 명령 완료");
    console.log("=================================================");
  };

  const addNotification = (entry: ReservationNotification) => {
    setNotifications((prev) => {
      if (
        entry.reservationId &&
        prev.some((n) => n.reservationId === entry.reservationId)
      ) {
        return prev;
      }
      return [...prev, entry];
    });
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
    localStorage.removeItem("current_user");
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

  const handleEquipmentSelect = async (equipment: Equipment) => {
    setSelectedEquipment(equipment);

    // 기구 상태가 'available'이면 세션을 시작하고 바로 타이머로 이동
    if (equipment.status === "available") {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          alert("로그인이 필요합니다.");
          return;
        }

        const apiBase = getApiBase();

        // 백엔드에 세션 시작 요청
        const response = await fetch(`${apiBase}/api/workouts/start/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            equipment_id: parseInt(equipment.id),
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("세션 시작 실패:", response.status, errorText);
          alert("운동 세션 시작에 실패했습니다.");
          return;
        }

        const sessionData = await response.json();
        console.log("세션 시작 성공:", sessionData);

        // [AI 시간 추천] 일반 시작에도 AI 추천 적용
        let finalEquipment = { ...equipment };
        try {
          console.log("🤖 AI 시간 추천 요청 중...");
          const aiResponse = await fetch(`${apiBase}/api/ai/time/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              equipment_id: equipment.id,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            console.log("🤖 AI 추천 시간 수신:", aiData.recommended_time);
            finalEquipment.allocatedTime = aiData.recommended_time;
          } else {
            console.warn("AI 시간 추천 응답 실패:", aiResponse.status);
          }
        } catch (aiError) {
          console.warn("AI 시간 추천 요청 실패 (기본값 사용):", aiError);
        }

        setSelectedEquipment(finalEquipment);
        setWorkoutStartTime(new Date());
        setDirectWorkout(true);
        await sendImmediateHeartbeat(equipment.id);
        setCurrentView("workout-timer");
      } catch (error) {
        console.error("세션 시작 중 오류:", error);
        alert("운동 세션 시작 중 오류가 발생했습니다.");
      }
      return;
    }

    // 기구가 사용 중이거나 대기 중인 경우 바로 줄서기 API 호출
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      const response = await fetch(
        "https://43.201.88.27/api/workouts/join-queue/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            equipment_id: parseInt(equipment.id),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("줄서기 실패:", response.status, errorText);
        alert("줄서기에 실패했습니다.");
        return;
      }

      const data = await response.json();
      console.log("줄서기 성공:", data);

      // 예약 상태에 추가하고 바로 예약 현황으로 이동
      handleSingleReservation(equipment, "waiting", data.position);
    } catch (error) {
      console.error("줄서기 중 오류:", error);
      alert("줄서기 중 오류가 발생했습니다.");
    }
  };

  // NFC 태그 감지 시 운동 시작
  const handleNFCTagDetected = async (equipmentId: string | number) => {
    const nfcTagId = String(equipmentId);
    const now = Date.now();

    // 🔍 [NFC 중복 방지] 같은 태그를 2초 이내에 다시 읽으면 무시
    if (lastNFCTagRef.current) {
      const timeDiff = now - lastNFCTagRef.current.timestamp;
      if (lastNFCTagRef.current.tagId === nfcTagId && timeDiff < 2000) {
        console.log(`⏭️ NFC 중복 호출 무시 (${timeDiff}ms 이내)`);
        return;
      }
    }

    // 현재 태그 정보 저장
    lastNFCTagRef.current = { tagId: nfcTagId, timestamp: now };

    // 🔍 [NFC 디버깅] 수신한 데이터 상세 로깅
    console.log("🏷️ NFC 태그 감지");
    console.log(`  - 원본 값: "${equipmentId}"`);
    console.log(`  - String 변환: "${nfcTagId}"`);
    console.log(`  - 길이: ${nfcTagId.length}`);
    console.log(
      `  - Char codes: ${[...nfcTagId].map((c) => c.charCodeAt(0)).join(", ")}`
    );

    // NFC 태그 값을 상태에 저장하여 화면에 표시
    setNfcTagValue(nfcTagId);

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      const apiBase = getApiBase();

      // 1️⃣ 먼저 현재 운동 세션이 있는지 확인
      console.log("🔍 현재 운동 세션 확인 중...");
      const currentSessionResponse = await fetch(`${apiBase}/api/workouts/current/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (currentSessionResponse.ok) {
        const currentSession = await currentSessionResponse.json();
        
        // 현재 운동 중인 기구와 NFC 태깅한 기구가 같은지 확인
        if (currentSession && currentSession.equipment) {
          const currentEquipmentNFC = currentSession.equipment.nfc_tag_id;
          
          console.log(`✅ 현재 운동 세션 발견`);
          console.log(`  - 운동 중인 기구 NFC: ${currentEquipmentNFC}`);
          console.log(`  - 태깅한 기구 NFC: ${nfcTagId}`);
          
          if (currentEquipmentNFC === nfcTagId) {
            // 같은 기구 → 운동 종료
            console.log("🛑 같은 기구 태깅 감지 → 운동 종료 처리");
            
            const endResponse = await fetch(`${apiBase}/api/workouts/end/`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
            });

            if (endResponse.ok) {
              alert(`✅ 운동을 종료했습니다.\n기구: ${nfcTagId}`);
              setCurrentView("equipment-list");
              setSelectedEquipment(null);
              setWorkoutStartTime(null);
              await fetchEquipment();
              return;
            } else {
              const errorText = await endResponse.text();
              console.error("운동 종료 실패:", errorText);
              alert("운동 종료에 실패했습니다.");
              return;
            }
          } else {
            // 다른 기구 → 현재 운동 자동 종료 후 새 기구로 전환
            console.log("🔄 다른 기구 태깅 감지 → 현재 운동 종료 후 새 기구 시작");
            
            const endResponse = await fetch(`${apiBase}/api/workouts/end/`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
            });

            if (!endResponse.ok) {
              console.error("이전 운동 종료 실패:", await endResponse.text());
              alert("이전 운동 종료에 실패했습니다.");
              return;
            }
            
            console.log("✅ 이전 운동 종료 성공, 새 기구로 전환");
            // 상태 초기화
            setSelectedEquipment(null);
            setWorkoutStartTime(null);
            await fetchEquipment();
            
            // 잠시 대기 후 새 운동 시작 (DB 동기화)
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

      // 2️⃣ 운동 세션이 없거나 이전 운동 종료 완료 → 새 운동 시작
      console.log("🎬 새로운 운동 시작");
      
      // 🔍 [NFC 디버깅] API 호출 전 상세 정보 로깅
      const requestPayload = { nfc_tag_id: nfcTagId };
      console.log(`📡 API 호출: POST ${apiBase}/api/workouts/start/`);
      console.log(`📤 전송 데이터:`, JSON.stringify(requestPayload, null, 2));
      console.log(`🔐 Token: ${token.substring(0, 20)}...`);

      const response = await fetch(`${apiBase}/api/workouts/start/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      // 🔍 [NFC 디버깅] API 응답 로깅
      console.log(
        `📥 API 응답 상태: ${response.status} ${response.statusText}`
      );
      console.log(`📥 Content-Type: ${response.headers.get("content-type")}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ NFC 운동 시작 실패`);
        console.error(`  - Status: ${response.status}`);
        console.error(`  - Error Body: ${errorText}`);

        // 응답을 JSON으로 파싱 시도
        let errorDetail = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorText;
        } catch (e) {
          // JSON 파싱 실패 시 원문 사용
        }

        alert(
          `❌ NFC 태그: ${nfcTagId}\n\n운동 시작에 실패했습니다.\n\n응답 코드: ${response.status}\n에러: ${errorDetail}\n\n기구가 사용 가능한지 확인해주세요.`
        );
        return;
      }

      const data = await response.json();
      console.log("✅ NFC 운동 시작 성공");
      console.log(`  - Response:`, data);
      alert(`✅ NFC 태그 "${nfcTagId}" 인식 성공!\n운동을 시작합니다.`);

      // 선택된 장비 설정 - NFC 태그 ID로 기구 찾기
      const foundEquipment = equipmentList.find(
        (e) => e.nfc_tag_id === nfcTagId || String(e.id) === nfcTagId
      );

      if (foundEquipment) {
        let finalEquipment = { ...foundEquipment };

        // [AI 시간 추천] AI에게 적정 운동 시간 물어보기
        try {
          console.log("🤖 AI 시간 추천 요청 중...");
          const aiResponse = await fetch(`${apiBase}/api/ai/time/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              equipment_id: foundEquipment.id,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            console.log("🤖 AI 추천 시간 수신:", aiData.recommended_time);
            // AI가 추천한 시간으로 덮어쓰기
            finalEquipment.allocatedTime = aiData.recommended_time;
          } else {
            console.warn("AI 시간 추천 응답 실패:", aiResponse.status);
          }
        } catch (aiError) {
          console.warn("AI 시간 추천 요청 실패 (기본값 사용):", aiError);
        }

        setSelectedEquipment(finalEquipment);
      } else {
        console.warn("기구를 찾을 수 없음, NFC ID:", nfcTagId);
        setSelectedEquipment({
          id: String(nfcTagId),
          name: "운동 기구",
          state: "IN-USE",
          type: "",
          status: "in-use",
          image: "",
          allocatedTime: 0,
        } as Equipment);
      }

      setWorkoutStartTime(new Date());
      setCurrentView("workout-timer");
      setDirectWorkout(true);

      // 즉시 heartbeat 전송 - equipment.id 사용
      if (foundEquipment) {
        await sendImmediateHeartbeat(foundEquipment.id);
      }

      // 장비 상태 갱신
      await fetchEquipment();

      console.log("🎬 운동 타이머 화면으로 이동");
    } catch (error) {
      console.error("NFC 운동 시작 중 오류:", error);
      alert("운동 시작 중 오류가 발생했습니다.");
    }
  };

  const handleWorkoutComplete = () => {
    setCurrentView("satisfaction-survey");
  };

  const handleSurveyComplete = async () => {
    // 운동기구 상태를 AVAILABLE로 변경
    if (selectedEquipment) {
      const token = localStorage.getItem("access_token");
      const apiBase = (() => {
        try {
          const vite = (import.meta as any)?.env?.VITE_API_BASE;
          if (vite) return vite;
        } catch (e) {
          /* ignore */
        }
        try {
          if (
            typeof process !== "undefined" &&
            process?.env?.REACT_APP_API_BASE
          )
            return process.env.REACT_APP_API_BASE;
        } catch (e) {
          /* ignore */
        }
        return "https://43.201.88.27";
      })();

      if (token) {
        try {
          // 백엔드가 세션 종료를 처리할 시간을 주기 위해 짧은 대기
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 먼저 대기열 상태 확인
          const queueRes = await fetch(
            `${apiBase}/api/reservations/?equipment_id=${encodeURIComponent(
              selectedEquipment.id
            )}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          let hasWaitingUsers = false;
          if (queueRes.ok) {
            const reservations = await queueRes.json();
            const waiting = reservations.filter(
              (r: any) => r.status === "WAITING" || r.status === "NOTIFIED"
            );
            hasWaitingUsers = waiting.length > 0;
            console.log(`대기중인 사용자: ${waiting.length}명`);
          }

          // 대기자가 없으면 AVAILABLE로 변경
          if (!hasWaitingUsers) {
            const response = await fetch(
              `${apiBase}/api/equipment/${selectedEquipment.id}/`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  equipment_status: "AVAILABLE",
                }),
              }
            );

            if (!response.ok) {
              console.error("기구 상태 업데이트 실패:", response.status);
            } else {
              console.log("기구 상태가 AVAILABLE로 변경되었습니다.");
              // SSE가 업데이트를 전파할 시간 제공
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          } else {
            console.log("대기자가 있어 기구 상태 유지");
          }
        } catch (error) {
          console.error("기구 상태 업데이트 중 오류:", error);
        }
      }
    }

    // 운동 종료 시, 해당 장비의 AI 추천 예약을 자동으로 '사용 완료' 처리하여 카드가 어두워지도록 함
    let wasAiRecommended = false;
    if (selectedEquipment) {
      const usedEqId = String(selectedEquipment.id);
      // 먼저 AI 추천 여부 확인
      wasAiRecommended = reservations.some((r) => {
        const rid = String(r.equipment_id ?? r.equipmentId ?? "");
        return r.isAiRecommended && rid === usedEqId;
      });
      // 해당 AI 예약을 사용 완료 처리
      setReservations((prev) =>
        prev.map((r) => {
          const rid = String(r.equipment_id ?? r.equipmentId ?? "");
          if (r.isAiRecommended && rid === usedEqId) {
            return { ...r, aiUsed: true };
          }
          return r;
        })
      );
    }

    // AI 추천 기구로 운동했으면 예약 현황의 AI 탭으로, 아니면 기구 목록으로
    if (wasAiRecommended) {
      setReservationTab("ai");
      setCurrentView("reservation-status");
    } else {
      setCurrentView("equipment-list");
    }
    setSelectedEquipment(null);
    setWorkoutStartTime(null);
    setDirectWorkout(false);
  };

  const handleReservationComplete = (newReservations: Reservation[]) => {
    // AI 루틴에서 생성된 예약을 추가하고 즉시 예약 현황 화면으로 이동
    setReservations((prev) => [...prev, ...newReservations]);
    // AI 추천 예약인 경우 AI 탭으로 설정
    if (newReservations.length > 0 && newReservations[0].isAiRecommended) {
      setReservationTab("ai");
    }
    setCurrentView("reservation-status");
  };

  const handleAiQueueJoin = async (
    equipmentId: number,
    equipmentName: string
  ) => {
    const equipment = equipmentList.find((eq) => Number(eq.id) === equipmentId);
    if (!equipment) return;

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      const apiBase = (() => {
        try {
          const vite = (import.meta as any)?.env?.VITE_API_BASE;
          if (vite) return vite;
        } catch (e) {
          /* ignore */
        }
        try {
          if (
            typeof process !== "undefined" &&
            process?.env?.REACT_APP_API_BASE
          )
            return process.env.REACT_APP_API_BASE;
        } catch (e) {
          /* ignore */
        }
        return "https://43.201.88.27";
      })();

      const response = await fetch(`${apiBase}/api/workouts/join-queue/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ equipment_id: parseInt(String(equipment.id)) }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AI] 줄서기 실패:", response.status, errorText);
        alert("줄서기에 실패했습니다.");
        return;
      }

      const data = await response.json();
      // 서버에서 생성된 예약 정보를 사용해 로컬 상태에 추가 (이미지 포함)
      const now = new Date();
      const reservationTime = now.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endTime = new Date(
        now.getTime() + equipment.allocatedTime * 60000
      ).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

      const serverReservation: Reservation = {
        id: String(data.id ?? Date.now()),
        equipment_id: equipment.id,
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipment_image: (equipment as any).image ?? undefined,
        reservationTime: `${reservationTime} - ${endTime}`,
        duration: equipment.allocatedTime,
        status: "waiting",
        waitingPosition: data.position ?? data.waiting_position ?? undefined,
        waiting_position: data.position ?? data.waiting_position ?? undefined,
        waitingCount: data.waiting_count ?? undefined,
        createdAt: now,
        // AI 탭에서 줄서기한 예약은 일반 예약으로 처리 (isAiRecommended 플래그 제거)
      };

      setReservations((prev) => [...prev, serverReservation]);
      setReservationTab("normal"); // 일반 탭으로 전환
      setCurrentView("reservation-status");

      // 줄서기 성공 알림 표시
      addNotification({
        reservationId: `queue-success-${Date.now()}`,
        equipmentName: equipment.name,
        expiresAt: null,
        secondsLeft: 3,
        type: "queue-success",
      });

      // 서버와 동기화하여 취소/상태가 정확하도록 새로 고침
      fetchReservations();
    } catch (error) {
      console.error("[AI] 줄서기 중 오류:", error);
      alert("줄서기 중 오류가 발생했습니다.");
    }
  };

  // AI 추천 예약 항목 사용 완료 표시
  const handleAiMarkUsed = (reservationId: string) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === reservationId ? { ...r, aiUsed: true } : r))
    );
  };

  // AI 탭에서 '바로 이용가능' 기구 즉시 시작
  const handleAiStartImmediate = async (equipmentId: number) => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/workouts/start/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ equipment_id: equipmentId }),
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error("즉시 시작 실패:", res.status, errorText);
        alert("운동 시작에 실패했습니다.");
        return;
      }
      // 선택된 기구 설정 및 운동 타이머 화면으로 이동
      const eq = equipmentList.find((e) => Number(e.id) === equipmentId);
      if (eq) {
        // @ts-ignore: equipment type in App may be loosely typed
        setSelectedEquipment(eq as any);
      }
      setWorkoutStartTime(new Date());
      setCurrentView("workout-timer");
      // 장비 상태 동기화
      fetchEquipment();
    } catch (e) {
      console.error("즉시 시작 중 오류:", e);
      alert("운동 시작 중 오류가 발생했습니다.");
    }
  };

  const handleCancelReservation = async (
    reservationId: string,
    equipmentId: string | number,
    waitingCount: number
  ) => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      // AI 추천 예약인지 확인 (로컬 전용)
      const reservation = reservations.find((r) => r.id === reservationId);
      const isAiRecommended = reservation?.isAiRecommended === true;

      // AI 추천 예약은 서버 호출 없이 로컬에서 취소 상태로만 표시(카드 어둡게)
      if (isAiRecommended) {
        setReservations((prev) =>
          prev.map((r) =>
            r.id === reservationId ? { ...r, aiCanceled: true } : r
          )
        );
        alert("AI 추천 예약이 취소 처리되었습니다.");
        return;
      }

      const apiBase = (() => {
        try {
          const vite = (import.meta as any)?.env?.VITE_API_BASE;
          if (vite) return vite;
        } catch (e) {
          /* ignore */
        }
        try {
          if (
            typeof process !== "undefined" &&
            process?.env?.REACT_APP_API_BASE
          )
            return process.env.REACT_APP_API_BASE;
        } catch (e) {
          /* ignore */
        }
        return "https://43.201.88.27";
      })();

      // 1. 예약 취소 API 호출
      const deleteResponse = await fetch(
        `${apiBase}/api/reservations/${reservationId}/`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!deleteResponse.ok) {
        throw new Error("예약 취소 실패");
      }

      // 2. 예약 현황에서 삭제
      setReservations((prev) =>
        prev.filter((reservation) => reservation.id !== reservationId)
      );

      // 2-1. 같은 장비를 추천한 AI 항목이 있다면 '미사용'으로 표시하여 AI 탭에서 어둡게 보이도록 함
      setReservations((prev) =>
        prev.map((r) => {
          const rid = String(r.equipment_id ?? r.equipmentId ?? "");
          if (r.isAiRecommended && rid === String(equipmentId)) {
            return { ...r, aiCanceled: true };
          }
          return r;
        })
      );

      // 3. 줄서기 인원이 1명 이하면 기구 상태를 AVAILABLE로 변경
      if (waitingCount <= 1) {
        await fetch(`${apiBase}/api/equipment/${equipmentId}/`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ equipment_status: "AVAILABLE" }),
        });
      }

      alert("예약이 취소되었습니다.");
    } catch (error) {
      console.error("예약 취소 중 오류:", error);
      alert("예약 취소에 실패했습니다. 관리자에게 문의하세요.");
    }
  };

  const handleQueueUpdate = async () => {
    await fetchReservations();
    setCurrentView("reservation-status");
  };

  // Fetch reservations from backend for the current user. Will attempt
  // to refresh access token on 401 using stored refresh_token.
  const fetchReservations = async () => {
    const base = (() => {
      try {
        const vite = (import.meta as any)?.env?.VITE_API_BASE;
        if (vite) return vite;
      } catch (e) {
        /* ignore */
      }
      try {
        if (typeof process !== "undefined" && process?.env?.REACT_APP_API_BASE)
          return process.env.REACT_APP_API_BASE;
      } catch (e) {
        /* ignore */
      }
      return "https://43.201.88.27";
    })();
    const access = localStorage.getItem("access_token");
    const refresh = localStorage.getItem("refresh_token");

    const doFetch = async (token: string | null) => {
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/reservations/`, { headers });
      return res;
    };

    try {
      // If there's no access token and no refresh token, skip calling protected API
      if (!access && !refresh) {
        console.warn(
          "No access or refresh token present - skipping reservations fetch"
        );
        setReservations([]);
        return;
      }

      let res = await doFetch(access);
      if (res.status === 401) {
        if (refresh) {
          // try refresh
          const rres = await fetch(`${base}/api/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          });
          if (rres.ok) {
            const rdata = await rres.json();
            if (rdata.access) {
              localStorage.setItem("access_token", rdata.access);
              res = await doFetch(rdata.access);
            }
          } else {
            // refresh failed -> logout
            handleLogout();
            return;
          }
        } else {
          // no refresh token -> logout
          handleLogout();
          return;
        }
      }

      if (!res.ok) {
        console.error("Failed to fetch reservations", res.status);
        return;
      }

      const data = await res.json();
      // map backend reservation objects to front Reservation type and include new fields
      // EXPIRED와 COMPLETED 상태인 예약은 제외하고 WAITING, NOTIFIED만 표시
      const mapped: Reservation[] = (data || [])
        .filter((r: any) => r.status !== "EXPIRED" && r.status !== "COMPLETED")
        .map((r: any) => {
          const status = r.status === "NOTIFIED" ? "confirmed" : "waiting";
          const reservationTime = r.created_at
            ? new Date(r.created_at).toLocaleString()
            : r.reservation_time || "";
          return {
            id: String(r.id),
            equipment_id: r.equipment_id ?? r.equipment ?? undefined,
            equipmentId: r.equipment_id ?? r.equipment ?? undefined,
            equipmentName: r.equipment || r.equipment_name || "",
            equipment_image: r.equipment_image ?? r.equipmentImage ?? null,
            reservationTime,
            duration: r.allocated_duration_minutes ?? r.duration ?? 0,
            equipment_allocated_time:
              r.equipment_allocated_time ??
              r.equipment_allocated_time ??
              r.allocated_duration_minutes ??
              null,
            status: status as "confirmed" | "waiting",
            waitingPosition: r.position ?? r.waiting_position ?? undefined,
            waiting_position: r.waiting_position ?? r.position ?? undefined,
            waitingCount: r.waiting_count ?? r.waitingCount ?? undefined,
            notified_at: r.notified_at ?? null,
            notification_expires_at: r.notification_expires_at ?? null,
            notification_timeout_seconds:
              r.notification_timeout_seconds ?? null,
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          };
        });

      // AI 추천 예약(로컬 전용)을 보존하면서 서버 데이터와 병합
      setReservations((prev) => {
        // 기존 AI 추천 예약만 필터링
        const aiReservations = prev.filter((r) => r.isAiRecommended === true);
        // 서버에서 가져온 예약과 AI 추천 예약 병합
        const merged = [...mapped, ...aiReservations];
        console.log(
          "📋 [fetchReservations] 서버 예약:",
          mapped.length,
          "AI 예약:",
          aiReservations.length,
          "병합:",
          merged.length
        );
        return merged;
      });
      return mapped;
    } catch (e) {
      console.error("Error fetching reservations:", e);
    }
  };

  /**
   * Poll /api/equipment/
   */
  const getEquipmentImage = (name: string, type: string): string => {
    const nameLower = (name || "").toLowerCase();
    if (
      nameLower.includes("러닝") ||
      nameLower.includes("런닝") ||
      nameLower.includes("treadmill")
    )
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (
      nameLower.includes("사이클") ||
      nameLower.includes("cycle") ||
      nameLower.includes("bike")
    )
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("일립티컬") || nameLower.includes("elliptical"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("로잉") || nameLower.includes("rowing"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("벤치") || nameLower.includes("bench"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("스쿼트") || nameLower.includes("squat"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("덤벨") || nameLower.includes("dumbbell"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if (nameLower.includes("스텝") || nameLower.includes("step"))
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    if ((type || "").toLowerCase() === "cardio")
      return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
    return "https://images.unsplash.com/photo-1758957646695-ec8bce3df462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
  };

  const formatSingleEquipment = (eq: any): Equipment => {
    const imageUrl =
      eq.image_url ||
      eq.image ||
      eq.imageUrl ||
      eq.photo ||
      eq.picture_url ||
      getEquipmentImage(eq.name, eq.type);

    return {
      id: eq.id.toString(),
      name: eq.name,
      type: (eq.type || "").toLowerCase(),
      status:
        eq.status === "AVAILABLE"
          ? "available"
          : eq.status === "IN_USE"
          ? "in-use"
          : eq.status === "WAITING"
          ? "waiting"
          : "available",
      image: imageUrl,
      allocatedTime: eq.base_session_time_minutes || 30,
      waitingCount: eq.waiting_count ?? 0,
      currentUser: eq.current_user ?? undefined,
      timeRemaining: eq.time_remaining ?? undefined,
      operational_state: eq.operational_state || "NORMAL",
      nfc_tag_id: eq.nfc_tag_id ?? undefined, // NFC 태그 ID 추가
    };
  };

  const formatEquipmentData = (data: any[]): Equipment[] => {
    return (data || []).map(formatSingleEquipment);
  };

  const fetchEquipment = async () => {
    const base = (() => {
      if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
      }
      return "https://43.201.88.27";
    })();
    const access = localStorage.getItem("access_token");
    const refresh = localStorage.getItem("refresh_token");

    const doFetch = async (token: string | null) => {
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/equipment/`, { headers });
      return res;
    };

    try {
      // If there's no access token and no refresh token, skip calling protected API
      if (!access && !refresh) {
        console.warn(
          "[App] No access or refresh token present - skipping equipment fetch"
        );
        setEquipmentList([]);
        return;
      }

      setEquipmentLoading(true);
      let res = await doFetch(access);
      if (res.status === 401) {
        if (refresh) {
          // try refresh
          const rres = await fetch(`${base}/api/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          });
          if (rres.ok) {
            const rdata = await rres.json();
            if (rdata.access) {
              localStorage.setItem("access_token", rdata.access);
              res = await doFetch(rdata.access);
            }
          } else {
            // refresh failed -> logout
            handleLogout();
            setEquipmentLoading(false);
            return;
          }
        } else {
          // no refresh token -> logout
          handleLogout();
          setEquipmentLoading(false);
          return;
        }
      }

      if (!res.ok) {
        console.error("[App] Failed to fetch equipment", res.status);
        setEquipmentError("장비 정보를 불러올 수 없습니다");
        setEquipmentLoading(false);
        return;
      }

      const data = await res.json();

      // 헬퍼 함수를 사용하여 백엔드 응답을 Equipment 타입으로 변환
      const formattedEquipment = formatEquipmentData(data);

      setEquipmentList(formattedEquipment);
      setEquipmentError(null);
      setEquipmentLoading(false);
      return formattedEquipment;
    } catch (e) {
      console.error("[App] Error fetching equipment:", e);
      setEquipmentError("장비 정보를 불러오는 중 오류가 발생했습니다");
      setEquipmentLoading(false);
    }
  };

  // 통합 SSE/폴링 관리: 예약 알림 + 장비 상태를 하나의 연결로 처리
  useEffect(() => {
    // 로그인하지 않은 경우 실행하지 않음
    if (!userName) {
      console.log("👤 사용자 미로그인 - SSE 건너뜀");
      return;
    }

    let mounted = true;
    let reservationPollTimer: any = null;
    let equipmentPollTimer: any = null;
    let sseConnected = false;
    let isInitialConnection = true; // 최초 연결인지 재연결인지 구분

    // 예약 데이터 폴링 (SSE 실패 시 백업)
    const pollReservations = async () => {
      if (sseConnected) return;

      console.log("🔄 [App] 예약 데이터 폴링 중...");
      try {
        const data = await fetchReservations();
        if (!mounted || !data) return;

        // NOTIFIED 예약 찾아서 알림 표시
        const now = new Date();
        for (const r of data) {
          if (r.status === "NOTIFIED" && r.notified_at) {
            const id = String(r.id);
            if (shownNotificationsRef.current[id]) continue;

            const expiresAt = (r as any).notification_expires_at || null;
            let secondsLeft = 15;
            if (expiresAt) {
              const exp = new Date(expiresAt);
              secondsLeft = Math.max(
                0,
                Math.floor((exp.getTime() - now.getTime()) / 1000)
              );
            } else if (r.notified_at) {
              const notif = new Date(r.notified_at);
              secondsLeft = Math.max(
                0,
                Math.floor((notif.getTime() + 15000 - now.getTime()) / 1000)
              );
            }

            if (secondsLeft <= 0) continue;

            shownNotificationsRef.current[id] = true;
            setNotifications((prev) => [
              ...prev,
              {
                reservationId: id,
                equipmentName: r.equipment || r.equipmentName || "",
                expiresAt,
                secondsLeft,
              },
            ]);
          }
        }
      } catch (err) {
        // ignore poll errors
      }
    };

    // 장비 데이터 폴링 (SSE 실패 시 백업)
    const pollEquipment = async () => {
      if (sseConnected) return;

      console.log("🔄 [App] 장비 데이터 폴링 중...");
      try {
        await fetchEquipment();
      } catch (err) {
        // ignore poll errors
      }
    };

    const token = localStorage.getItem("access_token");
    const currentUser = localStorage.getItem("current_user");
    const base = getApiBase();
    let es: EventSource | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    // SSE 통합 연결
    if (token && currentUser) {
      try {
        es = new EventSource(
          `${base}/api/equipment/stream?access_token=${encodeURIComponent(
            token
          )}`
        );

        es.onopen = () => {
          // 최초 연결 시에만 로그 출력 (재연결 시 중복 로그 방지)
          if (isInitialConnection) {
            console.log("✅ [App] SSE 연결 성공 (예약 + 장비 통합)");
            isInitialConnection = false;
          } else {
            // 재연결 시 reconnectAttempts를 0으로 리셋만 하고 로그는 간소화
            if (reconnectAttempts > 0) {
              console.log("🔄 [App] SSE 재연결 성공");
            }
          }
          sseConnected = true;
          reservationSSEConnectedRef.current = true;
          equipmentSSEConnectedRef.current = true;
          reconnectAttempts = 0;

          // 폴링 타이머 정리
          if (reservationPollTimer) {
            clearInterval(reservationPollTimer);
            reservationPollTimer = null;
          }
          if (equipmentPollTimer) {
            clearInterval(equipmentPollTimer);
            equipmentPollTimer = null;
          }
        };

        const lastResRefreshRef = { value: 0 };
        const RESERVATION_REFRESH_MIN_MS = 1500; // 과도한 호출 방지

        const safeRefreshReservations = (reason: string) => {
          const nowTs = Date.now();
          if (nowTs - lastResRefreshRef.value < RESERVATION_REFRESH_MIN_MS) {
            console.log(
              `[SSE] 예약 목록 갱신 스킵 (${reason}) - throttle 보호 (${
                nowTs - lastResRefreshRef.value
              }ms < ${RESERVATION_REFRESH_MIN_MS}ms)`
            );
            return;
          }
          lastResRefreshRef.value = nowTs;
          console.log(`[SSE] 예약 목록 갱신 실행 (${reason})`);
          fetchReservations();
        };

        const handleEvent = (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data);

            // 1. 예약 알림 처리 (NOTIFIED 승격 전용)
            if (payload && payload.notified_username === userName) {
              const reservationId = payload.notified_reservation_id
                ? String(payload.notified_reservation_id)
                : "";
              const equipmentName =
                payload.equipment_name || payload.name || "기구";
              const timeoutSeconds = payload.notification_timeout_seconds
                ? Number(payload.notification_timeout_seconds)
                : Math.max(1, payload.notification_timeout ?? 15);
              const expiresAt =
                payload.notification_expires_at ||
                new Date(Date.now() + timeoutSeconds * 1000).toISOString();

              addNotification({
                reservationId,
                equipmentName,
                expiresAt,
                secondsLeft: timeoutSeconds,
              });

              // 알림 승격 직후 예약 목록을 즉시 새로 고침
              safeRefreshReservations("NOTIFIED_EVENT");
            }

            // 1-추가. payload_kind === 'reservation' 인 일반 예약 관련 SSE (취소/만료/승격 등)
            if (payload && payload.payload_kind === "reservation") {
              // 내 예약과 직접 관련된 이벤트인지 최소 확인 (user match) 후 갱신
              if (
                payload.notified_username === userName ||
                // 혹시 backend가 다른 형태로 user id를 넣을 가능성 대비
                String(payload.notified_user_id || "") ===
                  String((window as any).CURRENT_USER_ID || "")
              ) {
                safeRefreshReservations("RESERVATION_EVENT");
              } else {
                // 내 NOTIFIED가 아니더라도 queue 변동 가능 -> 현재 뷰가 예약 현황이면 갱신
                if (currentView === "reservation-status") {
                  safeRefreshReservations("RESERVATION_EVENT_QUEUE");
                }
              }
            }

            // 2. 장비 상태 업데이트 처리 (이벤트 타입 별 분기)
            if (payload) {
              // initial: 전체 목록
              if (event.type === "initial" && Array.isArray(payload)) {
                console.log("🔄 [App] initial 장비 전체 목록 수신 (replace)");
                setEquipmentList(formatEquipmentData(payload));
                // 초기 로딩 시 내 예약 포지션 계산을 위해 한번만 갱신
                if (currentView === "reservation-status") {
                  safeRefreshReservations("INITIAL_EQUIPMENT");
                }
                return;
              }

              // refresh: 서버가 강제 전체 동기화 요청 (fallback)
              if (event.type === "refresh" && Array.isArray(payload)) {
                console.log("🔄 [App] refresh 이벤트 수신 - 전체 목록 교체");
                setEquipmentList(formatEquipmentData(payload));
                if (currentView === "reservation-status") {
                  safeRefreshReservations("REFRESH_EQUIPMENT");
                }
                return;
              }

              // update/message/reservation: 개별 기구 변경
              const equipmentData = payload.equipment || payload;
              if (equipmentData && equipmentData.id) {
                console.log(
                  `🔍 [SSE Update] 기구 ${equipmentData.id} 업데이트:`,
                  {
                    id: equipmentData.id,
                    name: equipmentData.name,
                    status: equipmentData.status,
                    waiting_count: equipmentData.waiting_count,
                    event_type: event.type,
                    full_payload: equipmentData,
                  }
                );

                const formattedItem = formatSingleEquipment(equipmentData);
                console.log(`🔍 [SSE Update] 포맷된 데이터:`, formattedItem);

                setEquipmentList((prev) => {
                  const map: Record<string, Equipment> = {};
                  prev.forEach((e) => (map[e.id] = e));

                  const existing = map[formattedItem.id];
                  if (existing) {
                    console.log(`🔍 [SSE Update] 기존 상태:`, {
                      id: existing.id,
                      name: existing.name,
                      status: existing.status,
                      operational_state: existing.operational_state,
                      waitingCount: existing.waitingCount,
                    });

                    const merged: Equipment = {
                      ...existing,
                      ...formattedItem,
                      waitingCount:
                        formattedItem.waitingCount !== undefined
                          ? formattedItem.waitingCount
                          : existing.waitingCount,
                      timeRemaining:
                        formattedItem.timeRemaining !== undefined
                          ? formattedItem.timeRemaining
                          : existing.timeRemaining,
                      operational_state:
                        formattedItem.operational_state ||
                        existing.operational_state,
                    };

                    console.log(`✅ [SSE Update] 머지된 상태:`, {
                      id: merged.id,
                      name: merged.name,
                      status: merged.status,
                      operational_state: merged.operational_state,
                      waitingCount: merged.waitingCount,
                    });

                    map[formattedItem.id] = merged;
                  } else {
                    console.log(`🆕 [SSE Update] 새 기구 추가:`, formattedItem);
                    map[formattedItem.id] = formattedItem;
                  }
                  return Object.values(map);
                });

                // 🔔 queue_positions가 있으면 내 예약의 대기 순번 즉시 업데이트
                if (
                  equipmentData.queue_positions &&
                  Array.isArray(equipmentData.queue_positions)
                ) {
                  console.log(
                    `[SSE] queue_positions 수신 (equipment ${equipmentData.id}):`,
                    equipmentData.queue_positions
                  );

                  // 현재 로그인한 사용자의 user_id를 가져오기 위해 임시로 reservations에서 추출 (또는 전역 상태 사용)
                  // 여기서는 간단히 reservations에서 user 정보를 찾거나, localStorage에서 가져올 수 있음
                  setReservations((prev) => {
                    return prev.map((r) => {
                      const eqId = String(
                        r.equipment_id || r.equipmentId || ""
                      );
                      if (eqId !== String(equipmentData.id)) {
                        return r; // 다른 기구 예약은 그대로
                      }

                      // 이 기구에 대한 내 예약 - queue_positions에서 내 position 찾기
                      const myQueueEntry = equipmentData.queue_positions.find(
                        (qp: any) => String(qp.reservation_id) === String(r.id)
                      );

                      if (myQueueEntry) {
                        console.log(
                          `[SSE] 예약 ${r.id} 순번 업데이트: ${
                            r.waitingPosition || r.waiting_position
                          } → ${myQueueEntry.position}`
                        );
                        return {
                          ...r,
                          waitingPosition: myQueueEntry.position,
                          waiting_position: myQueueEntry.position,
                          waitingCount: equipmentData.waiting_count,
                          waiting_count: equipmentData.waiting_count,
                        };
                      }

                      // queue_positions에 없다면 이미 dequeue 되었거나 만료됨 - 그대로 유지 (API refresh가 제거할 것)
                      return r;
                    });
                  });
                }

                // 내 예약 중 해당 기구를 사용하는 WAITING / NOTIFIED 가 있다면 포지션/만료 변동 가능성 -> 갱신
                const hasMyReservationForEquipment = reservations.some((r) => {
                  const eqId = String(r.equipment_id || r.equipmentId || "");
                  return eqId === String(equipmentData.id);
                });
                if (
                  hasMyReservationForEquipment &&
                  currentView === "reservation-status"
                ) {
                  safeRefreshReservations("EQUIPMENT_UPDATE_AFFECTS_MY_RES");
                }
              }
            }
          } catch (err) {
            console.warn("[App] SSE 페이로드 파싱 실패:", err);
          }
        };

        // heartbeat 이벤트 핸들러 추가 (ping 수신 확인용)
        es.addEventListener("heartbeat", (event: MessageEvent) => {
          console.log(
            "💓 [SSE] heartbeat 수신:",
            new Date().toLocaleTimeString()
          );
        });

        es.addEventListener("message", handleEvent);
        es.addEventListener("update", handleEvent);
        es.addEventListener("initial", handleEvent);
        es.addEventListener("refresh", handleEvent);
        es.addEventListener("reservation", handleEvent);

        es.onerror = (err) => {
          console.log(`⚠️ [SSE] onerror 발생 - readyState: ${es?.readyState}`);

          // 연결된 상태면 일시적 오류 - 무시
          if (es && es.readyState === EventSource.OPEN) {
            console.log("ℹ️ [SSE] OPEN 상태 - 일시적 오류, 무시");
            return;
          }

          // CONNECTING 상태면 브라우저가 자동 재연결 중 - 무시
          if (es && es.readyState === EventSource.CONNECTING) {
            console.log("ℹ️ [SSE] CONNECTING 상태 - 브라우저 자동 재연결 중");
            return;
          }

          // CLOSED 상태 - 실제 연결 끊김
          if (es && es.readyState === EventSource.CLOSED) {
            reconnectAttempts++;
            console.log(
              `❌ [App] SSE 완전히 끊김 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
            );

            sseConnected = false;
            reservationSSEConnectedRef.current = false;
            equipmentSSEConnectedRef.current = false;

            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              console.log("❌ [App] SSE 재시도 한도 초과 - 폴링 모드로 전환");
              es?.close();

              if (!reservationPollTimer && mounted) {
                console.log("🔄 [App] 예약 폴링 시작 (10초 간격)");
                pollReservations();
                reservationPollTimer = setInterval(pollReservations, 10000);
              }

              if (!equipmentPollTimer && mounted) {
                console.log("🔄 [App] 장비 폴링 시작 (10초 간격)");
                pollEquipment();
                equipmentPollTimer = setInterval(pollEquipment, 10000);
              }
            }
          }
        };
      } catch (err) {
        console.warn("[App] SSE 연결 실패:", err);
        sseConnected = false;
        reservationSSEConnectedRef.current = false;
        equipmentSSEConnectedRef.current = false;

        // 폴링 시작
        pollReservations();
        reservationPollTimer = setInterval(pollReservations, 10000);
        pollEquipment();
        equipmentPollTimer = setInterval(pollEquipment, 10000);
      }
    }

    return () => {
      mounted = false;
      reservationSSEConnectedRef.current = false;
      equipmentSSEConnectedRef.current = false;
      if (reservationPollTimer) clearInterval(reservationPollTimer);
      if (equipmentPollTimer) clearInterval(equipmentPollTimer);
      es?.close();
    };
  }, [userName]);

  // decrement countdowns for notifications
  useEffect(() => {
    if (notifications.length === 0) return;
    const iv = setInterval(() => {
      setNotifications((prev) =>
        prev
          .map((n) => ({ ...n, secondsLeft: n.secondsLeft - 1 }))
          .filter((n) => n.secondsLeft > 0)
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [notifications.length]);

  // When entering reservation-status view, load reservations from server
  // SSE 연결 시에는 초기 로딩만, 미연결 시에는 주기적 폴링
  useEffect(() => {
    // 로그인하지 않았으면 예약 현황 조회 안 함
    if (!userName) {
      return;
    }

    if (currentView === "reservation-status") {
      console.log("📋 [App] 예약 현황 뷰 진입 - 초기 데이터 로딩");
      fetchReservations();

      // SSE가 연결되지 않은 경우에만 폴링 시작
      let pollTimer: any = null;
      const checkSSEAndPoll = () => {
        // SSE 연결 상태 확인
        if (reservationSSEConnectedRef.current) {
          console.log("⏸️ [App] 예약 SSE 연결됨 - 현황 폴링 스킵");
          return;
        }

        console.log("🔄 [App] 예약 현황 폴링 실행 (SSE 미연결)");
        fetchReservations();
      };

      // 10초 후부터 10초 간격으로 폴링 (수동 체크 시만)
      const timeoutId = setTimeout(() => {
        console.log("🔄 [App] 예약 현황 폴링 시작 확인 중...");
        checkSSEAndPoll();
        pollTimer = setInterval(checkSSEAndPoll, 10000);
      }, 10000);

      return () => {
        clearTimeout(timeoutId);
        if (pollTimer) {
          console.log("🛑 [App] 예약 현황 폴링 중지");
          clearInterval(pollTimer);
        }
      };
    }
  }, [currentView, userName]);

  // NFC 스캔 활성화/비활성화 관리
  useEffect(() => {
    if (
      currentView === "equipment-list" ||
      currentView === "reservation-status"
    ) {
      setNfcEnabled(true);
      console.log("✅ NFC 스캔 활성화 (현재 뷰:", currentView, ")");
    } else {
      setNfcEnabled(false);
      console.log("🚫 NFC 스캔 비활성화");
    }
  }, [currentView]);

  // equipment-list 탭 선택 시 항상 API로 최신 데이터 로드
  useEffect(() => {
    if (currentView === "equipment-list" && userName) {
      console.log(
        "🔄 [App] equipment-list 탭 진입 - API로 최신 equipment 데이터 로드"
      );
      fetchEquipment();
    }
  }, [currentView, userName]);

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

    // 줄서기 예약 완료 시 바로 예약 현황으로 이동
    if (status === "waiting") {
      setCurrentView("reservation-status");
    }
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
      case "ai-recommendation":
        setCurrentView("equipment-list");
        break;
      case "reservation-status":
        setReservationTab("normal"); // 뒤로 가기 시 기본 탭으로 리셋
        setCurrentView("equipment-list");
        break;
      case "my-page":
        setCurrentView("equipment-list");
        break;
      case "admin-dashboard":
        setCurrentView("mode-selection");
        setSelectedMode(null);
        break;
      case "workout-timer":
        // 바로 시작한 경우 목록으로 돌아간다
        setCurrentView("equipment-list");
        setSelectedEquipment(null);
        setWorkoutStartTime(null);
        setDirectWorkout(false);
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
    // 예약 현황으로 이동할 때는 normal 탭으로 리셋
    if (view === "reservation-status") {
      setReservationTab("normal");
    }
    setCurrentView(view as AppView);
  };

  useEffect(() => {
    if (currentView === "equipment-list") {
      console.log("Rendering EquipmentList with selectedGym:", selectedGym);
    }
    if (currentView === "my-page") {
      console.log("Rendering MyPage with selectedGym:", selectedGym);
    }
  }, [currentView, selectedGym]);

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
        return selectedGym ? (
          <EquipmentList
            gymName={selectedGym.gym_name || ""}
            onBack={navigateBack}
            onEquipmentSelect={handleEquipmentSelect}
            equipment={equipmentList}
            loading={equipmentLoading}
            error={equipmentError}
            nfcEnabled={nfcEnabled}
            onNFCTagDetected={handleNFCTagDetected}
          />
        ) : null;

      case "ai-recommendation":
        return (
          <AIRoutineRecommendation
            onBack={navigateBack}
            onReservationComplete={handleReservationComplete}
            onJoinQueue={handleAiQueueJoin}
          />
        );

      case "admin-dashboard":
        return (
          <AdminDashboard
            onBack={navigateBack}
            gymName={selectedGym?.gym_name}
            onLogout={handleLogout}
          />
        );

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
            onCancelReservation={handleCancelReservation}
            onJoinQueue={handleAiQueueJoin}
            defaultTab={reservationTab}
            equipmentList={equipmentList}
            onMarkAiUsed={handleAiMarkUsed}
            onStartImmediate={handleAiStartImmediate}
            nfcEnabled={nfcEnabled}
            onNFCTagDetected={handleNFCTagDetected}
            onCreateNewRoutine={() => setCurrentView("ai-recommendation")}
          />
        );

      case "my-page":
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
      {/* Notification toasts for NOTIFIED reservations */}
      <div className="fixed top-4 right-4 z-50 space-y-3">
        {notifications.map((n) => {
          // 줄서기 성공 알림일 경우 다른 UI 표시
          if (n.type === "queue-success") {
            return (
              <div
                key={n.reservationId}
                className="bg-green-600/95 text-white rounded-lg p-4 shadow-lg w-80 animate-fade-in"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎉</span>
                  <div className="flex-1">
                    <div className="font-semibold text-base">
                      기구 예약이 완료되었습니다!
                    </div>
                    <div className="text-sm text-gray-100 mt-1">
                      예약 내역은 기구 줄서기 조회 창을 이용해주세요
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // 기존 NOTIFIED 예약 알림
          return (
            <div
              key={n.reservationId}
              className="bg-blue-900/90 text-white rounded-lg p-3 shadow-lg w-80"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">
                    {n.equipmentName || "기구"} - 지금 차례입니다
                  </div>
                  <div className="text-sm text-gray-200">
                    15초 내에 태깅하세요
                  </div>
                </div>
                <div className="text-2xl font-mono ml-2">{n.secondsLeft}s</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-semibold"
                  onClick={async () => {
                    // ✅ 개선: 단순 화면 전환 대신 서버에 세션 시작 요청 후 성공 시 상태 업데이트
                    try {
                      const token = localStorage.getItem("access_token");
                      if (!token) {
                        alert("로그인이 필요합니다.");
                        return;
                      }
                      const reservation = reservations.find(
                        (r) => r.id === n.reservationId
                      );
                      if (!reservation) {
                        console.warn(
                          "해당 알림에 대응하는 예약을 찾을 수 없습니다."
                        );
                        return;
                      }
                      const equipmentIdRaw =
                        reservation.equipment_id || reservation.equipmentId;
                      if (!equipmentIdRaw) {
                        console.warn("예약 객체에 equipment_id가 없습니다.");
                        return;
                      }
                      const equipmentId = parseInt(String(equipmentIdRaw), 10);
                      const apiBase = getApiBase();

                      const res = await fetch(
                        `${apiBase}/api/workouts/start/`,
                        {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ equipment_id: equipmentId }),
                        }
                      );

                      if (!res.ok) {
                        const errorText = await res.text().catch(() => "");
                        console.error(
                          "세션 시작 API 실패:",
                          res.status,
                          errorText
                        );
                        alert(
                          "세션 시작에 실패했습니다. 다시 시도하거나 관리자에게 문의하세요."
                        );
                        return;
                      }

                      const sessionData = await res.json();
                      console.log("[ToastStart] 세션 시작 성공:", sessionData);

                      // 선택된 기구 설정 (장비 리스트에서 찾기)
                      const equipment = equipmentList.find(
                        (eq) => String(eq.id) === String(equipmentId)
                      );
                      if (equipment) {
                        setSelectedEquipment(equipment);
                      }
                      setWorkoutStartTime(new Date());
                      setCurrentView("workout-timer");

                      // 알림 제거
                      setNotifications((prev) =>
                        prev.filter((x) => x.reservationId !== n.reservationId)
                      );

                      // 예약 목록/장비 상태 새로고침 (큐 반영)
                      try {
                        fetchReservations();
                        fetchEquipment();
                      } catch (e) {
                        console.warn("세션 시작 후 데이터 새로고침 실패", e);
                      }
                    } catch (err) {
                      console.error("알림 시작 처리 중 오류", err);
                      alert("세션 시작 처리 중 오류가 발생했습니다.");
                    }
                  }}
                >
                  시작
                </button>
                <button
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold"
                  onClick={async () => {
                    // 예약 거절 (leave-queue API 사용)
                    try {
                      const token = localStorage.getItem("access_token");
                      if (!token) {
                        alert("로그인이 필요합니다.");
                        return;
                      }

                      const apiBase = getApiBase();

                      const response = await fetch(
                        `${apiBase}/api/workouts/leave-queue/`,
                        {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            reservation_id: n.reservationId,
                          }),
                        }
                      );

                      if (response.ok || response.status === 404) {
                        console.log("✅ 예약 거절 (탈퇴) 성공");

                        // 알림 제거
                        setNotifications((prev) =>
                          prev.filter(
                            (x) => x.reservationId !== n.reservationId
                          )
                        );

                        // 예약 목록/장비 상태 갱신
                        try {
                          fetchReservations();
                          fetchEquipment();
                        } catch (e) {
                          console.warn("거절 후 데이터 새로고침 실패", e);
                        }
                      } else {
                        const errorText = await response.text().catch(() => "");
                        console.error(
                          "예약 거절 실패:",
                          response.status,
                          errorText
                        );
                        alert("예약 거절에 실패했습니다.");
                      }
                    } catch (error) {
                      console.error("예약 거절 중 오류:", error);
                      alert("예약 거절 중 오류가 발생했습니다.");
                    }
                  }}
                >
                  거절
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
