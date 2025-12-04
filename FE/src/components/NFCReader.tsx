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
        const { message, serialNumber } = event;
        console.log("📖 ===== NFC 메시지 수신 =====");
        console.log(`  - Serial Number: ${serialNumber}`);
        console.log(`  - Message:`, message);
        console.log(`  - Records Count: ${message.records.length}`);

        for (const record of message.records) {
          console.log(`\n📄 Record 상세 정보:`);
          console.log(`  - recordType: "${record.recordType}"`);
          console.log(`  - mediaType: "${record.mediaType}"`);
          console.log(`  - encoding: "${record.encoding}"`);
          console.log(`  - lang: "${record.lang}"`);
          console.log(`  - data 타입:`, typeof record.data);
          console.log(`  - data:`, record.data);

          if (record.recordType === "text") {
            try {
              let equipmentId = "";

              // Web NFC API의 텍스트 레코드는 이미 파싱된 문자열일 수 있음
              if (typeof record.data === "string") {
                equipmentId = record.data;
                console.log("  ✓ record.data는 이미 문자열:", equipmentId);
              } else if (record.data instanceof DataView) {
                // DataView 전체를 UTF-8로 디코딩 후 끝 6자리 추출
                console.log("  ✓ record.data는 DataView, 전체 디코딩 후 끝 6자리 추출");
                
                const textBytes = new Uint8Array(record.data.byteLength);
                for (let i = 0; i < record.data.byteLength; i++) {
                  textBytes[i] = record.data.getUint8(i);
                }
                
                const textDecoder = new TextDecoder("utf-8");
                const fullText = textDecoder.decode(textBytes);
                console.log(`  - 전체 디코딩: "${fullText}"`);
                
                // 끝에서 6자리 추출 (NFC001, NFC021 등)
                equipmentId = fullText.slice(-6);
                console.log(`  ✓ 끝 6자리 추출: "${equipmentId}"`);
              } else if (record.data instanceof ArrayBuffer) {
                // ArrayBuffer인 경우 Uint8Array로 변환 후 끝 6자리 추출
                console.log("  ✓ record.data는 ArrayBuffer, 디코딩 후 끝 6자리 추출");
                const textDecoder = new TextDecoder("utf-8");
                const fullText = textDecoder.decode(record.data);
                console.log(`  - 전체 디코딩: "${fullText}"`);
                
                equipmentId = fullText.slice(-6);
                console.log(`  ✓ 끝 6자리 추출: "${equipmentId}"`);
              } else {
                // 알 수 없는 형식 - 문자열로 변환 시도
                console.log("  ⚠ 알 수 없는 data 형식, toString() 시도");
                equipmentId = String(record.data);
              }

              console.log(`📌 최종 equipmentId: "${equipmentId}"`);

              // 추출된 값 검증: NFC + 3자리 숫자 형식인지 확인
              const trimmedId = equipmentId.trim().toUpperCase();

              // 추가 디버깅
              console.log(`  - trim 전 equipmentId: "${equipmentId}"`);
              console.log(`  - trim 후 trimmedId: "${trimmedId}"`);

              // 🔍 [NFC 디버깅] 읽은 데이터 상세 로깅
              console.log("\n✅ ===== NFC 텍스트 추출 성공 =====");
              console.log(`  - 원본 (decode): "${equipmentId}"`);
              console.log(`  - Trim + Upper: "${trimmedId}"`);
              console.log(`  - 길이: ${trimmedId.length}`);
              console.log(
                `  - Char codes: ${[...trimmedId]
                  .map((c) => c.charCodeAt(0))
                  .join(", ")}`
              );
              console.log(
                `  - Hex: ${[...trimmedId]
                  .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
                  .join(" ")}`
              );

              // NFC 형식 검증 (NFC001 ~ NFC999)
              if (!/^NFC\d{3}$/i.test(trimmedId)) {
                console.error(`  ❌ 잘못된 NFC 형식: "${trimmedId}"`);
                alert(
                  `잘못된 NFC 태그 형식입니다: [${trimmedId}]\n\n` +
                    `길이: ${trimmedId.length}\n` +
                    `Char codes: ${[...trimmedId]
                      .map((c) => c.charCodeAt(0))
                      .join(", ")}\n\n` +
                    `올바른 형식: NFC001 ~ NFC999`
                );
                return;
              }

              // 읽은 태그 값을 상태에 저장
              setLastScannedTag(trimmedId);

              // 태그 감지 후 스캔 중단 (중복 방지)
              setIsScanning(false);

              console.log(`\n🚀 onTagDetected 호출: "${trimmedId}"`);
              onTagDetected(trimmedId);
            } catch (decodeError) {
              console.error("❌ 텍스트 디코딩 실패:", decodeError);
              console.log("  - 원본 record:", record);
              alert(`NFC 태그 읽기 실패: ${decodeError}`);
            }

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
      <Wifi
        className={`w-5 h-5 text-blue-400 flex-shrink-0 ${
          isScanning ? "animate-pulse" : ""
        }`}
      />
      <p className="text-blue-400 text-sm font-medium">
        {isScanning ? "NFC 스캔 중..." : "NFC 연결"}
      </p>
    </div>
  );
}
