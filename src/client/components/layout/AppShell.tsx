import React from 'react';
import { MobileNav } from './MobileNav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      {children}
      <MobileNav />
      {/* Spacer for mobile nav + safe area */}
      <div className="h-14 pb-safe md:hidden" />
    </div>
  );
}
