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
  }, [activeConn?.id]);

  // 15-Minute Auto-Sync Live Countdown Timer (`أوتوماتيك كل 15 دقيقة بدون تكرار`)
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNextSync((prev) => {
        if (prev <= 1) {
          // Trigger automatic sync every 15 minutes
          handleSyncAndDistribute();
          return 15 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeConn?.id]);

  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setGoogleUserEmail(user.email || 'Google Account Connected');
        setHasOAuthToken(true);
      },
      () => {
        setHasOAuthToken(false);
      }
    );
    getAccessToken().then((tk) => {
      if (tk) {
        setHasOAuthToken(true);
        if (!activeConn?.spreadsheetId) {
          handleFindCrm1InDrive('CRM1');
        }
      }
    });
    return () => unsub();
  }, []);

  const handleFindCrm1InDrive = async (targetName = 'CRM1') => {
    setIsSearchingDrive(true);
    try {
      const res = await apiRequest('/api/drive/find-crm1', {
        method: 'POST',
        body: JSON.stringify({ fileName: targetName }),
      });
      if (res.found) {
        setSpreadsheetInput(res.spreadsheetUrl || '');
        setConnName(`شيت Google Drive الأساسي (${res.fileName})`);
        onToast(
          isAr
            ? `تم العثور على شيت "${res.fileName}" في Google Drive! جاري استيراد البيانات الفعلية من الشيت...`
            : `Found "${res.fileName}" on Google Drive! Importing real sheet rows...`
        );
        await handleSyncAndDistribute();
      } else {
        onToast(
          res.message ||
            (isAr
              ? `تم فحص Google Drive ولم يتم العثور على شيت باسم "${targetName}"`
              : `No sheet named "${targetName}" found on Google Drive`)
        );
      }
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsSearchingDrive(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUserEmail(res.user.email || res.user.displayName || 'Connected');
        setHasOAuthToken(true);
        onToast(
          isAr
            ? 'تم ربط Google Drive + Google Sheets بنجاح! جاري البحث التلقائي عن شيت CRM1...'
            : 'Google Drive & Sheets connected! Auto-locating CRM1 sheet...'
        );
        await handleFindCrm1InDrive(driveFileName || 'CRM1');
      }
    } catch {
      onToast(
        isAr
          ? 'تعذر إكمال نافذة دخول Google، يمكنك المحاولة مجدداً أو المزامنة المباشرة بالرابط'
          : 'Google Sign-In popup closed or blocked'
      );
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await googleLogout();
    setHasOAuthToken(false);
    setGoogleUserEmail(null);
    onToast(isAr ? 'تم فصل جلسة Google OAuth' : 'Disconnected Google session');
  };

  const handleInspectSheet = async () => {
    setIsInspecting(true);
    try {
      const res = await apiRequest('/api/sheets/inspect', {
        method: 'POST',
        body: JSON.stringify({ spreadsheetInput }),
      });
      setInspectedData(res);
      if (res.tabs && res.tabs.length > 0) {
        setSheetTabName(res.tabs[0]);
      }
      onToast(
        isAr
          ? `تم فحص الشيت "${res.title}" واكتشاف ${res.headers?.length || 0} أعمدة بنجاح`
          : `Inspected "${res.title}" with ${res.headers?.length || 0} columns`
      );
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSyncAndDistribute = async (optionalCsv?: string) => {
    if (!activeConn) return;
    setIsSyncing(true);
    try {
      const res = await apiRequest('/api/sheets/sync', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: activeConn.id,
          csvText: optionalCsv || undefined,
        }),
      });
      setSecondsToNextSync(15 * 60);
      if (optionalCsv) {
        setCsvPasteText('');
        setShowCsvImportBox(false);
      }
      onToast(
        isAr
          ? `شيت CRM1: تم استيراد ${res.newLeadsImported} عميل جديد (الاسم + الهاتف + إجابات الفورم) وتجاهل ${res.duplicatesSkipped || 0} مكرر بدون أي ID!`
          : `CRM1 Sync: Imported ${res.newLeadsImported} new leads (Name + Phone + Form Q&A) and skipped ${res.duplicatesSkipped || 0} duplicates!`
      );
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
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvPasteText(reader.result);
        setShowCsvImportBox(true);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveConnectionSettings = async () => {
    if (!activeConn) return;
    try {
      await apiRequest(`/api/sheets/connections/${activeConn.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: connName,
          driveFileName: driveFileName || 'CRM1',
          spreadsheetUrl: spreadsheetInput,
          sheetTabName,
          routingMode,
          columnMapping,
          syncIntervalMinutes: 15,
          autoSyncEnabled: true,
          ignoreIdColumns: true,
        }),
      });
      onToast(
        isAr
          ? 'تم حفظ إعدادات شيت CRM1 والمزامنة التلقائية كل 15 دقيقة بدون تكرار وبدون حقول ID'
          : 'Saved CRM1 connection and 15-minute deduplicated auto-sync settings'
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
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

  const activeSalesAgents = users.filter((u) => u.isActiveForRouting);
  const minsRemaining = String(Math.floor(secondsToNextSync / 60)).padStart(2, '0');
  const secsRemaining = String(secondsToNextSync % 60).padStart(2, '0');

  return (
    <div className="space-y-6">
      {/* 1. Top Banner: Google Drive (CRM1) + Google Sheets OAuth & 15-Minute Auto-Sync Engine */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-200">
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {isAr
                  ? 'المصدر الأساسي: شيت CRM1 على Google Drive'
                  : 'Primary Source: CRM1 on Google Drive'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-xs font-bold text-blue-700 border border-blue-200 font-mono-tabular">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? `مزامنة تلقائية كل 15 دقيقة (القادمة خلال ${minsRemaining}:${secsRemaining})`
                  : `Auto-Sync every 15m (Next in ${minsRemaining}:${secsRemaining})`}
              </span>
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900">
            {isAr
              ? 'استيراد تلقائي من شيت (CRM1) على Google Drive كل 15 دقيقة بدون تكرار'
              : 'Auto-Import Leads from Google Drive Sheet (CRM1) Every 15 Minutes'}
          </h1>
          <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
            {isAr
              ? 'يتصل النظام بصلاحيات Google Drive + Google Sheets للبحث عن شيت (CRM1) وسحب البيانات أوتوماتيك كل 15 دقيقة مع منع تكرار أرقام التليفون، وحذف أي خانات غير مفيدة مثل (id / ad_id / form_id)، واستيراد (الاسم + رقم التليفون + الأسئلة التي تم الإجابة عليها في الفورم) فقط.'
              : 'Connects to Google Drive & Sheets to locate CRM1, pulls new leads every 15 minutes without phone duplicates, strips all useless ID columns, and imports Name, Phone, and Form Questions & Answers.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Official Sign in with Google Button (Drive + Sheets Scopes) */}
          {!hasOAuthToken ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingInGoogle}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isLoggingInGoogle ? 'Connecting...' : 'Sign in with Google'}
                </span>
                <span style={{ display: 'none' }}>Sign in with Google</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                {googleUserEmail || 'Google Drive & Sheets Connected'}
              </span>
              <button
                onClick={handleGoogleDisconnect}
                title={isAr ? 'فصل حساب جوجل' : 'Disconnect Google'}
                className="p-1 hover:bg-emerald-100 rounded-md text-emerald-700 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleFindCrm1InDrive(driveFileName || 'CRM1')}
            disabled={isSearchingDrive}
            className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 text-indigo-600 ${isSearchingDrive ? 'animate-spin' : ''}`} />
            <span>
              {isSearchingDrive
                ? isAr
                  ? 'جاري البحث في Drive...'
                  : 'Searching Drive...'
                : isAr
                ? 'ربط شيت CRM1 من Google Drive'
                : 'Auto-Find CRM1 on Drive'}
            </span>
          </button>

          <label className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4 text-blue-600" />
            <span>{isAr ? 'رفع شيت CSV' : 'Upload CSV'}</span>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleCsvFileUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={() => handleSyncAndDistribute()}
            disabled={isSyncing}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? isAr
                  ? 'جاري سحب وتوزيع شيت CRM1...'
                  : 'Syncing CRM1...'
                : isAr
                ? 'مزامنة شيت CRM1 الآن'
                : 'Sync CRM1 Sheet Now'}
            </span>
          </button>
        </div>
      </div>

      {/* CRM1 Clean Import Filter Rules Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
            1
          </div>
          <div className="text-xs">
            <div className="font-bold text-slate-900">
              {isAr
                ? 'الاسم + رقم التليفون + إجابات أسئلة الفورم'
                : 'Name + Phone + Form Questions & Answers'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {isAr
                ? 'يستخرج النظام اسم العميل ورقم هاتفه، ويحول جميع أعمدة أسئلة الفورم تلقائياً إلى بطاقة أسئلة وإجابات واضحة لكل عميل.'
                : 'Automatically extracts client name, phone number, and converts all form columns into structured Q&A items.'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-rose-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold">
            2
          </div>
          <div className="text-xs">
            <div className="font-bold text-slate-900">
              {isAr
                ? 'حذف واستبعاد أي خانات ID غير مفيدة نهائياً'
                : 'Zero Useless ID Columns'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {isAr
                ? 'يتم تجاهل وحذف أعمدة (id, lead_id, ad_id, form_id, campaign_id, adset_id, created_time) تلقائياً حتى تظل بيانات العميل نظيفة.'
                : 'Automatically ignores id, lead_id, ad_id, form_id, campaign_id, and technical metadata columns.'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-blue-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold">
            3
          </div>
          <div className="text-xs">
            <div className="font-bold text-slate-900">
              {isAr
                ? 'سحب أوتوماتيك كل 15 دقيقة بدون أي تكرار'
                : '15-Minute Auto-Sync Without Duplicates'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {isAr
                ? 'يعمل المؤقت الخلفي كل 15 دقيقة لفحص شيت CRM1 واستيراد العملاء الجدد فقط مع منع تكرار أي رقم هاتف مسجل مسبقاً.'
                : 'Runs every 15 minutes in the background and deduplicates strictly by normalized phone number.'}
            </p>
          </div>
        </div>
      </div>

      {/* Optional CSV / Direct Rows Paste Box */}
      {showCsvImportBox && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr
                ? 'معاينة واستيراد صفوف الشيت المرفوعة وتوزيعها تلقائياً'
                : 'Preview & Auto-Distribute Uploaded Sheet Rows'}
            </h3>
            <button
              onClick={() => setShowCsvImportBox(false)}
              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
          <textarea
            rows={4}
            value={csvPasteText}
            onChange={(e) => setCsvPasteText(e.target.value)}
            placeholder="full_name,phone_number,project_name,budget..."
            className="w-full p-3 rounded-xl border border-slate-200 font-mono-tabular text-xs"
          />
          <div className="flex justify-end">
            <button
              onClick={() => handleSyncAndDistribute(csvPasteText)}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              {isAr
                ? 'بدء استيراد وتوزيع الصفوف على المبيعات الآن'
                : 'Import & Route Rows Now'}
            </button>
          </div>
        </div>
      )}

      {/* 2. Two-Column Configuration & Auto-Routing Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Google Sheet Connection & Editable Column Mapping */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                {isAr
                  ? 'إعدادات ملف Google Sheet ومطابقة الأعمدة'
                  : 'Google Sheet Source & Editable Column Mapping'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {sheetConnections.length > 1 && (
                <select
                  value={selectedConnId}
                  onChange={(e) => setSelectedConnId(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {sheetConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowAddConnModal(true)}
                className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة شيت جديد' : 'Add Sheet'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-emerald-950">
                  {isAr
                    ? 'اسم الشيت الأساسي في Google Drive (البحث والربط التلقائي):'
                    : 'Primary Sheet Name on Google Drive:'}
                </label>
                <span className="text-[11px] font-bold text-emerald-700">
                  {isAr ? 'صلاحية Google Drive مفعلة ✓' : 'Google Drive Scope Active ✓'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={driveFileName}
                  onChange={(e) => setDriveFileName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-emerald-200 bg-white font-mono-tabular font-bold text-slate-900"
                  placeholder="CRM1"
                />
                <button
                  type="button"
                  onClick={() => handleFindCrm1InDrive(driveFileName || 'CRM1')}
                  disabled={isSearchingDrive}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 cursor-pointer"
                >
                  {isSearchingDrive
                    ? isAr
                      ? 'جاري البحث...'
                      : 'Searching...'
                    : isAr
                    ? 'بحث وربط من Google Drive'
                    : 'Find on Google Drive'}
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1.5">
                {isAr
                  ? 'رابط Google Sheet أو معرف الجدول (Spreadsheet URL / ID):'
                  : 'Google Sheet URL or Spreadsheet ID:'}
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
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold shrink-0 cursor-pointer"
                >
                  {isInspecting
                    ? isAr
                      ? 'جاري الفحص...'
                      : 'Inspecting...'
                    : isAr
                    ? 'فحص التبويبات والأعمدة'
                    : 'Inspect Sheet'}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {isAr ? 'اسم اتصال الشيت:' : 'Connection Name:'}
              </label>
              <input
                type="text"
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {isAr ? 'اسم التبويب (Sheet Tab Name):' : 'Sheet Tab Name:'}
              </label>
              {inspectedData?.tabs && inspectedData.tabs.length > 0 ? (
                <select
                  value={sheetTabName}
                  onChange={(e) => setSheetTabName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  {inspectedData.tabs.map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={sheetTabName}
                  onChange={(e) => setSheetTabName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1.5">
                {isAr
                  ? 'خوارزمية التوزيع التلقائي على فريق المبيعات:'
                  : 'Automatic Lead Routing Algorithm:'}
              </label>
              <select
                value={routingMode}
                onChange={(e) => setRoutingMode(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-800"
              >
                <option value="project_then_round_robin">
                  {isAr
                    ? 'توزيع دائري بالتساوي مع التخصيص حسب المشروع العقاري (Recommended)'
                    : 'Round-Robin Equal Distribution + Real Estate Project Specialization'}
                </option>
                <option value="round_robin_only">
                  {isAr
                    ? 'توزيع دائري بالتساوي بين جميع المناديب النشطين فقط'
                    : 'Pure Round-Robin Across All Active Sales Agents'}
                </option>
              </select>
            </div>
          </div>

          {/* Editable Column Mapping */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {isAr
                  ? 'تخصيص أسماء أعمدة الشيت (Editable Column Mapping):'
                  : 'Customize Sheet Column Headers:'}
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold">
                {isAr ? 'يدعم الأعمدة العربية والإنجليزية' : 'Supports AR & EN headers'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
              <div>
                <label className="text-slate-500 block mb-1">
                  {isAr ? 'عمود اسم العميل' : 'Client Name Column'}
                </label>
                <input
                  type="text"
                  value={columnMapping.fullName}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, fullName: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono-tabular font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">
                  {isAr ? 'عمود رقم الهاتف' : 'Phone Column'}
                </label>
                <input
                  type="text"
                  value={columnMapping.phone}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, phone: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono-tabular font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">
                  {isAr ? 'عمود المشروع العقاري' : 'Project Column'}
                </label>
                <input
                  type="text"
                  value={columnMapping.projectInterest}
                  onChange={(e) =>
                    setColumnMapping({
                      ...columnMapping,
                      projectInterest: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono-tabular font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">
                  {isAr ? 'عمود الميزانية' : 'Budget Column'}
                </label>
                <input
                  type="text"
                  value={columnMapping.budgetMax}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, budgetMax: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono-tabular font-semibold text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Inspected Sheet Preview Table if inspected */}
          {inspectedData && (
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Table className="w-4 h-4 text-blue-600" />
                  <span>
                    {isAr ? 'معاينة بيانات الشيت:' : 'Sheet Preview:'} {inspectedData.title}
                  </span>
                </span>
                <span className="font-mono-tabular text-[11px] text-blue-700">
                  {inspectedData.tabs.join(' · ')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse bg-white rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
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
                          <td key={cIdx} className="p-2 border border-slate-100 text-slate-700">
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

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setShowCsvImportBox(!showCsvImportBox)}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              {isAr
                ? 'أو لصق صفوف مباشرة من جوجل شيت / إكسيل'
                : 'Or paste rows directly from Google Sheets / Excel'}
            </button>
            <button
              type="button"
              onClick={handleSaveConnectionSettings}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'حفظ إعدادات الشيت والتوزيع' : 'Save Sheet & Routing Config'}
            </button>
          </div>
        </div>

        {/* Right: Active Sales Team Routing Pool & Project Matrix */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  {isAr
                    ? 'قائمة المناديب المستلمين لليدز تلقائياً'
                    : 'Active Sales Agents in Auto-Routing Pool'}
                </h2>
              </div>
              <span className="text-xs font-mono-tabular font-semibold text-blue-600">
                {activeSalesAgents.length} {isAr ? 'نشط' : 'Active'}
              </span>
            </div>

            <div className="space-y-3">
              {activeSalesAgents.map((agent, idx) => (
                <div
                  key={agent.id}
                  className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <img
                      src={agent.avatarUrl}
                      alt={agent.fullName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {agent.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {(agent.assignedProjects || []).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <span className="text-[11px] font-semibold text-emerald-600">
                      {isAr ? 'جاهز للاستلام' : 'Ready'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-700 space-y-1.5">
            <div className="font-bold text-blue-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>
                {isAr ? 'كيف يعمل التوزيع الذكي؟' : 'How Smart Auto-Distribution Works:'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              {isAr
                ? 'عند وصول ليد جديد من شيت جوجل، يفحص النظام اسم المشروع العقاري (مثل Palm Hills أو Solare) ويقوم بتعيينه للمندوب المختص بهذا المشروع بالدور الدائري المتساوي، مع إرسال إشعار لحظي للمندوب.'
                : 'When a new row arrives from Google Sheets, the router matches the project name to specialized sales agents and assigns it in strict Round-Robin order with an instant notification.'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Sync History & Distribution Audit Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {isAr
                ? 'سجل عمليات الاستيراد والتوزيع التلقائي (Sync & Routing Logs)'
                : 'Google Sheets Import & Distribution History'}
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono-tabular">
            {syncLogs.length} {isAr ? 'عملية مزامنة' : 'sync runs'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500">
                <th className="py-3 px-4 text-start">{isAr ? 'التوقيت' : 'Timestamp'}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'اسم الشيت' : 'Sheet Source'}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'الصفوف المفحوصة' : 'Scanned'}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'الليدز المستوردة' : 'Imported'}</th>
                <th className="py-3 px-4 text-start">
                  {isAr ? 'تفاصيل التوزيع على السيلز' : 'Sales Team Distribution Breakdown'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {syncLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono-tabular text-slate-600">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {log.connectionName}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular">{log.rowsScanned}</td>
                  <td className="py-3 px-4 font-mono-tabular font-bold text-emerald-600">
                    +{log.newLeadsImported} {isAr ? 'ليد جديد' : 'new leads'}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
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
