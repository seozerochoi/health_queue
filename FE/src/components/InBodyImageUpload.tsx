import { useState, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Camera, Upload, RotateCw, Check, X, Loader2 } from "lucide-react";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface InBodyImageUploadProps {
  onDataExtracted: (data: any) => void;
  onCancel: () => void;
}

export function InBodyImageUpload({
  onDataExtracted,
  onCancel,
}: InBodyImageUploadProps) {
  const [step, setStep] = useState<
    "select" | "preview" | "processing" | "result"
  >("select");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    width: 90,
    height: 90,
    x: 5,
    y: 5,
  });
  const [rotation, setRotation] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 파일 선택 처리
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setStep("preview");
      };
      reader.readAsDataURL(file);
    }
  };

  // 이미지 회전
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Canvas에서 크롭 및 회전 적용한 이미지 생성
  const getCroppedImage = useCallback(
    async (
      image: HTMLImageElement,
      crop: PixelCrop,
      rotation: number
    ): Promise<string> => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Canvas context를 가져올 수 없습니다.");
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // 회전 적용
      const rotRad = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rotRad));
      const cos = Math.abs(Math.cos(rotRad));

      // 회전된 이미지의 새로운 크기 계산
      const rotatedWidth = image.naturalWidth * cos + image.naturalHeight * sin;
      const rotatedHeight =
        image.naturalWidth * sin + image.naturalHeight * cos;

      canvas.width = crop.width * scaleX;
      canvas.height = crop.height * scaleY;

      // 이미지 품질 향상을 위한 설정
      ctx.imageSmoothingQuality = "high";

      // 회전 적용
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotRad);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      // 크롭된 영역 그리기
      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.restore();

      // 이미지 보정: 대비 및 밝기 조정
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 간단한 대비 증가 (OCR 성능 향상을 위함)
      const contrastFactor = 1.2;
      const brightnessFactor = 10;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(
          255,
          Math.max(0, (data[i] - 128) * contrastFactor + 128 + brightnessFactor)
        ); // R
        data[i + 1] = Math.min(
          255,
          Math.max(
            0,
            (data[i + 1] - 128) * contrastFactor + 128 + brightnessFactor
          )
        ); // G
        data[i + 2] = Math.min(
          255,
          Math.max(
            0,
            (data[i + 2] - 128) * contrastFactor + 128 + brightnessFactor
          )
        ); // B
      }

      ctx.putImageData(imageData, 0, 0);

      return canvas.toDataURL("image/jpeg", 0.95);
    },
    []
  );

  // OCR 처리
  const handleProcess = async () => {
    if (!imageRef.current || !selectedImage) return;

    try {
      setProcessing(true);
      setError(null);
      setStep("processing");

      // 크롭 및 회전 적용된 이미지 생성
      const pixelCrop: PixelCrop = {
        unit: "px",
        x: (crop.x / 100) * imageRef.current.width,
        y: (crop.y / 100) * imageRef.current.height,
        width: (crop.width / 100) * imageRef.current.width,
        height: (crop.height / 100) * imageRef.current.height,
      };

      const croppedImageData = await getCroppedImage(
        imageRef.current,
        pixelCrop,
        rotation
      );

      // 서버로 이미지 전송
      const access = localStorage.getItem("access_token");
      const response = await fetch(
        "http://43.201.88.27/api/users/inbody/upload/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access}`,
          },
          body: JSON.stringify({
            image: croppedImageData,
            auto_save: false, // 먼저 결과를 확인한 후 저장
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "OCR 처리에 실패했습니다.");
      }

      const result = await response.json();
      setOcrResult(result);
      setStep("result");
    } catch (err: any) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setProcessing(false);
    }
  };

  // 결과 확인 및 저장
  const handleSaveResult = () => {
    if (ocrResult?.data) {
      onDataExtracted(ocrResult.data);
    }
  };

  // 단계별 렌더링
  if (step === "select") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">
            인바디 사진 업로드
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            인바디 측정 결과지를 촬영하거나 업로드해주세요.
          </p>

          <div className="space-y-4">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full h-14 bg-blue-600 hover:bg-blue-700"
            >
              <Camera className="mr-2" />
              카메라로 촬영하기
            </Button>

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full h-14"
            >
              <Upload className="mr-2" />
              갤러리에서 선택하기
            </Button>

            <Button
              onClick={onCancel}
              variant="ghost"
              className="w-full h-14"
            >
              취소
            </Button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </CardContent>
      </Card>
    );
  }

  if (step === "preview") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">
            이미지 조정
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            크롭 영역을 조정하고 필요시 회전해주세요.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-600 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              aspect={undefined}
            >
              <img
                ref={imageRef}
                src={selectedImage || ""}
                alt="Selected"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  maxWidth: "100%",
                  maxHeight: "400px",
                }}
              />
            </ReactCrop>
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              onClick={handleRotate}
              variant="outline"
              className="flex-1"
            >
              <RotateCw className="mr-2" />
              회전
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleProcess}
              disabled={processing}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <Check className="mr-2" />
                  분석하기
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                setSelectedImage(null);
                setStep("select");
                setError(null);
              }}
              variant="outline"
            >
              <X className="mr-2" />
              취소
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "processing") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              인바디 데이터 분석 중...
            </h3>
            <p className="text-sm text-gray-400">
              이미지에서 데이터를 추출하고 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "result") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">
            분석 결과
          </h3>

          {ocrResult?.data && Object.keys(ocrResult.data).length > 0 ? (
            <div className="space-y-4 mb-6">
              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3 text-green-400">
                  추출된 데이터
                </h4>
                <div className="space-y-2 text-sm">
                  {ocrResult.data.weight_kg && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">체중:</span>
                      <span className="text-white">
                        {ocrResult.data.weight_kg} kg
                      </span>
                    </div>
                  )}
                  {ocrResult.data.skeletal_muscle_mass_kg && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">골격근량:</span>
                      <span className="text-white">
                        {ocrResult.data.skeletal_muscle_mass_kg} kg
                      </span>
                    </div>
                  )}
                  {ocrResult.data.body_fat_mass_kg && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">체지방량:</span>
                      <span className="text-white">
                        {ocrResult.data.body_fat_mass_kg} kg
                      </span>
                    </div>
                  )}
                  {ocrResult.data.body_fat_percentage && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">체지방률:</span>
                      <span className="text-white">
                        {ocrResult.data.body_fat_percentage} %
                      </span>
                    </div>
                  )}
                  {ocrResult.data.bmi && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">BMI:</span>
                      <span className="text-white">{ocrResult.data.bmi}</span>
                    </div>
                  )}
                  {ocrResult.data.inbody_score && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">인바디점수:</span>
                      <span className="text-white">
                        {ocrResult.data.inbody_score}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {ocrResult.detected_texts &&
                ocrResult.detected_texts.length > 0 && (
                  <details className="bg-gray-800/50 p-4 rounded-lg">
                    <summary className="cursor-pointer text-sm text-gray-400 font-semibold">
                      감지된 텍스트 보기
                    </summary>
                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                      {ocrResult.detected_texts.map(
                        (text: string, idx: number) => (
                          <div key={idx}>• {text}</div>
                        )
                      )}
                    </div>
                  </details>
                )}
            </div>
          ) : (
            <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-600 rounded">
              <p className="text-yellow-400 text-sm">
                데이터를 추출하지 못했습니다. 이미지를 다시 촬영하거나 더
                선명한 이미지를 사용해주세요.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSaveResult}
              disabled={
                !ocrResult?.data || Object.keys(ocrResult.data).length === 0
              }
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Check className="mr-2" />
              저장하기
            </Button>
            <Button
              onClick={() => {
                setSelectedImage(null);
                setOcrResult(null);
                setStep("select");
              }}
              variant="outline"
            >
              다시 촬영
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
