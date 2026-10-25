import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import App from './app/App.jsx';
import './styles/global.css';
import { startMonitoring, captureReactError } from './services/monitoring.js';
import { startRum, telemetryEnabled } from './services/telemetry.js';

if (telemetryEnabled) startRum(import.meta.env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN, window.location.origin, document);

// A data router so useBlocker works (Req 20.7). App keeps its <Routes> and its own scroll effect,
// so there is no <ScrollRestoration> here.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

export default function Root() {
  useEffect(() => { startMonitoring(router); }, []);
  return <RouterProvider router={router} />;
}

function captureRootError(error, info) {
  captureReactError(error, info);
  // A failed first render must still initialize diagnostics without a mounted Root effect.
  startMonitoring(router);
}

createRoot(document.getElementById('root'), { onUncaughtError: captureRootError, onCaughtError: captureRootError, onRecoverableError: captureRootError }).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
