import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useI18n } from '../../contexts/I18nContext';
import { settingsApi, llmsApi } from '../../lib/api';
import type { LLMConfig } from '../../lib/types';

export function TranslateLLMForm() {
  const { t } = useI18n();
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    llmsApi.getAll().then(setLlmConfigs).catch(() => {});
    settingsApi.get<{ llmId?: string }>('translate_llm').then((res) => {
      if (res.value?.llmId) setSelectedId(res.value.llmId);
    }).catch(() => {});
  }, []);

  // 저장된 값이 없으면 첫 번째 활성 LLM을 기본 선택
  const activeConfigs = llmConfigs.filter(c => c.isActive);
  const effectiveId = selectedId || (activeConfigs.length > 0 ? activeConfigs[0].id : '');

  const handleSave = async () => {
    const target = llmConfigs.find(c => c.id === effectiveId);
    if (!target) return;
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.save('translate_llm', {
        llmId: target.id,
        provider: target.provider,
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        model: target.model,
      });
      setMessage({ type: 'success', text: t('common.saved') });
    } catch {
      setMessage({ type: 'error', text: t('common.saveFailed') });
    }
    setSaving(false);
  };

  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          {t('settings.translateLlm')}
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500 mt-0.5">
          {t('settings.translateLlmDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('settings.model')}
          </label>
          <select
            value={effectiveId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer appearance-none"
          >
            {activeConfigs.length === 0 && <option value="">LLM을 먼저 추가하세요</option>}
            {activeConfigs.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
        }`}>{message.text}</div>
      )}

      <div className="mt-5">
        <Button onClick={handleSave} loading={saving} disabled={!effectiveId}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}
