# QC Check Sheet — 프로젝트 가이드

> 폴더/파일이 무슨 역할인지, 누가 건드리는지, 수정할 때 어디를 봐야 하는지 정리한 문서.

---

## 1. 책임 구분 (누가 무엇을 만지나)

| 구분 | 대상 | 설명 |
|------|------|------|
| 🟦 **IT팀** | `.env` 파일만 | DB 연결 정보(서버/계정/비번). **코드는 절대 안 만짐** |
| 🟩 **개발(나)** | `app/`, `lib/`, `prisma/` | 화면·로직·DB 구조 수정 |
| ⬜ **아무도 안 만짐** | `node_modules/`, `.next/`, 자동생성 파일 | 빌드가 알아서 생성 |
| 🟨 **운영 데이터** | `storage/`, SQL Server DB | 백업 대상. 덮어쓰기 금지 |

**핵심:** IT는 `.env` 한 곳 + 빌드 명령만. DB 테이블 매핑은 Prisma가 자동 → 손으로 매핑할 게 없음.

---

## 2. 폴더 지도

```
qc-checklist/
│
├─ 🟦 .env                  ← [IT] DB 연결정보 (서버/계정/비번)
│
├─ 🟩 prisma/
│   └─ schema.prisma        ← DB 구조(테이블/컬럼). 열 추가 시 여기 + db push
│
├─ 🟩 lib/                  ← 공용 로직 (화면 아님)
│   ├─ db.ts                ← DB 연결 (Prisma) — 거의 안 건드림
│   ├─ auth.ts              ← 로그인/인증/쿠키
│   ├─ config.ts            ← 비번·Slack·이메일·브랜딩 설정 읽기/쓰기
│   ├─ audit.ts             ← 변경 이력 기록
│   ├─ notify.ts            ← Slack OOR 알림
│   ├─ email.ts             ← 이메일 전송
│   ├─ dailyReport.ts       ← 일일 리포트 내용 생성
│   └─ loginLockout.ts      ← 로그인 5회 실패 잠금
│
├─ 🟩 app/                  ← 모든 화면 + API (Next.js)
│   ├─ page.tsx             ← 홈 (회사 선택)
│   ├─ layout.tsx           ← 전체 레이아웃 + 브라우저 탭 제목
│   ├─ globals.css          ← 전체 디자인(색·글꼴·유리효과)
│   ├─ actions.ts           ← 핵심 저장 로직 (제출·로그인 등)
│   │
│   ├─ login/               ← 일반 로그인 화면
│   ├─ company/             ← 회사→라인→모델→파트넘버 선택 화면들
│   ├─ checklist/           ← ★체크시트 작성 화면 (입력 폼)
│   ├─ submission/          ← 제출 결과 조회 + 사진/시정조치
│   ├─ history/             ← 기록 조회
│   ├─ dashboard/           ← 대시보드(통계)
│   ├─ production/          ← 트렌드 차트
│   ├─ spc/                 ← SPC 차트
│   ├─ print/              ← 인쇄/PDF 화면
│   ├─ device/             ← 기기(태블릿) 이름 설정
│   ├─ components/          ← 공용 UI 조각
│   ├─ api/                 ← 파일 업로드·사진·엑셀·크론 등 API
│   └─ admin/              ← ★어드민 (/SWJ) 전체 관리
│       ├─ templates/      ← 템플릿(체크시트 양식) 편집
│       ├─ structure/      ← 구조도(회사~템플릿 트리)
│       ├─ companies/      ← 회사/라인/모델 관리
│       ├─ workers/        ← 작업자 관리
│       ├─ chart/          ← 차트 설정
│       ├─ notifications/  ← Slack/이메일 설정
│       ├─ audit/          ← 감사 로그
│       └─ settings/       ← 비밀번호·브랜딩 설정
│
├─ 🟨 storage/             ← [백업대상] config.json + 업로드 사진
├─ 🟩 scripts/             ← 일회성 데이터 import 스크립트
├─ certs/                  ← HTTPS 인증서
├─ server.js               ← HTTPS 서버 실행
└─ 설정파일들              ← next.config / tsconfig / eslint (건드릴 일 거의 없음)
```

---

## 3. "이거 고치려면 어디?" — 수정 위치 빠른 찾기

| 고치고 싶은 것 | 파일 |
|----------------|------|
| 체크시트 입력 화면 | `app/checklist/[templateId]/ChecklistForm.tsx` |
| 제출 시 저장 로직·검증 | `app/actions.ts` (submitChecklist) |
| 전체 색/디자인 | `app/globals.css` |
| 홈 화면 | `app/page.tsx` |
| 로그인 화면 | `app/login/page.tsx` + `LoginCard.tsx` |
| 템플릿 편집 화면 | `app/admin/templates/[id]/TemplateEditor.tsx` |
| 제출 결과 화면 | `app/submission/[id]/page.tsx` |
| 인쇄 양식 | `app/print/[id]/page.tsx` |
| Slack 알림 내용 | `lib/notify.ts` |
| 이메일 리포트 내용 | `lib/dailyReport.ts` |
| **DB에 열 추가** | `prisma/schema.prisma` → `npx prisma db push` |

---

## 4. DB에 새 열(컬럼) 추가하는 법 (진세운)

1. `prisma/schema.prisma`의 해당 model에 한 줄 추가
   - 텍스트: `필드명 String?`
   - 숫자: `필드명 Float?`
   - 필수면 `?` 빼기
2. `npx prisma db push` (기존 데이터 유지, 새 열만 추가)
3. 화면 표시는 관련 `.tsx` 파일 수정 (작성/조회/인쇄)
4. `npm run build` → 재시작

⚠️ 1~2는 안전, 3은 React 코드라 신중히 (AI에 맡기는 게 안전).

---

## 5. 서버 배포 (IT팀)

```
1. qc-checklist 폴더 복사  (node_modules, .next 제외 가능)
2. .env 파일에 회사 DB 정보 입력
3. npm install
4. npx prisma db push      (테이블 생성/갱신)
5. npm run build
6. node server.js  또는  npm run start
```

⚠️ **storage/ 폴더는 서버 것을 유지** (덮어쓰면 비번·사진 초기화됨)

---

## 6. 데이터는 어디 있나 (백업 대상)

| 데이터 | 위치 |
|--------|------|
| 제출 기록·측정값·템플릿·회사/라인/모델 | **SQL Server (qc_checklist DB)** |
| 비번·Slack·이메일·브랜딩 | `storage/config.json` |
| 업로드 사진 | `storage/attachments/` |

코드 폴더(app, lib 등)엔 데이터 없음 → 코드만 교체해도 기록 그대로 유지됨.
