import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  Clock,
  Search,
  X,
} from 'lucide-react';
import {
  CalendarEvent,
  Lead,
  PaginatedEventsResponse,
  UserProfile,
} from '../types/crm';
import { Lang } from '../i18n/translations';
import {
  apiRequest,
  getCurrentMonthDateRange,
  invalidateSwrCache,
  swrFetch,
} from '../services/api';

interface CalendarViewProps {
  lang: Lang;
  currentUser: UserProfile;
  users: UserProfile[];
  leads?: Lead[];
  events?: CalendarEvent[];
  projects: string[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

const persistedCalendarFilterState = {
  searchQuery: '',
  categoryFilter: 'ALL',
  projectFilter: 'ALL',
  dateFrom: getCurrentMonthDateRange().from,
  dateTo: getCurrentMonthDateRange().to,
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  lang,
  currentUser,
  users,
  leads = [],
  projects,
  onRefresh,
  onToast,
}) => {
  const isAr = lang === 'ar';
  const [searchQuery, setSearchQuery] = useState(persistedCalendarFilterState.searchQuery);
  const [categoryFilter, setCategoryFilter] = useState(persistedCalendarFilterState.categoryFilter);
  const [projectFilter, setProjectFilter] = useState(persistedCalendarFilterState.projectFilter);
  const [dateFrom, setDateFrom] = useState(persistedCalendarFilterState.dateFrom);
  const [dateTo, setDateTo] = useState(persistedCalendarFilterState.dateTo);

  useEffect(() => {
    persistedCalendarFilterState.searchQuery = searchQuery;
    persistedCalendarFilterState.categoryFilter = categoryFilter;
    persistedCalendarFilterState.projectFilter = projectFilter;
    persistedCalendarFilterState.dateFrom = dateFrom;
    persistedCalendarFilterState.dateTo = dateTo;
  }, [searchQuery, categoryFilter, projectFilter, dateFrom, dateTo]);

  const [eventsList, setEventsList] = useState<CalendarEvent[]>([]);
  const [totalMatchingEvents, setTotalMatchingEvents] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Site Visit' as CalendarEvent['category'],
    priority: 'High' as CalendarEvent['priority'],
    date: new Date().toISOString().slice(0, 10),
    time: '13:00',
    leadId: leads[0]?.id || '',
    projectName: projects[0] || 'Palm Hills New Cairo',
    assignedTo: currentUser.id,
    description: '',
  });

  const buildEventsQueryPath = useCallback(
    (cursorVal?: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (projectFilter !== 'ALL') params.set('project', projectFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (cursorVal) params.set('cursor', cursorVal);
      return `/api/events?${params.toString()}`;
    },
    [categoryFilter, projectFilter, searchQuery, dateFrom, dateTo]
  );

  const loadFirstEventsPage = useCallback(
    async (forceRefresh = false) => {
      const path = buildEventsQueryPath(null);
      setLoadingInitial(true);
      try {
        const res = await swrFetch<PaginatedEventsResponse>(path, {
          forceRefresh,
          onCached: (cached) => {
            if (cached?.items) {
              setEventsList(cached.items);
              setTotalMatchingEvents(cached.totalMatching ?? cached.items.length);
              setNextCursor(cached.nextCursor || null);
              setHasMore(Boolean(cached.hasMore));
              setLoadingInitial(false);
            }
          },
        });
        setEventsList(res.items || []);
        setTotalMatchingEvents(res.totalMatching ?? (res.items || []).length);
        setNextCursor(res.nextCursor || null);
        setHasMore(Boolean(res.hasMore));
      } catch (err) {
        console.error('Failed to load paginated events:', err);
      } finally {
        setLoadingInitial(false);
      }
    },
    [buildEventsQueryPath]
  );

  const loadMoreEvents = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore || loadingInitial) return;
    setLoadingMore(true);
    try {
      const path = buildEventsQueryPath(nextCursor);
      const res = await swrFetch<PaginatedEventsResponse>(path);
      setEventsList((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const incoming = (res.items || []).filter((e) => !existingIds.has(e.id));
        return [...prev, ...incoming];
      });
      setNextCursor(res.nextCursor || null);
      setHasMore(Boolean(res.hasMore));
      setTotalMatchingEvents(res.totalMatching);
    } catch (err) {
      console.error('Failed to load more events:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, loadingInitial, buildEventsQueryPath]);

  useEffect(() => {
    loadFirstEventsPage();
  }, [loadFirstEventsPage]);

  // IntersectionObserver for Infinite Scroll on Events
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreEvents();
        }
      },
      { rootMargin: '220px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMoreEvents]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/events', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowAddModal(false);
      if (res.event) {
        setEventsList((prev) => [res.event, ...prev]);
        setTotalMatchingEvents((c) => c + 1);
      }
      invalidateSwrCache('/api/events');
      onToast(
        isAr
          ? 'تمت جدولة الموعد / المعاينة العقارية في التقويم'
          : 'Event scheduled on calendar'
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleToggleComplete = async (evt: CalendarEvent) => {
    setEventsList((prev) =>
      prev.map((item) =>
        item.id === evt.id ? { ...item, completed: !evt.completed } : item
      )
    );
    try {
      await apiRequest(`/api/events/${evt.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !evt.completed }),
      });
      invalidateSwrCache('/api/events');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
      loadFirstEventsPage(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header matching Reference Image 3 ("Nearest Events / Calendar | + Add Event") */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isAr
              ? `التقويم وجدولة المعاينات العقارية (${totalMatchingEvents})`
              : `Calendar & Site Visits Schedule (${totalMatchingEvents})`}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr
              ? 'متابعة المعاينات الميدانية للمشاريع، اجتماعات العملاء، ومواعيد توقيع العقود'
              : 'Manage project site visits, client calls, and contract signings'}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إضافة موعد / معاينة' : 'Add Event'}</span>
        </button>
      </div>

      {/* Filter & Date Range Bar (Defaults to Current Month) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-center text-xs">
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr ? 'بحث بعنوان الموعد، اسم العميل، أو المشروع...' : 'Search event or client...'
            }
            className="w-full ps-8 pe-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] text-slate-700"
        >
          <option value="ALL">{isAr ? 'كل أنواع المواعيد' : 'All Categories'}</option>
          <option value="Site Visit">معاينة موقع (Site Visit)</option>
          <option value="Client Call">مكالمة عميل (Client Call)</option>
          <option value="Contract Signing">توقيع عقد (Contract Signing)</option>
          <option value="Team Meeting">اجتماع فريق (Team Meeting)</option>
        </select>

        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] text-slate-700"
        >
          <option value="ALL">{isAr ? 'كل المشاريع' : 'All Projects'}</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title={isAr ? 'من تاريخ' : 'From Date'}
            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] font-mono-tabular text-[11px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title={isAr ? 'إلى تاريخ' : 'To Date'}
            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] font-mono-tabular text-[11px]"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              title={isAr ? 'عرض كل التواريخ' : 'All Dates'}
              className="px-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold shrink-0 cursor-pointer"
            >
              {isAr ? 'الكل' : 'All'}
            </button>
          )}
        </div>
      </div>

      {/* Nearest Events 2-Column Card Grid matching Reference Image 3 */}
      {loadingInitial && eventsList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 animate-pulse"
            >
              <div className="h-3.5 bg-slate-200 rounded w-1/3" />
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <div className="h-5 bg-slate-200 rounded w-28" />
                <div className="h-5 bg-slate-200 rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : eventsList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
          {isAr
            ? 'لا توجد مواعيد أو معاينات مجدولة في النطاق الزمني المحدد.'
            : 'No events or site visits scheduled in the selected date range.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eventsList.map((evt) => {
            const agent = users.find((u) => u.id === evt.assignedTo);
            return (
              <div
                key={evt.id}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between transition-colors ${
                  evt.completed ? 'border-slate-100 opacity-70' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-blue-600 font-semibold">
                        {evt.category} · {evt.projectName}
                      </div>
                      <h3
                        className={`text-sm font-bold text-slate-900 mt-1 ${
                          evt.completed ? 'line-through' : ''
                        }`}
                      >
                        {evt.title}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleToggleComplete(evt)}
                      className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                        evt.completed
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {evt.completed
                          ? isAr
                            ? 'مكتمل'
                            : 'Done'
                          : isAr
                          ? 'إنجاز'
                          : 'Mark Done'}
                      </span>
                    </button>
                  </div>

                  {evt.description && (
                    <p className="text-xs text-slate-600 mt-2">{evt.description}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    {agent && (
                      <img
                        src={agent.avatarUrl}
                        alt={agent.fullName}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    )}
                    <span className="font-medium text-slate-700">{agent?.fullName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono-tabular text-slate-700 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {evt.date} · {evt.time}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} className="h-2" />
      {loadingMore && (
        <div className="text-center text-xs text-slate-400 animate-pulse">
          {isAr ? 'جاري تحميل المزيد من المواعيد...' : 'Loading more events...'}
        </div>
      )}

      {/* Add Event Modal matching Reference Image 3 ("Add Event") */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'جدولة معاينة أو موعد جديد (Add Event)' : 'Add Event / Site Visit'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'عنوان الموعد / المعاينة *' : 'Event Name *'}
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={isAr ? 'مثال: معاينة فيلا بالم هيلز مع العميل' : 'e.g. Site visit at Palm Hills'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'التصنيف' : 'Event Category'}
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="Site Visit">معاينة موقع (Site Visit)</option>
                    <option value="Client Call">مكالمة عميل (Client Call)</option>
                    <option value="Contract Signing">توقيع عقد (Contract Signing)</option>
                    <option value="Team Meeting">اجتماع فريق (Team Meeting)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'المشروع العقاري' : 'Project'}
                  </label>
                  <select
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    {projects.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'التاريخ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الوقت' : 'Time'}
                  </label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'مسؤول المبيعات المكلف' : 'Assigned Sales Rep'}
                </label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات وتفاصيل الموعد' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'حفظ الموعد' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
