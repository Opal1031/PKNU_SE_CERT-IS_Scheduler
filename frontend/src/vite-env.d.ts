/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API 주소. 지정하지 않으면 http://127.0.0.1:8000 을 사용한다. */
  readonly VITE_API_URL?: string;
  /** 'true'면 배포 빌드에서도 데모 로그인·사용자 미리보기를 보여 준다(백엔드 없는 데모 배포용). */
  readonly VITE_DEMO_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
