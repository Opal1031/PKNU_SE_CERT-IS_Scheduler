// Vite 클라이언트 타입과 import.meta.env 로 읽는 환경 변수의 타입 선언.
/// <reference types="vite/client" />

// 프론트엔드에서 쓰는 VITE_ 환경 변수 목록
interface ImportMetaEnv {
  /** 백엔드 API 주소. 지정하지 않으면 개발 서버는 http://127.0.0.1:8000, 배포 빌드는 같은 사이트 주소를 사용한다. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
