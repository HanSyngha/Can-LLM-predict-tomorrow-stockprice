import React from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
      {/* Spacer for mobile nav + safe area */}
      <div className="h-16 pb-safe md:hidden fixed bottom-0 left-0 right-0 pointer-events-none" />
    </div>
  );
}
