import { BrowserRouter, useRoutes } from 'react-router-dom';
import { RouteAnalytics } from './analytics';
import { AuthProvider } from './shell/auth';
import { PageMeta } from './shell/PageMeta';
import { routes } from './shell/routes';
import { ToastProvider } from './ui';

function Routes() {
  return useRoutes(routes);
}

export function App() {
  return (
    <BrowserRouter>
      {/* pageview só nas páginas públicas (docs/PLAN.md > Analytics) */}
      <RouteAnalytics />
      <PageMeta />
      <AuthProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
