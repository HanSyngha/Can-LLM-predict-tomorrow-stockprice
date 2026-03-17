import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useI18n } from '../../contexts/I18nContext';
import { llmsApi } from '../../lib/api';
import type { LLMConfig } from '../../lib/types';

const MAX_LLMS = 5;

export function LLMProviderForm() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state for add/edit
  const [form, setForm] = useState<LLMConfig>({
    id: '',
    name: '',
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4/',
    apiKey: '',
    model: '',
    isActive: true,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const data = await llmsApi.getAll();
      setConfigs(data);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.id || !form.name || !form.model) {
      setMessage({ type: 'error', text: 'ID, Name, and Model are required' });
      return;
    }
    setMessage(null);
    try {
      const updated = await llmsApi.add(form);
      setConfigs(updated);
      setShowAdd(false);
      setForm({ id: '', name: '', provider: 'zai', baseUrl: 'https://api.z.ai/api/coding/paas/v4/', apiKey: '', model: '', isActive: true });
      setMessage({ type: 'success', text: t('common.saved') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.saveFailed') });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setMessage(null);
    try {
      const updated = await llmsApi.update(editingId, {
        name: form.name,
        provider: form.provider,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        isActive: form.isActive,
      });
      setConfigs(updated);
      setEditingId(null);
      setMessage({ type: 'success', text: t('common.saved') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.saveFailed') });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('settings.deleteConfirm'))) return;
    setMessage(null);
    try {
      const updated = await llmsApi.remove(id);
      setConfigs(updated);
      setMessage({ type: 'success', text: t('common.saved') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.saveFailed') });
    }
  };

  const handleToggleActive = async (config: LLMConfig) => {
    try {
      const updated = await llmsApi.update(config.id, { isActive: !config.isActive });
      setConfigs(updated);
    } catch {
      // ignore
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await llmsApi.test(id);
      setTestResult({ id, success: result.success, error: result.error });
    } catch (err) {
      setTestResult({ id, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
    setTestingId(null);
  };

  const startEdit = (config: LLMConfig) => {
    setEditingId(config.id);
    setShowAdd(false);
    setForm({
      ...config,
      apiKey: '', // Don't pre-fill masked API key
    });
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {t('settings.llmConfigs')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('settings.llmConfigsDesc')}
          </p>
        </div>
        {configs.length < MAX_LLMS && !showAdd && !editingId && (
          <Button
            size="sm"
            onClick={() => {
              setShowAdd(true);
              setEditingId(null);
              setForm({ id: '', name: '', provider: 'zai', baseUrl: 'https://api.z.ai/api/coding/paas/v4/', apiKey: '', model: '', isActive: true });
            }}
          >
            {t('settings.addLLM')}
          </Button>
        )}
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* LLM Cards */}
      <div className="space-y-3">
        {configs.map((config) => (
          <div
            key={config.id}
            className={`p-4 rounded-lg border transition-all ${
              config.isActive
                ? 'border-slate-200 dark:border-[#38383a] bg-white dark:bg-[#1c1c1e]'
                : 'border-slate-100 dark:border-[#2c2c2e] bg-slate-50 dark:bg-[#2c2c2e]/50 opacity-60'
            }`}
          >
            {editingId === config.id ? (
              /* Edit Form */
              <div className="space-y-3">
                <Input
                  label={t('settings.llmName')}
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  label={t('settings.baseUrl')}
                  value={form.baseUrl}
                  onChange={(e) => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                />
                <Input
                  label={t('settings.apiKey')}
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Leave empty to keep current"
                />
                <Input
                  label={t('settings.model')}
                  value={form.model}
                  onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
                />
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button size="sm" onClick={handleUpdate}>{t('common.save')}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : (
              /* Display Card */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-white text-sm">{config.name}</span>
                      <Badge variant={config.isActive ? 'success' : 'neutral'}>
                        {config.isActive ? t('settings.llmActive') : t('settings.llmInactive')}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {config.model} &middot; {config.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Test result indicator */}
                  {testResult && testResult.id === config.id && (
                    <span className={`text-xs font-bold ${testResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {testResult.success ? t('common.connectionSuccess') : testResult.error || t('common.connectionFailed')}
                    </span>
                  )}
                  {testingId === config.id && <Spinner size="sm" />}

                  <button
                    onClick={() => handleTest(config.id)}
                    disabled={testingId !== null}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
                  >
                    {t('common.testConnection')}
                  </button>
                  <button
                    onClick={() => handleToggleActive(config)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    {config.isActive ? 'OFF' : 'ON'}
                  </button>
                  <button
                    onClick={() => startEdit(config)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    className="text-xs font-bold text-rose-500 hover:text-rose-700"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="mt-4 p-4 rounded-lg border border-dashed border-slate-300 dark:border-[#48484a] bg-slate-50/50 dark:bg-[#2c2c2e]/30">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t('settings.addLLM')}</h4>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('settings.llmId')}
                value={form.id}
                onChange={(e) => setForm(prev => ({ ...prev, id: e.target.value }))}
                placeholder="e.g. glm-5"
              />
              <Input
                label={t('settings.llmName')}
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. GLM-5"
              />
            </div>
            <Input
              label={t('settings.baseUrl')}
              value={form.baseUrl}
              onChange={(e) => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
            />
            <Input
              label={t('settings.apiKey')}
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
            />
            <Input
              label={t('settings.model')}
              value={form.model}
              onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="e.g. glm-5"
            />
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button size="sm" onClick={handleAdd}>{t('common.add')}</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Max LLMs indicator */}
      {configs.length >= MAX_LLMS && (
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
          {t('settings.maxLLMReached')}
        </p>
      )}
      {configs.length < MAX_LLMS && !showAdd && !editingId && (
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
          {t('settings.maxLLMs')} ({configs.length}/{MAX_LLMS})
        </p>
      )}
    </Card>
  );
}
