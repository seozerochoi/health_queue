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
import { NFCTagging } from "./components/NFCTagging";
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
    return "http://43.201.88.27";
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

  const handleSignUpStep1Complete = (userId: string, password: string) => {
    setTempUserId(userId);
    setTempPassword(password);
    setCurrentView("signup-user-info");
  };

  const handleSignUpStep2Complete = async (
    name: string,
    role: "user" | "admin"
  ) => {
    setUserRole(role);
    // nickname field removed; use name as display nickname to keep downstream components stable
    setUserNickname(name);
    setUserName(name);

    // NOTE: signup components are responsible for calling the backend.
    // App should NOT keep a local registeredUsers list. We keep the local
    // name/role state for routing after signup completes.

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

        const membershipResponse = await fetch(
          "http://43.201.88.27/api/gyms/memberships/",
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
        const res = await fetch("http://43.201.88.27/api/gyms/my-gym/", {
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
            console.log("기본 헬스장(스마트짐) 설정 (404 fallback):", defaultGym);
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

        // 백엔드에 세션 시작 요청
        const response = await fetch(
          "http://43.201.88.27/api/workouts/start/",
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
          console.error("세션 시작 실패:", response.status, errorText);
          alert("운동 세션 시작에 실패했습니다.");
          return;
        }

        const sessionData = await response.json();
        console.log("세션 시작 성공:", sessionData);

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
        "http://43.201.88.27/api/workouts/join-queue/",
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
        return "http://43.201.88.27";
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

    setCurrentView("equipment-list");
    setSelectedEquipment(null);
    setWorkoutStartTime(null);
    setDirectWorkout(false);
  };

  const handleReservationComplete = (newReservations: Reservation[]) => {
    // AI 루틴에서 생성된 예약을 추가하고 즉시 예약 현황 화면으로 이동
    setReservations((prev) => [...prev, ...newReservations]);
    setCurrentView("reservation-status");
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
        return "http://43.201.88.27";
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
      return "http://43.201.88.27";
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
      // EXPIRED 상태인 예약은 제외하고 WAITING, NOTIFIED, COMPLETED만 표시
      const mapped: Reservation[] = (data || [])
        .filter((r: any) => r.status !== "EXPIRED")
        .map((r: any) => {
          const status =
            r.status === "NOTIFIED" || r.status === "COMPLETED"
              ? "confirmed"
              : "waiting";
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

      setReservations(mapped);
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
      return "http://43.201.88.27";
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

        const handleEvent = (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data);

            // 1. 예약 알림 처리
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

              // 예약 목록도 갱신
              fetchReservations();
            }

            // 2. 장비 상태 업데이트 처리 (이벤트 타입 별 분기)
            if (payload) {
              // initial: 전체 목록
              if (event.type === "initial" && Array.isArray(payload)) {
                console.log("🔄 [App] initial 장비 전체 목록 수신 (replace)");
                setEquipmentList(formatEquipmentData(payload));
                return;
              }

              // refresh: 서버가 강제 전체 동기화 요청 (fallback)
              if (event.type === "refresh" && Array.isArray(payload)) {
                console.log("🔄 [App] refresh 이벤트 수신 - 전체 목록 교체");
                setEquipmentList(formatEquipmentData(payload));
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
                      waitingCount: existing.waitingCount,
                    });

                    // 머지: 기존 필드 유지 + 신규값 우선 (timeRemaining / waitingCount 등 업데이트)
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
                    };

                    console.log(`✅ [SSE Update] 머지된 상태:`, {
                      id: merged.id,
                      name: merged.name,
                      status: merged.status,
                      waitingCount: merged.waitingCount,
                    });

                    map[formattedItem.id] = merged;
                  } else {
                    console.log(`🆕 [SSE Update] 새 기구 추가:`, formattedItem);
                    map[formattedItem.id] = formattedItem;
                  }
                  return Object.values(map);
                });
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
        setCurrentView("equipment-list");
        break;
      case "workout-timer":
        // 바로 시작한 경우엔 NFC 화면이 없으므로 목록으로 돌아간다
        if (directWorkout) {
          setCurrentView("equipment-list");
          setSelectedEquipment(null);
          setWorkoutStartTime(null);
          setDirectWorkout(false);
        } else {
          setCurrentView("nfc-tagging");
        }
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
          <AdminDashboard
            onBack={navigateBack}
            gymName={selectedGym?.gym_name}
            onLogout={handleLogout}
          />
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
            onCancelReservation={handleCancelReservation}
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
        {notifications.map((n) => (
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
                  // 예약을 찾아서 해당 기구로 workout-timer 시작
                  const reservation = reservations.find(
                    (r) => r.id === n.reservationId
                  );
                  if (reservation) {
                    const equipmentId = String(
                      reservation.equipment_id || reservation.equipmentId || ""
                    );
                    const equipment = equipmentList.find(
                      (eq) => String(eq.id) === equipmentId
                    );

                    if (equipment) {
                      // 기구 선택 및 운동 시작
                      setSelectedEquipment(equipment);
                      setWorkoutStartTime(new Date());
                      setCurrentView("workout-timer");

                      // 알림 제거
                      setNotifications((prev) =>
                        prev.filter((x) => x.reservationId !== n.reservationId)
                      );
                    }
                  }
                }}
              >
                시작
              </button>
              <button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold"
                onClick={async () => {
                  // 예약 취소 (dequeue)
                  try {
                    const token = localStorage.getItem("access_token");
                    if (token) {
                      const base = (() => {
                        try {
                          const vite = (import.meta as any)?.env?.VITE_API_BASE;
                          if (vite) return vite;
                        } catch (e) {}
                        return "http://43.201.88.27";
                      })();

                      const response = await fetch(
                        `${base}/api/reservations/${n.reservationId}/`,
                        {
                          method: "DELETE",
                          headers: {
                            Authorization: `Bearer ${token}`,
                          },
                          credentials: "include",
                        }
                      );

                      if (response.ok || response.status === 404) {
                        console.log("✅ 예약 거절 (취소) 성공");
                        // 예약 목록 갱신
                        fetchReservations();
                      } else {
                        console.error("예약 취소 실패:", response.status);
                      }
                    }
                  } catch (error) {
                    console.error("예약 취소 중 오류:", error);
                  }

                  // 알림 제거
                  setNotifications((prev) =>
                    prev.filter((x) => x.reservationId !== n.reservationId)
                  );
                }}
              >
                거절
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
