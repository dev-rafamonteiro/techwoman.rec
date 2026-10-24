import { BrowserRouter, useRoutes } from 'react-router-dom';
import { AuthProvider } from './shell/auth';
import { routes } from './shell/routes';
import { ToastProvider } from './ui';

function Routes() {
  return useRoutes(routes);
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
