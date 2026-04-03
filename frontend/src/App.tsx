import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import './App.css';

type ThemeMode = 'light' | 'dark';

const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const SitesPage = lazy(() => import('./pages/Sites'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const AnalyticsPage = lazy(() => import('./pages/Analytics'));
const VisionPage = lazy(() => import('./pages/Vision'));
const SnapshotsPage = lazy(() => import('./pages/Snapshots'));

function RouteLoader() {
  return (
    <div className="route-loader-shell">
      <div className="route-loader-card">
        <span className="eyebrow">Loading</span>
        <h2>Preparing workspace</h2>
        <p>Bringing the next view into the control room.</p>
      </div>
    </div>
  );
}

function ProtectedPage({
  children,
  theme,
  onToggleTheme,
}: {
  children: ReactNode;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <ProtectedRoute>
      <div className="workspace-shell">
        <NavBar theme={theme} onToggleTheme={onToggleTheme} />
        <main className="workspace-content">{children}</main>
      </div>
    </ProtectedRoute>
  );
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/register" element={<RegisterPage theme={theme} onToggleTheme={toggleTheme} />} />
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <DashboardPage />
                </ProtectedPage>
              }
            />
            <Route
              path="/sites"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <SitesPage />
                </ProtectedPage>
              }
            />
            <Route
              path="/alerts"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <AlertsPage />
                </ProtectedPage>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <AnalyticsPage />
                </ProtectedPage>
              }
            />
            <Route
              path="/vision"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <VisionPage />
                </ProtectedPage>
              }
            />
            <Route
              path="/snapshots"
              element={
                <ProtectedPage theme={theme} onToggleTheme={toggleTheme}>
                  <SnapshotsPage />
                </ProtectedPage>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
