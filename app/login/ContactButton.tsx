"use client";

import { useState } from "react";

export default function ContactButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating side tab */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          padding: "14px 9px",
          fontSize: "12px",
          fontWeight: "600",
          fontFamily: "inherit",
          letterSpacing: "0.06em",
          color: "var(--accent)",
          background: "rgba(255,252,248,0.68)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          backdropFilter: "blur(20px) saturate(160%)",
          borderTop: "1px solid rgba(255,255,255,0.72)",
          borderBottom: "1px solid rgba(255,255,255,0.72)",
          borderLeft: "1px solid rgba(255,255,255,0.72)",
          borderRight: "none",
          borderRadius: "12px 0 0 12px",
          boxShadow: "-3px 0 18px rgba(160,120,80,0.16), inset 0 1px 0 rgba(255,255,255,0.80)",
          cursor: "pointer",
          zIndex: 50,
        }}
      >
        Contact
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(140,100,70,0.18)",
            WebkitBackdropFilter: "blur(4px)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          {/* Card — same glass style as login card */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "340px",
              background: "rgba(255,252,248,0.72)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              backdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.80)",
              borderRadius: "24px",
              padding: "24px 22px",
              boxShadow: "0 8px 40px rgba(160,120,80,0.20), inset 0 1px 0 rgba(255,255,255,0.90)",
              display: "flex",
              gap: "16px",
              alignItems: "flex-start",
            }}
          >
            {/* Logo */}
            <div style={{ flexShrink: 0, paddingTop: "3px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="logo" width={38} height={38} style={{ objectFit: "contain" }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-1)", letterSpacing: "0.01em", marginBottom: "2px" }}>
                HANSAE MOBILITY - USA PONTIAC
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "14px" }}>
                Internal Use Only
              </p>

              <p style={{ fontSize: "11px", color: "var(--text-2)", marginBottom: "8px" }}>
                For issue reports, contact:
              </p>

              {/* Phone buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
                {["+82) 10-6645-5460", "+1) 478-381-4024"].map((num) => (
                  <a
                    key={num}
                    href={`tel:${num.replace(/[^+\d]/g, "")}`}
                    style={{
                      display: "block",
                      padding: "9px 14px",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "var(--text-1)",
                      background: "rgba(255,255,255,0.55)",
                      border: "1px solid rgba(255,255,255,0.75)",
                      borderRadius: "10px",
                      textDecoration: "none",
                    }}
                  >
                    {num}
                  </a>
                ))}
              </div>

              <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Sewoon Jin</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
