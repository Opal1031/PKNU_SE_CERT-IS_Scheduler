/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API 주소. 지정하지 않으면 http://127.0.0.1:8000 을 사용한다. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
