import { useState, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, User, Settings, Camera, Loader2 } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import Cropper from "react-easy-crop";
import { Slider } from "./ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";

interface SignUpUserInfoProps {
  onBack: () => void;
  onNext: (name: string, role: "user" | "admin", inbodyData?: any) => void;
}

export function SignUpUserInfo({ onBack, onNext }: SignUpUserInfoProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin" | null>(null);
  
  // InBody Analysis State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inbodyData, setInbodyData] = useState<{
    height_cm: string;
    weight_kg: string;
    skeletal_muscle_mass_kg: string;
    body_fat_mass_kg: string;
    segment_right_arm_percent: string;
    segment_left_arm_percent: string;
    segment_trunk_percent: string;
    segment_right_leg_percent: string;
    segment_left_leg_percent: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.setAttribute("crossOrigin", "anonymous");
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: any
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("No 2d context");
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(blob);
      }, "image/jpeg");
    });
  };

  const handleAnalyze = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setIsAnalyzing(true);
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      
      const formData = new FormData();
      formData.append("image", croppedImageBlob, "inbody.jpg");

      const token = localStorage.getItem("access_token");
      
      const response = await fetch("https://43.201.88.27/api/inbody/analyze/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const responseData = await response.json();
        const data = responseData.parsed || {};
        
        setInbodyData({
            height_cm: data.height_cm ? String(data.height_cm) : "",
            weight_kg: data.weight_kg ? String(data.weight_kg) : "",
            skeletal_muscle_mass_kg: data.skeletal_muscle_mass_kg ? String(data.skeletal_muscle_mass_kg) : "",
            body_fat_mass_kg: data.body_fat_mass_kg ? String(data.body_fat_mass_kg) : "",
            segment_right_arm_percent: data.segment_right_arm_percent ? String(data.segment_right_arm_percent) : "",
            segment_left_arm_percent: data.segment_left_arm_percent ? String(data.segment_left_arm_percent) : "",
            segment_trunk_percent: data.segment_trunk_percent ? String(data.segment_trunk_percent) : "",
            segment_right_leg_percent: data.segment_right_leg_percent ? String(data.segment_right_leg_percent) : "",
            segment_left_leg_percent: data.segment_left_leg_percent ? String(data.segment_left_leg_percent) : "",
        });
        setShowCropper(false);
      } else {
        alert("분석에 실패했습니다. 다시 시도해주세요.");
      }
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNext = () => {
    if (name.trim() !== "" && role) {
      let finalInbodyData = undefined;
      if (inbodyData) {
          finalInbodyData = {
              height_cm: parseFloat(inbodyData.height_cm),
              weight_kg: parseFloat(inbodyData.weight_kg),
              skeletal_muscle_mass_kg: parseFloat(inbodyData.skeletal_muscle_mass_kg),
              body_fat_mass_kg: parseFloat(inbodyData.body_fat_mass_kg),
              segment_right_arm_percent: parseFloat(inbodyData.segment_right_arm_percent),
              segment_left_arm_percent: parseFloat(inbodyData.segment_left_arm_percent),
              segment_trunk_percent: parseFloat(inbodyData.segment_trunk_percent),
              segment_right_leg_percent: parseFloat(inbodyData.segment_right_leg_percent),
              segment_left_leg_percent: parseFloat(inbodyData.segment_left_leg_percent),
          };
      }
      
      onNext(name, role, finalInbodyData);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6 pt-4">
          <button onClick={onBack} className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl text-white ml-4">사용자 정보</h1>
        </div>

        {/* Form */}
        <div className="space-y-6 mt-8">
          {/* 이름 입력 */}
          <div className="space-y-2">
            <label className="text-white">이름</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full bg-card border-gray-600 text-white placeholder:text-gray-500"
            />
          </div>

          {/* 역할 선택 */}
          <div className="space-y-2">
            <label className="text-white">역할 선택</label>
            <div className="space-y-3">
              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === "user"
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-600 bg-card hover:border-gray-500"
                }`}
                onClick={() => setRole("user")}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 사용자</h3>
                      <p className="text-sm text-gray-300">
                        기구를 예약하고 이용합니다
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 transition-all ${
                  role === "admin"
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-600 bg-card hover:border-gray-500"
                }`}
                onClick={() => setRole("admin")}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center">
                      <Settings className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white">헬스장 운영자</h3>
                      <p className="text-sm text-gray-300">
                        헬스장을 관리하고 운영합니다
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* InBody Upload Section (Only for User) */}
          {role === "user" && (
            <div className="space-y-4 pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <label className="text-white font-medium">인바디 정보 (선택)</label>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Camera className="w-4 h-4 mr-2" />
                    사진 촬영/업로드
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                />
              </div>

              {inbodyData && (
                  <div className="grid grid-cols-2 gap-4 bg-card p-4 rounded-lg border border-gray-600">
                      <div className="space-y-1">
                          <label className="text-xs text-gray-400">키 (cm)</label>
                          <Input 
                              value={inbodyData.height_cm} 
                              onChange={(e) => setInbodyData({...inbodyData, height_cm: e.target.value})}
                              className="h-8 bg-background text-white"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-gray-400">체중 (kg)</label>
                          <Input 
                              value={inbodyData.weight_kg} 
                              onChange={(e) => setInbodyData({...inbodyData, weight_kg: e.target.value})}
                              className="h-8 bg-background text-white"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-gray-400">골격근량 (kg)</label>
                          <Input 
                              value={inbodyData.skeletal_muscle_mass_kg} 
                              onChange={(e) => setInbodyData({...inbodyData, skeletal_muscle_mass_kg: e.target.value})}
                              className="h-8 bg-background text-white"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-gray-400">체지방량 (kg)</label>
                          <Input 
                              value={inbodyData.body_fat_mass_kg} 
                              onChange={(e) => setInbodyData({...inbodyData, body_fat_mass_kg: e.target.value})}
                              className="h-8 bg-background text-white"
                          />
                      </div>
                      <div className="col-span-2 pt-2 border-t border-gray-700">
                          <label className="text-xs text-gray-400 block mb-2">부위별 근육 분석 (%)</label>
                          <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                  <label className="text-[10px] text-gray-500">오른팔</label>
                                  <Input 
                                      value={inbodyData.segment_right_arm_percent} 
                                      onChange={(e) => setInbodyData({...inbodyData, segment_right_arm_percent: e.target.value})}
                                      className="h-7 text-xs bg-background text-white"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] text-gray-500">왼팔</label>
                                  <Input 
                                      value={inbodyData.segment_left_arm_percent} 
                                      onChange={(e) => setInbodyData({...inbodyData, segment_left_arm_percent: e.target.value})}
                                      className="h-7 text-xs bg-background text-white"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] text-gray-500">몸통</label>
                                  <Input 
                                      value={inbodyData.segment_trunk_percent} 
                                      onChange={(e) => setInbodyData({...inbodyData, segment_trunk_percent: e.target.value})}
                                      className="h-7 text-xs bg-background text-white"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] text-gray-500">오른다리</label>
                                  <Input 
                                      value={inbodyData.segment_right_leg_percent} 
                                      onChange={(e) => setInbodyData({...inbodyData, segment_right_leg_percent: e.target.value})}
                                      className="h-7 text-xs bg-background text-white"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] text-gray-500">왼다리</label>
                                  <Input 
                                      value={inbodyData.segment_left_leg_percent} 
                                      onChange={(e) => setInbodyData({...inbodyData, segment_left_leg_percent: e.target.value})}
                                      className="h-7 text-xs bg-background text-white"
                                  />
                              </div>
                          </div>
                      </div>
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Next Button */}
        <div className="fixed bottom-6 left-0 right-0 px-4">
            <div className="max-w-md mx-auto">
                <Button 
                    className="w-full h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700"
                    disabled={!name.trim() || !role}
                    onClick={handleNext}
                >
                    다음
                </Button>
            </div>
        </div>
      </div>

      {/* Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="sm:max-w-md bg-background border-gray-700 text-white">
            <DialogHeader>
                <DialogTitle>인바디 결과지 자르기</DialogTitle>
            </DialogHeader>
            <div className="relative w-full h-64 bg-black mt-4">
                {imageSrc && (
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={3 / 4}
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                    />
                )}
            </div>
            <div className="py-4">
                <label className="text-xs text-gray-400 mb-2 block">확대/축소</label>
                <Slider
                    value={[zoom]}
                    min={1}
                    max={3}
                    step={0.1}
                    onValueChange={(value) => setZoom(value[0])}
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setShowCropper(false)}>취소</Button>
                <Button onClick={handleAnalyze} disabled={isAnalyzing}>
                    {isAnalyzing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            분석 중...
                        </>
                    ) : (
                        "분석하기"
                    )}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}