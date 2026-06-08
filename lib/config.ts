import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

const CONFIG_PATH = path.join(process.cwd(), "storage", "config.json");

type Config = {
  adminPasswordHash: string;
  appPasswordHash?: string; // 설정 시 .env 대신 사용
  authSecret?: string;      // HMAC 서명 쿠키용 비밀키 (없으면 최초 1회 자동 생성)
  // 알림 설정
  slackWebhookUrl?: string;
  slackEnabled?: boolean;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpUser?: string;
  emailSmtpPass?: string; // 평문 저장 (서버 내부망용)
  emailFrom?: string;
  emailTo?: string;       // 콤마로 구분된 리스트
  emailEnabled?: boolean;
  // 브랜딩 (화면 문구)
  brandLabel?: string;    // 상단 작은 라벨 (기본 "Hansae Mobility")
  appTitle?: string;      // 큰 제목 / 브라우저 탭 (기본 "QC Check Sheet")
  homeSubtitle?: string;  // 홈 부제목
};

// 브랜딩 문구 (없으면 기본값)
export function getBranding() {
  const c = readConfig();
  return {
    brandLabel: c.brandLabel || "Hansae Mobility",
    appTitle: c.appTitle || "QC Check Sheet",
    homeSubtitle: c.homeSubtitle || "Select a customer to continue.",
  };
}

export function setBranding(patch: { brandLabel?: string; appTitle?: string; homeSubtitle?: string }) {
  const config = readConfig();
  writeConfig({ ...config, ...patch });
}

export function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { adminPasswordHash: "" };
  }
}

export function writeConfig(config: Config) {
  // storage/ 폴더가 없으면(첫 배포 등) 자동 생성 후 기록
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isBcrypt(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$");
}

// SHA-256 해시와 bcrypt 해시 모두 비교. bcrypt가 아니면 로그인 성공 후 자동 마이그레이션.
async function verifyAndMigrate(
  input: string,
  stored: string,
  save: (hash: string) => void
): Promise<boolean> {
  if (isBcrypt(stored)) {
    return bcrypt.compare(input, stored);
  }
  // 기존 SHA-256 해시 — 일치하면 bcrypt로 재저장
  if (sha256(input) !== stored) return false;
  save(await bcrypt.hash(input, BCRYPT_ROUNDS));
  return true;
}

export async function checkAdminPassword(input: string): Promise<boolean> {
  const config = readConfig();
  return verifyAndMigrate(input, config.adminPasswordHash, (hash) => {
    const c = readConfig();
    c.adminPasswordHash = hash;
    writeConfig(c);
  });
}

export async function checkAppPassword(input: string): Promise<boolean> {
  const config = readConfig();
  if (!config.appPasswordHash) return false;
  return verifyAndMigrate(input, config.appPasswordHash, (hash) => {
    const c = readConfig();
    c.appPasswordHash = hash;
    writeConfig(c);
  });
}

export async function setAdminPassword(newPassword: string) {
  const config = readConfig();
  config.adminPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeConfig(config);
}

export async function setAppPassword(newPassword: string) {
  const config = readConfig();
  config.appPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeConfig(config);
}

export function updateNotificationSettings(patch: Partial<Config>) {
  const config = readConfig();
  writeConfig({ ...config, ...patch });
}
