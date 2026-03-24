import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2.5 text-sm rounded-xl
          bg-slate-50 dark:bg-white/[0.04]
          border border-slate-200 dark:border-white/[0.08]
          text-slate-900 dark:text-white
          placeholder-slate-400 dark:placeholder-slate-600
          focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
          ${error ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-500/30' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>
      )}
      {hint && !error && (
        <p className="text-[11px] text-slate-400 dark:text-slate-600">{hint}</p>
      )}
    </div>
  );
}
