/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Building2,
  Calendar,
  BarChart3,
  UserCheck,
  ShieldCheck,
  Bell,
  Globe,
  LogOut,
  CheckCheck,
  X,
  Menu,
  RefreshCw,
  Settings,
  Briefcase,
  Plus,
  Trophy,
  AlarmClock,
  Phone,
  Clock,
  MessageSquare,
} from 'lucide-react';
import {
  AppNotification,
  CalendarEvent,
  Deal,
  Lead,
  normalizeLeadStatus,
  PropertyUnit,
  RealEstateProject,
  Role,
  SheetConnection,
  SyncLog,
  UserProfile,
} from './types/crm';
import { Lang, translations } from './i18n/translations';
import {
  apiRequest,
  setCurrentApiUser,
  getSessionToken,
  setSessionToken,
  clearSessionAuth,
  isServerlessMode,
  hasValidActiveSession,
  isSessionExpiredByInactivity,
  touchSessionActivity,
} from './services/api';
import { subscribeToFirestoreWorkspace } from './services/firebaseClient';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { LeadsView } from './components/LeadsView';
import { GoogleSheetsView } from './components/GoogleSheetsView';
import { PermissionsMatrixView } from './components/PermissionsMatrixView';
import { EmployeesView } from './components/EmployeesView';
import { DailyReportsView } from './components/DailyReportsView';
import { DealsAndPropertiesView } from './components/DealsAndPropertiesView';
import { CalendarView } from './components/CalendarView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [lang, setLang] = useState<Lang>('ar');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasValidActiveSession());
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // CRM State loaded from Backend Database / Firebase Firestore
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<PropertyUnit[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sheetConnections, setSheetConnections] = useState<SheetConnection[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectsCatalog, setProjectsCatalog] = useState<RealEstateProject[]>([]);

  // Interactive UI Modals & Drawers
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferInitialFromUser, setTransferInitialFromUser] = useState<string>('');
  const [transferInitialToUser, setTransferInitialToUser] = useState<string>('');
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);
  const [dueReminderLeads, setDueReminderLeads] = useState<Lead[]>([]);
  const notifiedReminderKeysRef = useRef<Set<string>>(new Set());

  const isAr = lang === 'ar';
  const t = translations[lang];

  const handleLogout = useCallback((expiredReason?: string) => {
    clearSessionAuth();
    setCurrentUser(null);
    setCurrentRole(null);
    setLeads([]);
    setUsers([]);
    setDeals([]);
    setEvents([]);
    setSelectedLead(null);
    setSessionExpiredMessage(expiredReason || null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isAr]);

  // 15-Minute Inactivity & Tab-Absence Auto-Logout Guard
  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutMsg = isAr
      ? 'تم تسجيل الخروج تلقائياً بعد غياب 15 دقيقة حفاظاً على أمان البيانات. يرجى إعادة تسجيل الدخول.'
      : 'Automatically logged out after 15 minutes of inactivity. Please sign in again.';

    let lastTouch = Date.now();

    const checkAndHandleExpiry = (): boolean => {
      if (isSessionExpiredByInactivity()) {
        handleLogout(timeoutMsg);
        return true;
      }
      return false;
    };

    const onUserActivity = () => {
      if (checkAndHandleExpiry()) return;
      const now = Date.now();
      if (now - lastTouch > 4000) {
        lastTouch = now;
        touchSessionActivity();
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkAndHandleExpiry();
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    activityEvents.forEach((evt) =>
      window.addEventListener(evt, onUserActivity, { passive: true })
    );
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    const timer = setInterval(() => {
      checkAndHandleExpiry();
    }, 10_000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, onUserActivity));
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      clearInterval(timer);
    };
  }, [isAuthenticated, isAr, handleLogout]);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const loadBootstrapData = useCallback(async () => {
    if (isSessionExpiredByInactivity()) {
      handleLogout();
      return;
    }
    try {
      const data = await apiRequest('/api/bootstrap');
      if (!data || !data.currentUser || !data.currentRole) {
        return;
      }
      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
      }
      if (data.currentUser?.id) {
        setCurrentApiUser(data.currentUser.id, data.sessionToken);
      }
      setCurrentUser(data.currentUser);
      setCurrentRole(data.currentRole);
      setRoles(data.roles || []);
      setUsers(data.users || []);
      const freshLeads: Lead[] = data.leads || [];
      setLeads(freshLeads);
      setSelectedLead((prev) =>
        prev ? freshLeads.find((l) => l.id === prev.id) || null : null
      );
      setProperties(data.properties || []);
      setDeals(data.deals || []);
      setEvents(data.events || []);
      setSheetConnections(data.sheetConnections || []);
      setSyncLogs(data.syncLogs || []);
      setNotifications(data.notifications || []);
      setProjects(data.projects || []);
      setProjectsCatalog(data.projectsCatalog || []);
    } catch (err) {
      console.error('Failed to bootstrap CRM:', err);
    }
  }, [handleLogout]);

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await loadBootstrapData();
      triggerToast(
        isAr
          ? 'تم تحديث البيانات والمزامنة مع Firebase بنجاح ✓'
          : 'Workspace synced with Firebase successfully ✓'
      );
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 500);
    }
  }, [loadBootstrapData, triggerToast, isAr]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadBootstrapData();
    }
  }, [isAuthenticated, loadBootstrapData]);

  // Real-time synchronization directly with Google Firebase Cloud Firestore
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = subscribeToFirestoreWorkspace(() => {
      // Refresh CRM view when Cloud Firestore data changes externally
      void loadBootstrapData();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isAuthenticated, loadBootstrapData]);

  // Connect to Real-Time SSE Notification Stream only when Express backend is active
  useEffect(() => {
    if (!isAuthenticated || !currentUser || isServerlessMode()) return;
    const token = getSessionToken();
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    const evtSource = new EventSource(
      `/api/notifications/stream?userId=${encodeURIComponent(currentUser.id)}${tokenQuery}`
    );

    evtSource.onmessage = (event) => {
      try {
        const incoming: AppNotification = JSON.parse(event.data);
        setNotifications((prev) => [incoming, ...prev]);
        triggerToast(isAr ? incoming.titleAr : incoming.title);
        loadBootstrapData();
      } catch {
        // ignore malformed event
      }
    };

    evtSource.onerror = () => {
      // Close cleanly if running on a static/serverless host to prevent 404 retry loops
      if (isServerlessMode()) {
        evtSource.close();
      }
    };

    return () => {
      evtSource.close();
    };
  }, [isAuthenticated, currentUser?.id, isAr, triggerToast, loadBootstrapData]);

  // Pleasant Web Audio API Bell Chime for Due Call Reminders (no external audio files)
  const playReminderChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const playTone = (freq: number, startOffset: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + startOffset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration);
      };

      playTone(587.33, 0, 0.28); // D5
      playTone(880.0, 0.18, 0.45); // A5
    } catch {
      // ignore if browser blocks autoplay before user interaction
    }
  }, []);

  // Live Call & Follow-up Reminder Monitor (runs immediately + every 30 seconds)
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !currentRole) {
      setDueReminderLeads([]);
      return;
    }

    const evaluateDueReminders = () => {
      const nowMs = Date.now();
      const isAdmin = currentRole.id === 'role_admin';
      const dueList = leads.filter((l) => {
        if (!l.reminderDateTime || l.reminderNotified) return false;
        if (!isAdmin && l.assignedTo !== currentUser.id) return false;
        const ts = new Date(l.reminderDateTime).getTime();
        return !Number.isNaN(ts) && ts <= nowMs;
      });

      setDueReminderLeads(dueList);

      let shouldPlaySound = false;
      dueList.forEach((lead) => {
        const key = `${lead.id}::${lead.reminderDateTime}`;
        if (!notifiedReminderKeysRef.current.has(key)) {
          notifiedReminderKeysRef.current.add(key);
          shouldPlaySound = true;

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(
                isAr
                  ? `⏰ حان موعد مكالمة العميل: ${lead.fullName}`
                  : `⏰ Call Reminder Due: ${lead.fullName}`,
                {
                  body:
                    lead.reminderNote ||
                    `${lead.phone} · ${lead.projectInterest}`,
                }
              );
            } catch {
              // ignore notification error
            }
          }
        }
      });

      if (shouldPlaySound) {
        playReminderChime();
      }
    };

    evaluateDueReminders();
    const intervalId = setInterval(evaluateDueReminders, 30_000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, currentUser, currentRole, leads, isAr, playReminderChime]);

  const handleSnoozeReminder = async (lead: Lead) => {
    try {
      const snoozedIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await apiRequest(`/api/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          reminderDateTime: snoozedIso,
          reminderNotified: false,
        }),
      });
      setDueReminderLeads((prev) => prev.filter((item) => item.id !== lead.id));
      triggerToast(
        isAr
          ? `⏳ تم تأجيل تذكير مكالمة "${lead.fullName}" لمدة 15 دقيقة`
          : `⏳ Snoozed reminder for "${lead.fullName}" by 15 minutes`
      );
      await loadBootstrapData();
    } catch (err: any) {
      triggerToast(err.message);
    }
  };

  const handleCompleteReminder = async (lead: Lead) => {
    try {
      await apiRequest(`/api/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          reminderNotified: true,
        }),
      });
      setDueReminderLeads((prev) => prev.filter((item) => item.id !== lead.id));
      triggerToast(
        isAr
          ? `✓ تم إنهاء تذكير المكالمة للعميل "${lead.fullName}"`
          : `✓ Marked reminder completed for "${lead.fullName}"`
      );
      await loadBootstrapData();
    } catch (err: any) {
      triggerToast(err.message);
    }
  };

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const handleQuickSyncSheets = useCallback(async () => {
    if (
      !currentRole ||
      (currentRole.id !== 'role_admin' &&
        (!currentRole.permissions?.sheets_sync?.import ||
          currentRole.permissions.sheets_sync.import === 'none'))
    ) {
      return;
    }
    setIsSyncingSheets(true);
    try {
      const connId = sheetConnections[0]?.id;
      const res = await apiRequest('/api/sheets/sync', {
        method: 'POST',
        body: JSON.stringify({ connectionId: connId }),
      });
      triggerToast(
        isAr
          ? `شيت CRM1: تم استيراد ${res.newLeadsImported} عميل جديد (الاسم + رقم التليفون + إجابات الفورم) بدون تكرار وبدون ID!`
          : `CRM1 Sync: Imported ${res.newLeadsImported} new leads (Name + Phone + Form Q&A) without duplicates or IDs!`
      );
      await loadBootstrapData();
    } catch (err: any) {
      triggerToast(err.message);
    } finally {
      setIsSyncingSheets(false);
    }
  }, [currentRole, sheetConnections, isAr, triggerToast, loadBootstrapData]);

  // Global 15-Minute Automatic Sync Interval for Google Drive Sheet (CRM1) - Only for roles permitted to sync
  useEffect(() => {
    if (
      !isAuthenticated ||
      !currentRole ||
      (currentRole.id !== 'role_admin' &&
        (!currentRole.permissions?.sheets_sync?.import ||
          currentRole.permissions.sheets_sync.import === 'none'))
    ) {
      return;
    }
    const interval = setInterval(() => {
      handleQuickSyncSheets();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, currentRole, handleQuickSyncSheets]);

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const [openAddLeadModal, setOpenAddLeadModal] = useState(false);

  // Permission-filtered Sidebar Navigation Items (Strict Route Guard Contract)
  const navItems = React.useMemo(() => {
    if (!currentRole) return [];
    const perms = currentRole.permissions;
    const isAdmin = currentRole.id === 'role_admin';
    const canReadSettings =
      isAdmin || (Boolean(perms?.sheets_sync?.read) && perms.sheets_sync.read !== 'none');
    return [
      {
        id: 'dashboard',
        label: t.nav.dashboard,
        icon: LayoutDashboard,
        visible: true,
      },
      {
        id: 'leads',
        label: t.nav.leads,
        icon: Users,
        visible: isAdmin || (Boolean(perms?.leads?.read) && perms.leads.read !== 'none'),
        badge: leads.filter((l) => normalizeLeadStatus(l.status) === 'Fresh Lead').length,
      },
      {
        id: 'calendar',
        label: t.nav.calendar,
        icon: Calendar,
        visible: isAdmin || (Boolean(perms?.calendar?.read) && perms.calendar.read !== 'none'),
      },
      {
        id: 'properties',
        label: t.nav.properties,
        icon: Building2,
        visible: isAdmin || (Boolean(perms?.properties?.read) && perms.properties.read !== 'none'),
      },
      {
        id: 'deals',
        label: t.nav.deals,
        icon: Briefcase,
        visible: isAdmin || (Boolean(perms?.deals?.read) && perms.deals.read !== 'none'),
      },
      {
        id: 'employees',
        label: t.nav.employees,
        icon: UserCheck,
        visible:
          isAdmin || perms?.users?.read === 'all' || perms?.users?.read === 'team',
      },
      {
        id: 'dailyReports',
        label: t.nav.dailyReports,
        icon: Trophy,
        visible: isAdmin || (Boolean(perms?.reports?.read) && perms.reports.read !== 'none'),
      },
      {
        id: 'settings',
        label: t.nav.settings,
        icon: Settings,
        visible: canReadSettings,
      },
    ].filter((item) => item.visible);
  }, [currentRole, t.nav, leads]);

  // Route Guard: Redirect to first permitted tab if current role does not have access to activeTab
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((item) => item.id === activeTab)) {
      setActiveTab(navItems[0].id);
    }
  }, [navItems, activeTab]);

  if (!isAuthenticated) {
    return (
      <LoginView
        lang={lang}
        onToggleLang={handleToggleLang}
        sessionExpiredMessage={sessionExpiredMessage}
        onLoginSuccess={(u, r, token) => {
          setSessionExpiredMessage(null);
          setCurrentApiUser(u.id, token);
          touchSessionActivity();
          setCurrentUser(u);
          setCurrentRole(r);
          setRoles((prev) => (prev.length > 0 ? prev : [r]));
          setUsers((prev) => (prev.length > 0 ? prev : [u]));
          setActiveTab('dashboard');
          setIsAuthenticated(true);
        }}
      />
    );
  }

  if (!currentUser || !currentRole) {
    return (
      <div className="min-h-dvh bg-[#F4F7FE] flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center space-y-4 max-w-sm w-full">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto animate-pulse">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-slate-900">
            {isAr ? 'جاري التحقق من الجلسة وتحميل الصلاحيات...' : 'Verifying session & loading permissions...'}
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => loadBootstrapData()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
            >
              {isAr ? 'تحديث الآن' : 'Reload Now'}
            </button>
            <button
              onClick={() => handleLogout()}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
            >
              {isAr ? 'صفحة تسجيل الدخول' : 'Sign In Page'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const quickSearchMatches =
    globalSearch.trim().length > 0
      ? leads
          .filter(
            (l) =>
              l.fullName.toLowerCase().includes(globalSearch.toLowerCase()) ||
              l.phone.toLowerCase().includes(globalSearch.toLowerCase()) ||
              l.projectInterest.toLowerCase().includes(globalSearch.toLowerCase())
          )
          .slice(0, 5)
      : [];

  return (
    <div className="min-h-dvh w-full bg-[#F4F7FE] flex flex-col lg:flex-row">
      {/* Mobile Backdrop Overlay for Sidebar Drawer */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Left / Right Sidebar (Responsive Drawer on Mobile + Sticky Sidebar on Desktop) */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 w-72 max-w-[82vw] lg:sticky lg:top-0 lg:w-64 lg:h-dvh shrink-0 bg-gradient-to-b from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white flex flex-col justify-between p-4 overflow-y-auto transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : 'hidden lg:flex'
        }`}
      >
        <div>
          {/* Brand Logo Lockup */}
          <div className="flex items-center justify-between px-2 py-3 mb-6 border-b border-white/15">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                {t.brandName}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const badgeVal = item.id === 'leads' ? leads.length : item.badge;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-blue-50 hover:bg-white/15'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-blue-100'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {badgeVal !== undefined && badgeVal > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono-tabular font-bold ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white/20 text-white'
                      }`}
                    >
                      {badgeVal}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Current Role & Logout */}
        <div className="mt-8 pt-4 border-t border-white/15 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-white/10 text-[11px]">
            <div className="text-blue-100">
              {isAr ? 'الدور والصلاحية الحالية:' : 'Active Role:'}
            </div>
            <div className="font-bold text-white truncate mt-0.5">
              {isAr ? currentRole.nameAr : currentRole.name}
            </div>
          </div>

          <button
            onClick={() => handleLogout()}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-100 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.common.logout}</span>
          </button>

          <div className="text-[10px] text-blue-200/60 text-center pt-2 font-medium tracking-wide">
            By a2z marketing & software
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {/* Top Bar Contract (Responsive across Mobile, Tablet, Desktop & iframe) */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sticky top-0 z-30 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Zone 1: Context Title & Mobile Menu Button */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0 cursor-pointer"
                aria-label="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {navItems.find((n) => n.id === activeTab)?.label || t.nav.dashboard}
              </span>

              {/* Primary Header Action: Quick Add Lead */}
              {(currentRole?.id === 'role_admin' || currentRole?.permissions?.leads?.add !== 'none') && (
                <button
                  onClick={() => {
                    setActiveTab('leads');
                    setOpenAddLeadModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.common.addNewLead}</span>
                  <span className="sm:hidden">{t.common.add}</span>
                </button>
              )}
            </div>

            {/* Zone 1.5: Global Instant Lead Search Bar */}
            {navItems.some((n) => n.id === 'leads') && (
              <div className="relative order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-md">
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'بحث فوري عن عميل بالاسم، رقم الهاتف، أو المشروع...'
                      : 'Quick search lead by name, phone, or project...'
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F4F7FE] border border-slate-200/80 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600"
                />
                {quickSearchMatches.length > 0 && (
                  <div className="absolute start-0 end-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 z-50 divide-y divide-slate-50">
                    {quickSearchMatches.map((match) => (
                      <button
                        key={match.id}
                        onClick={() => {
                          setGlobalSearch('');
                          setSelectedLead(match);
                          setActiveTab('leads');
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50/60 text-start text-xs transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pe-2">
                          <div className="font-bold text-slate-900 truncate">{match.fullName}</div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular truncate">
                            {match.phone} · {match.projectInterest}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold shrink-0">
                          {t.status[match.status]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zone 2: Authenticated User Identity & Quick Actions (No Account Switcher) */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 order-2 md:order-3 shrink-0">
              <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#F4F7FE] border border-slate-200 text-xs font-semibold text-slate-800">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="max-w-[100px] sm:max-w-[140px] truncate text-slate-900 font-bold">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[10px] text-blue-600 font-semibold truncate hidden sm:block">
                    {isAr ? currentRole.nameAr : currentRole.name}
                  </div>
                </div>
              </div>

              {/* Bilingual Language Toggle */}
              <button
                onClick={handleToggleLang}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>{isAr ? 'EN' : 'عربي'}</span>
              </button>

              {/* Instant Notifications Bell */}
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                title={t.common.notifications}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-mono-tabular font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Quick Logout Button on Header */}
              <button
                onClick={() => handleLogout()}
                className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                title={t.common.logout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Horizontal Quick-Navigation Bar (Strictly filtered by navItems) */}
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const badgeVal = item.id === 'leads' ? leads.length : item.badge;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[#F4F7FE] text-slate-700 hover:bg-slate-200/70 border border-slate-200/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {badgeVal !== undefined && badgeVal > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono-tabular ${
                        isActive ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {badgeVal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* Sticky Call Reminder Alert Banner (`شريط تنبيه حي في أعلى الشاشة عند حلول موعد المكالمة`) */}
        {dueReminderLeads.length > 0 && (
          <div className="sticky top-[68px] z-30 px-3 sm:px-5 lg:px-7 pt-3 max-w-[1440px] w-full mx-auto space-y-2">
            {dueReminderLeads.slice(0, 3).map((remLead) => {
              const cleanPhone = String(remLead.phone || '').replace(/[^\d+]/g, '');
              const dueTimeStr = remLead.reminderDateTime
                ? new Date(remLead.reminderDateTime).toLocaleTimeString(
                    isAr ? 'ar-EG' : 'en-US',
                    { hour: '2-digit', minute: '2-digit' }
                  )
                : '';

              return (
                <div
                  key={remLead.id}
                  className="bg-gradient-to-l from-amber-500 via-orange-500 to-rose-600 text-white rounded-2xl p-3.5 shadow-xl border border-white/25 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 animate-bounce">
                      <AlarmClock className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-white text-rose-700 text-[10px] font-extrabold uppercase tracking-wide">
                          {isAr ? `⏰ منبه مكالمة مستحق الآن (${dueTimeStr})` : `⏰ Call Reminder Due (${dueTimeStr})`}
                        </span>
                        <span className="text-sm font-extrabold truncate">
                          {remLead.fullName}
                        </span>
                        <span
                          className="text-xs font-mono-tabular font-bold bg-black/20 px-2 py-0.5 rounded-md"
                          dir="ltr"
                        >
                          {remLead.phone}
                        </span>
                        <span className="text-xs font-semibold text-white/90">
                          · {remLead.projectInterest}
                        </span>
                      </div>
                      {remLead.reminderNote && (
                        <p className="text-xs text-white/95 font-medium mt-1 truncate">
                          {isAr ? 'ملاحظة التذكير: ' : 'Note: '}
                          <strong className="underline decoration-white/60">
                            {remLead.reminderNote}
                          </strong>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 3 Immediate Action Buttons: Call Now, Open Lead Profile, Snooze 15m / Done */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={`tel:${cleanPhone}`}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isAr ? '📞 اتصال الآن' : '📞 Call Now'}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLead(remLead);
                        setActiveTab('leads');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-amber-300" />
                      <span>{isAr ? '💬 فتح ملف العميل' : '💬 Open Client Profile'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSnoozeReminder(remLead)}
                      className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isAr ? '⏳ غفوة 15 دقيقة' : '⏳ Snooze 15m'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCompleteReminder(remLead)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{isAr ? '✓ تم التنفيذ' : '✓ Done'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active View Container (Strictly guarded by navItems permissions) */}
        <main className="flex-1 p-3 sm:p-5 lg:p-7 pb-24 lg:pb-7 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && navItems.some((n) => n.id === 'dashboard') && (
            <DashboardView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              deals={deals}
              events={events}
              sheetConnections={sheetConnections}
              onNavigate={(tab) => {
                if (navItems.some((n) => n.id === tab)) {
                  setActiveTab(tab);
                }
              }}
              onSelectLead={(lead) => {
                if (navItems.some((n) => n.id === 'leads')) {
                  setSelectedLead(lead);
                  setActiveTab('leads');
                }
              }}
              onOpenTransferModal={() => {
                if (navItems.some((n) => n.id === 'leads')) {
                  setShowTransferModal(true);
                  setActiveTab('leads');
                }
              }}
              onQuickSyncSheets={handleQuickSyncSheets}
              isSyncingSheets={isSyncingSheets}
            />
          )}

          {activeTab === 'leads' && navItems.some((n) => n.id === 'leads') && (
            <LeadsView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              properties={properties}
              projects={projects}
              selectedLead={selectedLead}
              onSelectLead={setSelectedLead}
              onRefresh={loadBootstrapData}
              showTransferModal={showTransferModal}
              setShowTransferModal={setShowTransferModal}
              initialTransferFromUser={transferInitialFromUser}
              initialTransferToUser={transferInitialToUser}
              onResetTransferInitialUsers={() => {
                setTransferInitialFromUser('');
                setTransferInitialToUser('');
              }}
              onToast={triggerToast}
              onQuickSyncSheets={handleQuickSyncSheets}
              isSyncingSheets={isSyncingSheets}
              openAddModalTrigger={openAddLeadModal}
              onResetAddModalTrigger={() => setOpenAddLeadModal(false)}
            />
          )}

          {activeTab === 'calendar' && navItems.some((n) => n.id === 'calendar') && (
            <CalendarView
              lang={lang}
              currentUser={currentUser}
              users={users}
              leads={leads}
              events={events}
              projects={projects}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'properties' && navItems.some((n) => n.id === 'properties') && (
            <DealsAndPropertiesView
              forcedSubTab="properties"
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              properties={properties}
              deals={deals}
              projects={projects}
              projectsCatalog={projectsCatalog}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'deals' && navItems.some((n) => n.id === 'deals') && (
            <DealsAndPropertiesView
              forcedSubTab="deals"
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              properties={properties}
              deals={deals}
              projects={projects}
              projectsCatalog={projectsCatalog}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'employees' && navItems.some((n) => n.id === 'employees') && (
            <EmployeesView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              roles={roles}
              leads={leads}
              projects={projects}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
              onOpenTransferForAgent={(fromUserId?: string, toUserId?: string) => {
                if (fromUserId) setTransferInitialFromUser(fromUserId);
                if (toUserId) setTransferInitialToUser(toUserId);
                setShowTransferModal(true);
                setActiveTab('leads');
              }}
            />
          )}

          {activeTab === 'dailyReports' && navItems.some((n) => n.id === 'dailyReports') && (
            <DailyReportsView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              leads={leads}
              deals={deals}
            />
          )}

          {(activeTab === 'settings' || activeTab === 'sheetsSync' || activeTab === 'permissions') &&
            navItems.some((n) => n.id === 'settings' || n.id === 'sheetsSync' || n.id === 'permissions') && (
              <SettingsView
                lang={lang}
                currentRole={currentRole}
                users={users}
                roles={roles}
                projects={projects}
                sheetConnections={sheetConnections}
                syncLogs={syncLogs}
                initialSubTab={activeTab === 'permissions' ? 'permissions' : 'sheets'}
                onRefresh={loadBootstrapData}
                onToast={triggerToast}
              />
            )}
        </main>
      </div>

      {/* Notifications Drawer */}
      {showNotificationsDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-s border-slate-200 flex flex-col justify-between">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">
                  {t.common.notifications}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMarkAllNotificationsRead}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{t.common.markAllRead}</span>
                </button>
                <button
                  onClick={() => setShowNotificationsDrawer(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  {isAr ? 'لا توجد تنبيهات حالياً' : 'No notifications yet'}
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (notif.relatedLeadId) {
                        const found = leads.find((l) => l.id === notif.relatedLeadId);
                        if (found) {
                          setSelectedLead(found);
                          setActiveTab('leads');
                          setShowNotificationsDrawer(false);
                        }
                      }
                    }}
                    className={`p-3.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                      notif.isRead
                        ? 'bg-white border-slate-100'
                        : 'bg-blue-50/50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">
                        {isAr ? notif.titleAr : notif.title}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-slate-400">
                        {new Date(notif.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      {isAr ? notif.messageAr : notif.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Mobile & Iframe Bottom Navigation Bar (Strictly filtered by navItems) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-2xl px-2 py-1.5 flex items-center justify-around safe-bottom">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer min-w-[56px] ${
                isActive
                  ? 'text-blue-600 scale-105'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="truncate max-w-[64px]">{item.label}</span>
              {item.id === 'leads' && leads.length > 0 && (
                <span className="absolute -top-1 end-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-mono-tabular font-bold">
                  {leads.length}
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => handleLogout()}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold text-red-600 hover:bg-red-50 transition-all cursor-pointer min-w-[56px]"
        >
          <LogOut className="w-5 h-5 mb-0.5 text-red-600" />
          <span className="truncate">{t.common.logout}</span>
        </button>
      </nav>

      {/* Instant Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 end-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-3 text-xs font-medium">
          <Bell className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ms-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
