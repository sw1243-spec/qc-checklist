"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Photo = { id: number; filename: string; originalName: string; caption: string | null };

export default function PhotoUploader({ submissionId, photos }: { submissionId: number; photos: Photo[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function uploadBlob(blob: Blob, name: string, type: string) {
    const fd = new FormData();
    fd.append("submissionId", String(submissionId));
    fd.append("file", new File([blob], name, { type }));
    const res = await fetch("/api/upload-photo", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Upload failed: ${err.error ?? res.statusText}`);
      return false;
    }
    return true;
  }

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      await uploadBlob(file, file.name, file.type);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function deletePhoto(id: number) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/photo/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Delete failed");
  }

  return (
    <div>
      <p className="ios-section-label">Photos {photos.length > 0 && `(${photos.length})`}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative", width: "110px", height: "110px" }}>
            <button
              type="button"
              onClick={() => setLightbox(p)}
              style={{
                width: "100%", height: "100%", padding: 0, border: "1px solid var(--border)",
                borderRadius: "10px", overflow: "hidden", cursor: "pointer", background: "var(--card)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photo/${p.id}`}
                alt={p.originalName}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
            <button
              type="button"
              onClick={() => deletePhoto(p.id)}
              title="Delete"
              style={{
                position: "absolute", top: "-6px", right: "-6px",
                width: "22px", height: "22px", borderRadius: "50%",
                background: "var(--danger)", color: "#fff", border: "2px solid var(--bg)",
                fontSize: "13px", fontWeight: "700", cursor: "pointer", lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>
        ))}
      </div>

      {/* 액션 버튼들 */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={uploading}
          className="btn-primary"
          style={{ flex: "1 1 140px", fontSize: "13px", padding: "10px 14px", gap: "6px" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Take Photo
        </button>
        <label
          className="btn-secondary"
          style={{ flex: "1 1 140px", fontSize: "13px", padding: "10px 14px", cursor: uploading ? "wait" : "pointer", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            disabled={uploading}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {uploading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Uploading…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Choose File
            </>
          )}
        </label>
      </div>

      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "10px" }}>
        JPEG / PNG / WebP / HEIC · max 10 MB
      </p>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: "20px", cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photo/${lightbox.id}`}
            alt={lightbox.originalName}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "8px" }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            style={{
              position: "absolute", top: "20px", right: "20px",
              width: "40px", height: "40px", borderRadius: "50%",
              background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
              fontSize: "22px", cursor: "pointer", lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* Camera Modal */}
      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={async (blob) => {
            setUploading(true);
            const ok = await uploadBlob(blob, `camera-${Date.now()}.jpg`, "image/jpeg");
            setUploading(false);
            if (ok) {
              setCameraOpen(false);
              router.refresh();
            }
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CameraCapture({ onClose, onCapture }: { onClose: () => void; onCapture: (blob: Blob) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let active = true;
    let currentStream: MediaStream | null = null;

    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        currentStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setError("Cannot access camera: " + (e as Error).message);
      }
    }
    start();

    return () => {
      active = false;
      currentStream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  async function snap() {
    if (!videoRef.current || !canvasRef.current) return;
    setBusy(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setBusy(false); return; }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (blob) await onCapture(blob);
      setBusy(false);
    }, "image/jpeg", 0.92);
  }

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "flex", flexDirection: "column",
      zIndex: 200,
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {error ? (
          <div style={{ padding: "30px", color: "#fff", textAlign: "center", maxWidth: "400px" }}>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>⚠️ Camera unavailable</div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>{error}</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "12px" }}>
              브라우저 카메라 권한을 허용하거나, &quot;Choose File&quot;로 갤러리에서 선택해주세요.
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          />
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {/* Controls */}
      <div style={{
        padding: "20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)",
      }}>
        <button onClick={close} style={{
          padding: "10px 18px", fontSize: "14px", fontWeight: "600",
          background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
          borderRadius: "10px", cursor: "pointer", fontFamily: "inherit",
        }}>
          Cancel
        </button>

        <button
          onClick={snap}
          disabled={!stream || busy || !!error}
          style={{
            width: "72px", height: "72px", borderRadius: "50%",
            background: "#fff", border: "4px solid rgba(255,255,255,0.6)",
            cursor: busy ? "wait" : "pointer", opacity: !stream || busy ? 0.5 : 1,
          }}
          aria-label="Capture"
        />

        <button
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={!stream || !!error}
          style={{
            padding: "10px 14px", fontSize: "13px", fontWeight: "600",
            background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
            borderRadius: "10px", cursor: "pointer", fontFamily: "inherit",
          }}
          title="Flip camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
