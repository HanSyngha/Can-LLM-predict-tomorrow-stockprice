import React from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Toggle } from '../components/ui/Toggle';
import { LLMProviderForm } from '../components/settings/LLMProviderForm';
import { GeneralSettingsForm } from '../components/settings/GeneralSettingsForm';
import { TranslateLLMForm } from '../components/settings/TranslateLLMForm';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n, type Locale } from '../contexts/I18nContext';

export function Settings() {
  const { t } = useI18n();
  const { resolved, toggle } = useTheme();
  const { locale, setLocale } = useI18n();

  return (
    <>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
          {/* LLM Provider */}
          <LLMProviderForm />

          {/* General */}
          <GeneralSettingsForm />

          {/* Translate LLM */}
          <TranslateLLMForm />

          {/* Language & Theme */}
          <Card>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {t('settings.languageAndTheme')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('settings.languageAndThemeDesc')}
              </p>
            </div>

            <div className="space-y-6">
              {/* Language */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  {t('language.title')}
                </p>
                <div className="flex items-center bg-slate-100 dark:bg-[#2c2c2e] rounded-lg p-1 w-fit">
                  {(['ko', 'en'] as Locale[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLocale(lang)}
                      className={`px-4 py-2 text-sm font-bold rounded-md transition-all duration-150 ${
                        locale === lang
                          ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {t(`language.${lang}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
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
