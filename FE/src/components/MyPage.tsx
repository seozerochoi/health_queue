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
  // 단순화: 운동 목적만 유지

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
          "http://43.201.88.27/api/token/refresh/",
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
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      if (!blob) throw new Error("Failed to crop image");

      // preview
      const previewUrl = URL.createObjectURL(blob);
      setPreviewSrc(previewUrl);
      setShowCrop(false);

      // upload to BE analyze endpoint
      const form = new FormData();
      form.append("image", blob, "inbody.jpg");
      const res = await fetchWithAuth(
        "http://43.201.88.27/api/inbody/analyze/",
        {
          method: "POST",
          body: form,
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        alert("분석 실패: " + res.status + "\n" + txt);
        return;
      }
      const data = await res.json();
      // prefer server-parsed values, fall back to heuristic parse of raw_lines
      const serverParsed = data.parsed || null;
      const serverLines: string[] = data.raw_lines || [];
      if (serverParsed && Object.keys(serverParsed).length > 0) {
        setParsedResult(serverParsed);
      } else if (serverLines.length > 0) {
        setParsedResult(parseFromLines(serverLines));
      } else {
        setParsedResult({});
      }
      setRawLines(serverLines);
    } catch (e) {
      console.error(e);
      alert("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
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
    if (parsedResult.weight_kg != null) body.weight_kg = parsedResult.weight_kg;
    if (parsedResult.body_fat_percentage != null)
      body.body_fat_percentage = parsedResult.body_fat_percentage;
    if (parsedResult.skeletal_muscle_mass_kg != null)
      body.skeletal_muscle_mass_kg = parsedResult.skeletal_muscle_mass_kg;
    if (parsedResult.bmi != null) body.bmi = parsedResult.bmi;

    try {
      setSaving(true);
      const res = await fetchWithAuth(
        "http://43.201.88.27/api/users/profile/",
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
          "http://43.201.88.27/api/users/profile/",
          { method: "GET" }
        );
        if (!res.ok) return;
        const data = await res.json();
        setExerciseGoal(data.exercise_goal || "");
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const saveProfile = async () => {
    try {
      setSaving(true);
      const body: any = {
        exercise_goal: exerciseGoal || null,
      };

      const res = await fetchWithAuth(
        "http://43.201.88.27/api/users/profile/",
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
        {/* 헤더: 좌측 뒤로가기, 중앙 제목, 우측 로그아웃 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-foreground hover:bg-secondary"
            >
              뒤로
            </Button>
            <h1 className="text-2xl font-bold text-foreground">마이페이지</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300 active:bg-red-800/30 active:text-red-200 active:border-red-500 transition-transform duration-150 ease-out active:scale-105"
            onClick={onLogout}
          >
            로그아웃
          </Button>
        </div>

        {/* 프로필 카드: 우측 버튼은 "마이페이지"(편집)로 변경 */}
        {/* 프로필 카드 제거 */}

        {/* 단순화된 폼: 운동 목적만 */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-6">
            {/* 운동 목적 */}
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
                    className="w-full max-h-64 object-contain rounded-lg"
                  />
                </div>
                <div>
                  <Label>추출된 값</Label>
                  <div className="mt-2">
                    <div>체중(kg): {parsedResult?.weight_kg ?? "-"} </div>
                    <div>
                      체지방(%): {parsedResult?.body_fat_percentage ?? "-"}{" "}
                    </div>
                    <div>
                      골격근량(kg):{" "}
                      {parsedResult?.skeletal_muscle_mass_kg ?? "-"}{" "}
                    </div>
                    <div>BMI: {parsedResult?.bmi ?? "-"} </div>
                  </div>
                </div>
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
      </div>
    </div>
  );
}
