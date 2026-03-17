import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useI18n } from '../../contexts/I18nContext';
import { settingsApi } from '../../lib/api';
import type { TranslateLLMSettings } from '../../lib/types';

export function TranslateLLMForm() {
  const { t } = useI18n();
  const [form, setForm] = useState<TranslateLLMSettings>({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    settingsApi
      .get<TranslateLLMSettings>('translate_llm')
      .then((res) => {
        if (res.value) {
          setForm((prev) => ({
            ...prev,
            provider: res.value.provider || prev.provider,
            baseUrl: res.value.baseUrl || prev.baseUrl,
            model: res.value.model || prev.model,
            // Don't populate apiKey (it may be masked)
          }));
        }
      })
      .catch(() => {
        // No translate_llm config yet, use defaults
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.save('translate_llm', form);
      setMessage({ type: 'success', text: t('common.saved') });
    } catch {
      setMessage({ type: 'error', text: t('common.saveFailed') });
    }
    setSaving(false);
  };

  return (
    <Card>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">
          {t('settings.translateLlm')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('settings.translateLlmDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label={t('settings.provider')}
          value={form.provider}
          onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
          placeholder="e.g. openai, zai, deepseek"
        />
        <Input
          label={t('settings.baseUrl')}
          value={form.baseUrl}
          onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder="https://api.openai.com/v1"
        />
        <Input
          label={t('settings.apiKey')}
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
          placeholder="Leave empty to keep current"
        />
        <Input
          label={t('settings.model')}
          value={form.model}
          onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
          placeholder="e.g. gpt-4o-mini"
        />
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6">
        <Button onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}
