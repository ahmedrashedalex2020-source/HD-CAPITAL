import React, { useState, useEffect } from 'react';
import { Lock, User, Building2, ArrowRight, Globe, ShieldCheck } from 'lucide-react';
import { apiRequest, setCurrentApiUser } from '../services/api';
import { Lang } from '../i18n/translations';

interface LoginViewProps {
  lang: Lang;
  onToggleLang: () => void;
  onLoginSuccess: (user: any, role: any, token?: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  onToggleLang,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    apiRequest('/api/auth/accounts-preview')
      .then((res) => {
        if (res.accounts) setAccounts(res.accounts);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setCurrentApiUser(res.user.id, res.token);
      onLoginSuccess(res.user, res.role, res.token);
    } catch (err: any) {
      setError(err.message || 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAccountSelect = async (acc: any) => {
    const defaultPass = acc.username === 'admin' ? 'admin123' : '123456';
    setUsername(acc.username);
    setPassword(defaultPass);
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: acc.username, password: defaultPass }),
      });
      setCurrentApiUser(res.user.id, res.token);
      onLoginSuccess(res.user, res.role, res.token);
    } catch {
      try {
        const switched = await apiRequest('/api/auth/switch-account', {
          method: 'POST',
          body: JSON.stringify({ targetUserId: acc.id }),
        });
        setCurrentApiUser(switched.user.id, switched.token);
        onLoginSuccess(switched.user, switched.role, switched.token);
      } catch (err: any) {
        setError(err.message || 'يرجى إدخال كلمة المرور الخاصة بهذا الحساب ثم الضغط على دخول');
      }
    } finally {
      setLoading(false);
    }
  };

  const isAr = lang === 'ar';

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-[#F4F7FE] flex flex-col justify-between p-3 sm:p-6">
      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate">
            PropSphere CRM
          </span>
        </div>
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-blue-600" />
          <span>{isAr ? 'English (LTR)' : 'العربية (RTL)'}</span>
        </button>
      </header>

      {/* Main Split Card */}
      <main className="max-w-5xl w-full mx-auto my-4 sm:my-auto grid grid-cols-1 lg:grid-cols-12 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Left / Right Blue Brand Column */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#1D4ED8] text-white p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-100 mb-4 sm:mb-6">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'نظام إدارة علاقات العملاء والتسويق العقاري'
                  : 'Real Estate CRM & Lead Distribution System'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-snug mb-3 sm:mb-4">
              {isAr
                ? 'إدارة احترافية لليدز، الصلاحيات، وأداء المبيعات اليومي'
                : 'Professional Real Estate Leads, RBAC & Daily Sales Analytics'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
              {isAr
                ? 'استيراد تلقائي لعملاء شيت CRM1 من Google Drive كل 15 دقيقة بدون تكرار، وتوزيع فوري على السيلز حسب المشروع، مع تنبيهات لحظية وشاشات مخصصة طبقاً للصلاحيات.'
                : 'Automatic CRM1 sheet import from Google Drive every 15 minutes without duplicates, smart project-based routing to sales reps, and role-based views.'}
            </p>
          </div>

          <div className="mt-6 sm:mt-8 pt-5 border-t border-white/15 space-y-2.5 text-xs text-blue-100">
            <div className="flex items-center justify-between">
              <span>{isAr ? 'مزامنة شيت CRM1 تلقائية' : 'CRM1 Google Drive Sync'}</span>
              <span className="font-mono-tabular font-semibold text-white">Every 15 Mins</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isAr ? 'قاعدة بيانات سحابية مباشرة' : 'Cloud Database'}</span>
              <span className="font-mono-tabular font-semibold text-white">Firebase Firestore</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isAr ? 'حماية الجلسات وتشفير الكلمات' : 'Session Security'}</span>
              <span className="font-mono-tabular font-semibold text-white">Scrypt + SHA-256</span>
            </div>
          </div>
        </div>

        {/* Form & Account Switcher Column */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
          <div className="mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              {isAr ? 'تسجيل الدخول إلى النظام' : 'Sign in to your CRM account'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'ادخل باسم المستخدم وكلمة المرور الخاصة بك، أو اختر حساباً من القائمة لتجربة الصلاحيات المختلفة فوراً'
                : 'Enter your username and password created by the Admin, or click any account below to test role permissions'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isAr ? 'اسم المستخدم (Username)' : 'Username'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute top-3.5 start-3.5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  className="w-full ps-10 pe-4 py-2.5 rounded-lg border border-slate-200 text-base sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
                  placeholder="admin / omarahmed1..."
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isAr ? 'كلمة المرور (Password)' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute top-3.5 start-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  dir="ltr"
                  className="w-full ps-10 pe-4 py-2.5 rounded-lg border border-slate-200 text-base sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {loading
                  ? isAr
                    ? 'جاري التحقق والدخول...'
                    : 'Signing in...'
                  : isAr
                  ? 'دخول للنظام'
                  : 'Sign In'}
              </span>
              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          </form>

          {/* Quick Role Preview Selector */}
          <div className="mt-6 sm:mt-7 pt-5 sm:pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-700">
                {isAr
                  ? 'دخول سريع للحسابات المسجلة (لمعاينة شاشات كل صلاحية):'
                  : 'Quick Login with Registered Accounts (Test Role Views):'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono-tabular shrink-0">
                {accounts.length} {isAr ? 'مستخدمين' : 'users'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pe-1">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleQuickAccountSelect(acc)}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-colors text-start cursor-pointer"
                >
                  <img
                    src={acc.avatarUrl}
                    alt={acc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {acc.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      @{acc.username} · {isAr ? acc.roleNameAr : acc.roleName}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-400 py-2">
        PropSphere Real Estate CRM · Enterprise Edition
      </footer>
    </div>
  );
};
