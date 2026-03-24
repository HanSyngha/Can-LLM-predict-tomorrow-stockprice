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
import { Spinner } from './components/ui/Spinner';

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

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0c]">
        <Spinner size="lg" />
      </div>
    );
  }

  // 로그인 안 되어 있으면 무조건 로그인 페이지
  if (!user) return <Login />;

  return (
    <AppShell>
      <AccessLogger />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stock/add" element={<StockAdd />} />
        <Route path="/stock/:ticker" element={<StockDetail />} />
        <Route path="/intraday" element={<Intraday />} />
        <Route path="/notes" element={<Notes />} />
        {/* Admin only */}
        <Route path="/admin" element={user.isAdmin ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={user.isAdmin ? <Settings /> : <Navigate to="/" replace />} />
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
            <AuthGate />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
