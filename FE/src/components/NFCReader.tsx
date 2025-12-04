import { useEffect, useState } from "react";
import { Wifi, AlertCircle } from "lucide-react";
import { Card, CardContent } from "./ui/card";

interface NFCReaderProps {
  onTagDetected: (equipmentId: string | number) => void;
  isEnabled: boolean;
}

export function NFCReader({ onTagDetected, isEnabled }: NFCReaderProps) {
  const [nfcSupported, setNfcSupported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Web NFC API 지원 확인
    if ("NDEFReader" in window) {
      setNfcSupported(true);
      console.log("✅ NFC 지원 가능");
    } else {
      setNfcSupported(false);
      console.log("❌ NFC 미지원 - Android Chrome 13+ 필요");
    }
  }, []);

  const startNFCScanning = async () => {
    if (!nfcSupported || !isEnabled) {
      console.log("NFC 스캔 조건 불만족:", { nfcSupported, isEnabled });
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      const ndef = new (window as any).NDEFReader();

      await ndef.scan();
      console.log("🔍 NFC 스캔 시작");

      ndef.onreading = (event: any) => {
        const { message } = event;
        console.log("📖 NFC 메시지 수신:", message);

        for (const record of message.records) {
          if (record.recordType === "text") {
            const textDecoder = new TextDecoder();
            const equipmentId = textDecoder.decode(record.data);
            console.log("✅ NFC 태그 감지 - 기구 ID:", equipmentId);
            
            // 태그 감지 후 스캔 중단 (중복 방지)
            setIsScanning(false);
            onTagDetected(equipmentId.trim());
            
            // 잠시 후 다시 스캔 활성화
            setTimeout(() => {
              if (isEnabled) {
                startNFCScanning();
              }
            }, 2000);
          }
        }
      };

      ndef.onerror = (error: any) => {
        console.error("❌ NFC 스캔 오류:", error);
        setError("NFC 스캔 중 오류가 발생했습니다");
        setIsScanning(false);
      };
    } catch (error: any) {
      console.error("❌ NFC 초기화 실패:", error);
      
      // 더 자세한 에러 메시지
      if (error.name === "NotAllowedError") {
        setError("NFC 권한이 필요합니다. 브라우저 설정을 확인해주세요.");
      } else if (error.name === "NotSupportedError") {
        setError("이 기기는 NFC를 지원하지 않습니다.");
      } else {
        setError("NFC를 초기화할 수 없습니다");
      }
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isEnabled && nfcSupported) {
      startNFCScanning();
    }
    
    return () => {
      setIsScanning(false);
    };
  }, [isEnabled, nfcSupported]);

  if (!isEnabled) {
    return null;
  }

  if (!nfcSupported) {
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-red-600 font-semibold">
              ⚠️ 이 기기는 NFC를 지원하지 않습니다
            </p>
            <p className="text-gray-600 text-sm">
              Android Chrome 13+ 기기에서 사용 가능합니다
            </p>
            <p className="text-gray-500 text-xs mt-2">
              NFC 없이 운동을 시작하려면 기구를 직접 선택하세요
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50">
      <CardContent className="pt-6">
        {isScanning ? (
          <div className="text-center space-y-4">
            <div className="relative">
              <Wifi className="w-16 h-16 text-blue-600 mx-auto animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 border-4 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
            <p className="text-blue-700 font-semibold text-lg">
              NFC 태그를 인식 중입니다
            </p>
            <p className="text-gray-600 text-sm">
              운동 기구의 NFC 스티커에<br />휴대폰을 가까이 대주세요
            </p>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <Wifi className="w-12 h-12 text-blue-500 mx-auto" />
            <p className="text-blue-600 font-semibold">NFC 스캔 준비 완료</p>
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
