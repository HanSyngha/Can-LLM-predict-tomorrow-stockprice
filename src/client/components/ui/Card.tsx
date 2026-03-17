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
    ? 'bg-white/60 dark:bg-[#1c1c1e]/60 backdrop-blur-lg rounded-xl shadow-card dark:shadow-card-dark border border-slate-200/60 dark:border-[#38383a]/60'
    : 'bg-white dark:bg-[#1c1c1e] rounded-xl shadow-card dark:shadow-card-dark border border-slate-200/60 dark:border-[#38383a]/60';
  const hoverStyles = hoverable
    ? 'hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300 dark:hover:border-[#48484a] cursor-pointer transition-all duration-200 ease-out active:scale-[0.98]'
    : '';
  const paddingStyles = padding ? 'p-3 sm:p-6' : '';

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
