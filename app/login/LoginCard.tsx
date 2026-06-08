"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function LoginCard({ children }: { children: ReactNode }) {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;

    // 데스크탑: 마우스 이동
    const onMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth  - 0.5) * 18;
      const y = (e.clientY / window.innerHeight - 0.5) * 18;
      bg.style.transform = `scale(1.08) translate(${-x}px, ${-y}px)`;
    };

    // 모바일: 자이로스코프
    const onOrientation = (e: DeviceOrientationEvent) => {
      const x = ((e.gamma ?? 0) / 45) * 12;
      const y = ((e.beta  ?? 0) / 45) * 12;
      bg.style.transform = `scale(1.08) translate(${-x}px, ${-y}px)`;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("deviceorientation", onOrientation);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, []);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* 패럴랙스 배경 */}
      <div
        ref={bgRef}
        style={{
          position: "absolute", inset: "-8%",
          backgroundImage: "url('/entry-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          transform: "scale(1.08)",
          transition: "transform 0.12s cubic-bezier(0.25, 0.1, 0.25, 1)",
          willChange: "transform",
        }}
      />

      {/* 따뜻한 오버레이 */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "rgba(200, 150, 100, 0.22)",
      }} />

      {/* Liquid Glass 카드 */}
      <div className="fade-up" style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: "360px",
        background: "rgba(255,255,255,0.06)",
        WebkitBackdropFilter: "blur(2px) brightness(1.02)",
        backdropFilter: "blur(2px) brightness(1.02)",
        border: "1px solid rgba(255,255,255,0.40)",
        borderRadius: "28px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.05), 0 16px 48px rgba(0,0,0,0.07)",
        padding: "44px 32px",
      }}>
        {children}
      </div>
    </div>
  );
}
