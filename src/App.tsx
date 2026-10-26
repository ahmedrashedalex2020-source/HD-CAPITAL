/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronDown,
  Menu,
} from 'lucide-react';
import {
  AppNotification,
  CalendarEvent,
  Deal,
  Lead,
  PropertyUnit,
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
} from './services/api';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { LeadsView } from './components/LeadsView';
import { GoogleSheetsView } from './components/GoogleSheetsView';
import { PermissionsMatrixView } from './components/PermissionsMatrixView';
import { EmployeesView } from './components/EmployeesView';
import { DailyReportsView } from './components/DailyReportsView';
import { DealsAndPropertiesView } from './components/DealsAndPropertiesView';
import { CalendarView } from './components/CalendarView';

export default function App() {
  const [lang, setLang] = useState<Lang>('ar');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
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

  // Interactive UI Modals & Drawers
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  const isAr = lang === 'ar';
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isAr]);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const loadBootstrapData = useCallback(async () => {
    try {
      const data = await apiRequest('/api/bootstrap');
      if (!data || !data.currentUser || !data.currentRole) {
        clearSessionAuth();
        setIsAuthenticated(false);
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
    } catch (err) {
      console.error('Failed to bootstrap CRM:', err);
      clearSessionAuth();
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadBootstrapData();
    }
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

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const handleSwitchUser = async (userId: string) => {
    try {
      const switched = await apiRequest('/api/auth/switch-account', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: userId }),
      });
      setCurrentApiUser(switched.user.id, switched.token);
      setShowAccountSwitcher(false);
      await loadBootstrapData();
      triggerToast(
        isAr
          ? 'تم تبديل الحساب وتحديث الشاشات حسب صلاحيات الدور الوظيفي'
          : 'Switched user account and applied role permissions'
      );
    } catch (err: any) {
      triggerToast(err.message);
    }
  };

  const handleQuickSyncSheets = useCallback(async () => {
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
  }, [sheetConnections, isAr, triggerToast, loadBootstrapData]);

  // Global 15-Minute Automatic Sync Interval for Google Drive Sheet (CRM1)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      handleQuickSyncSheets();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, handleQuickSyncSheets]);

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  // Permission-filtered Sidebar Navigation Items (Route Guard Contract)
  const navItems = React.useMemo(() => {
    if (!currentRole) return [];
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
        visible: currentRole.permissions?.leads?.read !== 'none',
        badge: leads.filter((l) => l.status === 'New').length,
      },
      {
        id: 'sheetsSync',
        label: t.nav.sheetsSync,
        icon: FileSpreadsheet,
        visible:
          currentRole.id === 'role_admin' ||
          currentRole.permissions?.sheets_sync?.read !== 'none',
      },
      {
        id: 'dealsAndProperties',
        label: t.nav.dealsAndProperties,
        icon: Building2,
        visible:
          currentRole.permissions?.deals?.read !== 'none' ||
          currentRole.permissions?.properties?.read !== 'none',
      },
      {
        id: 'calendar',
        label: t.nav.calendar,
        icon: Calendar,
        visible: currentRole.permissions?.calendar?.read !== 'none',
      },
      {
        id: 'dailyReports',
        label: t.nav.dailyReports,
        icon: BarChart3,
        visible: currentRole.permissions?.reports?.read !== 'none',
      },
      {
        id: 'employees',
        label: t.nav.employees,
        icon: UserCheck,
        visible: currentRole.permissions?.users?.read !== 'none',
      },
      {
        id: 'permissions',
        label: t.nav.permissions,
        icon: ShieldCheck,
        visible: currentRole.id === 'role_admin' || currentRole.id === 'role_supervisor',
      },
    ].filter((item) => item.visible);
  }, [currentRole, t.nav, leads]);

  // Route Guard: Redirect to dashboard if current role loses access to activeTab
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((item) => item.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [navItems, activeTab]);

  if (!isAuthenticated) {
    return (
      <LoginView
        lang={lang}
        onToggleLang={handleToggleLang}
        onLoginSuccess={(u, _r, token) => {
          setCurrentApiUser(u.id, token);
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
            {isAr ? 'جاري تحميل مساحة العمل والصلاحيات...' : 'Loading CRM Workspace...'}
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => loadBootstrapData()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
            >
              {isAr ? 'تحديث الآن' : 'Reload Now'}
            </button>
            <button
              onClick={() => {
                clearSessionAuth();
                setCurrentApiUser('usr_admin');
                setIsAuthenticated(false);
              }}
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
                PropSphere CRM
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
            onClick={() => {
              clearSessionAuth();
              setIsAuthenticated(false);
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-100 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.common.logout}</span>
          </button>
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
              <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {navItems.find((n) => n.id === activeTab)?.label || t.nav.dashboard}
              </span>
              <button
                onClick={() => setActiveTab('leads')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'leads'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>
                  {isAr ? `العملاء (${leads.length})` : `Leads (${leads.length})`}
                </span>
              </button>
            </div>

            {/* Zone 1.5: Global Instant Lead Search Bar */}
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

            {/* Zone 2: Quick Actions & Role Switcher */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 order-2 md:order-3 shrink-0">
              {/* Quick Role/Account Switcher to test RBAC permissions */}
              <div className="relative">
                <button
                  onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                  className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#F4F7FE] hover:bg-blue-50 border border-slate-200 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
                >
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.fullName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                  <span className="max-w-[100px] sm:max-w-[140px] truncate">
                    {currentUser.fullName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showAccountSwitcher && (
                  <div className="absolute end-0 mt-2 w-72 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl p-2 z-50">
                    <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-500">
                      {isAr
                        ? 'تبديل سريع للمستخدم (لمعاينة الصلاحيات):'
                        : 'Switch User (Preview Role Views):'}
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                      {users.map((u) => {
                        const r = roles.find((roleObj) => roleObj.id === u.roleId);
                        const isCurrent = u.id === currentUser.id;
                        return (
                          <button
                            key={u.id}
                            onClick={() => handleSwitchUser(u.id)}
                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-start text-xs transition-colors cursor-pointer ${
                              isCurrent ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50'
                            }`}
                          >
                            <img
                              src={u.avatarUrl}
                              alt={u.fullName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-slate-900 truncate">{u.fullName}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                @{u.username} · {isAr ? r?.nameAr : r?.name}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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

              {/* Quick Logout Button on Header for easy access */}
              <button
                onClick={() => {
                  clearSessionAuth();
                  setIsAuthenticated(false);
                }}
                className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                title={t.common.logout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Horizontal Quick-Navigation Bar (Always visible below header on < lg screens) */}
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

        {/* Active View Container */}
        <main className="flex-1 p-3 sm:p-5 lg:p-7 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              deals={deals}
              events={events}
              sheetConnections={sheetConnections}
              onNavigate={(tab) => setActiveTab(tab)}
              onSelectLead={(lead) => {
                setSelectedLead(lead);
                setActiveTab('leads');
              }}
              onOpenTransferModal={() => {
                setShowTransferModal(true);
                setActiveTab('leads');
              }}
              onQuickSyncSheets={handleQuickSyncSheets}
              isSyncingSheets={isSyncingSheets}
            />
          )}

          {activeTab === 'leads' && (
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
              onToast={triggerToast}
              onQuickSyncSheets={handleQuickSyncSheets}
              isSyncingSheets={isSyncingSheets}
            />
          )}

          {activeTab === 'sheetsSync' && (
            <GoogleSheetsView
              lang={lang}
              currentRole={currentRole}
              users={users}
              projects={projects}
              sheetConnections={sheetConnections}
              syncLogs={syncLogs}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'dealsAndProperties' && (
            <DealsAndPropertiesView
              lang={lang}
              currentUser={currentUser}
              currentRole={currentRole}
              users={users}
              leads={leads}
              properties={properties}
              deals={deals}
              projects={projects}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'calendar' && (
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

          {activeTab === 'dailyReports' && (
            <DailyReportsView lang={lang} leads={leads} deals={deals} />
          )}

          {activeTab === 'employees' && (
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
              onOpenTransferForAgent={() => {
                setShowTransferModal(true);
                setActiveTab('leads');
              }}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionsMatrixView
              lang={lang}
              currentRole={currentRole}
              roles={roles}
              users={users}
              onRefresh={loadBootstrapData}
              onToast={triggerToast}
            />
          )}
        </main>
      </div>

      {/* Notifications Drawer (Matches Reference Image 3 Notifications panel) */}
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
