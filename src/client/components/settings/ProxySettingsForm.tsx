import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useI18n } from '../../contexts/I18nContext';
import { settingsApi } from '../../lib/api';

interface ProxySettings {
  serviceId: string;
  deptName: string;
}

export function ProxySettingsForm() {
  const { t } = useI18n();
  const [form, setForm] = useState<ProxySettings>({
    serviceId: 'stock',
    deptName: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    settingsApi
      .get<ProxySettings>('proxy_settings')
      .then((res) => {
        if (res.value) {
          setForm({
            serviceId: res.value.serviceId || 'stock',
            deptName: res.value.deptName || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.save('proxy_settings', form);
      setMessage({ type: 'success', text: t('common.saved') });
    } catch {
      setMessage({ type: 'error', text: t('common.saveFailed') });
    }
    setSaving(false);
  };

  return (
    <Card>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('settings.proxySettings')}
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">
          {t('settings.proxySettingsDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label={t('settings.serviceId')}
          value={form.serviceId}
          onChange={(e) => setForm((prev) => ({ ...prev, serviceId: e.target.value }))}
          placeholder="stock"
          hint={t('settings.serviceIdHint')}
        />
        <Input
          label={t('settings.deptName')}
          value={form.deptName}
          onChange={(e) => setForm((prev) => ({ ...prev, deptName: e.target.value }))}
          placeholder="S/W혁신팀(S.LSI)"
          hint={t('settings.deptNameHint')}
        />
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-xl text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-5">
        <Button onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}
