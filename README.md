# QC Check List

Internal QC checksheet web app for HANSAE MOBILITY - USA PONTIAC.

Stack: **Next.js 16 (App Router) + Prisma 5 + SQL Server**

---

## 폴더 구조

```
qc-checklist/
├── app/                  # Next.js App Router 페이지 + Server Action
│   ├── actions.ts        # 공용 Server Action
│   ├── login/            # 앱 로그인 (+ Contact 버튼)
│   ├── admin/            # → /SWJ 로 접근 (어드민)
│   ├── company/...       # 회사 → 라인 → 모델 → 파트# 선택
│   ├── checklist/        # 체크시트 작성
│   ├── submission/       # 제출 결과 + OOR 시정조치
│   ├── history/          # 제출 이력 조회 (+ Excel 일괄 다운)
│   ├── dashboard/        # 통계/차트
│   ├── print/            # 인쇄용 뷰
│   └── api/export*/      # Excel 다운로드 API
├── lib/                  # auth, db (Prisma), config, audit
├── prisma/               # schema, migrations, seed
├── public/               # logo.png, entry-bg.png
├── certs/                # HTTPS 인증서 (gitignore, certs/README.md 참고)
├── server.js             # HTTPS 커스텀 서버 (`npm run start:https`)
└── storage/
    ├── config.json       # 비밀번호 해시 (gitignore)
    └── attachments/      # OOR 사진 업로드 저장
```

---

## 개발 환경 실행

```bash
npm install            # 첫 실행 시
npx prisma generate    # Prisma Client 생성
npm run dev            # http://localhost:3000
```

DB 시드 (최초 1회):
```bash
npm run db:seed
```

---

## 🚀 배포 가이드 (Windows 사내 PC)

### ① 사전 준비

1. **SQL Server 접속 정보** → `.env` 파일에 `DATABASE_URL` 설정
2. **비밀번호 초기화** → 아래 명령으로 `storage/config.json` 생성
   ```bash
   npm run setup:auth -- <admin비밀번호> [<앱비밀번호>]
   # 예) npm run setup:auth -- MyAdminPw1234 Floor2025
   ```
   - admin 비밀번호: 어드민(`/SWJ`) 로그인용 (필수, 8자 이상)
   - 앱 비밀번호: 작업자(`/login`) 로그인용 (선택 — 생략 시 어드민 로그인 후 설정 화면에서 지정)
   - ⚠️ 이 단계를 건너뛰면 admin 로그인이 불가능해 아무 설정도 못 합니다.
3. *(선택)* **Slack 링크 고정** → `.env` 에 `APP_BASE_URL=https://qc.사내도메인` 설정 시 알림 링크가 그 주소로 고정됩니다.

### ② Production 빌드 + 실행

```bash
npm install
npm run build
npm run start
```

기본적으로 `http://localhost:3000` 에서 작동.

### ③ 같은 네트워크의 다른 기기에서 접속 (태블릿/공장 PC)

#### 1) 서버 PC IP 확인
```bash
ipconfig
```
→ `IPv4 주소` 메모 (예: `192.168.0.50`)

#### 2) 외부 접속 허용으로 실행
`package.json` 의 `start` 스크립트 수정:
```json
"start": "next start -H 0.0.0.0 -p 3000"
```

또는 명령어로:
```bash
npx next start -H 0.0.0.0 -p 3000
```

#### 3) Windows 방화벽 열기
`Windows Defender 방화벽` → `고급 설정` → `인바운드 규칙` → `새 규칙`
- 포트 → TCP → 3000 → 허용

#### 4) 다른 기기에서 접속
```
http://192.168.0.50:3000
```

---

### ④ 백그라운드 상시 실행 (재부팅 시 자동 시작)

#### 옵션 A. PM2 (가장 간단)

```bash
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install

pm2 start npm --name "qc-checklist" -- start
pm2 save
```

이후 자동 실행. 상태 확인:
```bash
pm2 status
pm2 logs qc-checklist
```

#### 옵션 B. Windows 서비스 (NSSM)

[NSSM](https://nssm.cc/) 다운로드 → `nssm install QCChecklist` →
- Path: `node.exe` 경로
- Arguments: `node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000`
- Startup directory: 프로젝트 경로

---

### ⑤ 업데이트 배포 (코드 수정 후)

```bash
git pull                    #  또는 파일 직접 복사
npm install                 # 패키지 변경 있을 시
npx prisma generate         # 스키마 변경 있을 시
npx prisma db push          # DB 컬럼 변경 있을 시
npm run build
pm2 restart qc-checklist    # PM2 사용 시
```

---

### ⑥ DB 백업 (정기)

SQL Server Management Studio에서 정기 백업 작업 등록.
Submission, CorrectiveAction, SubmissionLog 테이블이 핵심 데이터.

---

## 보안 메모

- 어드민 URL은 `/SWJ` (외부 노출 X)
- `storage/config.json` 은 git에 올라가지 않음
- `.env` 의 DB 비밀번호 절대 commit 금지
- `/api/export*` 와 `/print/[id]` 모두 로그인 필요

---

## 문의

Sewoon Jin
- +82) 10-6645-5460
- +1) 478-381-4024
