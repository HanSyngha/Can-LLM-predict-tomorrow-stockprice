import React from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Toggle } from '../components/ui/Toggle';
import { LLMProviderForm } from '../components/settings/LLMProviderForm';
import { GeneralSettingsForm } from '../components/settings/GeneralSettingsForm';
import { TranslateLLMForm } from '../components/settings/TranslateLLMForm';
import { ProxySettingsForm } from '../components/settings/ProxySettingsForm';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n, type Locale } from '../contexts/I18nContext';

export function Settings() {
  const { t } = useI18n();
  const { resolved, toggle } = useTheme();
  const { locale, setLocale } = useI18n();

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
          {/* Page title */}
          <div className="mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('settings.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              {t('settings.subtitle')}
            </p>
          </div>

          {/* Proxy / Service Settings */}
          <ProxySettingsForm />

          {/* LLM Provider */}
          <LLMProviderForm />

          {/* General */}
          <GeneralSettingsForm />

          {/* Translate LLM */}
          <TranslateLLMForm />

          {/* Language & Theme */}
          <Card>
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 dark:bg-sky-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('settings.languageAndTheme')}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">
                {t('settings.languageAndThemeDesc')}
              </p>
            </div>

            <div className="space-y-5">
              {/* Language */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('language.title')}
                </p>
                <div className="flex items-center bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1 w-fit">
                  {(['ko', 'en'] as Locale[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLocale(lang)}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                        locale === lang
                          ? 'bg-white dark:bg-[#2a2a2e] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {t(`language.${lang}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('theme.title')}
                </p>
                <Toggle
                  checked={resolved === 'dark'}
                  onChange={toggle}
                  label={resolved === 'dark' ? t('theme.dark') : t('theme.light')}
                />
              </div>
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
