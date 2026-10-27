import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  Plus,
  Settings2,
  Users,
  Sparkles,
  Table,
  Clock,
  LogOut,
  Upload,
  ChevronRight,
  Database,
  Sliders,
  ShieldCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  ColumnMapping,
  Role,
  SheetConnection,
  SyncLog,
  UserProfile,
} from '../types/crm';
import { Lang } from '../i18n/translations';
import {
  initAuth,
  googleSignIn,
  googleLogout,
  getAccessToken,
} from '../services/googleAuth';
import { apiRequest } from '../services/api';

interface GoogleSheetsViewProps {
  lang: Lang;
  currentRole: Role;
  users: UserProfile[];
  projects: string[];
  sheetConnections: SheetConnection[];
  syncLogs: SyncLog[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

export const GoogleSheetsView: React.FC<GoogleSheetsViewProps> = ({
  lang,
  currentRole,
  users,
  projects,
  sheetConnections,
  syncLogs,
  onRefresh,
  onToast,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = currentRole.id === 'role_admin';

  // Google Workspace OAuth State
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [hasOAuthToken, setHasOAuthToken] = useState<boolean>(false);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  // Selected connection & inspection state
  const [selectedConnId, setSelectedConnId] = useState<string>(
    sheetConnections[0]?.id || ''
  );
  const activeConn =
    sheetConnections.find((c) => c.id === selectedConnId) || sheetConnections[0];

  const [spreadsheetInput, setSpreadsheetInput] = useState(
    activeConn?.spreadsheetUrl || ''
  );
  const [connName, setConnName] = useState(
    activeConn?.name || 'CRM1 (المصدر الأساسي لبيانات العملاء - Google Drive)'
  );
  const [sheetTabName, setSheetTabName] = useState(
    activeConn?.sheetTabName || 'CRM1'
  );
  const [routingMode, setRoutingMode] = useState<
    'project_then_round_robin' | 'round_robin_only'
  >(activeConn?.routingMode || 'project_then_round_robin');

  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(
    activeConn?.columnMapping || {
      fullName: 'الاسم',
      phone: 'رقم التليفون',
      email: 'email',
      projectInterest: 'project_name',
      campaignName: 'campaign_name',
      propertyType: 'unit_type',
      budgetMax: 'budget',
      notes: 'client_notes',
    }
  );

  // Direct CSV / Sheet Rows Paste or File Upload
  const [csvPasteText, setCsvPasteText] = useState('');
  const [showCsvImportBox, setShowCsvImportBox] = useState(false);

  // Admin Advanced Modal State
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<'mapping' | 'inspect' | 'csv' | 'logs'>('mapping');

  const [inspectedData, setInspectedData] = useState<{
    title: string;
    tabs: string[];
    headers: string[];
    sampleRows: string[][];
    mode: string;
  } | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSearchingDrive, setIsSearchingDrive] = useState(false);
  const [driveFileName, setDriveFileName] = useState(activeConn?.driveFileName || 'CRM1');
  const [secondsToNextSync, setSecondsToNextSync] = useState<number>(15 * 60);
  const [showAddConnModal, setShowAddConnModal] = useState(false);

  useEffect(() => {
    if (activeConn) {
      setConnName(activeConn.name);
      setSpreadsheetInput(activeConn.spreadsheetUrl || '');
      setSheetTabName(activeConn.sheetTabName);
      setRoutingMode(activeConn.routingMode);
      setDriveFileName(activeConn.driveFileName || 'CRM1');
      if (activeConn.columnMapping) {
        setColumnMapping(activeConn.columnMapping);
      }
    }
  }, [activeConn]);

  useEffect(() => {
    const unsub = initAuth(
      (user, _token) => {
        setHasOAuthToken(true);
        const email = user.email || localStorage.getItem('propsphere_google_email');
        if (email) {
          setGoogleUserEmail(email);
          localStorage.setItem('propsphere_google_email', email);
        }
      },
      () => {
        setHasOAuthToken(false);
      }
    );
    return () => unsub();
  }, []);

  // 15-Minute Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNextSync((prev) => (prev <= 1 ? 15 * 60 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    try {
      const authRes = await googleSignIn();
      if (authRes?.accessToken) {
        setHasOAuthToken(true);
        if (authRes.user?.email) {
          setGoogleUserEmail(authRes.user.email);
          localStorage.setItem('propsphere_google_email', authRes.user.email);
        }
        onToast(isAr ? 'تم ربط حساب Google Drive بنجاح' : 'Google Drive connected');
        handleFindCrm1InDrive(driveFileName || 'CRM1');
      }
    } catch (err: any) {
      console.error(err);
      onToast(err.message || 'فشل الاتصال بحساب Google');
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleDisconnect = () => {
    googleLogout();
    setHasOAuthToken(false);
    setGoogleUserEmail(null);
    localStorage.removeItem('propsphere_google_email');
    onToast(isAr ? 'تم فصل حساب Google' : 'Google disconnected');
  };

  const handleFindCrm1InDrive = async (fileName = 'CRM1') => {
    setIsSearchingDrive(true);
    try {
      const res = await apiRequest('/api/drive/find-crm1', {
        method: 'POST',
        body: JSON.stringify({ fileName }),
      });
      if (res.found && res.file) {
        setDriveFileName(res.file.name);
        setSpreadsheetInput(res.file.webViewLink || res.file.id);
        onToast(
          isAr
            ? `تم العثور على شيت (${res.file.name}) وربطه تلقائياً`
            : `Found and connected sheet (${res.file.name})`
        );
        onRefresh();
      } else {
        onToast(
          isAr
            ? `لم يتم العثور على ملف باسم "${fileName}". يرجى التأكد من اسم الشيت في Drive`
            : `Sheet "${fileName}" not found in Drive`
        );
      }
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsSearchingDrive(false);
    }
  };

  const handleInspectSheet = async () => {
    if (!spreadsheetInput.trim()) {
      onToast(isAr ? 'يرجى إدخال رابط الشيت' : 'Please provide sheet URL');
      return;
    }
    setIsInspecting(true);
    try {
      const res = await apiRequest('/api/sheets/inspect', {
        method: 'POST',
        body: JSON.stringify({ spreadsheetInput, sheetTabName }),
      });
      setInspectedData(res);
      if (res.tabs && res.tabs.length > 0 && !res.tabs.includes(sheetTabName)) {
        setSheetTabName(res.tabs[0]);
      }
      onToast(isAr ? 'تم فحص التبويبات والأعمدة بنجاح' : 'Sheet inspected');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!activeConn) return;
    try {
      await apiRequest(`/api/sheets/connections/${activeConn.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: connName,
          driveFileName,
          spreadsheetUrl: spreadsheetInput,
          sheetTabName,
          routingMode,
          columnMapping,
          syncIntervalMinutes: 15,
          autoSyncEnabled: true,
          ignoreIdColumns: true,
        }),
      });
      onToast(isAr ? 'تم حفظ إعدادات الشيت بنجاح' : 'Settings saved');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleSyncAndDistribute = async (overrideRawCsv?: string) => {
    setIsSyncing(true);
    try {
      const res = await apiRequest('/api/sheets/sync', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: activeConn?.id,
          rawCsvRows: overrideRawCsv || undefined,
        }),
      });
      setSecondsToNextSync(15 * 60);
      onToast(
        isAr
          ? `تم الاستيراد: ${res.newLeadsImported} عميل جديد بدون تكرار`
          : `Sync completed: ${res.newLeadsImported} new leads imported`
      );
      if (overrideRawCsv) {
        setCsvPasteText('');
        setShowCsvImportBox(false);
      }
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '');
      if (text.trim()) {
        setCsvPasteText(text);
        setShowCsvImportBox(true);
        onToast(isAr ? 'تم تحميل ملف CSV، يمكنك مراجعته وبدء الاستيراد' : 'CSV file loaded');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/sheets/connections', {
        method: 'POST',
        body: JSON.stringify({
          name: connName,
          driveFileName: driveFileName || 'CRM1',
          spreadsheetInput,
          sheetTabName,
          routingMode,
          columnMapping,
          syncIntervalMinutes: 15,
          autoSyncEnabled: true,
          ignoreIdColumns: true,
        }),
      });
      setSelectedConnId(res.connection.id);
      setShowAddConnModal(false);
      onToast(isAr ? 'تمت إضافة شيت جوجل جديد بنجاح' : 'New Google Sheet connected');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const hassanCrmAdmin =
    users.find(
      (u) =>
        u.id === 'usr_admin2' ||
        String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
    ) ||
    users.find((u) => u.id === 'usr_admin') ||
    users[0];

  const minsRemaining = String(Math.floor(secondsToNextSync / 60)).padStart(2, '0');
  const secsRemaining = String(secondsToNextSync % 60).padStart(2, '0');

  const totalImportedAllTime = syncLogs.reduce((acc, l) => acc + (l.newLeadsImported || 0), 0);
  const lastSyncTimeStr = syncLogs[0]?.timestamp
    ? new Date(syncLogs[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : isAr ? 'اليوم' : 'Today';

  return (
    <div className="space-y-6">
      {/* 1. Main Lead Source Business Status Card (Uncluttered, Real Estate Business Focused) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{isAr ? 'المصدر متصل وجاهز للمزامنة' : 'Lead Source Connected'}</span>
              </span>
              <span className="text-xs text-slate-400 font-mono-tabular">
                {driveFileName || 'CRM1'}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {isAr ? 'ربط وتوزيع العملاء من Google Drive & Sheets' : 'Google Sheets Client Source & Routing'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Google OAuth State */}
            {!hasOAuthToken ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingInGoogle}
                className="gsi-material-button scale-95"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents text-xs">
                    {isLoggingInGoogle ? 'جاري الاتصال...' : 'ربط حساب Google'}
                  </span>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold truncate max-w-[160px]">
                  {googleUserEmail || 'حساب Google متصل'}
                </span>
                <button
                  onClick={handleGoogleDisconnect}
                  title={isAr ? 'فصل حساب جوجل' : 'Disconnect Google'}
                  className="p-1 hover:bg-emerald-100 rounded-md text-emerald-700 cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Quick CSV Upload */}
            <label className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'رفع ملف CSV' : 'Upload CSV'}</span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
            </label>

            {/* Primary Action Button: Sync Now */}
            <button
              onClick={() => handleSyncAndDistribute()}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing
                  ? isAr ? 'جاري المزامنة...' : 'Syncing...'
                  : isAr ? 'مزامنة العملاء الآن' : 'Sync Clients Now'}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Summary KPIs for the Connected Source */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-1">
            <div className="text-[11px] text-slate-500 font-semibold">{isAr ? 'الملف المتصل' : 'Connected File'}</div>
            <div className="text-base font-bold text-slate-900 truncate">{driveFileName || 'CRM1'}</div>
            <div className="text-[10px] text-emerald-600 font-semibold">{isAr ? 'Google Drive مباشر' : 'Live Drive Link'}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-1">
            <div className="text-[11px] text-slate-500 font-semibold">{isAr ? 'آخر مزامنة ناجحة' : 'Last Synced'}</div>
            <div className="text-base font-bold text-slate-900 font-mono-tabular">{lastSyncTimeStr}</div>
            <div className="text-[10px] text-slate-500">{isAr ? 'بدون تكرار أرقام الهواتف' : 'Zero duplicates'}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-1">
            <div className="text-[11px] text-slate-500 font-semibold">{isAr ? 'إجمالي العملاء المستوردين' : 'Total Imported'}</div>
            <div className="text-base font-bold text-blue-600 font-mono-tabular">{totalImportedAllTime} عميل</div>
            <div className="text-[10px] text-slate-500">{isAr ? 'مسجلين في قاعدة البيانات' : 'Active in CRM'}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-1">
            <div className="text-[11px] text-slate-500 font-semibold">{isAr ? 'المزامنة التلقائية القادمة' : 'Next Auto-Sync'}</div>
            <div className="text-base font-bold text-indigo-600 font-mono-tabular">{minsRemaining}:{secsRemaining}</div>
            <div className="text-[10px] text-slate-500">{isAr ? 'تحديث دوري كل 15 دقيقة' : 'Every 15 minutes'}</div>
          </div>
        </div>

        {/* Lead Routing Policy Box */}
        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">
                {isAr
                  ? 'التعيين التلقائي المباشر للعملاء:'
                  : 'Automatic Lead Assignment:'}
              </div>
              <div className="text-[11px] text-blue-800 font-semibold mt-0.5">
                {isAr
                  ? `يتم تعيين كافة العملاء تلقائياً لمدير الـ CRM الثاني: ${hassanCrmAdmin?.fullName || 'حسن شحاتة'}`
                  : `All leads are automatically assigned to 2nd CRM Manager: ${hassanCrmAdmin?.fullName || 'Hassan Shehata'}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleFindCrm1InDrive(driveFileName || 'CRM1')}
              disabled={isSearchingDrive}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 text-blue-600 ${isSearchingDrive ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث الرابط من Drive' : 'Relink from Drive'}</span>
            </button>

            {/* Admin Advanced Settings Modal Trigger */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdvancedModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Settings2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'الإعدادات المتقدمة والسجلات' : 'Advanced Settings & Logs'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSV Rows Paste Box if opened */}
      {showCsvImportBox && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr
                ? 'معاينة واستيراد صفوف الشيت المرفوعة وتعيينها'
                : 'Preview & Distribute Uploaded Sheet Rows'}
            </h3>
            <button
              onClick={() => setShowCsvImportBox(false)}
              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <textarea
            rows={4}
            value={csvPasteText}
            onChange={(e) => setCsvPasteText(e.target.value)}
            placeholder="الاسم, رقم التليفون, المشروع, الميزانية..."
            className="w-full p-3 rounded-xl border border-slate-200 font-mono-tabular text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleSyncAndDistribute(csvPasteText)}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'بدء استيراد الصفوف الآن' : 'Import Rows Now'}
            </button>
          </div>
        </div>
      )}

      {/* 2. ADMIN ONLY: ADVANCED SETTINGS, COLUMN MAPPING, INSPECTOR & SYNC LOGS MODAL */}
      {showAdvancedModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  {isAr ? 'لوحة الإعدادات المتقدمة وسجل المزامنة (للمدير فقط)' : 'Advanced Source Settings & Logs (Admin Only)'}
                </h3>
              </div>
              <button
                onClick={() => setShowAdvancedModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab Navigation inside Modal */}
            <div className="p-3 bg-slate-100 border-b border-slate-200/80 flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setAdvancedTab('mapping')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  advancedTab === 'mapping'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isAr ? 'مطابقة الأعمدة (Column Mapping)' : 'Column Mapping'}
              </button>
              <button
                onClick={() => setAdvancedTab('inspect')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  advancedTab === 'inspect'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isAr ? 'فحص ومعاينة الشيت' : 'Sheet Inspector'}
              </button>
              <button
                onClick={() => setAdvancedTab('logs')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  advancedTab === 'logs'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isAr ? `سجل المزامنة (${syncLogs.length})` : `Sync Logs (${syncLogs.length})`}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* TAB 1: COLUMN MAPPING */}
              {advancedTab === 'mapping' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800">
                      {isAr ? 'تخصيص أسماء الأعمدة في ملف الشيت:' : 'Customize Column Headers:'}
                    </span>
                    <button
                      onClick={handleSaveConnection}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {isAr ? 'حفظ إعدادات الأعمدة' : 'Save Column Mapping'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-slate-600 block mb-1 font-semibold">
                        {isAr ? 'عمود اسم العميل (Name Column):' : 'Client Name Column:'}
                      </label>
                      <input
                        type="text"
                        value={columnMapping.fullName}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, fullName: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="text-slate-600 block mb-1 font-semibold">
                        {isAr ? 'عمود رقم الهاتف (Phone Column):' : 'Phone Column:'}
                      </label>
                      <input
                        type="text"
                        value={columnMapping.phone}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, phone: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="text-slate-600 block mb-1 font-semibold">
                        {isAr ? 'عمود المشروع العقاري (Project Column):' : 'Project Column:'}
                      </label>
                      <input
                        type="text"
                        value={columnMapping.projectInterest}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, projectInterest: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="text-slate-600 block mb-1 font-semibold">
                        {isAr ? 'عمود الميزانية (Budget Column):' : 'Budget Column:'}
                      </label>
                      <input
                        type="text"
                        value={columnMapping.budgetMax}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, budgetMax: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    <p className="leading-relaxed">
                      {isAr
                        ? 'ملاحظة: يتم استبعاد وتجاهل جميع الخانات التقنية تلقائياً مثل (id, lead_id, ad_id, form_id)، وتحويل أسئلة وإجابات الفورم إلى بطاقة أسئلة واضحة.'
                        : 'Note: Technical ID columns are automatically excluded, and answered form questions are preserved as clean Q&A.'}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: SHEET INSPECTOR */}
              {advancedTab === 'inspect' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      {isAr ? 'رابط ملف Google Sheet المراد فحصه:' : 'Google Sheet URL to Inspect:'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={spreadsheetInput}
                        onChange={(e) => setSpreadsheetInput(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular text-xs"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                      <button
                        type="button"
                        onClick={handleInspectSheet}
                        disabled={isInspecting}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0 cursor-pointer"
                      >
                        {isInspecting ? (isAr ? 'جاري الفحص...' : 'Inspecting...') : (isAr ? 'فحص الشيت' : 'Inspect')}
                      </button>
                    </div>
                  </div>

                  {inspectedData && (
                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{inspectedData.title}</span>
                        <span className="font-mono-tabular text-blue-700">
                          {inspectedData.tabs.join(' · ')}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse bg-white rounded-lg">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700">
                              {inspectedData.headers.slice(0, 6).map((h, i) => (
                                <th key={i} className="p-2 text-start border border-slate-200">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {inspectedData.sampleRows.slice(0, 3).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.slice(0, 6).map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2 border border-slate-100 font-mono-tabular">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SYNC LOGS */}
              {advancedTab === 'logs' && (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500 font-bold">
                          <th className="py-2.5 px-3 text-start">{isAr ? 'التوقيت' : 'Timestamp'}</th>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'المصدر' : 'Source'}</th>
                          <th className="py-2.5 px-3 text-center">{isAr ? 'المفحوص' : 'Scanned'}</th>
                          <th className="py-2.5 px-3 text-center">{isAr ? 'المستورد' : 'Imported'}</th>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'التفاصيل' : 'Details'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {syncLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {log.connectionName}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono-tabular">
                              {log.rowsScanned}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono-tabular font-bold text-emerald-600">
                              +{log.newLeadsImported}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                              {(log.assignmentsSummary || [])
                                .map((a) => `${a.userName} (${a.count})`)
                                .join(' · ') || log.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                onClick={() => setShowAdvancedModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Sheet Modal */}
      {showAddConnModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {isAr ? 'ربط ملف Google Sheet جديد' : 'Connect New Google Sheet'}
            </h3>
            <form onSubmit={handleCreateConnection} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم الشيت / الحملة *' : 'Sheet / Campaign Title *'}
                </label>
                <input
                  type="text"
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'رابط Google Sheet أو Spreadsheet ID *' : 'Google Sheet URL or ID *'}
                </label>
                <input
                  type="text"
                  value={spreadsheetInput}
                  onChange={(e) => setSpreadsheetInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddConnModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'ربط الشيت' : 'Connect Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
