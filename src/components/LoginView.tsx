import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Building2,
  ArrowRight,
  Globe,
  ShieldCheck,
  Eye,
  EyeOff,
  Database,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { apiRequest, setCurrentApiUser } from '../services/api';
import { testConnection } from '../services/firebaseClient';
import { Lang } from '../i18n/translations';

interface LoginViewProps {
  lang: Lang;
  onToggleLang: () => void;
  onLoginSuccess: (user: any, role: any, token?: string) => void;
  sessionExpiredMessage?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  onToggleLang,
  onLoginSuccess,
  sessionExpiredMessage,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(true);

  useEffect(() => {
    testConnection()
      .then((ok) => {
        if (ok) setFirebaseConnected(true);
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
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      setCurrentApiUser(res.user.id, res.token);
      onLoginSuccess(res.user, res.role, res.token);
    } catch (err: any) {
      setError(err.message || 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const isAr = lang === 'ar';

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-[#090D16] flex flex-col justify-between p-3 sm:p-6">
      {/* Top Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white truncate block">
              HD CAPITAL CRM
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {firebaseConnected
                ? isAr
                  ? 'متصل بقاعدة بيانات Google Firebase Firestore'
                  : 'Connected to Google Firebase Firestore'
                : isAr
                ? 'جاري الاتصال بقاعدة بيانات Firebase...'
                : 'Connecting to Firebase...'}
            </span>
          </div>
        </div>
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-blue-400" />
          <span>{isAr ? 'English (LTR)' : 'العربية (RTL)'}</span>
        </button>
      </header>

      {/* Main Split Card */}
      <main className="max-w-4xl w-full mx-auto my-4 sm:my-auto grid grid-cols-1 lg:grid-cols-12 bg-white rounded-2xl border border-slate-800/20 shadow-2xl overflow-hidden">
        {/* Brand & Security Column */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#1E3A8A] via-[#2563EB] to-[#1D4ED8] text-white p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-100 mb-4 sm:mb-6">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'بوابة الدخول الآمن وعزل الصلاحيات'
                  : 'Secure Access Gate & Role Isolation'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold leading-snug mb-3 sm:mb-4">
              {isAr
                ? 'إدارة احترافية ومؤمنة لليدز، الصلاحيات، وأداء المبيعات'
                : 'Secure Real Estate Leads, Strict RBAC & Sales Analytics'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
              {isAr
                ? 'يتم التحقق من هوية وصلاحيات كل مستخدم عند كل دخول، مع عرض الشاشات والعملاء المخصصين لدوره الوظيفي فقط وتأمين الجلسة تلقائياً بعد 15 دقيقة من عدم النشاط.'
                : 'Every session is strictly authenticated and isolated by role permissions, with automatic session lock after 15 minutes of inactivity.'}
            </p>
          </div>

          <div className="mt-6 sm:mt-8 pt-5 border-t border-white/15 space-y-2.5 text-xs text-blue-100">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-300" />
                {isAr ? 'قاعدة بيانات سحابية مباشرة' : 'Cloud Database'}
              </span>
              <span className="font-mono-tabular font-semibold text-emerald-300">
                Google Firebase Live
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                {isAr ? 'تأمين الجلسة التلقائي' : 'Inactivity Auto-Logout'}
              </span>
              <span className="font-mono-tabular font-semibold text-white">15 Minutes</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isAr ? 'عزل الصلاحيات والبيانات' : 'Access Control'}</span>
              <span className="font-mono-tabular font-semibold text-white">Strict RBAC</span>
            </div>
          </div>
        </div>

        {/* Manual Login Form Column */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              {isAr ? 'تسجيل الدخول إلى النظام' : 'Sign in to your CRM account'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'يرجى إدخال اسم المستخدم وكلمة المرور الخاصة بحسابك للتحقق من الصلاحيات وفتح مساحة العمل'
                : 'Enter your assigned username and password to verify your permissions and access the workspace'}
            </p>
          </div>

          {sessionExpiredMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{sessionExpiredMessage}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
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
                  autoComplete="username"
                  spellCheck={false}
                  dir="ltr"
                  className="w-full ps-10 pe-4 py-2.5 rounded-lg border border-slate-200 text-base sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
                  placeholder={isAr ? 'أدخل اسم المستخدم...' : 'Enter username...'}
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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="current-password"
                  dir="ltr"
                  className="w-full ps-10 pe-10 py-2.5 rounded-lg border border-slate-200 text-base sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-3 end-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>
                {loading
                  ? isAr
                    ? 'جاري التحقق من بيانات الدخول...'
                    : 'Verifying credentials...'
                  : isAr
                  ? 'تسجيل الدخول للنظام'
                  : 'Sign In'}
              </span>
              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              {isAr
                ? 'محمي بتشفير الجلسات وعزل الصلاحيات الصارم'
                : 'Protected by session encryption & strict RBAC'}
            </span>
            <span className="font-mono-tabular text-slate-400">15m Timeout</span>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500 py-2">
        PropSphere Real Estate CRM · Connected to Google Firebase Cloud Firestore
      </footer>
    </div>
  );
};
