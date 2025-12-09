// 아이콘 최소화 요청: 불필요 아이콘 제거
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useEffect, useState, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Camera } from "lucide-react";

interface MyPageProps {
  onBack: () => void;
  onLogout: () => void;
  userName?: string;
  userNickname?: string;
  userGym?: string;
}

interface ActivityDayData {
  total_sessions: number;
  total_minutes: number;
  equipment: Array<{
    id: number;
    name: string;
    category: string;
    sessions: Array<{
      session_id: number;
      start_time: string;
      end_time: string;
      duration_minutes: number;
      session_type: string;
    }>;
  }>;
}

interface ActivityLogData {
  [date: string]: ActivityDayData;
}

interface AIMotivation {
  message: string;
  analysis: {
    weight_change: {
      before: number;
      after: number;
      change: number;
      change_percent: number;
    } | null;
    muscle_change: {
      before: number;
      after: number;
      change: number;
      change_percent: number;
    } | null;
    fat_change: {
      before: number;
      after: number;
      change: number;
      change_percent: number;
    } | null;
    fat_percent_change: {
      before: number;
      after: number;
      change: number;
      change_percent: number;
    } | null;
    comparison_period: string;
    parts_improvement: string[];
    parts_decline: string[];
  } | null;
}

export function MyPage({
  onBack,
  onLogout,
  userName,
  userNickname,
  userGym,
}: MyPageProps) {
  // 디버깅: props 확인
  console.log("MyPage props:", { userName, userNickname, userGym });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [exerciseGoal, setExerciseGoal] = useState<string>("");
  
  // AI 트레이너 응원 메시지
  const [motivation, setMotivation] = useState<AIMotivation | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(false);
  
  // 운동 로그 달력
  const [activityLog, setActivityLog] = useState<ActivityLogData>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  
  // 신체 데이터 편집
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);

  // 공통: 토큰 만료 시 자동 갱신 후 재시도하는 fetch 래퍼
  const fetchWithAuth = async (
    url: string,
    options: RequestInit = {},
    retry: boolean = true
  ): Promise<Response> => {
    const access = localStorage.getItem("access_token");
    // If body is FormData, do not set Content-Type (browser will set multipart boundary)
    const isForm = options.body instanceof FormData;
    const headers: HeadersInit = {
      ...(options.headers || {}),
      Authorization: `Bearer ${access}`,
    } as HeadersInit;
    if (!isForm) headers["Content-Type"] = "application/json";

    let res = await fetch(url, { ...options, headers });
    if (res.status === 401 && retry) {
      try {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) throw new Error("No refresh token");

        const refreshRes = await fetch(
          "https://43.201.88.27/api/token/refresh/",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          }
        );

        if (!refreshRes.ok) throw new Error("Refresh failed");
        const refreshData = await refreshRes.json();
        if (refreshData?.access) {
          localStorage.setItem("access_token", refreshData.access);
        }

        const newHeaders: HeadersInit = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshData.access}`,
        } as HeadersInit;
        res = await fetch(url, { ...options, headers: newHeaders });
      } catch (e) {
        // 새 토큰 발급 실패 → 세션 만료 처리
        alert("세션이 만료되어 로그아웃됩니다. 다시 로그인해주세요.");
        onLogout();
      }
    }
    return res;
  };

  // AI 트레이너 응원 메시지 조회
  const loadMotivation = async () => {
    try {
      setMotivationLoading(true);
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/users/motivation/",
        { method: "GET" }
      );
      if (!res.ok) {
        console.warn("Failed to load motivation:", res.status);
        return;
      }
      const data = await res.json();
      setMotivation(data);
    } catch (e) {
      console.error("Failed to load motivation:", e);
    } finally {
      setMotivationLoading(false);
    }
  };

  // 운동 로그 조회
  const loadActivityLog = async () => {
    try {
      setActivityLoading(true);
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/workouts/activity-log/",
        { method: "GET" }
      );
      if (!res.ok) {
        console.warn("Failed to load activity log:", res.status);
        return;
      }
      const data = await res.json();
      setActivityLog(data.activity || {});
    } catch (e) {
      console.error("Failed to load activity log:", e);
    } finally {
      setActivityLoading(false);
    }
  };

  // 신체 프로필 데이터 저장
  const saveProfileData = async () => {
    if (!profileData) return;
    try {
      setSaving(true);
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/users/profile/",
        {
          method: "PATCH",
          body: JSON.stringify(profileData),
        }
      );
      if (!res.ok) {
        alert("프로필 저장 실패: " + res.status);
        return;
      }
      alert("신체 데이터가 저장되었습니다.");
      setIsEditingProfile(false);
    } finally {
      setSaving(false);
    }
  };

  // 인바디 캡쳐 / 크롭(자르기) / 업로드
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [serverImageUrl, setServerImageUrl] = useState<string | null>(null);
  const [recordMeta, setRecordMeta] = useState<{
    id: number;
    created_at: string;
  } | null>(null);
  const [latestRecord, setLatestRecord] = useState<{
    image_url: string;
    parsed: any;
    created_at: string;
  } | null>(null);

  const onSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setShowCrop(true);
    // reset previous
    setParsedResult(null);
  };

  const onCropComplete = useCallback((_: any, pixels: any) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // helper: create image element
  const createImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => resolve(img));
      img.addEventListener("error", (e) => reject(e));
      img.setAttribute("crossOrigin", "anonymous");
      img.src = url;
    });

  // helper: get cropped image blob from source, cropped pixels and rotation
  async function getCroppedImg(imageSrc: string, pixelCrop: any, rotation = 0) {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    // draw the rotated/cropped image portion
    // simple approach: draw full image then extract crop
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = image.width;
    tmpCanvas.height = image.height;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (!tmpCtx) throw new Error("No tmp canvas context");
    tmpCtx.save();
    // apply rotation around center
    tmpCtx.translate(image.width / 2, image.height / 2);
    tmpCtx.rotate((rotation * Math.PI) / 180);
    tmpCtx.drawImage(image, -image.width / 2, -image.height / 2);
    tmpCtx.restore();

    const data = tmpCtx.getImageData(
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height
    );
    ctx.putImageData(data, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    });
  }

  const confirmCropAndUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    try {
      setUploading(true);
      setAnalyzeError(null);
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      if (!blob) throw new Error("Failed to crop image");
      setLastBlob(blob);

      // preview
      const previewUrl = URL.createObjectURL(blob);
      setPreviewSrc(previewUrl);
      setShowCrop(false);

      // upload to BE analyze endpoint
      const form = new FormData();
      form.append("image", blob, "inbody.jpg");
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/inbody/analyze/",
        {
          method: "POST",
          body: form,
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        setAnalyzeError(`분석 실패: ${res.status} ${txt}`);
        return;
      }
      const data = await res.json();
      // prefer server-parsed values, fall back to heuristic parse of raw_lines
      const serverParsed = data.parsed || null;
      // raw_lines from backend may be array of objects: {text,type,confidence}
      const serverLinesRaw: any[] = data.raw_lines || [];
      const serverLines: string[] = serverLinesRaw.map((l: any) =>
        typeof l === "string"
          ? l
          : l && typeof l.text === "string"
          ? l.text
          : ""
      );
      const rec = data.record || null;
      if (serverParsed && Object.keys(serverParsed).length > 0) {
        setParsedResult(serverParsed);
      } else if (serverLines.length > 0) {
        setParsedResult(parseFromLines(serverLines));
      } else {
        setParsedResult({});
      }
      setRawLines(serverLines);
      if (rec) {
        setServerImageUrl(rec.image_url || null);
        if (rec.id != null && rec.created_at)
          setRecordMeta({ id: rec.id, created_at: rec.created_at });
      }
    } catch (e) {
      console.error(e);
      setAnalyzeError("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    } finally {
      setUploading(false);
    }
  };

  const retryAnalyze = async () => {
    if (!lastBlob) return;
    try {
      setUploading(true);
      setAnalyzeError(null);
      const form = new FormData();
      form.append("image", lastBlob, "inbody.jpg");
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/inbody/analyze/",
        { method: "POST", body: form }
      );
      if (!res.ok) {
        const txt = await res.text();
        setAnalyzeError(`분석 실패: ${res.status} ${txt}`);
        return;
      }
      const data = await res.json();
      const serverParsed = data.parsed || null;
      const serverLinesRaw: any[] = data.raw_lines || [];
      const serverLines: string[] = serverLinesRaw.map((l: any) =>
        typeof l === "string"
          ? l
          : l && typeof l.text === "string"
          ? l.text
          : ""
      );
      const rec = data.record || null;
      setParsedResult(
        serverParsed || (serverLines.length ? parseFromLines(serverLines) : {})
      );
      setRawLines(serverLines);
      if (rec) {
        setServerImageUrl(rec.image_url || null);
        if (rec.id != null && rec.created_at)
          setRecordMeta({ id: rec.id, created_at: rec.created_at });
      }
    } catch (e) {
      console.error(e);
      setAnalyzeError("재시도 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  // Heuristic parser for OCR raw lines -> numeric fields
  const parseFromLines = (lines: string[]) => {
    const out: any = {};
    const n = (s: string) => {
      const m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
      return m ? parseFloat(m[1]) : null;
    };
    for (const line of lines) {
      const l = line.toLowerCase();
      if (l.includes("weight") || l.includes("kg") || /체중/.test(l)) {
        const v = n(line);
        if (v != null) out.weight_kg = v;
      }
      if (l.includes("fat") || l.includes("body fat") || /체지방/.test(l)) {
        const v = n(line);
        if (v != null) out.body_fat_percentage = v;
      }
      if (l.includes("skeletal") || l.includes("muscle") || /골격근/.test(l)) {
        const v = n(line);
        if (v != null) out.skeletal_muscle_mass_kg = v;
      }
      if (l.includes("bmi")) {
        const v = n(line);
        if (v != null) out.bmi = v;
      }
    }
    return out;
  };

  const applyParsedToProfile = async () => {
    if (!parsedResult) return;
    const body: any = {};

    // 기본 필드들
    if (parsedResult.gender != null) body.gender = parsedResult.gender;
    if (parsedResult.age != null) body.age = parsedResult.age;
    if (parsedResult.height_cm != null) body.height_cm = parsedResult.height_cm;
    if (parsedResult.weight_kg != null) body.weight_kg = parsedResult.weight_kg;
    if (parsedResult.inbody_score != null)
      body.inbody_score = parsedResult.inbody_score;
    if (parsedResult.skeletal_muscle_mass_kg != null)
      body.skeletal_muscle_mass_kg = parsedResult.skeletal_muscle_mass_kg;
    if (parsedResult.body_fat_mass_kg != null)
      body.body_fat_mass_kg = parsedResult.body_fat_mass_kg;
    if (parsedResult.body_fat_percentage != null)
      body.body_fat_percentage = parsedResult.body_fat_percentage;
    if (parsedResult.bmi != null) body.bmi = parsedResult.bmi;

    // 세그멘탈 근육량 필드들
    if (parsedResult.segment_right_arm_kg != null)
      body.segment_right_arm_kg = parsedResult.segment_right_arm_kg;
    if (parsedResult.segment_left_arm_kg != null)
      body.segment_left_arm_kg = parsedResult.segment_left_arm_kg;
    if (parsedResult.segment_trunk_kg != null)
      body.segment_trunk_kg = parsedResult.segment_trunk_kg;
    if (parsedResult.segment_right_leg_kg != null)
      body.segment_right_leg_kg = parsedResult.segment_right_leg_kg;
    if (parsedResult.segment_left_leg_kg != null)
      body.segment_left_leg_kg = parsedResult.segment_left_leg_kg;

    try {
      setSaving(true);
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/users/profile/",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        alert("프로필 저장 실패: " + res.status + "\n" + txt);
        return;
      }
      alert("분석 결과가 프로필에 저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 프로필 로드
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth(
          "https://43.201.88.27/api/users/profile/",
          { method: "GET" }
        );
        if (!res.ok) return;
        const data = await res.json();
        setExerciseGoal(data.exercise_goal || "");
        setProfileData(data);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
    loadLatestInbody();
    loadMotivation();
    // 모달이 열릴 때만 로드하도록 변경
  }, []);
  
  const loadLatestInbody = async () => {
    try {
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/inbody/records/latest/",
        { method: "GET" }
      );
      if (res.status === 204) return; // no content
      if (!res.ok) return;
      const data = await res.json();
      if (data?.image_url) {
        setLatestRecord({
          image_url: data.image_url,
          parsed: data.parsed || {},
          created_at: data.created_at,
        });
      }
    } catch (e) {
      console.warn("Failed to load latest inbody record", e);
    }
  };

  const applyParsedToProfileFrom = async (parsed: any) => {
    if (!parsed) return;
    const body: any = {};

    // 기본 필드들
    if (parsed.gender != null) body.gender = parsed.gender;
    if (parsed.age != null) body.age = parsed.age;
    if (parsed.height_cm != null) body.height_cm = parsed.height_cm;
    if (parsed.weight_kg != null) body.weight_kg = parsed.weight_kg;
    if (parsed.inbody_score != null) body.inbody_score = parsed.inbody_score;
    if (parsed.skeletal_muscle_mass_kg != null)
      body.skeletal_muscle_mass_kg = parsed.skeletal_muscle_mass_kg;
    if (parsed.body_fat_mass_kg != null)
      body.body_fat_mass_kg = parsed.body_fat_mass_kg;
    if (parsed.body_fat_percentage != null)
      body.body_fat_percentage = parsed.body_fat_percentage;
    if (parsed.bmi != null) body.bmi = parsed.bmi;

    // 세그멘탈 근육량 필드들
    if (parsed.segment_right_arm_percent != null)
      body.segment_right_arm_percent = parsed.segment_right_arm_percent;
    if (parsed.segment_left_arm_percent != null)
      body.segment_left_arm_percent = parsed.segment_left_arm_percent;
    if (parsed.segment_trunk_percent != null)
      body.segment_trunk_percent = parsed.segment_trunk_percent;
    if (parsed.segment_right_leg_percent != null)
      body.segment_right_leg_percent = parsed.segment_right_leg_percent;
    if (parsed.segment_left_leg_percent != null)
      body.segment_left_leg_percent = parsed.segment_left_leg_percent;

    try {
      setSaving(true);
      const res = await fetchWithAuth(
        "https://43.201.88.27/api/users/profile/",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        alert("프로필 저장 실패: " + res.status + "\n" + txt);
        return;
      }
      alert("분석 결과가 프로필에 저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      const body: any = {
        exercise_goal: exerciseGoal || null,
      };

      const res = await fetchWithAuth(
        "https://43.201.88.27/api/users/profile/",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("프로필 저장 실패:", res.status, text);
        alert("저장에 실패했습니다.");
        return;
      }
      alert("마이페이지 정보가 저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 헤더: 중앙 제목, 우측 로그아웃 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">마이페이지</h1>
          <Button
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300 active:bg-red-800/30 active:text-red-200 active:border-red-500 transition-transform duration-150 ease-out active:scale-105"
            onClick={onLogout}
          >
            로그아웃
          </Button>
        </div>

        {/* 프로필 카드 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                  {userNickname
                    ? userNickname[0].toUpperCase()
                    : userName
                    ? userName[0].toUpperCase()
                    : "U"}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-semibold text-foreground">
                    {userNickname || userName || "사용자"}
                  </div>
                  <div className="text-sm text-muted-foreground">스마트짐</div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  setShowActivityModal(true);
                  // 모달 열 때 바로 데이터 로드
                  if (Object.keys(activityLog).length === 0) {
                    await loadActivityLog();
                  }
                }}
                className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white"
              >
                운동 기록 조회
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI 트레이너 응원 메시지 */}
        {motivation && motivation.message && (
          <Card className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-blue-700/50">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">💪</div>
                  <div className="flex-1">
                    <p className="text-foreground font-medium text-lg">
                      {motivation.message}
                    </p>
                  </div>
                </div>
                {motivation.analysis && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                    {motivation.analysis.weight_change && (
                      <div className="bg-black/20 p-2 rounded">
                        <div className="font-semibold">체중</div>
                        <div className={motivation.analysis.weight_change.change < 0 ? "text-green-400" : "text-orange-400"}>
                          {motivation.analysis.weight_change.change > 0 ? "+" : ""}{motivation.analysis.weight_change.change}kg
                        </div>
                      </div>
                    )}
                    {motivation.analysis.muscle_change && (
                      <div className="bg-black/20 p-2 rounded">
                        <div className="font-semibold">근육량</div>
                        <div className={motivation.analysis.muscle_change.change > 0 ? "text-green-400" : "text-orange-400"}>
                          {motivation.analysis.muscle_change.change > 0 ? "+" : ""}{motivation.analysis.muscle_change.change}kg
                        </div>
                      </div>
                    )}
                    {motivation.analysis.fat_change && (
                      <div className="bg-black/20 p-2 rounded">
                        <div className="font-semibold">체지방</div>
                        <div className={motivation.analysis.fat_change.change < 0 ? "text-green-400" : "text-orange-400"}>
                          {motivation.analysis.fat_change.change > 0 ? "+" : ""}{motivation.analysis.fat_change.change}kg
                        </div>
                      </div>
                    )}
                    {motivation.analysis.fat_percent_change && (
                      <div className="bg-black/20 p-2 rounded">
                        <div className="font-semibold">체지방률</div>
                        <div className={motivation.analysis.fat_percent_change.change < 0 ? "text-green-400" : "text-orange-400"}>
                          {motivation.analysis.fat_percent_change.change > 0 ? "+" : ""}{motivation.analysis.fat_percent_change.change}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 신체 데이터 표시 및 수정 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-6">
            {/* 현재 신체 프로필 정보 */}
            {profileData && !isEditingProfile && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">나의 신체 프로필</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    수정하기
                  </Button>
                </div>
                <div className="rounded-lg border border-gray-700 p-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    {profileData.gender && (
                      <div>
                        <div className="text-muted-foreground">성별</div>
                        <div className="font-semibold text-foreground">
                          {profileData.gender === "Male"
                            ? "남성"
                            : profileData.gender === "Female"
                            ? "여성"
                            : profileData.gender}
                        </div>
                      </div>
                    )}
                    {profileData.age && (
                      <div>
                        <div className="text-muted-foreground">나이</div>
                        <div className="font-semibold text-foreground">
                          {profileData.age}세
                        </div>
                      </div>
                    )}
                    {profileData.height_cm && (
                      <div>
                        <div className="text-muted-foreground">키</div>
                        <div className="font-semibold text-foreground">
                          {profileData.height_cm}cm
                        </div>
                      </div>
                    )}
                    {profileData.weight_kg && (
                      <div>
                        <div className="text-muted-foreground">체중</div>
                        <div className="font-semibold text-foreground">
                          {profileData.weight_kg}kg
                        </div>
                      </div>
                    )}
                    {profileData.inbody_score && (
                      <div>
                        <div className="text-muted-foreground">InBody 점수</div>
                        <div className="font-semibold text-foreground">
                          {profileData.inbody_score}
                        </div>
                      </div>
                    )}
                    {profileData.bmi && (
                      <div>
                        <div className="text-muted-foreground">BMI</div>
                        <div className="font-semibold text-foreground">
                          {profileData.bmi}
                        </div>
                      </div>
                    )}
                    {profileData.skeletal_muscle_mass_kg && (
                      <div>
                        <div className="text-muted-foreground">골격근량</div>
                        <div className="font-semibold text-foreground">
                          {profileData.skeletal_muscle_mass_kg}kg
                        </div>
                      </div>
                    )}
                    {profileData.body_fat_mass_kg && (
                      <div>
                        <div className="text-muted-foreground">체지방량</div>
                        <div className="font-semibold text-foreground">
                          {profileData.body_fat_mass_kg}kg
                        </div>
                      </div>
                    )}
                    {profileData.body_fat_percentage && (
                      <div>
                        <div className="text-muted-foreground">체지방률</div>
                        <div className="font-semibold text-foreground">
                          {profileData.body_fat_percentage}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 신체 데이터 수정 모드 */}
            {isEditingProfile && profileData && (
              <div className="space-y-4">
                <Label className="text-foreground font-semibold">신체 데이터 수정</Label>
                
                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">성별</label>
                  <Select
                    value={profileData?.gender || ""}
                    onValueChange={(value) => {
                      setProfileData({
                        ...profileData,
                        gender: value || null,
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1 border-gray-600 bg-input-background text-white">
                      <SelectValue placeholder="성별 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">남성</SelectItem>
                      <SelectItem value="Female">여성</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">나이(세)</label>
                  <Input
                    type="number"
                    value={profileData?.age ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        age: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">키(cm)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.height_cm ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        height_cm: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">체중(kg)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.weight_kg ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        weight_kg: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">InBody 점수</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.inbody_score ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        inbody_score: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">BMI</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.bmi ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        bmi: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">골격근량(kg)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.skeletal_muscle_mass_kg ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        skeletal_muscle_mass_kg: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">체지방량(kg)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.body_fat_mass_kg ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        body_fat_mass_kg: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-24">체지방률(%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={profileData?.body_fat_percentage ?? ""}
                    onChange={(e) => {
                      setProfileData({
                        ...profileData,
                        body_fat_percentage: e.target.value ? Number(e.target.value) : null,
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditingProfile(false)}
                  >
                    취소
                  </Button>
                  <Button
                    onClick={saveProfileData}
                    disabled={saving}
                  >
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-foreground">운동 목적</Label>
              <Select value={exerciseGoal} onValueChange={setExerciseGoal}>
                <SelectTrigger className="border-gray-600 bg-input-background text-white">
                  <SelectValue placeholder="운동 목적을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUSCLE_GAIN">근육량 증가</SelectItem>
                  <SelectItem value="DIET">다이어트</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 인바디 사진 촬영 CTA */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={onSelectFile}
              style={{ display: "none" }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dotted border-gray-600 rounded-xl bg-gray-900/40 hover:bg-gray-800/50 transition-colors"
              style={{ height: "280px" }}
            >
              <div className="h-full w-full flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-300">
                  <Camera className="h-6 w-6" />
                  <span className="text-lg font-medium">인바디 사진 촬영</span>
                </div>
              </div>
            </button>

            {/* Crop Modal */}
            {showCrop && imageSrc && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                <div className="w-full max-w-3xl bg-card p-4 rounded-lg">
                  <div
                    style={{
                      position: "relative",
                      height: 640,
                      touchAction: "none",
                    }}
                  >
                    <Cropper
                      image={imageSrc}
                      crop={crop}
                      zoom={zoom}
                      rotation={rotation}
                      aspect={3 / 4}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <label className="text-sm text-foreground">Zoom</label>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                    <label className="text-sm text-foreground">Rotate</label>
                    <Button
                      variant="outline"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                    >
                      회전 90°
                    </Button>
                    <div className="text-sm text-foreground ml-2">
                      (핀치 제스처로 확대/축소 가능)
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCrop(false);
                        setImageSrc(null);
                      }}
                    >
                      취소
                    </Button>
                    <Button onClick={confirmCropAndUpload} disabled={uploading}>
                      {uploading ? "업로드 중..." : "확정 및 분석"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview & Parsed Result */}
            {previewSrc && (
              <div className="mt-4 space-y-3">
                <div>
                  <Label>분석 미리보기</Label>
                  <img
                    src={previewSrc}
                    alt="preview"
                    crossOrigin="anonymous"
                    className="w-full max-h-64 object-contain rounded-lg"
                  />
                </div>
                {analyzeError && (
                  <div className="rounded-md bg-red-900/30 border border-red-700 p-3 text-red-200 flex items-center justify-between">
                    <span className="text-sm">{analyzeError}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={retryAnalyze}
                        disabled={uploading}
                      >
                        {uploading ? "재시도 중..." : "재시도"}
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <Label>추출된 값 (편집 가능)</Label>
                  <div className="mt-2 space-y-3">
                    {/* 성별 선택 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        성별
                      </label>
                      <Select
                        value={parsedResult?.gender || ""}
                        onValueChange={(value) => {
                          setParsedResult({
                            ...parsedResult,
                            gender: value || null,
                          });
                        }}
                      >
                        <SelectTrigger className="flex-1 border-gray-600 bg-input-background text-white">
                          <SelectValue placeholder="성별 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">남성</SelectItem>
                          <SelectItem value="Female">여성</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 나이 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        나이(세)
                      </label>
                      <Input
                        type="number"
                        value={parsedResult?.age ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            age: e.target.value ? Number(e.target.value) : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* InBody Score */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        InBody 점수
                      </label>
                      <Input
                        type="number"
                        value={parsedResult?.inbody_score ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            inbody_score: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 키 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        키(cm)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.height_cm ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            height_cm: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 체중 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        체중(kg)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.weight_kg ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            weight_kg: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 골격근량 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        골격근량(kg)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.skeletal_muscle_mass_kg ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            skeletal_muscle_mass_kg: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 체지방량 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        체지방량(kg)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.body_fat_mass_kg ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            body_fat_mass_kg: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 체지방률 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        체지방률(%)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.body_fat_percentage ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            body_fat_percentage: e.target.value
                              ? Number(e.target.value)
                              : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* BMI */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground w-32">
                        BMI
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={parsedResult?.bmi ?? ""}
                        onChange={(e) => {
                          setParsedResult({
                            ...parsedResult,
                            bmi: e.target.value ? Number(e.target.value) : null,
                          });
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* 세그멘탈 근육량 (InBody 770) */}
                    <div className="mt-4 space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        부위별 근육량 (%)
                      </Label>

                      <div className="flex items-center gap-3">
                        <label className="text-sm text-foreground w-32">
                          우측 팔(%)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          value={parsedResult?.segment_right_arm_percent ?? ""}
                          onChange={(e) => {
                            setParsedResult({
                              ...parsedResult,
                              segment_right_arm_percent: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                          }}
                          className="flex-1"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-sm text-foreground w-32">
                          좌측 팔(%)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          value={parsedResult?.segment_left_arm_percent ?? ""}
                          onChange={(e) => {
                            setParsedResult({
                              ...parsedResult,
                              segment_left_arm_percent: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                          }}
                          className="flex-1"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-sm text-foreground w-32">
                          몸통(%)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          value={parsedResult?.segment_trunk_percent ?? ""}
                          onChange={(e) => {
                            setParsedResult({
                              ...parsedResult,
                              segment_trunk_percent: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                          }}
                          className="flex-1"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-sm text-foreground w-32">
                          우측 다리(%)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          value={parsedResult?.segment_right_leg_percent ?? ""}
                          onChange={(e) => {
                            setParsedResult({
                              ...parsedResult,
                              segment_right_leg_percent: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                          }}
                          className="flex-1"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-sm text-foreground w-32">
                          좌측 다리(%)
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          value={parsedResult?.segment_left_leg_percent ?? ""}
                          onChange={(e) => {
                            setParsedResult({
                              ...parsedResult,
                              segment_left_leg_percent: e.target.value
                                ? Number(e.target.value)
                                : null,
                            });
                          }}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {serverImageUrl && (
                  <div className="rounded-md bg-emerald-900/20 border border-emerald-700 p-3 text-emerald-200">
                    <div className="text-sm">
                      서버에 이미지가 저장되었습니다.
                      {recordMeta?.created_at && (
                        <span className="ml-2 opacity-80">
                          ({new Date(recordMeta.created_at).toLocaleString()})
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <a
                        className="underline"
                        href={serverImageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        이미지 열기
                      </a>
                    </div>
                  </div>
                )}
                <div>
                  <Label>OCR 원문 (편집 가능)</Label>
                  <div className="mt-2 space-y-2">
                    {rawLines.length === 0 && (
                      <div className="text-sm">원문이 없습니다.</div>
                    )}
                    {rawLines.map((line, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={line}
                          onChange={(e) => {
                            const copy = [...rawLines];
                            copy[i] = e.target.value;
                            setRawLines(copy);
                          }}
                        />
                      </div>
                    ))}
                    {rawLines.length > 0 && (
                      <div className="mt-2 flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const p = parseFromLines(rawLines);
                            setParsedResult(p);
                            alert("편집 내용이 반영되었습니다.");
                          }}
                        >
                          편집 반영
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewSrc(null);
                      setParsedResult(null);
                    }}
                  >
                    미리보기 삭제
                  </Button>
                  <Button
                    onClick={applyParsedToProfile}
                    disabled={saving || !parsedResult}
                  >
                    프로필에 적용
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={saveProfile}
                disabled={saving}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 운동 로그 달력 모달 */}
        {showActivityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="w-full max-w-2xl bg-card rounded-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-foreground">
                  운동 기록 
                  {Object.keys(activityLog).length > 0 && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({Object.keys(activityLog).sort().reverse()[0]?.substring(0, 7)})
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => {
                    setShowActivityModal(false);
                    setSelectedActivityDate(null);
                  }}
                  className="text-muted-foreground hover:text-foreground text-lg"
                >
                  ✕
                </button>
              </div>

              {activityLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : Object.keys(activityLog).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  운동 기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 활동 강도 범례 */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">활동 강도:</span>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-gray-700 rounded"></div>
                        <span className="text-muted-foreground">0</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-900 rounded"></div>
                        <span className="text-muted-foreground">약함</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-600 rounded"></div>
                        <span className="text-muted-foreground">보통</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-400 rounded"></div>
                        <span className="text-muted-foreground">강함</span>
                      </div>
                    </div>
                  </div>

                  {/* 활동 날짜 그리드 */}
                  <div className="grid grid-cols-7 gap-1">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                      <div
                        key={day}
                        className="text-center text-xs text-muted-foreground py-2 font-semibold"
                      >
                        {day}
                      </div>
                    ))}
                    {/* 날짜 셀 생성 */}
                    {(() => {
                      const dates = Object.keys(activityLog).sort().reverse();
                      if (dates.length === 0) {
                        return <div className="col-span-7 text-center py-4 text-muted-foreground">데이터가 없습니다</div>;
                      }
                      
                      // 최근 기록을 기준으로 현재 달 결정
                      const latestDateStr = dates[0];
                      const [yearStr, monthStr] = latestDateStr.split('-');
                      const year = parseInt(yearStr);
                      const month = parseInt(monthStr);
                      
                      const startDate = new Date(year, month - 1, 1);
                      const endDate = new Date(year, month, 0);
                      
                      const cells = [];
                      const firstDayOfWeek = startDate.getDay();
                      
                      // 빈 셀 추가
                      for (let i = 0; i < firstDayOfWeek; i++) {
                        cells.push(
                          <div key={`empty-${i}`} className="aspect-square"></div>
                        );
                      }
                      
                      // 날짜 셀 추가
                      for (let day = 1; day <= endDate.getDate(); day++) {
                        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const activity = activityLog[dateStr];
                        const intensity = activity
                          ? Math.min(3, Math.ceil((activity.total_sessions || 0) / 2))
                          : 0;
                        
                        const bgColor =
                          intensity === 0
                            ? "bg-gray-700"
                            : intensity === 1
                            ? "bg-blue-900"
                            : intensity === 2
                            ? "bg-blue-600"
                            : "bg-blue-400";
                        
                        cells.push(
                          <button
                            key={dateStr}
                            onClick={() => setSelectedActivityDate(dateStr)}
                            className={`aspect-square rounded text-xs font-semibold transition-opacity ${
                              activity 
                                ? `${bgColor} text-white hover:opacity-80` 
                                : "bg-gray-800 text-gray-600 hover:opacity-60"
                            } ${
                              selectedActivityDate === dateStr ? "ring-2 ring-blue-500" : ""
                            }`}
                          >
                            {day}
                          </button>
                        );
                      }
                      
                      return cells;
                    })()}
                  </div>

                  {/* 선택된 날짜의 상세 운동 기록 */}
                  {selectedActivityDate && activityLog[selectedActivityDate] && (
                    <div className="border-t border-gray-700 pt-4 space-y-3">
                      <h3 className="font-semibold text-foreground">
                        {selectedActivityDate} 운동 기록
                      </h3>
                      <div className="space-y-2">
                        {activityLog[selectedActivityDate].equipment.map((equip, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-900/50 rounded p-3 space-y-2"
                          >
                            <div className="font-semibold text-blue-400">
                              {equip.name}
                            </div>
                            {equip.sessions.map((session, sidx) => (
                              <div
                                key={sidx}
                                className="text-xs text-muted-foreground ml-2 space-y-1"
                              >
                                <div>
                                  시간: {new Date(session.start_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })} ~ {new Date(session.end_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                </div>
                                <div>
                                  소요 시간: {Math.round(session.duration_minutes)}분
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-foreground font-semibold bg-blue-900/20 rounded p-2">
                        총 {activityLog[selectedActivityDate].total_sessions}개 운동, {Math.round(activityLog[selectedActivityDate].total_minutes)}분
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
