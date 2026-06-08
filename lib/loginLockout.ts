// 로그인 실패 잠금 (in-memory)
// - 5회 실패 시 1분 잠금
// - 성공 시 리셋
// - 잠금 시간 지나면 자동 해제

import { headers } from "next/headers";

type Attempt = {
  failCount: number;
  lockedUntil: number | null;
  lastFailAt: number;
};

const MAX_FAILS = 5;
const LOCK_DURATION_MS = 60 * 1000; // 1분
const FAIL_RESET_MS = 10 * 60 * 1000; // 10분간 실패 카운트 유지

// IP/scope별 시도 기록
const attempts = new Map<string, Attempt>();

async function getKey(scope: string): Promise<string> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0].trim()
      || h.get("x-real-ip")
      || "unknown";
    return `${scope}:${ip}`;
  } catch {
    return `${scope}:unknown`;
  }
}

export async function checkLockout(scope: "user" | "admin"): Promise<{ locked: boolean; remainingMs?: number }> {
  const key = await getKey(scope);
  const a = attempts.get(key);
  if (!a) return { locked: false };

  const now = Date.now();
  // 잠금 시간 만료 → 해제
  if (a.lockedUntil && now >= a.lockedUntil) {
    attempts.delete(key);
    return { locked: false };
  }
  // 실패 카운트가 오래 안 갱신되면 리셋
  if (!a.lockedUntil && now - a.lastFailAt > FAIL_RESET_MS) {
    attempts.delete(key);
    return { locked: false };
  }
  if (a.lockedUntil) {
    return { locked: true, remainingMs: a.lockedUntil - now };
  }
  return { locked: false };
}

export async function recordFail(scope: "user" | "admin"): Promise<{ locked: boolean; remainingMs?: number; failCount: number }> {
  const key = await getKey(scope);
  const now = Date.now();
  const prev = attempts.get(key);

  // 이전 실패가 오래되었으면 카운트 리셋
  const baseFailCount = prev && now - prev.lastFailAt > FAIL_RESET_MS ? 0 : (prev?.failCount ?? 0);
  const failCount = baseFailCount + 1;

  const next: Attempt = {
    failCount,
    lastFailAt: now,
    lockedUntil: failCount >= MAX_FAILS ? now + LOCK_DURATION_MS : null,
  };
  attempts.set(key, next);

  return {
    locked: !!next.lockedUntil,
    remainingMs: next.lockedUntil ? next.lockedUntil - now : undefined,
    failCount,
  };
}

export async function clearAttempts(scope: "user" | "admin") {
  const key = await getKey(scope);
  attempts.delete(key);
}
