import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
  padding?: boolean;
  variant?: 'default' | 'glass';
}

export function Card({ children, className = '', hoverable = false, onClick, padding = true, variant = 'default' }: CardProps) {
  const base = variant === 'glass'
    ? 'bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-white/[0.06]'
    : 'bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/60 dark:border-white/[0.06] shadow-sm dark:shadow-none';
  const hoverStyles = hoverable
    ? 'hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 hover:border-slate-300/80 dark:hover:border-white/10 cursor-pointer transition-all duration-200 ease-out active:scale-[0.98]'
    : '';
  const paddingStyles = padding ? 'p-4 sm:p-6' : '';

  return (
    <div
      className={`${base} ${hoverStyles} ${paddingStyles} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {children}
    </div>
  );
}
