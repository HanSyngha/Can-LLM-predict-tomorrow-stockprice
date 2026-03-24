import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { StockDetail } from './pages/StockDetail';
import { StockAdd } from './pages/StockAdd';
import { Settings } from './pages/Settings';
import { Notes } from './pages/Notes';
import { Admin } from './pages/Admin';
import { Intraday } from './pages/Intraday';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/stock/add" element={<StockAdd />} />
              <Route path="/stock/:ticker" element={<StockDetail />} />
              <Route path="/intraday" element={<Intraday />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
