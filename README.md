# CERT-IS 프론트엔드

현재 개발 대상은 `frontend/`의 React + TypeScript + Tailwind CSS 앱임. 기존 개선안과 로컬 운영 흐름을 이관했음.

## 실행

Node.js 22.18 이상과 pnpm 11 사용함.

```powershell
cd frontend
pnpm install
pnpm dev
```

주소: http://127.0.0.1:8765/#/dashboard

타입 검사·배포 빌드는 `pnpm build`, 운영 로직 검사는 `pnpm test`로 실행함. 실행법과 검증 내용은 [frontend/README.md](frontend/README.md)에 있음.

설계·이전 시제품 검토 기록은 `docs/frontend/`, 설문 문항·가중치는 `docs/recommend/`에 있음. 실제 인증·API·DB·WebSocket·Gemini는 아직 연결하지 않았음.
