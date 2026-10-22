// 프론트엔드 진입점. 전역 스타일을 불러오고 index.html 의 #root 에 App 을 마운트한다.
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
