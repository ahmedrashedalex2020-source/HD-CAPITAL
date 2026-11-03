import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Unknown error'),
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Caught runtime error:', error, errorInfo);
  }

  handleRecover = () => {
    try {
      window.sessionStorage?.clear();
    } catch {
      // ignore
    }
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-dvh bg-[#F4F7FE] flex items-center justify-center p-4 font-sans"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full text-center space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">
              تم تحديث الواجهة — يرجى إعادة تحميل الصفحة
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              حدث تعارض مؤقت أثناء تحميل البيانات المحفوظة في المتصفح. اضغط على الزر أدناه لتحديث الجلسة والمتابعة فوراً.
            </p>
            <button
              onClick={this.handleRecover}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer"
            >
              تحديث واستعادة الواجهة الآن
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
