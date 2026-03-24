import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { StockDetail } from './pages/StockDetail';
import { StockAdd } from './pages/StockAdd';
import { Settings } from './pages/Settings';
import { Notes } from './pages/Notes';
import { Admin } from './pages/Admin';
import { Intraday } from './pages/Intraday';
import { Login } from './pages/Login';

function AccessLogger() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('stock_evolving_token');
    if (!token) return;
    fetch('/api/auth/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: location.pathname }),
    }).catch(() => {});
  }, [location.pathname, user]);

  return null;
}

/** Admin-only: not logged in → login page, not admin → home */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Login />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <AppShell>
      {user && <AccessLogger />}
      <Routes>
        {/* Public - 로그인 없이 누구나 접근 */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/stock/add" element={<StockAdd />} />
        <Route path="/stock/:ticker" element={<StockDetail />} />
        <Route path="/intraday" element={<Intraday />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/login" element={<Login />} />
        {/* Admin only - 로그인 + syngha.han만 */}
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
