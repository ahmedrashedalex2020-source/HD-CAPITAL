import React, { useState, useMemo } from 'react';
import {
  Users,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  PhoneCall,
  RefreshCw,
  ArrowLeftRight,
  Building2,
  Banknote,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Filter,
  X,
  AlarmClock,
} from 'lucide-react';
import {
  UserProfile,
  Role,
  Lead,
  Deal,
  CalendarEvent,
  SheetConnection,
  BootstrapCounts,
  normalizeLeadStatus,
} from '../types/crm';
import { Lang, translations } from '../i18n/translations';

interface DashboardViewProps {
  lang: Lang;
  currentUser: UserProfile;
  currentRole: Role;
  users: UserProfile[];
  bootstrapCounts?: BootstrapCounts | null;
  leads?: Lead[];
  deals?: Deal[];
  events?: CalendarEvent[];
  sheetConnections: SheetConnection[];
  onNavigate: (tab: string) => void;
  onSelectLead: (lead: Lead) => void;
  onOpenTransferModal: () => void;
  onQuickSyncSheets: () => void;
  isSyncingSheets: boolean;
}

type FollowUpTileKey =
  | 'fresh'
  | 'without_stage'
  | 'fresh_today'
  | 'no_answer_first'
  | 'following'
  | 'follow_later'
  | 'interested'
  | 'visit'
  | 'visit_declined'
  | 'meeting'
  | 'meeting_declined'
  | 'following_after_meeting';

interface FollowUpTileDefinition {
  key: FollowUpTileKey;
  labelEn: string;
  labelAr: string;
  count: number;
  matches: (lead: Lead) => boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  currentUser,
  currentRole,
  users,
  bootstrapCounts,
  leads = [],
  deals = [],
  events = [],
  sheetConnections,
  onNavigate,
  onSelectLead,
  onOpenTransferModal,
  onQuickSyncSheets,
  isSyncingSheets,
}) => {
  const isAr = lang === 'ar';
  const t = translations[lang];

  const [selectedTileKey, setSelectedTileKey] = useState<FollowUpTileKey | null>(null);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('ALL');
  const [showArabicLabelsOnTiles, setShowArabicLabelsOnTiles] = useState<boolean>(false);

  const canViewTeamUsers =
    currentRole.id === 'role_admin' ||
    currentRole.permissions?.users?.read === 'all' ||
    currentRole.permissions?.users?.read === 'team';

  const canTransfer =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.transfer !== 'none';
  const canSyncSheets =
    currentRole.id === 'role_admin' || currentRole.permissions?.sheets_sync?.import !== 'none';
  const canViewSheets =
    currentRole.id === 'role_admin' ||
    (currentRole.permissions?.sheets_sync?.read !== undefined &&
      currentRole.permissions?.sheets_sync?.read !== 'none');
  const canViewPermissions = currentRole.id === 'role_admin';

  const salesTeam = useMemo(
    () =>
      (users || []).filter(
        (u) =>
          u.roleId === 'role_employee' ||
          u.roleId === 'role_supervisor' ||
          u.roleId === 'role_deputy'
      ),
    [users]
  );

  // Filter leads by selected agent if manager filters by a specific rep
  const scopedLeads = useMemo(() => {
    if (selectedAgentFilter === 'ALL') return leads;
    return leads.filter((l) => l.assignedTo === selectedAgentFilter);
  }, [leads, selectedAgentFilter]);

  const todayDateStr = useMemo(() => new Date().toDateString(), []);

  const isLeadCreatedToday = (lead: Lead): boolean => {
    if (!lead.createdAt) return false;
    const d = new Date(lead.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === todayDateStr;
  };

  const hasVisitKeywords = (lead: Lead): boolean => {
    const noteText = String(lead.notes || '').toLowerCase();
    if (noteText.includes('زيارة') || noteText.includes('زياره') || noteText.includes('visit')) {
      return true;
    }
    return (lead.activities || []).some((a) => {
      const s = String(a.summary || '').toLowerCase();
      return s.includes('زيارة') || s.includes('زياره') || s.includes('visit');
    });
  };

  // The exact 12 Royal-Blue tiles from the attached Follow-Up Board design (4 rows × 3 columns)
  const followUpTiles: FollowUpTileDefinition[] = useMemo(() => {
    const defs: Omit<FollowUpTileDefinition, 'count'>[] = [
      {
        key: 'fresh',
        labelEn: 'Fresh',
        labelAr: 'فريش ليدز',
        matches: (l) => normalizeLeadStatus(l.status) === 'Fresh Lead',
      },
      {
        key: 'without_stage',
        labelEn: 'Without Stage',
        labelAr: 'بدون مرحلة',
        matches: (l) =>
          !l.status ||
          (normalizeLeadStatus(l.status) === 'Fresh Lead' &&
            (!l.activities || l.activities.filter((a) => a.type === 'call').length === 0)),
      },
      {
        key: 'fresh_today',
        labelEn: 'Fresh today',
        labelAr: 'فريش اليوم',
        matches: (l) => isLeadCreatedToday(l),
      },
      {
        key: 'no_answer_first',
        labelEn: 'No answer first call',
        labelAr: 'لم يرد أول مكالمة',
        matches: (l) => normalizeLeadStatus(l.status) === 'No Answer',
      },
      {
        key: 'following',
        labelEn: 'Following',
        labelAr: 'متابعة',
        matches: (l) => normalizeLeadStatus(l.status) === 'Follow Up',
      },
      {
        key: 'follow_later',
        labelEn: 'Follow later',
        labelAr: 'متابعة لاحقاً',
        matches: (l) =>
          Boolean(l.reminderDateTime) ||
          (normalizeLeadStatus(l.status) === 'Follow Up' &&
            Boolean(l.notes || (l.activities && l.activities.length > 0))),
      },
      {
        key: 'interested',
        labelEn: 'intersted',
        labelAr: 'مهتم',
        matches: (l) => normalizeLeadStatus(l.status) === 'Interested',
      },
      {
        key: 'visit',
        labelEn: 'visit',
        labelAr: 'زيارة',
        matches: (l) => normalizeLeadStatus(l.status) === 'Visit',
      },
      {
        key: 'visit_declined',
        labelEn: 'Visit declined',
        labelAr: 'إلغاء زيارة',
        matches: (l) => normalizeLeadStatus(l.status) === 'Not Interested' && hasVisitKeywords(l),
      },
      {
        key: 'meeting',
        labelEn: 'meeting',
        labelAr: 'معاينه',
        matches: (l) => normalizeLeadStatus(l.status) === 'Inspection',
      },
      {
        key: 'meeting_declined',
        labelEn: 'meeting declined',
        labelAr: 'غير مهتم / إلغاء معاينة',
        matches: (l) => normalizeLeadStatus(l.status) === 'Not Interested',
      },
      {
        key: 'following_after_meeting',
        labelEn: 'Following after meeting',
        labelAr: 'متابعة بعد المعاينة (حجز/تعاقد)',
        matches: (l) => ['Contracted', 'Reservation'].includes(normalizeLeadStatus(l.status)),
      },
    ];

    return defs.map((d) => ({
      ...d,
      count: scopedLeads.filter(d.matches).length,
    }));
  }, [scopedLeads, todayDateStr]);

  const totalLeadsCount =
    selectedAgentFilter === 'ALL' && bootstrapCounts
      ? bootstrapCounts.totalLeadsCount
      : scopedLeads.length;

  const activeTileDef = useMemo(
    () => followUpTiles.find((tile) => tile.key === selectedTileKey) || null,
    [followUpTiles, selectedTileKey]
  );

  const displayedLeads = useMemo(() => {
    if (!activeTileDef) return scopedLeads;
    return scopedLeads.filter(activeTileDef.matches);
  }, [scopedLeads, activeTileDef]);

  const totalPipelineValue = bootstrapCounts?.dealsSummary
    ? bootstrapCounts.dealsSummary.totalPipelineValue
    : deals.reduce((sum, d) => sum + (Number(d.dealValue) || 0), 0);
  const wonDealsValue = bootstrapCounts?.dealsSummary
    ? bootstrapCounts.dealsSummary.wonDealsValue
    : deals
        .filter((d) => d.stage === 'Closed Won')
        .reduce((sum, d) => sum + (Number(d.dealValue) || 0), 0);

  const rawUpcomingEvents =
    bootstrapCounts?.eventsSummary?.upcomingEvents ||
    (bootstrapCounts?.eventsSummary as any)?.nearestEvents;
  const upcomingEvents = Array.isArray(rawUpcomingEvents)
    ? rawUpcomingEvents.slice(0, 4)
    : (events || []).filter((e) => !e.completed).slice(0, 4);

  const recentActivities = Array.isArray(bootstrapCounts?.recentActivities)
    ? bootstrapCounts.recentActivities.slice(0, 6)
    : (leads || [])
        .flatMap((l) =>
          (l.activities || []).map((a) => ({
            ...a,
            leadName: l.fullName,
            projectInterest: l.projectInterest,
            leadObj: l,
          }))
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6);

  const formatEgp = (val: number) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M EGP`;
    }
    return `${val.toLocaleString()} EGP`;
  };

  // Top 5 Icon Navigation Actions matching the attached screenshot
  const topQuickIcons = [
    {
      id: 'properties',
      icon: Building2,
      labelAr: 'المشروعات والوحدات',
      labelEn: 'Projects & Units',
      isActive: false,
      onClick: () => onNavigate('properties'),
    },
    {
      id: 'deals',
      icon: Banknote,
      labelAr: 'الصفقات والمبيعات',
      labelEn: 'Deals & Sales',
      isActive: false,
      onClick: () => onNavigate('deals'),
    },
    {
      id: 'calendar',
      icon: Calendar,
      labelAr: 'المتابعات والمعاينات',
      labelEn: 'Calendar & Visits',
      isActive: false,
      onClick: () => onNavigate('calendar'),
    },
    {
      id: 'followup_board',
      icon: ClipboardCheck,
      labelAr: 'لوحة المتابعة',
      labelEn: 'Follow-up Board',
      isActive: selectedTileKey !== 'following_after_meeting',
      onClick: () => setSelectedTileKey(null),
    },
    {
      id: 'completed',
      icon: CheckCircle2,
      labelAr: 'التعاقدات المكتملة',
      labelEn: 'Completed & Won',
      isActive: selectedTileKey === 'following_after_meeting',
      onClick: () =>
        setSelectedTileKey((prev) =>
          prev === 'following_after_meeting' ? null : 'following_after_meeting'
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* MAIN FOLLOW-UP BOARD SECTION (Exact Visual Match to Attached Screenshot) */}
      <section className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 lg:p-8 shadow-xs max-w-4xl mx-auto">
        {/* 1. Top 5 Rounded-Square Light-Slate Action Icons (Exact Match to Screenshot Top Row) */}
        <div className="grid grid-cols-5 gap-2.5 sm:gap-4" dir="ltr">
          {topQuickIcons.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                title={isAr ? item.labelAr : item.labelEn}
                className={`group h-14 sm:h-[68px] rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                  item.isActive
                    ? 'bg-[#E8ECF4] border-[#3B5BDB]/40 shadow-xs ring-2 ring-[#3B5BDB]/20'
                    : 'bg-[#EEF1F6] hover:bg-[#E2E7F0] border-transparent'
                }`}
              >
                <IconComponent
                  className="w-6 h-6 sm:w-7 sm:h-7 text-[#2B303A] group-hover:scale-105 transition-transform"
                  strokeWidth={2}
                />
              </button>
            );
          })}
        </div>

        {/* 2. Toolbar & Right-Aligned "Total: <count>" Counter Line */}
        <div
          className="mt-5 mb-4 flex flex-wrap items-center justify-between gap-3 pt-1"
          dir="ltr"
        >
          {/* Left side controls: Quick Filters & Sync */}
          <div className="flex flex-wrap items-center gap-2">
            {canViewTeamUsers && (
              <div className="inline-flex items-center gap-1.5 bg-[#F4F7FE] border border-slate-200 rounded-xl px-2.5 py-1.5">
                <Filter className="w-3.5 h-3.5 text-[#3B5BDB]" />
                <select
                  value={selectedAgentFilter}
                  onChange={(e) => setSelectedAgentFilter(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  dir={isAr ? 'rtl' : 'ltr'}
                >
                  <option value="ALL">
                    {isAr ? 'كل مسؤولي المبيعات' : 'All Sales Agents'}
                  </option>
                  {salesTeam.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowArabicLabelsOnTiles((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F4F7FE] hover:bg-slate-200/70 border border-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              {showArabicLabelsOnTiles ? 'English Labels' : 'مسميات عربي / EN'}
            </button>

            {canSyncSheets && (
              <button
                type="button"
                onClick={onQuickSyncSheets}
                disabled={isSyncingSheets}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'مزامنة الشيت' : 'Sync'}</span>
              </button>
            )}

            {canTransfer && (
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#3B5BDB]" />
                <span>{isAr ? 'تحويل عملاء' : 'Transfer'}</span>
              </button>
            )}
          </div>

          {/* Right side: Exact "Total: <count>" Display from Screenshot */}
          <div className="text-right ms-auto">
            <span className="text-base sm:text-xl font-medium text-[#687076] font-mono-tabular tracking-tight">
              Total: {totalLeadsCount}
            </span>
          </div>
        </div>

        {/* 3. The 3×4 Royal-Blue Follow-Up Stage Grid (Exact Match to Screenshot) */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4" dir="ltr">
          {followUpTiles.map((tile) => {
            const isSelected = selectedTileKey === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() =>
                  setSelectedTileKey((prev) => (prev === tile.key ? null : tile.key))
                }
                className={`group relative rounded-[18px] min-h-[116px] sm:min-h-[138px] p-3 sm:p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[#2843B5] ring-4 ring-amber-400 shadow-lg scale-[1.01]'
                    : 'bg-[#3B5BDB] hover:bg-[#3250C7] active:scale-[0.99] shadow-sm'
                }`}
              >
                {/* Top Bold Count (Tabular Numerals) */}
                <span className="text-2xl sm:text-[32px] font-bold text-white font-mono-tabular leading-none tracking-tight mb-2.5">
                  {tile.count}
                </span>

                {/* Stage / Bucket Label matching Screenshot */}
                <span className="text-xs sm:text-[17px] font-medium text-white leading-snug break-words max-w-full">
                  {showArabicLabelsOnTiles ? tile.labelAr : tile.labelEn}
                </span>

                {/* Optional bilingual subtitle when toggled or hovered */}
                <span
                  className={`text-[10px] sm:text-xs text-blue-100/80 font-medium mt-1 transition-opacity ${
                    showArabicLabelsOnTiles
                      ? 'opacity-90'
                      : 'opacity-80 group-hover:opacity-100'
                  }`}
                  dir="rtl"
                >
                  {showArabicLabelsOnTiles ? tile.labelEn : tile.labelAr}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Quick Action Bar under the 3x4 Grid */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{currentUser.fullName}</span>
            <span>·</span>
            <span className="text-slate-500">
              {isAr ? currentRole.nameAr : currentRole.name}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedTileKey && (
              <button
                type="button"
                onClick={() => setSelectedTileKey(null)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? `إلغاء فلتر (${activeTileDef?.labelAr})`
                    : `Clear Filter (${activeTileDef?.labelEn})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('leads')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3B5BDB] hover:bg-[#3250C7] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? `فتح قائمة العملاء الكاملة (${totalLeadsCount})`
                  : `Open All Clients (${totalLeadsCount})`}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. Interactive Filtered Leads Drawer / Section (Updates Live when Clicking Any Blue Tile) */}
      {(selectedTileKey !== null || displayedLeads.length > 0) && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3B5BDB]" />
                <span>
                  {activeTileDef
                    ? isAr
                      ? `عملاء مرحلة: ${activeTileDef.labelAr} (${activeTileDef.labelEn}) — ${displayedLeads.length} عميل`
                      : `Clients in "${activeTileDef.labelEn}" (${displayedLeads.length})`
                    : isAr
                    ? `قائمة العملاء الجاهزة للمتابعة الفورية (${displayedLeads.length} عميل)`
                    : `Active Leads Ready for Follow-Up (${displayedLeads.length})`}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'اضغط على أي مربع أزرق في لوحة المتابعة أعلاه لفلترة العملاء فوراً، أو اضغط على العميل لفتح ملفه الكامل'
                  : 'Click any blue tile on the follow-up board above to filter clients, or click a client card to open their profile'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTileDef && (
                <button
                  type="button"
                  onClick={() => setSelectedTileKey(null)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عرض الكل' : 'Show All'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('leads')}
                className="px-4 py-2 rounded-xl bg-[#3B5BDB] hover:bg-[#3250C7] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>
                  {isAr
                    ? `إدارة كل العملاء (${scopedLeads.length})`
                    : `Manage All Leads (${scopedLeads.length})`}
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {displayedLeads.length === 0 ? (
            <div className="py-10 text-center bg-[#F8FAFC] rounded-2xl border border-dashed border-slate-200">
              <div className="text-sm font-bold text-slate-700">
                {isAr
                  ? 'لا يوجد عملاء في هذا التصنيف حالياً'
                  : 'No clients match this follow-up stage right now'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'اختر مربعاً آخر من لوحة المتابعة الزرقاء أعلاه لعرض العملاء'
                  : 'Select another tile from the blue follow-up board above'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {displayedLeads.slice(0, selectedTileKey ? 18 : 6).map((lead) => {
                const cleanDigits = String(lead.phone || '').replace(/[^0-9]/g, '');
                const waPhone = cleanDigits.startsWith('0')
                  ? `20${cleanDigits.slice(1)}`
                  : cleanDigits;
                const normalizedSt = normalizeLeadStatus(lead.status);
                return (
                  <div
                    key={lead.id}
                    onClick={() => onSelectLead(lead)}
                    className="p-3.5 rounded-xl bg-[#F8FAFC] hover:bg-blue-50/40 border border-slate-200/80 hover:border-[#3B5BDB] transition-all flex flex-col justify-between gap-3 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {lead.fullName}
                          </div>
                          <div
                            className="text-xs font-mono-tabular text-[#3B5BDB] font-semibold mt-0.5"
                            dir="ltr"
                          >
                            {lead.phone}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold shrink-0">
                          {t.status[normalizedSt]}
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-600 font-medium truncate">
                        {lead.projectInterest}{' '}
                        {lead.propertyType ? `· ${lead.propertyType}` : ''}
                      </div>

                      {lead.reminderDateTime && (
                        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold font-mono-tabular">
                          <AlarmClock className="w-3 h-3 text-amber-600" />
                          <span>
                            {new Date(lead.reminderDateTime).toLocaleString(
                              isAr ? 'ar-EG' : 'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )}
                          </span>
                        </div>
                      )}

                      {Array.isArray(lead.formResponses) && lead.formResponses.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/70 flex flex-wrap gap-1.5">
                          {lead.formResponses.slice(0, 2).map((qa, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-700 truncate max-w-full"
                            >
                              <span className="text-slate-400">{qa.question}: </span>
                              <strong className="text-slate-900">{qa.answer}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2.5 py-1 rounded-lg bg-[#3B5BDB] hover:bg-[#3250C7] text-white text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <PhoneCall className="w-3 h-3" />
                          <span>{isAr ? 'اتصال' : 'Call'}</span>
                        </a>
                        <a
                          href={`https://wa.me/${waPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                        </a>
                      </div>
                      <span className="text-[11px] font-bold text-[#3B5BDB] hover:underline">
                        {isAr ? 'فتح ملف العميل ←' : 'Open Client →'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 5. Three-Column Workspace Grid (Team Routing, Nearest Visits, Live Activity Stream) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Sales Team Workload (Admins/Supervisors) OR Personal Summary */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          {canViewTeamUsers ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr ? 'فريق المبيعات وتوزيع الليدز' : 'Sales Team & Lead Routing'}
                </h3>
                <button
                  onClick={() => onNavigate('employees')}
                  className="text-xs font-semibold text-[#3B5BDB] hover:underline cursor-pointer"
                >
                  {isAr ? 'إدارة الفريق' : 'Manage'}
                </button>
              </div>

              <div className="space-y-3">
                {salesTeam.slice(0, 4).map((member) => {
                  const memberLeadsCount =
                    bootstrapCounts?.agentLeadCounts?.[member.id]?.total ??
                    leads.filter((l) => l.assignedTo === member.id).length;
                  const isFilteredMember = selectedAgentFilter === member.id;
                  return (
                    <div
                      key={member.id}
                      onClick={() =>
                        setSelectedAgentFilter((prev) =>
                          prev === member.id ? 'ALL' : member.id
                        )
                      }
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        isFilteredMember
                          ? 'bg-blue-50/70 border-[#3B5BDB]'
                          : 'bg-[#F8FAFC] hover:bg-slate-100/80 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={member.avatarUrl}
                          alt={member.fullName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {member.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {(member.assignedProjects || []).slice(0, 2).join(' · ')}
                          </div>
                        </div>
                      </div>
                      <div className="text-end shrink-0 ms-2">
                        <div className="text-xs font-bold text-[#3B5BDB] font-mono-tabular">
                          {memberLeadsCount} {isAr ? 'ليد' : 'leads'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {member.isActiveForRouting
                            ? isAr
                              ? 'يستقبل تلقائياً'
                              : 'Auto-Receive ON'
                            : isAr
                            ? 'موقوف مؤقتاً'
                            : 'Paused'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr ? 'مشاريعي العقارية وحالة حسابي' : 'My Assigned Projects & Status'}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold">
                  @{currentUser.username}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {isAr ? 'العملاء المعينون لي:' : 'My Assigned Leads:'}
                  </span>
                  <span className="font-mono-tabular font-bold text-[#3B5BDB]">
                    {totalLeadsCount} {isAr ? 'عميل' : 'leads'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {isAr ? 'حجم الصفقات النشطة:' : 'Active Pipeline:'}
                  </span>
                  <span className="font-mono-tabular font-bold text-emerald-600">
                    {formatEgp(totalPipelineValue)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200/70">
                  <div className="text-[11px] text-slate-500 mb-2">
                    {isAr ? 'المشاريع المسندة لي:' : 'My Assigned Projects:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(currentUser.assignedProjects || []).map((proj) => (
                      <span
                        key={proj}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700"
                      >
                        {proj}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => onNavigate('dailyReports')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#3B5BDB] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>
              {canViewTeamUsers
                ? isAr
                  ? 'فتح التقرير التحليلي اليومي للسيلز'
                  : 'View Daily Sales Performance Report'
                : isAr
                ? 'فتح تقرير أدائي اليومي'
                : 'View My Daily Performance Report'}
            </span>
          </button>
        </div>

        {/* Column 2: Nearest Events & Site Visits */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {isAr
                  ? 'أقرب المعاينات والمواعيد (Nearest Events)'
                  : 'Nearest Site Visits & Events'}
              </h3>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs font-semibold text-[#3B5BDB] hover:underline cursor-pointer"
              >
                {isAr ? 'التقويم' : 'Calendar'}
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {isAr
                  ? 'لا توجد مواعيد معاينات مجدولة حالياً'
                  : 'No upcoming site visits scheduled'}
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {evt.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        <span>{evt.category}</span>
                        {evt.projectName && (
                          <>
                            <span className="mx-1">·</span>
                            <span>{evt.projectName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-end shrink-0 font-mono-tabular">
                      <div className="text-xs font-semibold text-[#3B5BDB]">{evt.time}</div>
                      <div className="text-[10px] text-slate-400">{evt.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('calendar')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#3B5BDB]" />
            <span>{isAr ? 'جدولة معاينة عقارية جديدة' : 'Schedule New Site Visit'}</span>
          </button>
        </div>

        {/* Column 3: Recent Lead Activity Stream & Sheet Status */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'سجل النشاط والمتابعات الفوري' : 'Live Lead Activity Stream'}
              </h3>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-3">
              {recentActivities.slice(0, 4).map((act: any) => (
                <div
                  key={act.id}
                  onClick={() => {
                    if (act.leadObj) {
                      onSelectLead(act.leadObj);
                    } else {
                      onNavigate('leads');
                    }
                  }}
                  className="p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 truncate">{act.leadName}</span>
                    <span className="text-[10px] text-slate-400 font-mono-tabular shrink-0">
                      {new Date(act.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{act.summary}</p>
                  <div className="text-[10px] text-slate-400 mt-1">
                    <span>{act.userName}</span>
                    <span className="mx-1">·</span>
                    <span>{act.projectInterest}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canViewSheets ? (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium flex items-center gap-1.5 truncate">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  {sheetConnections[0]?.name || 'Google Drive · CRM1'}
                </span>
              </span>
              <span className="font-mono-tabular font-bold text-emerald-700 shrink-0">
                {formatEgp(wonDealsValue)}
              </span>
            </div>
          ) : (
            <div
              className={`mt-4 pt-3 border-t border-slate-100 grid ${
                canViewPermissions ? 'grid-cols-4' : 'grid-cols-3'
              } gap-2`}
            >
              <button
                onClick={() => onNavigate('leads')}
                className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5 text-[#3B5BDB]" />
                <span>{isAr ? 'العملاء' : 'Clients'}</span>
              </button>
              <button
                onClick={() => onNavigate('properties')}
                className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isAr ? 'الوحدات' : 'Units'}</span>
              </button>
              <button
                onClick={() => onNavigate('deals')}
                className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isAr ? 'الصفقات' : 'Deals'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
