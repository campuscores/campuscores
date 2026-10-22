import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import App from './app/App.jsx';
import './styles/global.css';

// A data router so useBlocker works (Req 20.7). App keeps its <Routes> and its own scroll effect,
// so there is no <ScrollRestoration> here.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
