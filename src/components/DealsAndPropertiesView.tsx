import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2,
  Briefcase,
  Plus,
  BedDouble,
  Maximize2,
  MapPin,
  Search,
  Calendar,
  X,
} from 'lucide-react';
import {
  Deal,
  Lead,
  PaginatedDealsResponse,
  PaginatedLeadsResponse,
  PropertyUnit,
  Role,
  UserProfile,
} from '../types/crm';
import { Lang } from '../i18n/translations';
import {
  apiRequest,
  getCurrentMonthDateRange,
  invalidateSwrCache,
  swrFetch,
} from '../services/api';

interface DealsAndPropertiesViewProps {
  lang: Lang;
  currentUser: UserProfile;
  currentRole: Role;
  users: UserProfile[];
  leads?: Lead[];
  properties: PropertyUnit[];
  deals?: Deal[];
  projects: string[];
  forcedSubTab?: 'deals' | 'properties';
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

const persistedDealsFilterState = {
  activeSubTab: 'deals' as 'deals' | 'properties',
  searchQuery: '',
  stageFilter: 'ALL',
  projectFilter: 'ALL',
  dateFrom: '',
  dateTo: '',
};

export const DealsAndPropertiesView: React.FC<DealsAndPropertiesViewProps> = ({
  lang,
  currentUser,
  currentRole,
  users,
  leads = [],
  properties,
  projects,
  forcedSubTab,
  onRefresh,
  onToast,
}) => {
  const isAr = lang === 'ar';
  const [activeSubTab, setActiveSubTab] = useState<'deals' | 'properties'>(
    forcedSubTab || persistedDealsFilterState.activeSubTab
  );

  useEffect(() => {
    if (forcedSubTab) {
      setActiveSubTab(forcedSubTab);
    }
  }, [forcedSubTab]);
  const [searchQuery, setSearchQuery] = useState(persistedDealsFilterState.searchQuery);
  const [stageFilter, setStageFilter] = useState(persistedDealsFilterState.stageFilter);
  const [projectFilter, setProjectFilter] = useState(persistedDealsFilterState.projectFilter);
  const [dateFrom, setDateFrom] = useState(persistedDealsFilterState.dateFrom);
  const [dateTo, setDateTo] = useState(persistedDealsFilterState.dateTo);

  useEffect(() => {
    persistedDealsFilterState.activeSubTab = activeSubTab;
    persistedDealsFilterState.searchQuery = searchQuery;
    persistedDealsFilterState.stageFilter = stageFilter;
    persistedDealsFilterState.projectFilter = projectFilter;
    persistedDealsFilterState.dateFrom = dateFrom;
    persistedDealsFilterState.dateTo = dateTo;
  }, [activeSubTab, searchQuery, stageFilter, projectFilter, dateFrom, dateTo]);

  const [dealsList, setDealsList] = useState<Deal[]>([]);
  const [totalMatchingDeals, setTotalMatchingDeals] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [leadOptions, setLeadOptions] = useState<Lead[]>(leads);
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);

  const buildDealsQueryPath = useCallback(
    (cursorVal?: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (stageFilter !== 'ALL') params.set('stage', stageFilter);
      if (projectFilter !== 'ALL') params.set('project', projectFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (cursorVal) params.set('cursor', cursorVal);
      return `/api/deals?${params.toString()}`;
    },
    [stageFilter, projectFilter, searchQuery, dateFrom, dateTo]
  );

  const loadFirstDealsPage = useCallback(
    async (forceRefresh = false) => {
      const path = buildDealsQueryPath(null);
      setLoadingInitial(true);
      try {
        const res = await swrFetch<PaginatedDealsResponse>(path, {
          forceRefresh,
          onCached: (cached) => {
            if (cached?.items) {
              setDealsList(cached.items);
              setTotalMatchingDeals(cached.totalMatching ?? cached.items.length);
              setNextCursor(cached.nextCursor || null);
              setHasMore(Boolean(cached.hasMore));
              setLoadingInitial(false);
            }
          },
        });
        setDealsList(res.items || []);
        setTotalMatchingDeals(res.totalMatching ?? (res.items || []).length);
        setNextCursor(res.nextCursor || null);
        setHasMore(Boolean(res.hasMore));
      } catch (err) {
        console.error('Failed to load paginated deals:', err);
      } finally {
        setLoadingInitial(false);
      }
    },
    [buildDealsQueryPath]
  );

  const loadMoreDeals = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore || loadingInitial) return;
    setLoadingMore(true);
    try {
      const path = buildDealsQueryPath(nextCursor);
      const res = await swrFetch<PaginatedDealsResponse>(path);
      setDealsList((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        const incoming = (res.items || []).filter((d) => !existingIds.has(d.id));
        return [...prev, ...incoming];
      });
      setNextCursor(res.nextCursor || null);
      setHasMore(Boolean(res.hasMore));
      setTotalMatchingDeals(res.totalMatching);
    } catch (err) {
      console.error('Failed to load more deals:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, loadingInitial, buildDealsQueryPath]);

  useEffect(() => {
    loadFirstDealsPage();
  }, [loadFirstDealsPage]);

  // IntersectionObserver for Infinite Scroll on Deals
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || activeSubTab !== 'deals' || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreDeals();
        }
      },
      { rootMargin: '220px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeSubTab, hasMore, loadMoreDeals]);

  // Load first 30 leads when opening Add Deal modal if not already loaded
  useEffect(() => {
    if (!showAddDealModal) return;
    swrFetch<PaginatedLeadsResponse>('/api/leads?limit=30')
      .then((res) => {
        if (res?.items) {
          setLeadOptions(res.items);
          setDealForm((prev) => ({
            ...prev,
            leadId: prev.leadId || res.items[0]?.id || '',
          }));
        }
      })
      .catch(() => {});
  }, [showAddDealModal]);

  const [propForm, setPropForm] = useState({
    code: `PH-${Math.floor(100 + Math.random() * 899)}`,
    titleAr: '',
    projectName: projects[0] || 'ليدز مغتربين',
    developer: '',
    location: 'القاهرة الجديدة · التجمع الخامس',
    type: 'Villa',
    areaSqm: 285,
    bedrooms: 4,
    bathrooms: 4,
    price: 18500000,
    downPaymentPercent: 10,
    installmentYears: 8,
    deliveryYear: 2027,
  });

  const [dealForm, setDealForm] = useState({
    title: '',
    leadId: leads[0]?.id || '',
    propertyId: properties[0]?.id || '',
    assignedTo: currentUser.id,
    stage: 'Reservation',
    dealValue: 16500000,
    commissionPercent: 2.5,
    expectedCloseDate: new Date().toISOString().slice(0, 10),
  });

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/properties', {
        method: 'POST',
        body: JSON.stringify(propForm),
      });
      setShowAddPropertyModal(false);
      onToast(isAr ? 'تمت إضافة الوحدة العقارية للكتالوج' : 'Property unit added to catalog');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/deals', {
        method: 'POST',
        body: JSON.stringify(dealForm),
      });
      setShowAddDealModal(false);
      if (res.deal) {
        setDealsList((prev) => [res.deal, ...prev]);
        setTotalMatchingDeals((c) => c + 1);
      }
      invalidateSwrCache('/api/deals');
      onToast(isAr ? 'تم تسجيل الصفقة العقارية بنجاح' : 'Deal created successfully');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleDealStageChange = async (dealId: string, newStage: string) => {
    setDealsList((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: newStage as any } : d))
    );
    try {
      await apiRequest(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({ stage: newStage }),
      });
      invalidateSwrCache('/api/deals');
      onToast(isAr ? 'تم تحديث مرحلة الصفقة' : 'Deal stage updated');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
      loadFirstDealsPage(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {forcedSubTab ? (
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 mb-0.5">
              {forcedSubTab === 'properties' ? <Building2 className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
              <span>
                {forcedSubTab === 'properties'
                  ? (isAr ? 'المشروعات والوحدات العقارية' : 'Projects & Units')
                  : (isAr ? 'مراحل البيع والصفقات' : 'Sales Deals')}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              {forcedSubTab === 'properties'
                ? (isAr ? `كتالوج الوحدات والمشاريع (${properties.length})` : `Property Units Catalog (${properties.length})`)
                : (isAr ? `إدارة الصفقات والتعاقدات (${totalMatchingDeals})` : `Deals Pipeline (${totalMatchingDeals})`)}
            </h1>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              onClick={() => setActiveSubTab('deals')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                activeSubTab === 'deals'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>
                {isAr
                  ? `إدارة الصفقات والتعاقدات (${totalMatchingDeals})`
                  : `Deals Pipeline (${totalMatchingDeals})`}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('properties')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                activeSubTab === 'properties'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>
                {isAr
                  ? `كتالوج الوحدات والمشاريع (${properties.length})`
                  : `Property Units Catalog (${properties.length})`}
              </span>
            </button>
          </div>
        )}

        <div>
          {activeSubTab === 'deals' ? (
            <button
              onClick={() => setShowAddDealModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل صفقة / حجز جديد' : 'Add New Deal'}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAddPropertyModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة وحدة عقارية جديدة' : 'Add Property Unit'}</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'deals' ? (
        <div className="space-y-4">
          {/* Deals Filter & Date Range Bar (Defaults to Current Month) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-center text-xs">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr ? 'بحث بعنوان الصفقة، اسم العميل، أو المشروع...' : 'Search deal or client...'
                }
                className="w-full ps-8 pe-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] text-slate-700"
            >
              <option value="ALL">{isAr ? 'كل مراحل الصفقات' : 'All Deal Stages'}</option>
              <option value="Reservation">حجز مبدئي (Reservation)</option>
              <option value="Contract Review">مراجعة العقود (Contract Review)</option>
              <option value="Down Payment">سداد المقدم (Down Payment)</option>
              <option value="Closed Won">تم التعاقد النهائي (Closed Won)</option>
              <option value="Cancelled">ملغاة (Cancelled)</option>
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
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] text-slate-500 font-semibold">
                  <th className="py-3.5 px-4 text-start">
                    {isAr ? 'عنوان الصفقة والعميل' : 'Deal & Client'}
                  </th>
                  <th className="py-3.5 px-4 text-start">
                    {isAr ? 'المشروع والوحدة' : 'Project & Unit'}
                  </th>
                  <th className="py-3.5 px-4 text-start">
                    {isAr ? 'قيمة الصفقة' : 'Deal Value'}
                  </th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'العمولة' : 'Commission'}</th>
                  <th className="py-3.5 px-4 text-start">
                    {isAr ? 'مسؤول المبيعات' : 'Sales Rep'}
                  </th>
                  <th className="py-3.5 px-4 text-start">
                    {isAr ? 'مرحلة التعاقد' : 'Deal Stage'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingInitial && dealsList.length === 0 ? (
                  [1, 2, 3, 4].map((skeletonIdx) => (
                    <tr key={skeletonIdx} className="animate-pulse">
                      <td className="py-4 px-4">
                        <div className="h-3.5 bg-slate-200 rounded w-40 mb-1.5" />
                        <div className="h-2.5 bg-slate-100 rounded w-24" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-3.5 bg-slate-200 rounded w-32 mb-1.5" />
                        <div className="h-2.5 bg-slate-100 rounded w-20" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-3.5 bg-slate-200 rounded w-20" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-3.5 bg-slate-200 rounded w-24" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-3.5 bg-slate-200 rounded w-28" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-7 bg-slate-100 rounded-lg w-36" />
                      </td>
                    </tr>
                  ))
                ) : dealsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      {isAr
                        ? 'لا توجد صفقات مطابقة للفلاتر أو النطاق الزمني المحدد.'
                        : 'No deals found matching the current filters or date range.'}
                    </td>
                  </tr>
                ) : (
                  dealsList.map((d) => {
                    const agent = users.find((u) => u.id === d.assignedTo);
                    const commissionValue = Math.round(
                      (d.dealValue * (d.commissionPercent || 2.5)) / 100
                    );
                    return (
                      <tr key={d.id} className="hover:bg-blue-50/30">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{d.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{d.leadName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{d.projectName}</div>
                          <div className="text-[11px] text-slate-500">{d.propertyName}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono-tabular font-bold text-slate-900">
                          {(d.dealValue / 1000000).toFixed(2)}M EGP
                        </td>
                        <td className="py-3.5 px-4 font-mono-tabular text-emerald-600 font-semibold">
                          {d.commissionPercent}% ({(commissionValue / 1000).toFixed(0)}K EGP)
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {agent?.fullName || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            value={d.stage}
                            onChange={(e) => handleDealStageChange(d.id, e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-blue-600 cursor-pointer"
                          >
                            <option value="Reservation">حجز مبدئي (Reservation)</option>
                            <option value="Contract Review">مراجعة العقود (Contract Review)</option>
                            <option value="Down Payment">سداد المقدم (Down Payment)</option>
                            <option value="Closed Won">تم التعاقد النهائي (Closed Won)</option>
                            <option value="Cancelled">ملغاة (Cancelled)</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div ref={sentinelRef} className="h-2" />
            {loadingMore && (
              <div className="p-3 text-center text-xs text-slate-400 animate-pulse border-t border-slate-100">
                {isAr ? 'جاري تحميل المزيد من الصفقات...' : 'Loading more deals...'}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Property Units Catalog Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between hover:border-blue-400 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono-tabular mb-2">
                  <span>{prop.code}</span>
                  <span
                    className={`font-sans font-semibold ${
                      prop.status === 'Available'
                        ? 'text-emerald-600'
                        : prop.status === 'Reserved'
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }`}
                  >
                    {prop.status === 'Available'
                      ? isAr
                        ? 'متاحة للبيع'
                        : 'Available'
                      : prop.status === 'Reserved'
                      ? isAr
                        ? 'محجوزة'
                        : 'Reserved'
                      : isAr
                      ? 'مباعة'
                      : 'Sold'}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? prop.titleAr : prop.title}
                </h3>
                <p className="text-xs text-blue-600 font-semibold mt-0.5">
                  {prop.projectName} · {prop.developer}
                </p>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{prop.location}</span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1 font-mono-tabular">
                    <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{prop.areaSqm} m²</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono-tabular">
                    <BedDouble className="w-3.5 h-3.5 text-blue-600" />
                    <span>{prop.bedrooms} BR</span>
                  </div>
                  <div className="font-mono-tabular text-end">
                    {prop.downPaymentPercent}% / {prop.installmentYears}Y
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {isAr ? `استلام ${prop.deliveryYear}` : `Delivery ${prop.deliveryYear}`}
                </span>
                <span className="text-base font-bold text-slate-900 font-mono-tabular">
                  {(prop.price / 1000000).toFixed(2)}M EGP
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Property Modal */}
      {showAddPropertyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'إضافة وحدة عقارية جديدة للكتالوج' : 'Add New Property Unit'}
              </h3>
              <button
                onClick={() => setShowAddPropertyModal(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProperty} className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم/وصف الوحدة *' : 'Unit Title *'}
                </label>
                <input
                  type="text"
                  value={propForm.titleAr}
                  onChange={(e) => setPropForm({ ...propForm, titleAr: e.target.value })}
                  placeholder="مثال: فيلا تاون هاوس كورنر بحديقة"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'المشروع العقاري' : 'Project Name'}
                </label>
                <input
                  type="text"
                  value={propForm.projectName}
                  onChange={(e) => setPropForm({ ...propForm, projectName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'السعر الإجمالي (EGP)' : 'Total Price (EGP)'}
                </label>
                <input
                  type="number"
                  value={propForm.price}
                  onChange={(e) => setPropForm({ ...propForm, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'المساحة (متر مربع)' : 'Area (sqm)'}
                </label>
                <input
                  type="number"
                  value={propForm.areaSqm}
                  onChange={(e) => setPropForm({ ...propForm, areaSqm: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'سنوات التقسيط' : 'Installment Years'}
                </label>
                <input
                  type="number"
                  value={propForm.installmentYears}
                  onChange={(e) =>
                    setPropForm({ ...propForm, installmentYears: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddPropertyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'حفظ الوحدة' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Deal Modal */}
      {showAddDealModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'تسجيل صفقة عقارية جديدة' : 'Create New Real Estate Deal'}
              </h3>
              <button
                onClick={() => setShowAddDealModal(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDeal} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'عنوان الصفقة *' : 'Deal Title *'}
                </label>
                <input
                  type="text"
                  value={dealForm.title}
                  onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                  placeholder="مثال: تعاقد فيلا بالم هيلز"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اختر العميل (الليد)' : 'Select Client'}
                </label>
                <select
                  value={dealForm.leadId}
                  onChange={(e) => setDealForm({ ...dealForm, leadId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  {(leadOptions.length > 0 ? leadOptions : leads).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName} ({l.projectInterest})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'قيمة التعاقد (EGP)' : 'Contract Value (EGP)'}
                </label>
                <input
                  type="number"
                  value={dealForm.dealValue}
                  onChange={(e) =>
                    setDealForm({ ...dealForm, dealValue: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddDealModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'حفظ الصفقة' : 'Save Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
