import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import PlatformApp from './platform/PlatformApp.tsx';
import { installClientFailureReporting } from './services/clientReport';

// The platform area has its own sign-in and never shares state with the school app.
const isPlatform = window.location.pathname === '/platform' || window.location.pathname.startsWith('/platform/');
if (!isPlatform) installClientFailureReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPlatform ? <PlatformApp /> : <App />}
  </StrictMode>,
);
