"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LockoutCountdown({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      router.replace("/login");
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, router]);

  return (
    <div style={{
      padding: "12px 14px",
      background: "rgba(255,59,48,0.08)",
      border: "1px solid rgba(255,59,48,0.25)",
      borderRadius: "12px",
      textAlign: "center",
    }}>
      <p style={{ fontSize: "13px", fontWeight: "700", color: "var(--danger)", marginBottom: "4px" }}>
        🔒 Account Locked
      </p>
      <p style={{ fontSize: "12px", color: "var(--text-2)" }}>
        Too many failed attempts. Try again in <strong>{remaining}s</strong>
      </p>
    </div>
  );
}
