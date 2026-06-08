import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkAppPassword, checkAdminPassword, readConfig, writeConfig } from "@/lib/config";

const COOKIE_NAME       = "qc_auth";
const ADMIN_COOKIE_NAME = "qc_admin";

// ─── HMAC 서명 쿠키 ──────────────────────────────────────────
// 쿠키 값을 "user:만료시각.서명" 형식으로 서버가 서명해서 발급한다.
// 클라이언트가 값을 위조하면 서명 검증에서 실패한다.

function getOrCreateAuthSecret(): string {
  const cfg = readConfig();
  if (cfg.authSecret) return cfg.authSecret;
  // 최초 1회 256-bit 비밀키를 자동 생성해 config.json 에 보관
  const secret = crypto.randomBytes(32).toString("hex");
  writeConfig({ ...cfg, authSecret: secret });
  return secret;
}

function createSignedToken(role: string, maxAgeSeconds: number): string {
  const secret = getOrCreateAuthSecret();
  const exp    = Date.now() + maxAgeSeconds * 1000;
  const payload = `${role}:${exp}`;
  const sig     = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySignedToken(value: string, expectedRole: string): boolean {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx === -1) return false;

  const payload = value.slice(0, dotIdx);
  const sig     = value.slice(dotIdx + 1);

  const parts = payload.split(":");
  if (parts.length !== 2) return false;
  const [role, expStr] = parts;
  if (role !== expectedRole) return false;

  const exp = Number(expStr);
  if (isNaN(exp) || Date.now() > exp) return false; // 만료

  const secret   = getOrCreateAuthSecret();
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  // 타이밍 공격 방지를 위해 timingSafeEqual 사용
  try {
    if (expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ─── 일반 사용자 인증 ─────────────────────────────────────────

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? "";
  return verifySignedToken(value, "user");
}

export async function checkPassword(input: string): Promise<boolean> {
  return checkAppPassword(input);
}

export async function setAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSignedToken("user", 60 * 60 * 8), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
    secure: process.env.COOKIE_SECURE === "true", // HTTPS 서버(start:https)에서만 true. HTTP 배포에선 꺼짐
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

// ─── 어드민 인증 ──────────────────────────────────────────────

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? "";
  return verifySignedToken(value, "admin");
}

export async function checkAdminPw(input: string): Promise<boolean> {
  return checkAdminPassword(input);
}

export async function setAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, createSignedToken("admin", 60 * 60 * 4), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
    secure: process.env.COOKIE_SECURE === "true", // HTTPS 서버(start:https)에서만 true. HTTP 배포에선 꺼짐
  });
}

// ─── Server Action 가드 ───────────────────────────────────────
// 각 Server Action 첫 줄에서 호출한다. 미인증이면 로그인 페이지로 리다이렉트.

export async function requireUser(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");
}
