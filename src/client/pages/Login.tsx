import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SSO_BASE_URL = 'https://genai.samsungds.net:36810';
const SSO_PATH = '/direct_sso';

export function Login() {
  const { user, login, loginWithSSOToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user]);

  // SSO callback: ?data=<urlEncodedJson>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    if (!data) return;
    setProcessing(true);
    (async () => {
      try {
        const decoded = decodeURIComponent(data);
        const ssoData = JSON.parse(decoded);
        const jsonData = JSON.stringify({ loginid: ssoData.loginid, username: ssoData.username, deptname: ssoData.deptname || '', timestamp: Date.now() });
        const ssoToken = btoa(unescape(encodeURIComponent(jsonData)));
        await loginWithSSOToken(`sso.${ssoToken}`);
        window.history.replaceState({}, '', '/');
      } catch {
        try {
          const decoded = decodeURIComponent(data);
          const ssoData = JSON.parse(decoded);
          await login({ loginid: ssoData.loginid, username: ssoData.username || ssoData.loginid, deptname: ssoData.deptname || '' });
          window.history.replaceState({}, '', '/');
        } catch { setError('SSO 인증 실패'); }
      }
      setProcessing(false);
    })();
  }, []);

  const handleSSOLogin = () => {
    const redirectUrl = window.location.origin + '/';
    const ssoUrl = new URL(SSO_PATH, SSO_BASE_URL);
    ssoUrl.searchParams.set('redirect_url', redirectUrl);
    window.location.href = ssoUrl.toString();
  };

  const handleManualLogin = async () => {
    if (!manualId.trim()) return;
    setError(null);
    try { await login({ loginid: manualId.trim(), username: manualId.trim(), deptname: '' }); }
    catch { setError('로그인 실패'); }
  };

  if (processing) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8 pb-20 md:pb-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">SSO 인증 처리 중...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 md:pb-8">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">관리자 로그인</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">설정/모니터 접근에는 로그인이 필요합니다</p>
          </div>

          <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/60 dark:border-white/[0.06] shadow-sm p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-sm text-rose-700 dark:text-rose-300 font-medium">{error}</div>
            )}

            <button onClick={handleSSOLogin} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all duration-150 shadow-sm shadow-indigo-500/20 active:scale-[0.98] cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              SSO로 로그인
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-white/[0.06]" /></div>
              <div className="relative flex justify-center">
                <button onClick={() => setShowManual(!showManual)} className="px-3 bg-white dark:bg-[#141416] text-[11px] text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 cursor-pointer transition-colors">
                  {showManual ? '접기' : 'SSO 안 될 때'}
                </button>
              </div>
            </div>

            {showManual && (
              <div className="space-y-3 animate-fade-in">
                <input
                  type="text" value={manualId} onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualLogin()}
                  placeholder="사번 ID (예: syngha.han)"
                  className="w-full px-3 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <button onClick={handleManualLogin} className="w-full px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                  ID로 로그인
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 mt-4">
            일반 사용자는 로그인 없이 대시보드를 이용할 수 있습니다
          </p>
        </div>
      </div>
    </main>
  );
}
