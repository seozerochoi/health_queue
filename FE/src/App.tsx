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
  const [notifications, setNotifications] = useState<
    Array<{
      reservationId: string;
      equipmentName: string;
      expiresAt: string | null; // ISO
      secondsLeft: number;
    }>
  >([]);
  const shownNotificationsRef = useRef<Record<string, boolean>>({});
  const [tempUserId, setTempUserId] = useState<string>("");
  const [tempPassword, setTempPassword] = useState<string>("");
  // 사용자가 NFC 과정을 거치지 않고 바로 타이머로 진입했는지 여부
  const [directWorkout, setDirectWorkout] = useState<boolean>(false);

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
            join_date: new Date().toISOString().split("T")[0],
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
    const name = additionalData?.name || userId;
    const role = additionalData?.role || "user";

    console.log("받은 role:", additionalData?.role);
    console.log("최종 설정할 role:", role);

    setUserName(name);
    setUserNickname(name);
    setUserRole(role);

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
            // 404인 경우 기본 헬스장 설정 (첫 번째 mock gym)
            const defaultGym = {
              id: 1,
              user: userId,
              gym_name: "헬스장 예제",
              gym_address: "서울시 강남구 테헤란로 123",
              status: "운영중",
              join_date: new Date().toISOString().split("T")[0],
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

    // 화면 전환 - role에 따라 다른 페이지로 이동
    console.log("============ 화면 전환 시작 ============");
    console.log("현재 role 값:", role);
    console.log("role === 'admin' ?", role === "admin");
    console.log("typeof role:", typeof role);

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
        setCurrentView("workout-timer");
      } catch (error) {
        console.error("세션 시작 중 오류:", error);
        alert("운동 세션 시작 중 오류가 발생했습니다.");
      }
      return;
    }

    // 그 외(in-use, waiting 등)는 기존 예약 흐름 유지
    setDirectWorkout(false);
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
          if (typeof process !== "undefined" && process?.env?.REACT_APP_API_BASE)
            return process.env.REACT_APP_API_BASE;
        } catch (e) {
          /* ignore */
        }
        return "http://43.201.88.27";
      })();

      if (token) {
        try {
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
      const mapped: Reservation[] = (data || []).map((r: any) => {
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
          notification_timeout_seconds: r.notification_timeout_seconds ?? null,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        };
      });

      setReservations(mapped);
      return mapped;
    } catch (e) {
      console.error("Error fetching reservations:", e);
    }
  };

  // Poll reservations in background to detect NOTIFIED reservations and show popup
  useEffect(() => {
    let mounted = true;
    let timer: any = null;

    const poll = async () => {
      try {
        const data = await fetchReservations();
        if (!mounted || !data) return;
        // find notified reservations
        const now = new Date();
        for (const r of data) {
          if (r.status === "NOTIFIED" && r.notified_at) {
            const id = String(r.id);
            if (shownNotificationsRef.current[id]) continue; // already shown

            // compute expiresAt from serializer if provided
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

            if (secondsLeft <= 0) continue; // already expired

            // add notification
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

    // start immediately and then interval
    poll();
    timer = setInterval(poll, 3000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

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
  useEffect(() => {
    if (currentView === "reservation-status") {
      fetchReservations();
    }
  }, [currentView]);

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
            <div className="mt-2 flex justify-end">
              <button
                className="bg-white text-blue-900 px-3 py-1 rounded"
                onClick={() => {
                  // navigate to reservation status page
                  setCurrentView("reservation-status");
                  // remove this notification
                  setNotifications((prev) =>
                    prev.filter((x) => x.reservationId !== n.reservationId)
                  );
                }}
              >
                확인
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
