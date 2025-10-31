import { Button } from "./ui/button";

interface SignUpCompleteProps {
  onStart: () => void;
}

export function SignUpComplete({ onStart }: SignUpCompleteProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <h1 className="text-3xl text-white">
          회원가입 완료!
        </h1>
        
        <Button 
          onClick={onStart}
          className="w-full h-14 bg-white text-black hover:bg-gray-200 transition-colors"
        >
          시작하기
        </Button>
      </div>
    </div>
  );
}
