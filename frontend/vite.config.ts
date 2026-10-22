// Vite 설정. Tailwind CSS 플러그인을 쓰고, 개발 서버가 frontend 밖의
// ../assets/icon(로고 이미지) 파일도 제공할 수 있게 허용한다.
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [tailwindcss()], server: { fs: { allow: ['.', '../assets/icon'] } } });
