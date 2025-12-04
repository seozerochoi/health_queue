import { useEffect, useState } from "react";
import { Wifi, AlertCircle } from "lucide-react";

interface NFCReaderProps {
  onTagDetected: (equipmentId: string | number) => void;
  isEnabled: boolean;
}

export function NFCReader({ onTagDetected, isEnabled }: NFCReaderProps) {
  const [nfcSupported, setNfcSupported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScannedTag, setLastScannedTag] = useState<string | null>(null);

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
          console.log(`  - Record Type: ${record.recordType}`);
          console.log(`  - Record Data (Raw):`, record.data);

          if (record.recordType === "text") {
            const textDecoder = new TextDecoder();
            const equipmentId = textDecoder.decode(record.data);
            const trimmedId = equipmentId.trim();

            // 🔍 [NFC 디버깅] 읽은 데이터 상세 로깅
            console.log("✅ NFC 태그 감지");
            console.log(`  - 원본: "${equipmentId}"`);
            console.log(`  - Trim 후: "${trimmedId}"`);
            console.log(`  - 길이: ${trimmedId.length}`);
            console.log(
              `  - Char codes: ${[...trimmedId]
                .map((c) => c.charCodeAt(0))
                .join(", ")}`
            );
            console.log(
              `  - Hex: ${trimmedId
                .split("")
                .map((c) => c.charCodeAt(0).toString(16))
                .join(" ")}`
            );

            // 읽은 태그 값을 상태에 저장
            setLastScannedTag(trimmedId);

            // 태그 감지 후 스캔 중단 (중복 방지)
            setIsScanning(false);
            onTagDetected(trimmedId);

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
      <div className="flex items-center justify-center gap-2 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
        <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <p className="text-yellow-400 text-sm font-medium">NFC 미지원</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg mb-4">
      <Wifi className={`w-5 h-5 text-blue-400 flex-shrink-0 ${isScanning ? "animate-pulse" : ""}`} />
      <p className="text-blue-400 text-sm font-medium">
        {isScanning ? "NFC 스캔 중..." : "NFC 연결"}
      </p>
    </div>
  );
}
