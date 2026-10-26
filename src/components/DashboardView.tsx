import React from 'react';
import {
  Users,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  PhoneCall,
  RefreshCw,
  ArrowLeftRight,
  Building,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import {
  UserProfile,
  Role,
  Lead,
  Deal,
  CalendarEvent,
  SheetConnection,
  BootstrapCounts,
} from '../types/crm';
import { Lang } from '../i18n/translations';

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

  // Calculate live metrics from lightweight bootstrapCounts (with fallback to arrays)
  const statusCounts = bootstrapCounts?.statusCounts || {};
  const totalLeads = bootstrapCounts ? bootstrapCounts.totalLeadsCount : leads.length;
  const newLeadsCount = bootstrapCounts
    ? statusCounts.New || 0
    : leads.filter((l) => l.status === 'New').length;
  const contactedCount = bootstrapCounts
    ? statusCounts.Contacted || 0
    : leads.filter((l) => l.status === 'Contacted').length;
  const qualifiedCount = bootstrapCounts
    ? (statusCounts.Qualified || 0) +
      (statusCounts['Site Visit Scheduled'] || 0) +
      (statusCounts.Negotiation || 0)
    : leads.filter((l) =>
        ['Qualified', 'Site Visit Scheduled', 'Negotiation'].includes(l.status)
      ).length;
  const wonCount = bootstrapCounts
    ? statusCounts.Won || 0
    : leads.filter((l) => l.status === 'Won').length;
  const conversionRate =
    totalLeads > 0 ? Math.round(((qualifiedCount + wonCount) / totalLeads) * 100) : 0;

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

  // Recent activities across visible leads
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

  const salesTeam = (users || []).filter(
    (u) =>
      u.roleId === 'role_employee' ||
      u.roleId === 'role_supervisor' ||
      u.roleId === 'role_deputy'
  );

  const canTransfer =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.transfer !== 'none';
  const canSyncSheets =
    currentRole.id === 'role_admin' || currentRole.permissions?.sheets_sync?.import !== 'none';

  const formatEgp = (val: number) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M EGP`;
    }
    return `${val.toLocaleString()} EGP`;
  };

  return (
    <div className="space-y-6">
      {/* 1. User Profile & Key Metrics Header Card (Directly inspired by Reference Image 1) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 p-0.5"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{currentUser.fullName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr ? currentUser.jobTitleAr : currentUser.jobTitle}
              <span className="mx-1.5">·</span>
              <span>{ isAr ? currentRole.nameAr : currentRole.name }</span>
              <span className="mx-1.5">·</span>
              <span>{currentUser.location}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canSyncSheets && (
                <button
                  onClick={onQuickSyncSheets}
                  disabled={isSyncingSheets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingSheets
                      ? isAr
                        ? 'جاري استيراد وتوزيع الليدز...'
                        : 'Syncing & Routing...'
                      : isAr
                      ? 'استيراد ليدز Google Sheets الآن'
                      : 'Sync Google Sheets Leads'}
                  </span>
                </button>
              )}
              {canTransfer && (
                <button
                  onClick={onOpenTransferModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                  <span>{isAr ? 'نقل الليدز بين السيلز' : 'Transfer Leads'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4 Clean Unboxed Tabular Metrics (Matches 7789 / 25% / 476 / All Control in Image 1) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div className="text-center lg:text-start">
            <div className="text-2xl font-bold text-slate-900 font-mono-tabular">
              {totalLeads}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'إجمالي الليدز المتاحة' : 'Total Leads'}
            </div>
          </div>
          <div className="text-center lg:text-start">
            <div className="text-2xl font-bold text-blue-600 font-mono-tabular">
              {conversionRate}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'معدل التأهيل والتحويل' : 'Qualification Rate'}
            </div>
          </div>
          <div className="text-center lg:text-start">
            <div className="text-2xl font-bold text-slate-900 font-mono-tabular">
              {upcomingEvents.length}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'معاينات ومهام قادمة' : 'Upcoming Visits'}
            </div>
          </div>
          <div className="text-center lg:text-start">
            <div className="text-lg font-bold text-emerald-600 font-mono-tabular">
              {formatEgp(totalPipelineValue)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'حجم الصفقات النشطة' : 'Active Pipeline'}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Two-Column Pipeline & Sales Velocity Row (Matches Guars Pipeline & Sales cards in Image 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Deals & Leads Pipeline Card */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isAr ? 'مراحل خط المبيعات والليدز (Leads Pipeline)' : 'Real Estate Leads Pipeline'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'توزيع العملاء الحاليين عبر مراحل البيع والمعاينات الميدانية'
                  : 'Distribution of active leads across real estate sales stages'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('leads')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{isAr ? 'عرض كل الليدز' : 'View All Leads'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">
                  {isAr ? 'ليدز جديدة (New Leads)' : 'New Inbound Leads'}
                </span>
                <span className="font-mono-tabular font-semibold text-blue-600">
                  {newLeadsCount} ({totalLeads ? Math.round((newLeadsCount / totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${totalLeads && newLeadsCount ? Math.round((newLeadsCount / totalLeads) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">
                  {isAr ? 'تم التواصل (Contacted)' : 'Contacted'}
                </span>
                <span className="font-mono-tabular font-semibold text-amber-600">
                  {contactedCount} ({totalLeads ? Math.round((contactedCount / totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${totalLeads && contactedCount ? Math.round((contactedCount / totalLeads) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">
                  {isAr ? 'مؤهل / معاينة مجدولة (Qualified & Visits)' : 'Qualified & Site Visits'}
                </span>
                <span className="font-mono-tabular font-semibold text-indigo-600">
                  {qualifiedCount} ({totalLeads ? Math.round((qualifiedCount / totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full"
                  style={{ width: `${totalLeads && qualifiedCount ? Math.round((qualifiedCount / totalLeads) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">
                  {isAr ? 'تعاقد ناجح (Closed Won)' : 'Closed Won Deals'}
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-600">
                  {wonCount} ({totalLeads ? Math.round((wonCount / totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${totalLeads && wonCount ? Math.round((wonCount / totalLeads) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              <span>{isAr ? 'مصدر الليدز الأساسي:' : 'Primary Lead Source:'}</span>{' '}
              <span className="font-semibold text-slate-800">Google Drive · شيت CRM1 فقط</span>
            </div>
            <div>
              <span>{isAr ? 'آلية التوزيع التلقائي:' : 'Auto-Routing Engine:'}</span>{' '}
              <span className="font-semibold text-blue-600">
                {isAr ? 'كل 15 دقيقة تلقائياً بدون تكرار' : 'Every 15 mins · Deduplicated'}
              </span>
            </div>
          </div>
        </div>

        {/* Sales Volume & Google Sheets Connection Status Card */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">
                {isAr ? 'ملخص المبيعات ومزامنة الشيت' : 'Sales Volume & Sheet Sync'}
              </h2>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                <div className="text-xs text-slate-500">
                  {isAr ? 'المبيعات المحققة (Won)' : 'Closed Won Revenue'}
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono-tabular mt-1">
                  {formatEgp(wonDealsValue)}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                <div className="text-xs text-slate-500">
                  {isAr ? 'شيتات جوجل المربوطة' : 'Connected Google Sheets'}
                </div>
                <div className="text-lg font-bold text-blue-600 font-mono-tabular mt-1">
                  {sheetConnections.length} {isAr ? 'شيت نشط' : 'Active'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="truncate max-w-[220px]">
                  {sheetConnections[0]?.name || 'Meta Lead Ads Sheet'}
                </span>
              </span>
              <button
                onClick={() => onNavigate('sheetsSync')}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                {isAr ? 'إعدادات الربط' : 'Configure'}
              </button>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full w-4/5" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
              <span>
                {isAr ? 'إجمالي المستورد:' : 'Total Imported:'}{' '}
                <strong className="text-slate-700 font-mono-tabular">
                  {sheetConnections[0]?.totalImportedCount || totalLeads}
                </strong>
              </span>
              <span>
                {isAr ? 'التوزيع التلقائي مفعل' : 'Auto-Distribution Active'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Three-Column Workspace Grid (Matches Image 1 Bottom Cards & Image 3 Workload / Nearest Events / Activity Stream) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Sales Team Workload & Routing Status */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'فريق المبيعات وتوزيع الليدز' : 'Sales Team & Lead Routing'}
              </h3>
              <button
                onClick={() => onNavigate('employees')}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {isAr ? 'إدارة الفريق' : 'Manage'}
              </button>
            </div>

            <div className="space-y-3">
              {salesTeam.slice(0, 4).map((member) => {
                const memberLeadsCount =
                  bootstrapCounts?.agentLeadCounts?.[member.id]?.total ??
                  leads.filter((l) => l.assignedTo === member.id).length;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-100"
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
                      <div className="text-xs font-bold text-blue-600 font-mono-tabular">
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

          <button
            onClick={() => onNavigate('dailyReports')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {isAr ? 'فتح التقرير التحليلي اليومي للسيلز' : 'View Daily Sales Performance Report'}
            </span>
          </button>
        </div>

        {/* Column 2: Nearest Events & Site Visits (Matches Reference Image 3 Nearest Events) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'أقرب المعاينات والمواعيد (Nearest Events)' : 'Nearest Site Visits & Events'}
              </h3>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {isAr ? 'التقويم' : 'Calendar'}
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {isAr ? 'لا توجد مواعيد معاينات مجدولة حالياً' : 'No upcoming site visits scheduled'}
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
                      <div className="text-xs font-semibold text-blue-600">{evt.time}</div>
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
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'جدولة معاينة عقارية جديدة' : 'Schedule New Site Visit'}</span>
          </button>
        </div>

        {/* Column 3: Recent Lead Activity Stream (Matches Activity Stream in Image 3) */}
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

          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
            <button
              onClick={() => onNavigate('leads')}
              className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'الليدز' : 'Leads'}</span>
            </button>
            <button
              onClick={() => onNavigate('dealsAndProperties')}
              className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <Building className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAr ? 'العقارات' : 'Units'}</span>
            </button>
            <button
              onClick={() => onNavigate('permissions')}
              className="py-2 px-2 rounded-lg bg-[#F8FAFC] hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'الصلاحيات' : 'RBAC'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
