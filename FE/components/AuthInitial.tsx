import React from "react";
import { Button } from "./ui/button";

interface AuthInitialProps {
  onNavigate: (view: "signup" | "login") => void;
}

export function AuthInitial({ onNavigate }: AuthInitialProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontSize: "calc(1.875rem + 16px)" }}
          >
            Health Queue
          </h1>
        </div>

        <div className="space-y-4">
          <Button
            onClick={() => onNavigate("signup")}
            className="w-full h-14 bg-white text-black hover:bg-gray-200 transition-colors"
          >
            회원가입 하기
          </Button>

          <Button
            onClick={() => onNavigate("login")}
            className="w-full h-14 bg-white text-black hover:bg-gray-200 transition-colors"
          >
            로그인하기
          </Button>
        </div>
      </div>
    </div>
  );
}
