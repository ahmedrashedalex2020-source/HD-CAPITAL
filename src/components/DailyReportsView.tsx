import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Calendar,
  Download,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  Clock,
  RefreshCw,
  Award,
  Flame,
  Zap,
  Target,
  Users,
  ChevronRight,
  Info,
  ArrowUpRight,
  ShieldAlert,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { DailyAgentStat, WeeklyLeagueAgentStat, Lead, Deal, UserProfile, Role } from '../types/crm';
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

  const [activeTab, setActiveTab] = useState<'league' | 'daily'>('league');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState<DailyAgentStat[]>([]);
  const [weeklyLeague, setWeeklyLeague] = useState<WeeklyLeagueAgentStat[]>([]);
  const [weekRange, setWeekRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const [loading, setLoading] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const fetchReport = async (dateStr: string) => {
    setLoading(true);
    try {
      const path = `/api/reports/daily?date=${encodeURIComponent(dateStr)}`;
      const res = await swrFetch(path, {
        onCached: (cached) => {
          if (cached?.agentStats) setStats(cached.agentStats);
          if (cached?.weeklyLeague) setWeeklyLeague(cached.weeklyLeague);
          if (cached?.weekStart && cached?.weekEnd) {
            setWeekRange({ start: cached.weekStart, end: cached.weekEnd });
          }
          setLoading(false);
        },
      });
      if (res?.agentStats) {
        setStats(res.agentStats);
      }
      if (res?.weeklyLeague) {
        setWeeklyLeague(res.weeklyLeague);
      }
      if (res?.weekStart && res?.weekEnd) {
        setWeekRange({ start: res.weekStart, end: res.weekEnd });
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

  const visibleDailyStats =
    isOwnReportOnly && currentUser
      ? stats.filter((s) => s.userId === currentUser.id)
      : stats;

  const visibleWeeklyLeague =
    isOwnReportOnly && currentUser
      ? weeklyLeague.filter((s) => s.userId === currentUser.id)
      : weeklyLeague;

  // Daily Totals
  const totalAssignedToday = visibleDailyStats.reduce((s, a) => s + a.leadsAssignedToday, 0);
  const totalCallsToday = visibleDailyStats.reduce((s, a) => s + a.callsToday + a.whatsappToday, 0);
  const totalInterestedToday = visibleDailyStats.reduce((s, a) => s + (a.interestedCount || 0), 0);
  const totalVisitsToday = visibleDailyStats.reduce((s, a) => s + a.visitsScheduledToday, 0);
  const totalDailyPoints = visibleDailyStats.reduce((s, a) => s + (a.dailyPoints || 0), 0);

  // Overall Daily Conversion Rate
  const overallDailyConversionRate =
    totalAssignedToday > 0
      ? Math.round((totalInterestedToday / totalAssignedToday) * 100)
      : visibleDailyStats.length > 0
      ? Math.round(
          visibleDailyStats.reduce((s, a) => s + a.conversionRate, 0) / visibleDailyStats.length
        )
      : 0;

  // Top 3 Podium for Weekly League
  const podiumTop3 = visibleWeeklyLeague.slice(0, 3);
  const leaderUser = visibleWeeklyLeague[0];

  const handleExportCsv = () => {
    if (activeTab === 'league') {
      const headers = [
        'الترتيب (Rank)',
        'مسؤول المبيعات (Sales Rep)',
        'إجمالي نقاط الدوري (Total Points)',
        'المكالمات المنفذة (Calls)',
        'متابعات واتساب (WhatsApp)',
        'العملاء المعينون هذا الأسبوع (Assigned Leads)',
        'العملاء المهتمون (Interested Leads)',
        'معدل التحويل (Conversion %)',
        'المعاينات الميدانية (Site Visits)',
        'الصفقات المغلقة (Closed Deals)',
        'قيمة الصفقات بالجنيه (Closed Revenue)',
      ];
      const rows = visibleWeeklyLeague.map((row) => [
        row.rank,
        `"${row.fullName}"`,
        row.weeklyPoints,
        row.weeklyCalls,
        row.weeklyWhatsapp,
        row.weeklyAssignedLeads,
        row.weeklyInterested,
        `${row.weeklyConversionRate}%`,
        row.weeklyVisits,
        row.weeklyWonDeals,
        row.weeklyWonRevenue,
      ]);
      const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_league_week_${selectedDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        'مسؤول المبيعات (Sales Rep)',
        'العملاء المستلمون اليوم (Assigned Today)',
        'تم التواصل اليوم (Contacted Today)',
        'المكالمات اليومية (Calls)',
        'متابعات واتساب (WhatsApp)',
        'العملاء المهتمون اليوم (Interested Today)',
        'معدل تحويل اليوم (Daily Conversion %)',
        'المعاينات الميدانية (Site Visits)',
        'متوسط سرعة الرد بالدقائق (Avg Response)',
        'نقاط أداء اليوم (Daily Points)',
      ];
      const rows = visibleDailyStats.map((st) => [
        `"${st.fullName}"`,
        st.leadsAssignedToday,
        st.contactedToday,
        st.callsToday,
        st.whatsappToday,
        st.interestedCount || 0,
        `${st.dailyConversionRate || 0}%`,
        st.visitsScheduledToday,
        st.avgResponseMinutes,
        st.dailyPoints || 0,
      ]);
      const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily_sales_performance_${selectedDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & View Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>
              {isAr
                ? 'دوري التميز والتقارير اليومية لمبيعات العقارات'
                : 'Real Estate Sales League & Performance Analytics'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {isOwnReportOnly
              ? isAr
                ? 'أدائي اليومي وترتيبي في دوري النقاط الأسبوعي'
                : 'My Daily KPIs & Weekly League Standings'
              : isAr
              ? 'دوري أداء المبيعات الأسبوعي ومعدل تحويل العملاء'
              : 'Weekly Sales League & Lead Conversion Matrix'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isAr
              ? 'احتساب نقاط يومية على كل مكالمة، معاينة، ومعدل تحويل العملاء المهتمين من الليدز'
              : 'Real-time performance points for calls, site visits, and interested lead conversion rate'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Main Navigation Switch: Weekly League vs Daily Performance */}
          <div className="p-1 rounded-xl bg-slate-100 flex items-center gap-1 border border-slate-200/80">
            <button
              onClick={() => setActiveTab('league')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'league'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>{isAr ? 'دوري النقاط الأسبوعي' : 'Weekly League'}</span>
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'daily'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'تقرير الأداء اليومي' : 'Daily Report'}</span>
            </button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-blue-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-mono-tabular font-semibold text-slate-800 focus:outline-none"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchReport(selectedDate)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Scoring Rules Guide Button */}
          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-1 cursor-pointer border border-amber-200"
            title={isAr ? 'كيف يتم احتساب النقاط؟' : 'How are points calculated?'}
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>{isAr ? 'قواعد النقاط' : 'Points Rules'}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isAr ? 'تصدير الكشف CSV' : 'Export CSV'}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: WEEKLY SALES LEAGUE TABLE (دوري النقاط الأسبوعي) */}
      {activeTab === 'league' && (
        <div className="space-y-6">
          {/* League Podium: Top 3 Sales Representatives */}
          {podiumTop3.length > 0 && !isOwnReportOnly && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 2nd Place (Silver) */}
              {podiumTop3[1] && (
                <div className="order-2 md:order-1 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col items-center text-center relative overflow-hidden shadow-xs hover:border-slate-300 transition-all">
                  <div className="absolute top-3 start-3 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200 flex items-center gap-1">
                    🥈 {isAr ? 'المركز الثاني' : '2nd Place'}
                  </div>
                  <div className="relative mt-4 mb-2">
                    <img
                      src={podiumTop3[1].avatarUrl}
                      alt={podiumTop3[1].fullName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-4 border-slate-200 shadow-md"
                    />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{podiumTop3[1].fullName}</h3>
                  <div className="text-xs text-slate-500 mb-3">
                    {isAr ? podiumTop3[1].jobTitleAr : podiumTop3[1].jobTitle}
                  </div>
                  <div className="w-full bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'إجمالي النقاط' : 'Points'}</div>
                      <div className="font-mono-tabular font-extrabold text-slate-800 text-base">
                        {podiumTop3[1].weeklyPoints} 🏆
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'تحويل مهتمين' : 'Interested'}</div>
                      <div className="font-mono-tabular font-bold text-blue-600 text-base">
                        {podiumTop3[1].weeklyInterested}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 1st Place (Gold / Champion) */}
              {podiumTop3[0] && (
                <div className="order-1 md:order-2 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-white rounded-2xl border-2 border-amber-400/80 p-6 flex flex-col items-center text-center relative overflow-hidden shadow-md transform md:-translate-y-2">
                  <div className="absolute top-3 inset-x-0 mx-auto w-fit px-3 py-1 rounded-full bg-amber-400 text-amber-950 text-xs font-black shadow-xs flex items-center gap-1.5">
                    👑 🥇 {isAr ? 'متصدر دوري المبيعات' : 'League Leader'}
                  </div>
                  <div className="relative mt-6 mb-2">
                    <img
                      src={podiumTop3[0].avatarUrl}
                      alt={podiumTop3[0].fullName}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-full object-cover border-4 border-amber-400 shadow-lg ring-4 ring-amber-100"
                    />
                    <span className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center font-bold text-xs shadow-xs">
                      1
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 text-lg">{podiumTop3[0].fullName}</h3>
                  <div className="text-xs font-semibold text-amber-700 mb-4">
                    {isAr ? podiumTop3[0].jobTitleAr : podiumTop3[0].jobTitle}
                  </div>
                  <div className="w-full bg-white rounded-xl p-3.5 border border-amber-200/70 shadow-xs grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'نقاط الدوري' : 'Points'}</div>
                      <div className="font-mono-tabular font-black text-amber-600 text-lg">
                        {podiumTop3[0].weeklyPoints}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'عميل مهتم' : 'Interested'}</div>
                      <div className="font-mono-tabular font-bold text-blue-600 text-lg">
                        {podiumTop3[0].weeklyInterested}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'نسبة التحويل' : 'Conv %'}</div>
                      <div className="font-mono-tabular font-bold text-emerald-600 text-lg">
                        {podiumTop3[0].weeklyConversionRate}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3rd Place (Bronze) */}
              {podiumTop3[2] && (
                <div className="order-3 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col items-center text-center relative overflow-hidden shadow-xs hover:border-slate-300 transition-all">
                  <div className="absolute top-3 start-3 px-2.5 py-0.5 rounded-full bg-amber-100/70 text-amber-900 text-[11px] font-bold border border-amber-200 flex items-center gap-1">
                    🥉 {isAr ? 'المركز الثالث' : '3rd Place'}
                  </div>
                  <div className="relative mt-4 mb-2">
                    <img
                      src={podiumTop3[2].avatarUrl}
                      alt={podiumTop3[2].fullName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-4 border-amber-600/40 shadow-md"
                    />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{podiumTop3[2].fullName}</h3>
                  <div className="text-xs text-slate-500 mb-3">
                    {isAr ? podiumTop3[2].jobTitleAr : podiumTop3[2].jobTitle}
                  </div>
                  <div className="w-full bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'إجمالي النقاط' : 'Points'}</div>
                      <div className="font-mono-tabular font-extrabold text-slate-800 text-base">
                        {podiumTop3[2].weeklyPoints} 🏆
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">{isAr ? 'تحويل مهتمين' : 'Interested'}</div>
                      <div className="font-mono-tabular font-bold text-blue-600 text-base">
                        {podiumTop3[2].weeklyInterested}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full League Standings Table (Like a Premier Football League Table) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900">
                    {isAr ? 'جدول ترتيب دوري مبيعات الشركة' : 'Corporate Sales League Table'}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                    {weekRange.start && weekRange.end
                      ? `${weekRange.start} ➔ ${weekRange.end}`
                      : isAr
                      ? 'الأسبوع الحالي'
                      : 'Current Week'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isAr
                    ? 'ترتيب فرق وموظفي المبيعات حسب النقاط المكتسبة من المكالمات والمعاينات ومعدل تحويل العملاء المهتمين'
                    : 'Rankings based on points accumulated from calls, site visits, and interested lead conversion'}
                </p>
              </div>

              {leaderUser && !isOwnReportOnly && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
                  <Flame className="w-4 h-4 text-amber-600" />
                  <span>
                    {isAr ? `نجم الأسبوع: ${leaderUser.fullName}` : `Top Performer: ${leaderUser.fullName}`}
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-3 text-center w-12">{isAr ? 'المركز' : 'Rank'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'مسؤول المبيعات' : 'Sales Advisor'}</th>
                    <th className="py-3.5 px-4 text-center font-bold text-blue-700 bg-blue-50/50">
                      {isAr ? 'إجمالي النقاط 🏆' : 'Total Points 🏆'}
                    </th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'المكالمات والواتساب' : 'Calls / WA'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الليدز المستلمة' : 'Assigned Leads'}</th>
                    <th className="py-3.5 px-4 text-center text-emerald-700 font-bold">
                      {isAr ? 'العملاء المهتمين' : 'Interested Leads'}
                    </th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'معدل التحويل' : 'Conversion %'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'المعاينات' : 'Site Visits'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'صفقات ناجحة' : 'Won Deals'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Trend'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleWeeklyLeague.map((row) => {
                    const isTop1 = row.rank === 1;
                    const isTop2 = row.rank === 2;
                    const isTop3 = row.rank === 3;
                    return (
                      <tr
                        key={row.userId}
                        className={`transition-colors hover:bg-blue-50/40 ${
                          isTop1 ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3.5 px-3 text-center font-mono-tabular font-bold">
                          {isTop1 ? (
                            <span className="w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center mx-auto shadow-xs">
                              1
                            </span>
                          ) : isTop2 ? (
                            <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center mx-auto">
                              2
                            </span>
                          ) : isTop3 ? (
                            <span className="w-7 h-7 rounded-full bg-amber-700 text-amber-100 font-bold text-xs flex items-center justify-center mx-auto">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-500 font-semibold">{row.rank}</span>
                          )}
                        </td>

                        {/* Name & Job Title */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={row.avatarUrl}
                              alt={row.fullName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                            />
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{row.fullName}</span>
                                {isTop1 && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    {isAr ? 'المتصدر' : 'Leader'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {isAr ? row.jobTitleAr : row.jobTitle}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Total Points */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular font-black text-base text-blue-700 bg-blue-50/50">
                          {row.weeklyPoints}
                        </td>

                        {/* Calls & WhatsApp */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular text-slate-700 font-semibold">
                          <div className="flex items-center justify-center gap-1">
                            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {row.weeklyCalls} <span className="text-slate-400 font-normal">/ {row.weeklyWhatsapp}</span>
                            </span>
                          </div>
                        </td>

                        {/* Assigned Leads */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-slate-900">
                          {row.weeklyAssignedLeads}
                        </td>

                        {/* Converted to Interested */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                            <Target className="w-3.5 h-3.5 text-emerald-600" />
                            <span>
                              {row.weeklyInterested} {isAr ? 'مهتم' : 'interested'}
                            </span>
                          </span>
                        </td>

                        {/* Conversion Rate */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                              <div
                                className={`h-full rounded-full ${
                                  row.weeklyConversionRate >= 30
                                    ? 'bg-emerald-500'
                                    : row.weeklyConversionRate >= 15
                                    ? 'bg-blue-600'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(10, row.weeklyConversionRate))}%` }}
                              />
                            </div>
                            <span className="font-mono-tabular font-extrabold text-slate-900">
                              {row.weeklyConversionRate}%
                            </span>
                          </div>
                        </td>

                        {/* Site Visits */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-indigo-600">
                          {row.weeklyVisits}
                        </td>

                        {/* Won Deals */}
                        <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-emerald-600">
                          {row.weeklyWonDeals > 0 ? (
                            <span>
                              {row.weeklyWonDeals} ({(row.weeklyWonRevenue / 1000000).toFixed(1)}M)
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">-</span>
                          )}
                        </td>

                        {/* Trend */}
                        <td className="py-3.5 px-4 text-center">
                          {row.trend === 'up' ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-bold">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>{isAr ? 'صاعد' : 'Up'}</span>
                            </span>
                          ) : row.trend === 'down' ? (
                            <span className="inline-flex items-center gap-0.5 text-slate-400 text-xs">
                              <span>{isAr ? 'يحتاج تنشيط' : 'Behind'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-blue-600 text-xs font-semibold">
                              <span>{isAr ? 'مستقر' : 'Stable'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED DAILY PERFORMANCE & CONVERSION REPORT */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* 4 Summary KPI Cards for Selected Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Leads Received Today */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs text-slate-500 font-semibold">
                {isAr ? 'العملاء المستلمون والموزعون اليوم' : 'Assigned Leads Today'}
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono-tabular mt-1.5">
                {totalAssignedToday}
              </div>
              <div className="text-[11px] text-blue-600 mt-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? `إجمالي عملاء اليوم في حسابات المبيعات`
                    : `Total daily intake assigned to team`}
                </span>
              </div>
            </div>

            {/* Calls and Touchpoints Today */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs text-slate-500 font-semibold">
                {isAr ? 'المكالمات والمتابعات المنفذة اليوم' : 'Calls & Touchpoints Logged'}
              </div>
              <div className="text-2xl font-black text-blue-600 font-mono-tabular mt-1.5">
                {totalCallsToday}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isAr ? 'متابعات موثقة في سجل النظام' : 'Verified daily call logs'}</span>
              </div>
            </div>

            {/* Converted to Interested Today */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs text-slate-500 font-semibold">
                {isAr ? 'العملاء المحولون لمهتمين اليوم' : 'Converted to Interested Today'}
              </div>
              <div className="text-2xl font-black text-emerald-600 font-mono-tabular mt-1.5">
                {totalInterestedToday}
              </div>
              <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? `معدل تحويل اليوم: ${overallDailyConversionRate}%`
                    : `Daily Conversion Rate: ${overallDailyConversionRate}%`}
                </span>
              </div>
            </div>

            {/* Total Daily Points Earned */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs text-slate-500 font-semibold">
                {isAr ? 'إجمالي نقاط الأداء المحققة اليوم' : 'Daily League Points Scored'}
              </div>
              <div className="text-2xl font-black text-amber-600 font-mono-tabular mt-1.5 flex items-center gap-1.5">
                <span>{totalDailyPoints}</span>
                <Trophy className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-[11px] text-amber-800 mt-1 font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>{isAr ? 'تضاف مباشرة لرصيد الدوري الأسبوعي' : 'Added to weekly league total'}</span>
              </div>
            </div>
          </div>

          {/* Granular Per-Salesperson Daily Performance Matrix */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {isAr
                    ? 'جدول تفصيلي بأداء مناديب المبيعات ومعدل تحويل العملاء اليوم'
                    : 'Daily Sales Rep Activity & Conversion Rate Table'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? 'يوضح كم عميل تم تحويله إلى مهتم من الليدز المستلمة اليوم مع عدد المكالمات وسرعة الرد'
                    : 'Shows how many leads each sales rep converted to interested along with call count and response speed'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4 text-start">{isAr ? 'مسؤول المبيعات' : 'Sales Representative'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'ليدز مستلمة اليوم' : 'Assigned Today'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'تم التواصل' : 'Contacted'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'مكالمات / واتساب' : 'Calls / WA'}</th>
                    <th className="py-3.5 px-4 text-center text-emerald-700 font-bold bg-emerald-50/50">
                      {isAr ? 'تحويل لمهتمين' : 'Converted to Interested'}
                    </th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'معدل التحويل اليومي' : 'Daily Conversion %'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'معاينات' : 'Site Visits'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'متوسط سرعة الرد' : 'Avg Response'}</th>
                    <th className="py-3.5 px-4 text-end text-amber-700 font-bold bg-amber-50/40">
                      {isAr ? 'نقاط اليوم 🏆' : 'Daily Points 🏆'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDailyStats.map((row) => (
                    <tr key={row.userId} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={row.avatarUrl}
                            alt={row.fullName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{row.fullName}</div>
                            <div className="text-[11px] text-slate-500">
                              {isAr ? row.jobTitleAr : row.jobTitle}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-blue-600">
                        +{row.leadsAssignedToday}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-tabular font-semibold text-slate-800">
                        {row.contactedToday}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-tabular text-slate-700">
                        {row.callsToday} / {row.whatsappToday}
                      </td>

                      {/* Converted to Interested Today */}
                      <td className="py-3.5 px-4 text-center font-mono-tabular font-black text-emerald-700 bg-emerald-50/50">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{row.interestedCount || 0} عميل</span>
                        </span>
                      </td>

                      {/* Daily Conversion Rate */}
                      <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-slate-900">
                        {row.dailyConversionRate || 0}%
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-indigo-600">
                        {row.visitsScheduledToday}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-tabular text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          {row.avgResponseMinutes} {isAr ? 'د' : 'm'}
                        </span>
                      </td>

                      {/* Points scored today */}
                      <td className="py-3.5 px-4 text-end font-mono-tabular font-black text-base text-amber-700 bg-amber-50/40">
                        +{row.dailyPoints || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: POINTS CALCULATION RULES & SCORING TRANSPARENCY */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-900">
                  {isAr ? 'قواعد ونظام نقاط دوري المبيعات' : 'Sales League Scoring System'}
                </h3>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? 'يهدف دوري المبيعات الأسبوعي إلى تحفيز فريق المبيعات بنظام نقاط تنافسي وعادل يحسب تلقائياً من خلال الأنشطة اليومية المسجلة في الـ CRM:'
                : 'The Weekly Sales League motivates advisors with fair and automated points calculated directly from daily CRM activities:'}
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-slate-800">
                    {isAr ? 'كل مكالمة هاتفية موثقة' : 'Each Logged Client Call'}
                  </span>
                </div>
                <span className="font-mono-tabular font-black text-blue-700 text-sm">
                  +2 {isAr ? 'نقاط' : 'pts'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-800">
                    {isAr ? 'تحويل العميل إلى "مهتم" (Qualified)' : 'Converting Lead to "Interested"'}
                  </span>
                </div>
                <span className="font-mono-tabular font-black text-emerald-700 text-sm">
                  +10 {isAr ? 'نقاط' : 'pts'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800">
                    {isAr ? 'حجز معاينة ميدانية لمشروع (Site Visit)' : 'Scheduled Project Site Visit'}
                  </span>
                </div>
                <span className="font-mono-tabular font-black text-indigo-700 text-sm">
                  +15 {isAr ? 'نقطة' : 'pts'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-slate-800">
                    {isAr ? 'إغلاق صفقة بيع ناجحة (Closed Won)' : 'Closed Won Property Contract'}
                  </span>
                </div>
                <span className="font-mono-tabular font-black text-amber-700 text-sm">
                  +50 {isAr ? 'نقطة' : 'pts'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="font-bold text-slate-800">
                    {isAr ? 'مكافأة كفاءة التحويل (تحويل > 25% من الليدز)' : 'Conversion Efficiency Bonus (>25%)'}
                  </span>
                </div>
                <span className="font-mono-tabular font-black text-purple-700 text-sm">
                  +25 {isAr ? 'نقطة بونص' : 'pts bonus'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowRulesModal(false)}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
              >
                {isAr ? 'فهمت النظام، إغلاق' : 'Got it, Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
