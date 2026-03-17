import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n, type Locale } from '../../contexts/I18nContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightContent?: React.ReactNode;
}

export function Header({ title, subtitle, showBack = false, rightContent }: HeaderProps) {
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="bg-white/80 dark:bg-black/80 backdrop-blur-2xl border-b border-slate-200 dark:border-[#38383a] shadow-[0_1px_3px_rgba(0,0,0,0.05)] sticky top-0 z-50 pt-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-4 min-w-0">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors shrink-0"
              aria-label={t('common.back')}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
            </button>
          )}
          {title && (
            <div className="flex flex-col min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                  {subtitle}
                </span>
              )}
            </div>
          )}
          {!title && (
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-xl font-black text-slate-900 dark:text-white">
                {t('common.appName')}
              </span>
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {rightContent}

          {/* Language toggle - segmented control */}
          <div className="hidden sm:flex items-center bg-slate-100 dark:bg-[#2c2c2e] rounded-lg p-0.5">
            {(['ko', 'en'] as Locale[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-150 ${
                  locale === lang
                    ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="p-2.5 sm:p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2c2c2e] transition-colors"
            aria-label={resolved === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {resolved === 'dark' ? (
              // Sun icon
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              // Moon icon
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
