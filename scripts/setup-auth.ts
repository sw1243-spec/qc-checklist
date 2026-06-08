// 최초 1회 인증 초기화 — 새 서버(회사 PC 등)에 배포 후 실행한다.
//
// 사용법:
//   npm run setup:auth -- <admin비밀번호> [<앱비밀번호>]
//   예) npm run setup:auth -- MyAdminPw1234 Floor2025
//
// - admin 비밀번호: 어드민(/SWJ) 로그인용 (필수)
// - 앱 비밀번호: 작업자(/login) 로그인용 (선택, 생략 시 나중에 어드민에서 설정)
// 기존 config.json 이 있으면 비밀번호만 갱신하고 나머지 설정(authSecret 등)은 보존한다.

import { readConfig, writeConfig, setAdminPassword, setAppPassword } from "../lib/config";

async function main() {
  const [adminPw, appPw] = process.argv.slice(2);

  if (!adminPw || adminPw.length < 8) {
    console.error("[X] Admin password must be at least 8 characters.");
    console.error("    Usage: npm run setup:auth -- <adminPassword> [<appPassword>]");
    process.exit(1);
  }

  // config.json 이 없으면 빈 골격을 먼저 만들어 둔다(storage/ 자동 생성 포함)
  const existing = readConfig();
  if (!existing.adminPasswordHash) {
    writeConfig({ adminPasswordHash: "" });
  }

  await setAdminPassword(adminPw);
  console.log("[OK] Admin password set.");

  if (appPw) {
    if (appPw.length < 6) {
      console.error("[!] App password too short, skipped (6+ chars recommended). Set it later in the admin screen.");
    } else {
      await setAppPassword(appPw);
      console.log("[OK] App (worker) password set.");
    }
  } else {
    console.log("[i] App password not set - configure it after admin login in the settings screen.");
  }

  console.log("\nSetup complete. You can now log in to the admin at /SWJ.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
