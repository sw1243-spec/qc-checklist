# HTTPS 인증서 폴더

이 폴더에 SSL 인증서 파일 2개를 넣어주세요:
- `server-key.pem` (개인키)
- `server-cert.pem` (인증서)

## mkcert 셋업 (서버 PC에서 1회)

### 1) mkcert 설치
```powershell
# Chocolatey 사용 시
choco install mkcert

# 또는 GitHub에서 직접 다운로드
# https://github.com/FiloSottile/mkcert/releases
```

### 2) 로컬 CA 등록 (한 번만)
```powershell
mkcert -install
```
→ Windows 신뢰 루트 인증기관에 mkcert 로컬 CA가 자동 등록됩니다.

### 3) 인증서 발급 (서버 IP 포함)
```powershell
cd C:\Users\jin.sewoon\Desktop\qc-checklist
mkcert -key-file certs/server-key.pem -cert-file certs/server-cert.pem localhost 127.0.0.1 10.64.244.29
```
※ 실제 서버 IP를 추가하세요. 도메인 있으면 `qc.회사.local` 같은 것도 추가 가능.

### 4) HTTPS 서버 실행
```powershell
npm run build
npm run start:https
```
→ `https://10.64.244.29:3443` 에서 접속 가능 (포트 3443 기본)

## 각 접속 디바이스 (태블릿/PC)에서 (1회씩)

mkcert의 루트 CA 파일을 가져와서 신뢰 등록해야 합니다.

### 1) 서버 PC에서 루트 CA 파일 위치 확인
```powershell
mkcert -CAROOT
```
→ 출력된 폴더의 `rootCA.pem` 파일을 USB나 공유폴더로 복사

### 2) 태블릿/PC에서 설치
1. `rootCA.pem` 파일 더블클릭 → "인증서 설치"
2. 저장소 위치: **로컬 컴퓨터**
3. "다음" → **신뢰할 수 있는 루트 인증 기관**에 저장
4. 완료 후 브라우저 재시작

→ 이후 `https://10.64.244.29:3443` 접속 시 **경고창 없음** + 카메라 권한 작동

## 방화벽 (서버 PC)

```powershell
New-NetFirewallRule -DisplayName "QC HTTPS" -Direction Inbound -LocalPort 3443 -Protocol TCP -Action Allow
```
