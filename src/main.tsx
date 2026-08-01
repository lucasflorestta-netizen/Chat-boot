import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initTheme } from './lib/theme';
import { preferInstalledServerIp } from './lib/prefer-server-ip';

initTheme();
void preferInstalledServerIp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
