/* eslint-disable @typescript-eslint/no-require-imports */
// HTTPS 서버 (자체 서명 인증서 사용)
// 사용법: node server.js
// 환경 변수:
//   HTTPS_PORT (default 3443)
//   HTTPS_HOST (default 0.0.0.0)
//   SSL_KEY  (default ./certs/server-key.pem)
//   SSL_CERT (default ./certs/server-cert.pem)

const { createServer } = require("https");
const { parse } = require("url");
const next = require("next");
const fs = require("fs");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
// HTTPS로 서빙하므로 secure 쿠키 활성화 (auth.ts가 이 값을 본다)
process.env.COOKIE_SECURE = "true";
const port = Number(process.env.HTTPS_PORT || 3443);
const hostname = process.env.HTTPS_HOST || "0.0.0.0";

const keyPath = process.env.SSL_KEY  || path.join(__dirname, "certs", "server-key.pem");
const certPath = process.env.SSL_CERT || path.join(__dirname, "certs", "server-cert.pem");

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error("\n❌ SSL 인증서를 찾을 수 없습니다.");
  console.error(`   key:  ${keyPath}`);
  console.error(`   cert: ${certPath}`);
  console.error("\n📌 인증서 발급 방법 (mkcert 사용):");
  console.error("   1) choco install mkcert      (Windows)");
  console.error("   2) mkcert -install            (로컬 CA 등록 - 1회만)");
  console.error("   3) mkdir certs                (폴더 생성)");
  console.error("   4) mkcert -key-file certs/server-key.pem -cert-file certs/server-cert.pem localhost 127.0.0.1 10.64.244.29");
  console.error("   5) npm run start:https\n");
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const httpsOptions = {
  key:  fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, hostname, () => {
    console.log(`\n✅ HTTPS server ready`);
    console.log(`   Local:    https://localhost:${port}`);
    console.log(`   Network:  https://${hostname === "0.0.0.0" ? "<your-ip>" : hostname}:${port}\n`);
  });
});
