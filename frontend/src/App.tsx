import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import DashboardPage from './pages/Dashboard';
import SitesPage from './pages/Sites';
import AlertsPage from './pages/Alerts';
import AnalyticsPage from './pages/Analytics';
import VisionPage from './pages/Vision';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import './App.css';

type ThemeMode = 'light' | 'dark';

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
              <ProtectedRoute>
                <><NavBar theme={theme} onToggleTheme={toggleTheme} /><DashboardPage /></>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sites"
            element={
              <ProtectedRoute>
                <><NavBar theme={theme} onToggleTheme={toggleTheme} /><SitesPage /></>
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <><NavBar theme={theme} onToggleTheme={toggleTheme} /><AlertsPage /></>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <><NavBar theme={theme} onToggleTheme={toggleTheme} /><AnalyticsPage /></>
              </ProtectedRoute>
            }
          />
          <Route
            path="/vision"
            element={
              <ProtectedRoute>
                <><NavBar theme={theme} onToggleTheme={toggleTheme} /><VisionPage /></>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
