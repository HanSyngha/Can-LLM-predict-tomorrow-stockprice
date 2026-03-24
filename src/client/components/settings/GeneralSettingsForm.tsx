import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useI18n } from '../../contexts/I18nContext';
import { settingsApi } from '../../lib/api';
import type { ScheduleSettings, GeneralSettings } from '../../lib/types';

export function GeneralSettingsForm() {
  const { t } = useI18n();

  const [schedule, setSchedule] = useState<ScheduleSettings>({
    predictionCron: '0 8 * * 1-5',
    reviewCron: '0 16 * * 1-5',
  });
  const [general, setGeneral] = useState<GeneralSettings>({
    flatThreshold: 0.3,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    settingsApi.getSchedule().then(setSchedule).catch(() => {});
    settingsApi.getGeneral().then(setGeneral).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        settingsApi.saveSchedule(schedule),
        settingsApi.saveGeneral(general),
      ]);
      setMessage({ type: 'success', text: t('common.saved') });
    } catch {
      setMessage({ type: 'error', text: t('common.saveFailed') });
    }
    setSaving(false);
  };

  return (
    <Card>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('settings.general')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.generalDesc')}</p>
      </div>

      <div className="space-y-4">
        <Input
          label={t('settings.predictionTime')}
          value={schedule.predictionCron}
          onChange={(e) => setSchedule((prev) => ({ ...prev, predictionCron: e.target.value }))}
          placeholder="0 8 * * 1-5"
          hint="e.g. 0 8 * * 1-5 (Mon-Fri 8:00 AM)"
        />

        <Input
          label={t('settings.reviewTime')}
          value={schedule.reviewCron}
          onChange={(e) => setSchedule((prev) => ({ ...prev, reviewCron: e.target.value }))}
          placeholder="0 18 * * 1-5"
          hint="e.g. 0 18 * * 1-5 (Mon-Fri 6:00 PM)"
        />

        <Input
          label={t('settings.flatThreshold')}
          type="number"
          step="0.1"
          min="0"
          max="10"
          value={general.flatThreshold}
          onChange={(e) => setGeneral((prev) => ({ ...prev, flatThreshold: parseFloat(e.target.value) || 0 }))}
          hint={t('settings.flatThresholdDesc')}
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
