import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { DailyAgentStat, Lead, Deal, UserProfile, Role } from '../types/crm';
import { Lang } from '../i18n/translations';
import { swrFetch } from '../services/api';

interface DailyReportsViewProps {
  lang: Lang;
  currentUser?: UserProfile;
  currentRole?: Role;
  leads?: Lead[];
  deals?: Deal[];
}

export const DailyReportsView: React.FC<DailyReportsViewProps> = ({
  lang,
  currentUser,
  currentRole,
  leads = [],
  deals = [],
}) => {
  const isAr = lang === 'ar';
  const isOwnReportOnly =
    currentRole?.id !== 'role_admin' && currentRole?.permissions?.reports?.read === 'own';
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [stats, setStats] = useState<DailyAgentStat[]>([]);
  const [serverProjectBreakdown, setServerProjectBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchReport = async (dateStr: string) => {
    setLoading(true);
    try {
      const path = `/api/reports/daily?date=${encodeURIComponent(dateStr)}`;
      const res = await swrFetch(path, {
        onCached: (cached) => {
          if (cached?.agentStats) setStats(cached.agentStats);
          if (cached?.projectBreakdown) setServerProjectBreakdown(cached.projectBreakdown);
          setLoading(false);
        },
      });
      if (res.agentStats) {
        setStats(res.agentStats);
      }
      if (res.projectBreakdown) {
        setServerProjectBreakdown(res.projectBreakdown);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate);
  }, [selectedDate, leads.length, deals.length]);

  const visibleStats = isOwnReportOnly && currentUser
    ? stats.filter((s) => s.userId === currentUser.id)
    : stats;

  const totalAssigned = visibleStats.reduce((s, a) => s + a.totalAssignedLeads, 0);
  const totalContactedToday = visibleStats.reduce((s, a) => s + a.contactedToday, 0);
  const totalCallsToday = visibleStats.reduce((s, a) => s + a.callsToday + a.whatsappToday, 0);
  const totalVisitsToday = visibleStats.reduce((s, a) => s + a.visitsScheduledToday, 0);
  const totalWonRevenue = visibleStats.reduce((s, a) => s + a.wonRevenue, 0);

  // Project interest distribution across leads
  const projectBreakdown =
    Object.keys(serverProjectBreakdown).length > 0
      ? serverProjectBreakdown
      : leads.reduce<Record<string, number>>((acc, l) => {
          acc[l.projectInterest] = (acc[l.projectInterest] || 0) + 1;
          return acc;
        }, {});

  const handleExportReportCsv = () => {
    const headers = [
      'Sales Representative',
      'Total Assigned Leads',
      'Leads Assigned Today',
      'Contacted Today',
      'Calls Logged Today',
      'WhatsApp Follow-ups',
      'Site Visits Scheduled',
      'Qualified Leads',
      'Closed Won Deals',
      'Closed Revenue (EGP)',
      'Conversion Rate (%)',
      'Avg Response Time (Min)',
    ];
    const rows = visibleStats.map((st) => [
      `"${st.fullName}"`,
      st.totalAssignedLeads,
      st.leadsAssignedToday,
      st.contactedToday,
      st.callsToday,
      st.whatsappToday,
      st.visitsScheduledToday,
      st.qualifiedCount,
      st.wonDealsCount,
      st.wonRevenue,
      `${st.conversionRate}%`,
      st.avgResponseMinutes,
    ]);
    const csv =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_sales_report_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>
              {isOwnReportOnly
                ? isAr
                  ? 'تقريري اليومي الشخصي للمكالمات والمتابعات'
                  : 'My Personal Daily Call & Follow-up Report'
                : isAr
                ? 'التقارير التحليلية اليومية لأداء فريق المبيعات'
                : 'Daily Analytical Sales Team Performance Reports'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {isOwnReportOnly
              ? isAr
                ? 'متابعة أدائي الشخصي، المكالمات المسجلة، والعملاء المعينين لي'
                : 'My Personal Daily KPIs, Logged Calls & Assigned Leads'
              : isAr
              ? 'مراقبة أداء الموظفين، المكالمات اليومية، ومعدلات إغلاق الصفقات'
              : 'Sales Team Daily KPIs, Call Activity & Conversion Analytics'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-blue-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-mono-tabular font-semibold text-slate-800 focus:outline-none"
            />
          </div>

          <button
            onClick={() => fetchReport(selectedDate)}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportReportCsv}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'تصدير التقرير اليومي CSV' : 'Export Daily Report CSV'}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">
            {isAr ? 'إجمالي الليدز الموزعة على الفريق' : 'Total Distributed Leads'}
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-tabular mt-1.5">
            {totalAssigned}
          </div>
          <div className="text-[11px] text-blue-600 mt-1">
            {isAr
              ? `تم التواصل اليوم مع ${totalContactedToday} عميل`
              : `${totalContactedToday} leads contacted today`}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">
            {isAr ? 'المكالمات والمتابعات اليومية' : 'Calls & WhatsApp Logged Today'}
          </div>
          <div className="text-2xl font-bold text-blue-600 font-mono-tabular mt-1.5">
            {totalCallsToday}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <PhoneCall className="w-3 h-3 text-emerald-600" />
            <span>{isAr ? 'متابعات موثقة في سجل الليدز' : 'Verified CRM activity logs'}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">
            {isAr ? 'المعاينات العقارية المجدولة' : 'Site Visits Scheduled'}
          </div>
          <div className="text-2xl font-bold text-indigo-600 font-mono-tabular mt-1.5">
            {totalVisitsToday}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {isAr ? 'زيارات ميدانية للمشاريع' : 'Active project site visits'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">
            {isAr ? 'إجمالي مبيعات التعاقدات (Won)' : 'Closed Won Sales Volume'}
          </div>
          <div className="text-2xl font-bold text-emerald-600 font-mono-tabular mt-1.5">
            {(totalWonRevenue / 1000000).toFixed(1)}M EGP
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>{isAr ? 'عقود مبيعات مؤكدة' : 'Confirmed property contracts'}</span>
          </div>
        </div>
      </div>

      {/* Detailed Per-Salesperson Daily Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAr
                ? 'جدول تقييم أداء مناديب المبيعات اليومي'
                : 'Sales Representatives Daily Performance Matrix'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? 'تحليل دقيق لعدد الليدز المستلمة، سرعة الاستجابة، المكالمات، المعاينات، ونسبة التحويل لكل موظف'
                : 'Granular breakdown of assigned leads, response time, calls, site visits, and conversion rate per agent'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500 font-semibold">
                <th className="py-3.5 px-4 text-start">{isAr ? 'مسؤول المبيعات' : 'Sales Representative'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'إجمالي الليدز' : 'Total Leads'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'مستلم اليوم' : 'Assigned Today'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'تواصل اليوم' : 'Contacted Today'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'مكالمات / واتساب' : 'Calls / WA'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'معاينات' : 'Site Visits'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'متوسط سرعة الرد' : 'Avg Response'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'صفقات ناجحة' : 'Deals Won'}</th>
                <th className="py-3.5 px-4 text-end">{isAr ? 'معدل التحويل' : 'Conversion Rate'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStats.map((row) => (
                <tr key={row.userId} className="hover:bg-blue-50/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={row.avatarUrl}
                        alt={row.fullName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{row.fullName}</div>
                        <div className="text-[11px] text-slate-500">
                          {isAr ? row.jobTitleAr : row.jobTitle}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-slate-900">
                    {row.totalAssignedLeads}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular text-blue-600 font-semibold">
                    +{row.leadsAssignedToday}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular font-semibold text-slate-800">
                    {row.contactedToday}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular text-slate-700">
                    {row.callsToday} / {row.whatsappToday}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular font-semibold text-indigo-600">
                    {row.visitsScheduledToday}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      {row.avgResponseMinutes} {isAr ? 'دقيقة' : 'min'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-emerald-600">
                    {row.wonDealsCount} ({(row.wonRevenue / 1000000).toFixed(1)}M)
                  </td>
                  <td className="py-3.5 px-4 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${Math.max(10, row.conversionRate)}%` }}
                        />
                      </div>
                      <span className="font-mono-tabular font-bold text-slate-900 w-9 text-end">
                        {row.conversionRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real Estate Projects Demand Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">
          {isAr
            ? 'تحليل الطلب حسب المشروع العقاري (من ليدز Google Sheets)'
            : 'Lead Demand by Real Estate Project'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(projectBreakdown).map(([project, count]) => {
            const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
            return (
              <div
                key={project}
                className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{project}</span>
                  <span className="font-mono-tabular font-semibold text-blue-600">
                    {count} {isAr ? 'ليد' : 'leads'} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
