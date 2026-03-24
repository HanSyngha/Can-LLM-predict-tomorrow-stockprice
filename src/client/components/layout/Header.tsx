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
    <header className="bg-white/70 dark:bg-[#0e0e10]/70 backdrop-blur-2xl border-b border-slate-200/60 dark:border-[#2a2a2c] sticky top-0 z-40 pt-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-4 min-w-0">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors shrink-0 -ml-1 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
              aria-label={t('common.back')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {title && (
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight truncate tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <span className="text-xs sm:text-sm font-medium text-slate-400 dark:text-slate-500 truncate">
                  {subtitle}
                </span>
              )}
            </div>
          )}
          {!title && (
            <div className="flex items-center gap-2.5 md:hidden">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Stock AI
              </span>
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {rightContent}

          {/* Language toggle - mobile only (sidebar has it on desktop) */}
          <div className="flex md:hidden items-center bg-slate-100 dark:bg-[#1c1c1e] rounded-lg p-0.5">
            {(['ko', 'en'] as Locale[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
                  locale === lang
                    ? 'bg-white dark:bg-[#38383a] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle - mobile only */}
          <button
            onClick={toggle}
            className="md:hidden p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            aria-label={resolved === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {resolved === 'dark' ? (
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
