import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';

const SSO_BASE_URL = 'https://genai.samsungds.net:36810';
const SSO_PATH = '/direct_sso';

export function Login() {
  const { login, loginWithSSOToken } = useAuth();
  const { t } = useI18n();
  const { resolved, toggle } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Handle SSO callback: ?data=<urlEncodedJson>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    if (!data) return;

    setProcessing(true);
    (async () => {
      try {
        const decoded = decodeURIComponent(data);
        const ssoData = JSON.parse(decoded);

        // Create SSO token (nexus-coder compatible)
        const jsonData = JSON.stringify({
          loginid: ssoData.loginid,
          username: ssoData.username,
          deptname: ssoData.deptname || '',
          timestamp: Date.now(),
        });
        // btoa with UTF-8 support
        const ssoToken = btoa(unescape(encodeURIComponent(jsonData)));
        await loginWithSSOToken(`sso.${ssoToken}`);
        window.history.replaceState({}, '', '/');
      } catch (err) {
        // Fallback: try direct login
        try {
          const decoded = decodeURIComponent(data);
          const ssoData = JSON.parse(decoded);
          await login({
            loginid: ssoData.loginid,
            username: ssoData.username || ssoData.loginid,
            deptname: ssoData.deptname || '',
          });
          window.history.replaceState({}, '', '/');
        } catch {
          setError('SSO 로그인에 실패했습니다');
        }
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

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0c]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">SSO 인증 처리 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-[#0a0a0c] dark:via-[#0e0e12] dark:to-[#0a0a0c] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Stock AI
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            Self-Evolving Prediction System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/60 dark:border-white/[0.06] shadow-sm p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-sm text-rose-700 dark:text-rose-300 font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleSSOLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all duration-150 shadow-sm shadow-indigo-500/20 active:scale-[0.98] cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            SSO로 로그인
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-white/[0.06]" /></div>
            <div className="relative flex justify-center"><span className="px-3 bg-white dark:bg-[#141416] text-xs text-slate-400 dark:text-slate-600">or</span></div>
          </div>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-600">
            Samsung DS SSO 계정으로 로그인합니다
          </p>
        </div>

        {/* Theme toggle */}
        <div className="flex justify-center mt-6">
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            {resolved === 'dark' ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
