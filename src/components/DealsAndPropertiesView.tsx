import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Briefcase,
  Plus,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  X,
  Search,
  Sparkles,
  FileText,
  ExternalLink,
  Percent,
  Calendar,
  Layers,
  Award,
  Edit3,
  Trash2,
  FolderKanban,
  LayoutGrid,
  Image as ImageIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Deal,
  Lead,
  PropertyUnit,
  RealEstateProject,
  Role,
  UserProfile,
} from '../types/crm';
import { Lang, translations } from '../i18n/translations';
import { apiRequest } from '../services/api';

type DealStage = Deal['stage'];

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatching: number;
}

interface DealsAndPropertiesViewProps {
  lang: Lang;
  currentUser: UserProfile;
  currentRole: Role;
  users: UserProfile[];
  leads: Lead[];
  properties: PropertyUnit[];
  deals: Deal[];
  projects: string[];
  projectsCatalog?: RealEstateProject[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
  forcedSubTab?: 'deals' | 'properties';
}

const DEAL_STAGES: DealStage[] = [
  'Reservation',
  'Contract Review',
  'Down Payment',
  'Closed Won',
  'Cancelled',
];

const DEAL_STAGE_LABELS: Record<DealStage, { ar: string; en: string }> = {
  Reservation: { ar: 'حجز مبدئي (Reservation)', en: 'Reservation' },
  'Contract Review': { ar: 'مراجعة العقود (Contract Review)', en: 'Contract Review' },
  'Down Payment': { ar: 'سداد المقدم (Down Payment)', en: 'Down Payment' },
  'Closed Won': { ar: 'تعاقد مكتمل (Closed Won)', en: 'Closed Won' },
  Cancelled: { ar: 'ملغاة (Cancelled)', en: 'Cancelled' },
};

const PROJECT_TYPE_OPTIONS = [
  { value: 'Residential', labelAr: 'سكني (Residential)', labelEn: 'Residential' },
  { value: 'Commercial', labelAr: 'تجاري (Commercial)', labelEn: 'Commercial' },
  { value: 'Administrative', labelAr: 'إداري (Administrative)', labelEn: 'Administrative' },
  { value: 'Medical', labelAr: 'طبي (Medical)', labelEn: 'Medical' },
  { value: 'Coastal', labelAr: 'ساحلي / مصيفي (Coastal)', labelEn: 'Coastal' },
  { value: 'Mixed Use', labelAr: 'متعدد الاستخدامات (Mixed Use)', labelEn: 'Mixed Use' },
];

const PROJECT_STATUS_OPTIONS: {
  value: 'Active' | 'Launching Soon' | 'Sold Out';
  labelAr: string;
  labelEn: string;
  badgeClass: string;
}[] = [
  {
    value: 'Active',
    labelAr: 'متاح للبيع (Active)',
    labelEn: 'Active',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    value: 'Launching Soon',
    labelAr: 'قريباً اللونش (Launching Soon)',
    labelEn: 'Launching Soon',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    value: 'Sold Out',
    labelAr: 'مكتمل البيع (Sold Out)',
    labelEn: 'Sold Out',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-300',
  },
];

const AVAILABLE_UNIT_TYPES = [
  'شقق',
  'دوبلكس',
  'تاون هاوس',
  'توين هاوس',
  'فيلا مستقلة',
  'تجاري',
  'إداري',
  'طبي',
];

const FINISHING_OPTIONS = [
  'تشطيب كامل بالتكييفات والمطابخ',
  'تشطيب كامل سوبر لوكس',
  'نصف تشطيب (محارة وحلوق)',
  'طوب أحمر',
  'تشطيب فندقي مفروش',
];

interface ProjectFormState {
  id?: string;
  name: string;
  developer: string;
  location: string;
  projectType: string;
  status: 'Active' | 'Launching Soon' | 'Sold Out';
  unitTypes: string[];
  areaMinSqm: string;
  areaMaxSqm: string;
  priceMin: string;
  priceMax: string;
  pricePerSqm: string;
  downPaymentPercent: string;
  installmentYears: string;
  deliveryDate: string;
  finishingType: string;
  commissionPercent: string;
  maintenancePercent: string;
  brochureUrl: string;
  masterPlanImageUrl: string;
  facilities: string;
  sellingPoints: string;
  notes: string;
}

const createEmptyProjectForm = (): ProjectFormState => ({
  name: '',
  developer: '',
  location: '',
  projectType: 'Residential',
  status: 'Active',
  unitTypes: ['شقق', 'تاون هاوس', 'فيلا مستقلة'],
  areaMinSqm: '',
  areaMaxSqm: '',
  priceMin: '',
  priceMax: '',
  pricePerSqm: '',
  downPaymentPercent: '',
  installmentYears: '',
  deliveryDate: '',
  finishingType: 'تشطيب كامل سوبر لوكس',
  commissionPercent: '',
  maintenancePercent: '',
  brochureUrl: '',
  masterPlanImageUrl: '',
  facilities: '',
  sellingPoints: '',
  notes: '',
});

export const DealsAndPropertiesView: React.FC<DealsAndPropertiesViewProps> = ({
  lang,
  currentUser,
  currentRole,
  users,
  leads,
  properties,
  deals,
  projects,
  projectsCatalog = [],
  onRefresh,
  onToast,
  forcedSubTab,
}) => {
  const t = translations[lang];
  const isAr = lang === 'ar';
  const egpLabel = isAr ? 'ج.م' : 'EGP';

  const [subTab, setSubTab] = useState<'deals' | 'properties'>(forcedSubTab || 'properties');
  const [propertiesViewMode, setPropertiesViewMode] = useState<'projects_cards' | 'units_grid'>(
    'projects_cards'
  );
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);

  React.useEffect(() => {
    if (forcedSubTab) {
      setSubTab(forcedSubTab);
    }
  }, [forcedSubTab]);

  // Server-driven filter & pagination states for Deals
  const [dealSearch, setDealSearch] = useState('');
  const [debouncedDealSearch, setDebouncedDealSearch] = useState('');
  const [dealStageFilter, setDealStageFilter] = useState<string>('ALL');
  const [dealAgentFilter, setDealAgentFilter] = useState<string>('ALL');
  const [dealDateFrom, setDealDateFrom] = useState<string>('');
  const [dealDateTo, setDealDateTo] = useState<string>('');
  const [pagedDeals, setPagedDeals] = useState<Deal[]>(deals);
  const [dealsNextCursor, setDealsNextCursor] = useState<string | null>(null);
  const [dealsHasMore, setDealsHasMore] = useState<boolean>(false);
  const [dealsTotalMatching, setDealsTotalMatching] = useState<number>(deals.length);
  const [dealsSummary, setDealsSummary] = useState({
    totalCount: deals.length,
    totalPipelineValue: deals.reduce((s, d) => s + d.dealValue, 0),
    wonDealsValue: deals
      .filter((d) => d.stage === 'Closed Won')
      .reduce((s, d) => s + d.dealValue, 0),
  });
  const [isDealsLoading, setIsDealsLoading] = useState<boolean>(false);
  const [isDealsLoadingMore, setIsDealsLoadingMore] = useState<boolean>(false);

  // Lazy-loaded Lead options for the Add Deal modal
  const [leadOptions, setLeadOptions] = useState<Lead[]>([]);

  const [projectForm, setProjectForm] = useState<ProjectFormState>(createEmptyProjectForm);

  const [propForm, setPropForm] = useState({
    code: '',
    title: '',
    titleAr: '',
    projectName: projects[0] || 'ليدز مغتربين',
    developer: '',
    location: '',
    type: 'Villa' as PropertyUnit['type'],
    areaSqm: '' as string | number,
    bedrooms: '' as string | number,
    bathrooms: '' as string | number,
    price: '' as string | number,
    downPaymentPercent: '' as string | number,
    installmentYears: '' as string | number,
    deliveryYear: '' as string | number,
  });

  const [dealForm, setDealForm] = useState({
    title: '',
    leadId: leads[0]?.id || '',
    propertyId: properties[0]?.id || '',
    stage: 'Reservation' as DealStage,
    dealValue: 12000000,
    commissionPercent: 2.5,
    expectedCloseDate: new Date().toISOString().slice(0, 10),
  });

  const isAdmin = currentRole.id === 'role_admin' || currentUser.roleId === 'role_admin';
  const canAddProperty = isAdmin || currentRole.permissions?.properties?.add !== 'none';
  const canEditProperty = isAdmin || currentRole.permissions?.properties?.edit !== 'none';
  const canDeleteProperty = isAdmin || currentRole.permissions?.properties?.delete !== 'none';
  const canAddDeal = isAdmin || currentRole.permissions?.deals?.add !== 'none';
  const canEditDeal = isAdmin || currentRole.permissions?.deals?.edit !== 'none';

  // Merge rich projectsCatalog with any project names in `projects` so all projects appear as cards
  const mergedProjectsList: RealEstateProject[] = useMemo(() => {
    const byName = new Map<string, RealEstateProject>();
    projectsCatalog.forEach((item) => {
      if (item && item.name) {
        byName.set(item.name.trim(), item);
      }
    });
    projects.forEach((projName, idx) => {
      const clean = String(projName || '').trim();
      if (clean && !byName.has(clean)) {
        byName.set(clean, {
          id: `legacy_proj_${idx}_${clean}`,
          name: clean,
          status: 'Active',
          projectType: 'Residential',
          createdAt: new Date().toISOString(),
        });
      }
    });
    return Array.from(byName.values());
  }, [projectsCatalog, projects]);

  const allProjectNames = useMemo(() => {
    const set = new Set<string>();
    mergedProjectsList.forEach((p) => {
      if (p.name) set.add(p.name);
    });
    projects.forEach((p) => {
      if (p) set.add(p);
    });
    return Array.from(set);
  }, [mergedProjectsList, projects]);

  const filteredProjectsCatalog = useMemo(() => {
    return mergedProjectsList.filter((proj) => {
      if (projectFilter !== 'ALL' && proj.name !== projectFilter) return false;
      if (projectSearchQuery.trim()) {
        const q = projectSearchQuery.trim().toLowerCase();
        const hay = `${proj.name || ''} ${proj.developer || ''} ${proj.location || ''} ${
          proj.sellingPoints || ''
        } ${proj.facilities || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedProjectsList, projectFilter, projectSearchQuery]);

  // Debounce deal search input
  useEffect(() => {
    const tId = setTimeout(() => setDebouncedDealSearch(dealSearch.trim()), 250);
    return () => clearTimeout(tId);
  }, [dealSearch]);

  const fetchDealsPage = useCallback(
    async (cursorToLoad: string | null, append: boolean) => {
      if (append) {
        setIsDealsLoadingMore(true);
      } else {
        setIsDealsLoading(true);
      }
      try {
        const params = new URLSearchParams();
        params.set('limit', '30');
        if (cursorToLoad) params.set('cursor', cursorToLoad);
        if (dealStageFilter !== 'ALL') params.set('stage', dealStageFilter);
        if (dealAgentFilter !== 'ALL') params.set('assignedTo', dealAgentFilter);
        if (projectFilter !== 'ALL') params.set('project', projectFilter);
        if (debouncedDealSearch) params.set('q', debouncedDealSearch);
        if (dealDateFrom) params.set('from', dealDateFrom);
        if (dealDateTo) params.set('to', dealDateTo);

        const res = await apiRequest<
          PaginatedResult<Deal> & {
            summary?: { totalCount: number; totalPipelineValue: number; wonDealsValue: number };
          }
        >(`/api/deals?${params.toString()}`);

        if (res && Array.isArray(res.items)) {
          setPagedDeals((prev) => (append ? [...prev, ...res.items] : res.items));
          setDealsNextCursor(res.nextCursor);
          setDealsHasMore(Boolean(res.hasMore));
          setDealsTotalMatching(res.totalMatching);
          if (res.summary) {
            setDealsSummary(res.summary);
          }
        }
      } catch {
        setPagedDeals(deals);
      } finally {
        setIsDealsLoading(false);
        setIsDealsLoadingMore(false);
      }
    },
    [
      dealStageFilter,
      dealAgentFilter,
      projectFilter,
      debouncedDealSearch,
      dealDateFrom,
      dealDateTo,
      deals,
    ]
  );

  useEffect(() => {
    if (subTab === 'deals') {
      fetchDealsPage(null, false);
    }
  }, [subTab, fetchDealsPage]);

  // Lazy load leads only when Add Deal modal opens
  useEffect(() => {
    if (!showAddDealModal) return;
    let active = true;
    apiRequest<PaginatedResult<Lead>>('/api/leads?limit=50')
      .then((res) => {
        if (active && res && Array.isArray(res.items)) {
          setLeadOptions(res.items);
          if (!dealForm.leadId && res.items[0]?.id) {
            setDealForm((prev) => ({ ...prev, leadId: res.items[0].id }));
          }
        }
      })
      .catch(() => {
        if (active) setLeadOptions(leads);
      });
    return () => {
      active = false;
    };
  }, [showAddDealModal, leads, dealForm.leadId]);

  const filteredProperties = properties.filter((p) => {
    if (projectFilter !== 'ALL' && p.projectName !== projectFilter) return false;
    if (projectSearchQuery.trim()) {
      const q = projectSearchQuery.trim().toLowerCase();
      const hay = `${p.titleAr || ''} ${p.title || ''} ${p.projectName || ''} ${p.code || ''} ${
        p.location || ''
      }`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const handleOpenAddProjectModal = () => {
    setProjectForm(createEmptyProjectForm());
    setShowProjectModal(true);
  };

  const handleOpenEditProjectModal = (proj: RealEstateProject) => {
    setProjectForm({
      id: proj.id.startsWith('legacy_proj_') ? undefined : proj.id,
      name: proj.name || '',
      developer: proj.developer || '',
      location: proj.location || '',
      projectType: proj.projectType || 'Residential',
      status: proj.status || 'Active',
      unitTypes: Array.isArray(proj.unitTypes) ? proj.unitTypes : [],
      areaMinSqm: proj.areaMinSqm !== undefined ? String(proj.areaMinSqm) : '',
      areaMaxSqm: proj.areaMaxSqm !== undefined ? String(proj.areaMaxSqm) : '',
      priceMin: proj.priceMin !== undefined ? String(proj.priceMin) : '',
      priceMax: proj.priceMax !== undefined ? String(proj.priceMax) : '',
      pricePerSqm: proj.pricePerSqm !== undefined ? String(proj.pricePerSqm) : '',
      downPaymentPercent:
        proj.downPaymentPercent !== undefined ? String(proj.downPaymentPercent) : '',
      installmentYears: proj.installmentYears !== undefined ? String(proj.installmentYears) : '',
      deliveryDate: proj.deliveryDate || '',
      finishingType: proj.finishingType || '',
      commissionPercent:
        proj.commissionPercent !== undefined ? String(proj.commissionPercent) : '',
      maintenancePercent:
        proj.maintenancePercent !== undefined ? String(proj.maintenancePercent) : '',
      brochureUrl: proj.brochureUrl || '',
      masterPlanImageUrl: proj.masterPlanImageUrl || '',
      facilities: proj.facilities || '',
      sellingPoints: proj.sellingPoints || '',
      notes: proj.notes || '',
    });
    setShowProjectModal(true);
  };

  const toggleProjectUnitType = (unitLabel: string) => {
    setProjectForm((prev) => {
      const exists = prev.unitTypes.includes(unitLabel);
      return {
        ...prev,
        unitTypes: exists
          ? prev.unitTypes.filter((u) => u !== unitLabel)
          : [...prev.unitTypes, unitLabel],
      };
    });
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProject(true);
    try {
      const payload = {
        name: projectForm.name.trim(),
        developer: projectForm.developer.trim(),
        location: projectForm.location.trim(),
        projectType: projectForm.projectType || 'Residential',
        status: projectForm.status || 'Active',
        unitTypes: projectForm.unitTypes,
        areaMinSqm: projectForm.areaMinSqm !== '' ? Number(projectForm.areaMinSqm) : undefined,
        areaMaxSqm: projectForm.areaMaxSqm !== '' ? Number(projectForm.areaMaxSqm) : undefined,
        priceMin: projectForm.priceMin !== '' ? Number(projectForm.priceMin) : undefined,
        priceMax: projectForm.priceMax !== '' ? Number(projectForm.priceMax) : undefined,
        pricePerSqm: projectForm.pricePerSqm !== '' ? Number(projectForm.pricePerSqm) : undefined,
        downPaymentPercent:
          projectForm.downPaymentPercent !== ''
            ? Number(projectForm.downPaymentPercent)
            : undefined,
        installmentYears:
          projectForm.installmentYears !== '' ? Number(projectForm.installmentYears) : undefined,
        deliveryDate: projectForm.deliveryDate.trim(),
        finishingType: projectForm.finishingType.trim(),
        commissionPercent:
          projectForm.commissionPercent !== ''
            ? Number(projectForm.commissionPercent)
            : undefined,
        maintenancePercent:
          projectForm.maintenancePercent !== ''
            ? Number(projectForm.maintenancePercent)
            : undefined,
        brochureUrl: projectForm.brochureUrl.trim(),
        masterPlanImageUrl: projectForm.masterPlanImageUrl.trim(),
        facilities: projectForm.facilities.trim(),
        sellingPoints: projectForm.sellingPoints.trim(),
        notes: projectForm.notes.trim(),
      };

      if (projectForm.id) {
        await apiRequest(`/api/projects-catalog/${projectForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onToast(
          isAr
            ? `✓ تم تحديث بيانات المشروع العقاري "${payload.name || ''}" بنجاح`
            : `✓ Project updated successfully`
        );
      } else {
        const res = await apiRequest('/api/projects-catalog', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const savedName = res?.project?.name || payload.name || 'مشروع جديد';
        onToast(
          isAr
            ? `✓ تم إضافة المشروع العقاري "${savedName}" وحفظه في النظام بنجاح`
            : `✓ Added new project "${savedName}" successfully`
        );
      }
      setShowProjectModal(false);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async (proj: RealEstateProject) => {
    if (proj.id.startsWith('legacy_proj_')) {
      onToast(
        isAr
          ? 'هذا المشروع مرتبط بعملاء حاليين في النظام الأساسي'
          : 'This project is linked to active leads'
      );
      return;
    }
    try {
      await apiRequest(`/api/projects-catalog/${proj.id}`, {
        method: 'DELETE',
      });
      onToast(
        isAr
          ? `تم حذف بطاقة المشروع "${proj.name}"`
          : `Deleted project "${proj.name}"`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanTitleAr = propForm.titleAr.trim() || propForm.title.trim() || 'وحدة عقارية جديدة';
      await apiRequest('/api/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propForm,
          titleAr: cleanTitleAr,
          title: propForm.title.trim() || cleanTitleAr,
          projectName: propForm.projectName.trim() || allProjectNames[0] || 'ليدز مغتربين',
          areaSqm: Number(propForm.areaSqm) || 0,
          bedrooms: Number(propForm.bedrooms) || 0,
          bathrooms: Number(propForm.bathrooms) || 0,
          price: Number(propForm.price) || 0,
          downPaymentPercent: Number(propForm.downPaymentPercent) || 0,
          installmentYears: Number(propForm.installmentYears) || 0,
          deliveryYear: Number(propForm.deliveryYear) || new Date().getFullYear(),
        }),
      });
      onToast(isAr ? 'تمت إضافة الوحدة العقارية بنجاح' : 'Property unit added');
      setShowAddPropertyModal(false);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/deals', {
        method: 'POST',
        body: JSON.stringify(dealForm),
      });
      onToast(isAr ? 'تم إنشاء الصفقة العقارية بنجاح' : 'Deal created successfully');
      setShowAddDealModal(false);
      onRefresh();
      fetchDealsPage(null, false);
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleUpdateDealStage = async (dealId: string, stage: DealStage) => {
    if (!canEditDeal) return;
    try {
      await apiRequest(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({ stage }),
      });
      onToast(isAr ? 'تم تحديث مرحلة الصفقة' : 'Deal stage updated');
      onRefresh();
      fetchDealsPage(null, false);
    } catch (err: any) {
      onToast(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {!forcedSubTab ? (
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setSubTab('properties')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  subTab === 'properties'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>{t.nav.properties}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono-tabular">
                  {mergedProjectsList.length}
                </span>
              </button>
              <button
                onClick={() => setSubTab('deals')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  subTab === 'deals'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>{isAr ? 'خط الصفقات والتعاقدات' : 'Deals Pipeline'}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-mono-tabular">
                  {dealsSummary.totalCount}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                {subTab === 'deals' ? (
                  <Briefcase className="w-5 h-5" />
                ) : (
                  <Building2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  {subTab === 'deals'
                    ? isAr
                      ? 'إدارة الصفقات والتعاقدات العقارية'
                      : 'Real Estate Deals & Contracts'
                    : isAr
                    ? 'دليل المشروعات العقارية والوحدات المتاحة'
                    : 'Real Estate Projects & Units Catalog'}
                </h2>
                <p className="text-xs text-slate-500">
                  {subTab === 'deals'
                    ? isAr
                      ? `إجمالي الصفقات المسجلة: ${dealsSummary.totalCount}`
                      : `Total Deals: ${dealsSummary.totalCount}`
                    : isAr
                    ? `${mergedProjectsList.length} مشروع عقاري مسجل · ${properties.length} وحدة تفصيلية`
                    : `${mergedProjectsList.length} Projects · ${properties.length} Units`}
                </p>
              </div>
            </div>
          )}

          {/* Switcher inside Properties Tab: Projects Cards vs Detailed Units */}
          {subTab === 'properties' && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setPropertiesViewMode('projects_cards')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  propertiesViewMode === 'projects_cards'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>{isAr ? 'بطاقات المشروعات العقارية' : 'Projects Catalog'}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono-tabular ${
                    propertiesViewMode === 'projects_cards'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {mergedProjectsList.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPropertiesViewMode('units_grid')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  propertiesViewMode === 'units_grid'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isAr ? 'الوحدات التفصيلية' : 'Detailed Units'}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono-tabular ${
                    propertiesViewMode === 'units_grid'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {properties.length}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {subTab === 'properties' && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث باسم المشروع، المطور، المنطقة...'
                    : 'Search project, developer, area...'
                }
                className="ps-8 pe-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600 w-52 sm:w-64"
              />
            </div>
          )}

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
          >
            <option value="ALL">{isAr ? 'كل المشروعات العقارية' : 'All Projects'}</option>
            {allProjectNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {subTab === 'properties' && canAddProperty && (
            <>
              <button
                type="button"
                onClick={handleOpenAddProjectModal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isAr ? '+ إضافة مشروع عقاري جديد' : '+ Add New Project'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPropForm((prev) => ({
                    ...prev,
                    projectName:
                      projectFilter !== 'ALL'
                        ? projectFilter
                        : allProjectNames[0] || 'ليدز مغتربين',
                  }));
                  setShowAddPropertyModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? '+ إضافة وحدة عقارية' : '+ Add Property Unit'}</span>
              </button>
            </>
          )}

          {subTab === 'deals' && canAddDeal && (
            <button
              onClick={() => setShowAddDealModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل صفقة جديدة' : 'Create New Deal'}</span>
            </button>
          )}
        </div>
      </div>

      {subTab === 'deals' ? (
        <div className="space-y-6">
          {/* Deal KPI Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {isAr ? 'إجمالي قيمة الصفقات الجارية' : 'Total Pipeline Value'}
                </div>
                <div className="text-2xl font-bold text-slate-900 font-mono-tabular mt-1">
                  {(dealsSummary.totalPipelineValue / 1000000).toFixed(1)}M{' '}
                  <span className="text-xs font-normal text-slate-500">{egpLabel}</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {isAr ? 'المبيعات المغلقة بنجاح (Closed Won)' : 'Closed Won Volume'}
                </div>
                <div className="text-2xl font-bold text-emerald-700 font-mono-tabular mt-1">
                  {(dealsSummary.wonDealsValue / 1000000).toFixed(1)}M{' '}
                  <span className="text-xs font-normal text-slate-500">{egpLabel}</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {isAr ? 'عدد الصفقات النشطة' : 'Active Deals Count'}
                </div>
                <div className="text-2xl font-bold text-slate-900 font-mono-tabular mt-1">
                  {dealsTotalMatching}
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Server-Side Deals Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={dealSearch}
                onChange={(e) => setDealSearch(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث بعنوان الصفقة، العميل، أو الوحدة...'
                    : 'Search deal title, client, or unit...'
                }
                className="w-full ps-9 pe-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <select
              value={dealStageFilter}
              onChange={(e) => setDealStageFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
            >
              <option value="ALL">{isAr ? 'كل مراحل الصفقات' : 'All Stages'}</option>
              {DEAL_STAGES.map((st) => (
                <option key={st} value={st}>
                  {isAr ? DEAL_STAGE_LABELS[st]?.ar || st : DEAL_STAGE_LABELS[st]?.en || st}
                </option>
              ))}
            </select>

            <select
              value={dealAgentFilter}
              onChange={(e) => setDealAgentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
            >
              <option value="ALL">{isAr ? 'كل مسؤولي المبيعات' : 'All Agents'}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>{isAr ? 'من:' : 'From:'}</span>
              <input
                type="date"
                value={dealDateFrom}
                onChange={(e) => setDealDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono-tabular"
              />
              <span>{isAr ? 'إلى:' : 'To:'}</span>
              <input
                type="date"
                value={dealDateTo}
                onChange={(e) => setDealDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono-tabular"
              />
            </div>
          </div>

          {isDealsLoading && (
            <div className="text-center py-3 text-xs font-semibold text-blue-600">
              {isAr ? 'جاري تحميل الصفقات...' : 'Loading deals...'}
            </div>
          )}

          {/* Deals Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الصفقة والعميل' : 'Deal & Client'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الوحدة والمشروع' : 'Property & Project'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'قيمة التعاقد' : 'Deal Value'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'العمولة' : 'Commission'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'مسؤول المبيعات' : 'Sales Rep'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'مرحلة الصفقة' : 'Deal Stage'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pagedDeals.map((deal) => {
                    const agent = users.find((u) => u.id === deal.assignedTo);
                    const commissionAmount = Math.round(
                      (deal.dealValue * (deal.commissionPercent || 2.5)) / 100
                    );
                    return (
                      <tr key={deal.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{deal.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{deal.leadName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">{deal.propertyName}</div>
                          <div className="text-[11px] text-blue-600 font-semibold">{deal.projectName}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono-tabular font-bold text-slate-900">
                          {deal.dealValue.toLocaleString()} {egpLabel}
                        </td>
                        <td className="py-3.5 px-4 font-mono-tabular text-emerald-700 font-semibold">
                          {commissionAmount.toLocaleString()} {egpLabel} ({deal.commissionPercent}%)
                        </td>
                        <td className="py-3.5 px-4">
                          {agent ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={agent.avatarUrl}
                                alt={agent.fullName}
                                referrerPolicy="no-referrer"
                                className="w-6 h-6 rounded-full object-cover"
                              />
                              <span className="font-medium text-slate-700">{agent.fullName}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            disabled={!canEditDeal}
                            value={deal.stage}
                            onChange={(e) =>
                              handleUpdateDealStage(deal.id, e.target.value as DealStage)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                              deal.stage === 'Closed Won'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : deal.stage === 'Cancelled'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {DEAL_STAGES.map((st) => (
                              <option key={st} value={st}>
                                {isAr ? DEAL_STAGE_LABELS[st]?.ar || st : DEAL_STAGE_LABELS[st]?.en || st}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {dealsHasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={isDealsLoadingMore}
                onClick={() => fetchDealsPage(dealsNextCursor, true)}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDealsLoadingMore
                  ? isAr
                    ? 'جاري تحميل المزيد...'
                    : 'Loading more...'
                  : isAr
                  ? `عرض المزيد من الصفقات (${pagedDeals.length} من ${dealsTotalMatching})`
                  : `Load More Deals (${pagedDeals.length} of ${dealsTotalMatching})`}
              </button>
            </div>
          )}
        </div>
      ) : propertiesViewMode === 'projects_cards' ? (
        /* Real Estate Projects Catalog Cards View */
        <div className="space-y-5">
          {filteredProjectsCatalog.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-slate-900">
                {isAr
                  ? 'لا توجد مشاريع عقارية مطابقة للبحث الحالي'
                  : 'No matching real estate projects found'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isAr
                  ? 'يمكنك إضافة مشروع عقاري جديد بضغطة واحدة (يكفي كتابة اسم المشروع فقط أو إدخال كافة التفاصيل الاختيارية مثل الأسعار وأنظمة السداد ونقاط البيع القوية).'
                  : 'Click "+ Add New Project" to create a real estate project card.'}
              </p>
              {canAddProperty && (
                <button
                  type="button"
                  onClick={handleOpenAddProjectModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? '+ إضافة مشروع عقاري جديد' : '+ Add New Project'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredProjectsCatalog.map((proj) => {
                const statusMeta =
                  PROJECT_STATUS_OPTIONS.find((s) => s.value === proj.status) ||
                  PROJECT_STATUS_OPTIONS[0];
                const typeMeta = PROJECT_TYPE_OPTIONS.find((tOpt) => tOpt.value === proj.projectType);
                const projectUnitsCount = properties.filter(
                  (u) => u.projectName === proj.name
                ).length;
                const projectLeadsCount = leads.filter(
                  (l) => l.projectInterest === proj.name
                ).length;

                return (
                  <div
                    key={proj.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 transition-all overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md"
                  >
                    <div>
                      {/* Card Top Banner / Master Plan Preview */}
                      <div className="relative h-32 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 text-white p-4 flex flex-col justify-between overflow-hidden">
                        {proj.masterPlanImageUrl && (
                          <img
                            src={proj.masterPlanImageUrl}
                            alt={proj.name}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover opacity-35"
                          />
                        )}
                        <div className="relative z-10 flex items-center justify-between gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${statusMeta.badgeClass}`}
                          >
                            {isAr ? statusMeta.labelAr : statusMeta.labelEn}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md bg-white/15 backdrop-blur-xs text-white text-[10px] font-semibold">
                            {typeMeta
                              ? isAr
                                ? typeMeta.labelAr
                                : typeMeta.labelEn
                              : proj.projectType || (isAr ? 'سكني' : 'Residential')}
                          </span>
                        </div>

                        <div className="relative z-10">
                          <h3 className="text-base font-extrabold text-white truncate">
                            {proj.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-blue-100 mt-0.5">
                            {proj.developer && (
                              <span className="font-semibold truncate">
                                🏢 {proj.developer}
                              </span>
                            )}
                            {proj.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0 text-blue-300" />
                                {proj.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-5 space-y-4">
                        {/* Available Unit Types Badges */}
                        {Array.isArray(proj.unitTypes) && proj.unitTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {proj.unitTypes.map((uType) => (
                              <span
                                key={uType}
                                className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/70 text-[10px] font-bold"
                              >
                                {uType}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Key Financial & Area Metrics Grid */}
                        <div className="grid grid-cols-2 gap-2.5 bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400 font-semibold">
                              {isAr ? 'الأسعار تبدأ من' : 'Starting Price'}
                            </div>
                            <div className="font-extrabold text-blue-700 font-mono-tabular mt-0.5">
                              {proj.priceMin
                                ? `${proj.priceMin.toLocaleString()} ${egpLabel}`
                                : isAr
                                ? 'غير محدد بعد'
                                : 'TBD'}
                            </div>
                            {proj.pricePerSqm ? (
                              <div className="text-[10px] text-slate-500 font-mono-tabular">
                                {isAr ? 'سعر المتر:' : 'Per m²:'}{' '}
                                {proj.pricePerSqm.toLocaleString()} {egpLabel}
                              </div>
                            ) : null}
                          </div>

                          <div>
                            <div className="text-[10px] text-slate-400 font-semibold">
                              {isAr ? 'المساحات المتاحة' : 'Areas Range'}
                            </div>
                            <div className="font-bold text-slate-800 font-mono-tabular mt-0.5">
                              {proj.areaMinSqm || proj.areaMaxSqm
                                ? `${proj.areaMinSqm || '?'} - ${proj.areaMaxSqm || '?'} م²`
                                : isAr
                                ? 'متنوعة'
                                : 'Various'}
                            </div>
                            {proj.finishingType && (
                              <div className="text-[10px] text-slate-500 truncate">
                                {proj.finishingType}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-[10px] text-slate-400 font-semibold">
                              {isAr ? 'نظام السداد' : 'Payment Plan'}
                            </div>
                            <div className="font-bold text-emerald-700 font-mono-tabular mt-0.5">
                              {proj.downPaymentPercent !== undefined ||
                              proj.installmentYears !== undefined
                                ? `${
                                    proj.downPaymentPercent !== undefined
                                      ? `مقدم ${proj.downPaymentPercent}%`
                                      : ''
                                  }${
                                    proj.downPaymentPercent !== undefined &&
                                    proj.installmentYears !== undefined
                                      ? ' · '
                                      : ''
                                  }${
                                    proj.installmentYears !== undefined
                                      ? `حتى ${proj.installmentYears} سنوات`
                                      : ''
                                  }`
                                : isAr
                                ? 'أنظمة مرنة'
                                : 'Flexible'}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] text-slate-400 font-semibold">
                              {isAr ? 'الاستلام والعمولة' : 'Delivery & Comm.'}
                            </div>
                            <div className="font-bold text-slate-800 mt-0.5 truncate">
                              {proj.deliveryDate || (isAr ? 'متاح' : 'Available')}
                              {proj.commissionPercent !== undefined && (
                                <span className="ms-1.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-mono-tabular">
                                  {isAr ? `عمولة ${proj.commissionPercent}%` : `${proj.commissionPercent}% Comm.`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Selling Points (USP) & Facilities */}
                        {(proj.sellingPoints || proj.facilities || proj.notes) && (
                          <div className="space-y-1.5 text-xs bg-amber-50/50 border border-amber-200/70 rounded-xl p-3">
                            {proj.sellingPoints && (
                              <div>
                                <span className="font-bold text-amber-900 flex items-center gap-1 text-[11px]">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  {isAr ? 'نقاط البيع القوية (USP):' : 'Selling Points (USP):'}
                                </span>
                                <p className="text-slate-700 text-[11px] leading-relaxed mt-0.5 line-clamp-2">
                                  {proj.sellingPoints}
                                </p>
                              </div>
                            )}
                            {proj.facilities && (
                              <div className="text-[11px] text-slate-600 line-clamp-2">
                                <strong className="text-slate-800">
                                  {isAr ? 'الخدمات والمميزات: ' : 'Facilities: '}
                                </strong>
                                {proj.facilities}
                              </div>
                            )}
                            {proj.notes && !proj.sellingPoints && (
                              <div className="text-[11px] text-slate-600 line-clamp-2">
                                {proj.notes}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Stats Row: Linked Leads & Units */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                          <span className="flex items-center gap-1 font-semibold">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            {isAr
                              ? `${projectLeadsCount} عميل مهتم بالمشروع`
                              : `${projectLeadsCount} Interested Leads`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setProjectFilter(proj.name);
                              setPropertiesViewMode('units_grid');
                            }}
                            className="text-blue-600 hover:underline font-bold cursor-pointer"
                          >
                            {isAr
                              ? `${projectUnitsCount} وحدات مسجلة ←`
                              : `${projectUnitsCount} Units →`}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {proj.brochureUrl ? (
                          <a
                            href={proj.brochureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>{isAr ? 'البروشور / Drive' : 'Brochure / Drive'}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {isAr ? 'بدون رابط بروشور' : 'No brochure URL'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {canAddProperty && (
                          <button
                            type="button"
                            onClick={() => {
                              setPropForm((prev) => ({
                                ...prev,
                                projectName: proj.name,
                                developer: proj.developer || '',
                                location: proj.location || '',
                              }));
                              setShowAddPropertyModal(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold cursor-pointer"
                            title={isAr ? 'إضافة وحدة داخل هذا المشروع' : 'Add unit in this project'}
                          >
                            {isAr ? '+ وحدة' : '+ Unit'}
                          </button>
                        )}
                        {canEditProperty && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditProjectModal(proj)}
                            className="p-1.5 rounded-lg bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 cursor-pointer"
                            title={isAr ? 'تعديل واستكمال بيانات المشروع' : 'Edit project details'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteProperty && !proj.id.startsWith('legacy_proj_') && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProject(proj)}
                            className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 cursor-pointer"
                            title={isAr ? 'حذف المشروع' : 'Delete project'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Detailed Property Units Catalog Grid */
        <div className="space-y-4">
          {filteredProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-slate-900">
                {isAr ? 'لا توجد وحدات عقارية مسجلة في هذا الفلتر' : 'No property units found'}
              </div>
              {canAddProperty && (
                <button
                  type="button"
                  onClick={() => setShowAddPropertyModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? '+ إضافة وحدة عقارية' : '+ Add Property Unit'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProperties.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono-tabular font-bold">
                        {prop.code}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          prop.status === 'Available'
                            ? 'bg-emerald-50 text-emerald-700'
                            : prop.status === 'Reserved'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
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

                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {isAr ? prop.titleAr : prop.title}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold mt-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{prop.projectName}</span>
                        {prop.developer ? <span>· {prop.developer}</span> : null}
                      </div>
                      {prop.location ? (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          <span>{prop.location}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono-tabular">{prop.areaSqm || 0} m²</span>
                      </div>
                      {prop.bedrooms > 0 && (
                        <div className="flex items-center gap-1.5">
                          <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono-tabular">{prop.bedrooms}</span>
                        </div>
                      )}
                      {prop.bathrooms > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Bath className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono-tabular">{prop.bathrooms}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400">
                        {isAr ? 'السعر الإجمالي' : 'Total Price'}
                      </div>
                      <div className="text-sm font-bold text-slate-900 font-mono-tabular">
                        {(prop.price || 0).toLocaleString()} {egpLabel}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[10px] text-slate-400">
                        {isAr ? 'خطة السداد' : 'Payment Plan'}
                      </div>
                      <div className="text-xs font-semibold text-blue-600 font-mono-tabular">
                        {prop.downPaymentPercent || 0}% DP · {prop.installmentYears || 0} Yrs
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Professional 4-Section Real Estate Project Entry Modal (All Detailed Fields Optional) */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-l from-slate-900 via-blue-950 to-indigo-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold">
                    {projectForm.id
                      ? isAr
                        ? 'تعديل واستكمال بيانات المشروع العقاري'
                        : 'Edit Real Estate Project'
                      : isAr
                      ? 'لوحة إدخال بيانات مشروع عقاري جديد'
                      : 'Add New Real Estate Project'}
                  </h3>
                  <p className="text-[11px] text-blue-200 font-medium mt-0.5">
                    {isAr
                      ? '(جميع الحقول التفصيلية اختيارية — يمكنك إدخال المتاح لديك الآن واستكمال الباقي لاحقاً)'
                      : '(All detailed fields are optional — fill what you have now and complete the rest later)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body (4 Organized Sections) */}
            <form
              onSubmit={handleSaveProject}
              className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs"
            >
              {/* Optional Notice Banner */}
              <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-blue-900 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {isAr
                      ? 'حفظ مرن وسريع: يكفي كتابة اسم المشروع فقط للحفظ الفوري، أو يمكنك تعبئة تفاصيل الأسعار والمساحات وأنظمة السداد لمساعدة فريق السيلز.'
                      : 'Flexible Save: Only the project name is needed to save immediately, or fill any available details below.'}
                  </span>
                </div>
              </div>

              {/* Section 1: الهوية والموقع الأساسي */}
              <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-[11px]">
                    1
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {isAr
                      ? 'القسم الأول: الهوية والموقع الأساسي للمشروع'
                      : 'Section 1: Core Project Identity & Location'}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block font-bold text-slate-800 mb-1">
                      {isAr ? 'اسم المشروع العقاري' : 'Project Name'}
                    </label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      placeholder={
                        isAr
                          ? 'مثال: كمبوند بالم هيلز التجمع / مول إداري...'
                          : 'e.g. Palm Hills New Cairo'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 focus:border-blue-600 focus:outline-none font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'اسم شركة التطوير العقاري (اختياري)' : 'Developer Name (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={projectForm.developer}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, developer: e.target.value })
                      }
                      placeholder={isAr ? 'مثال: إعمار / سوديك / ماونتن فيو...' : 'e.g. Emaar Misr'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'الموقع / المدينة / المنطقة (اختياري)' : 'Location / City (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={projectForm.location}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, location: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? 'مثال: التجمع الخامس - الجولدن سكوير / العاصمة الإدارية'
                          : 'e.g. New Cairo - Golden Square'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'تصنيف المشروع (اختياري)' : 'Project Classification'}
                    </label>
                    <select
                      value={projectForm.projectType}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, projectType: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none font-medium"
                    >
                      {PROJECT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isAr ? opt.labelAr : opt.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'حالة الطرح والمبيعات (اختياري)' : 'Launch Status'}
                    </label>
                    <select
                      value={projectForm.status}
                      onChange={(e) =>
                        setProjectForm({
                          ...projectForm,
                          status: e.target.value as 'Active' | 'Launching Soon' | 'Sold Out',
                        })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none font-medium"
                    >
                      {PROJECT_STATUS_OPTIONS.map((st) => (
                        <option key={st.value} value={st.value}>
                          {isAr ? st.labelAr : st.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: الوحدات والمساحات والأسعار */}
              <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-[11px]">
                    2
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {isAr
                      ? 'القسم الثاني: أنواع الوحدات والمساحات والأسعار (اختياري)'
                      : 'Section 2: Unit Types, Areas & Pricing (Optional)'}
                  </h4>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-2">
                    {isAr
                      ? 'أنواع الوحدات المتاحة بالمشروع (يمكنك اختيار أكثر من نوع)'
                      : 'Available Unit Types (Multi-select)'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_UNIT_TYPES.map((unitLabel) => {
                      const active = projectForm.unitTypes.includes(unitLabel);
                      return (
                        <button
                          key={unitLabel}
                          type="button"
                          onClick={() => toggleProjectUnitType(unitLabel)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active ? `✓ ${unitLabel}` : `+ ${unitLabel}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'أقل مساحة (م²)' : 'Min Area (m²)'}
                    </label>
                    <input
                      type="number"
                      value={projectForm.areaMinSqm}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, areaMinSqm: e.target.value })
                      }
                      placeholder="90"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'أكبر مساحة (م²)' : 'Max Area (m²)'}
                    </label>
                    <input
                      type="number"
                      value={projectForm.areaMaxSqm}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, areaMaxSqm: e.target.value })
                      }
                      placeholder="450"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'الأسعار تبدأ من (ج.م)' : 'Starting Price (EGP)'}
                    </label>
                    <input
                      type="number"
                      value={projectForm.priceMin}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, priceMin: e.target.value })
                      }
                      placeholder="4500000"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'الأسعار تصل إلى (ج.م)' : 'Max Price (EGP)'}
                    </label>
                    <input
                      type="number"
                      value={projectForm.priceMax}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, priceMax: e.target.value })
                      }
                      placeholder="25000000"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'متوسط سعر المتر (ج.م)' : 'Avg Price / m²'}
                    </label>
                    <input
                      type="number"
                      value={projectForm.pricePerSqm}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, pricePerSqm: e.target.value })
                      }
                      placeholder="55000"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: أنظمة السداد والاستلام والعمولة */}
              <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                  <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-[11px]">
                    3
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {isAr
                      ? 'القسم الثالث: أنظمة السداد والاستلام والعمولة (اختياري)'
                      : 'Section 3: Payment Plan, Delivery & Commission (Optional)'}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'أقل مقدم تعاقد (%)' : 'Min Down Payment (%)'}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={projectForm.downPaymentPercent}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, downPaymentPercent: e.target.value })
                      }
                      placeholder="10"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'أطول فترة تقسيط (سنوات)' : 'Max Installment Years'}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={projectForm.installmentYears}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, installmentYears: e.target.value })
                      }
                      placeholder="8"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'موعد / سنة الاستلام' : 'Delivery Date / Year'}
                    </label>
                    <input
                      type="text"
                      value={projectForm.deliveryDate}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, deliveryDate: e.target.value })
                      }
                      placeholder={isAr ? 'مثال: استلام فوري / 2027 / خلال 3 سنوات' : 'e.g. Ready to Move / 2027'}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'نوع التشطيب' : 'Finishing Type'}
                    </label>
                    <input
                      type="text"
                      list="finishing-options-list"
                      value={projectForm.finishingType}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, finishingType: e.target.value })
                      }
                      placeholder={isAr ? 'تشطيب كامل / نصف تشطيب...' : 'Fully Finished / Core & Shell'}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                    />
                    <datalist id="finishing-options-list">
                      {FINISHING_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'وديعة الصيانة (%)' : 'Maintenance Deposit (%)'}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={projectForm.maintenancePercent}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, maintenancePercent: e.target.value })
                      }
                      placeholder="8"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr
                        ? 'نسبة عمولة المبيعات / البروكر (%)'
                        : 'Sales / Broker Commission (%)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={projectForm.commissionPercent}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, commissionPercent: e.target.value })
                      }
                      placeholder="3.5"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: ملفات المبيعات ونقاط القوة */}
              <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                  <span className="w-6 h-6 rounded-lg bg-amber-600 text-white font-bold flex items-center justify-center text-[11px]">
                    4
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {isAr
                      ? 'القسم الرابع: ملفات المبيعات ونقاط القوة (USP) (اختياري)'
                      : 'Section 4: Sales Collateral & Selling Points (Optional)'}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr
                        ? 'رابط البروشور أو فولدر Google Drive للمشروع'
                        : 'Brochure / Google Drive Folder URL'}
                    </label>
                    <input
                      type="url"
                      value={projectForm.brochureUrl}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, brochureUrl: e.target.value })
                      }
                      placeholder="https://drive.google.com/..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr
                        ? 'رابط صورة المشروع / الماستر بلان (اختياري)'
                        : 'Project / Master Plan Image URL'}
                    </label>
                    <input
                      type="url"
                      value={projectForm.masterPlanImageUrl}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, masterPlanImageUrl: e.target.value })
                      }
                      placeholder="https://..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr
                        ? 'نقاط البيع القوية (USP) لمساعدة السيلز في الإقناع'
                        : 'Key Selling Points (USP) for Sales Pitch'}
                    </label>
                    <textarea
                      rows={2}
                      value={projectForm.sellingPoints}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, sellingPoints: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? 'مثال: مباشر على محور بن زايد، أقل نسبة تحميل، خصم كاش 35%، استلام فوري...'
                          : 'e.g. Prime location, 0% down payment offer, high ROI...'
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr
                        ? 'الخدمات والمميزات الرئيسية بالمشروع'
                        : 'Main Facilities & Amenities'}
                    </label>
                    <textarea
                      rows={2}
                      value={projectForm.facilities}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, facilities: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? 'مثال: كلوب هاوس، حمامات سباحة، منطقة تجارية، أمن ذكي 24/7، كريستال لاجون...'
                          : 'e.g. Clubhouse, Crystal Lagoons, Commercial Strip, 24/7 Security...'
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'ملاحظات إضافية عامة' : 'General Notes'}
                    </label>
                    <input
                      type="text"
                      value={projectForm.notes}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, notes: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? 'أي تعليمات إضافية لفريق المبيعات بخصوص الطرح أو الأسعار...'
                          : 'Any additional notes for the sales team...'
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingProject}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSavingProject
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : projectForm.id
                    ? isAr
                      ? 'حفظ تعديلات المشروع العقاري'
                      : 'Save Project Changes'
                    : isAr
                    ? 'حفظ وإضافة المشروع العقاري الآن'
                    : 'Save & Add Project Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Property Unit Modal (All Sub-Fields Optional) */}
      {showAddPropertyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? 'إضافة وحدة عقارية جديدة' : 'Add New Property Unit'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'جميع الحقول التفصيلية اختيارية — أدخل المتاح لديك الآن'
                    : 'All detailed fields are optional'}
                </p>
              </div>
              <button
                onClick={() => setShowAddPropertyModal(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProperty} className="mt-4 grid grid-cols-2 gap-3.5 text-xs">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم/وصف الوحدة بالعربية (اختياري)' : 'Unit Title (Optional)'}
                </label>
                <input
                  type="text"
                  value={propForm.titleAr}
                  onChange={(e) => setPropForm({ ...propForm, titleAr: e.target.value })}
                  placeholder="مثال: فيلا تاون هاوس كورنر بحديقة"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'المشروع العقاري (اختياري)' : 'Project Name (Optional)'}
                </label>
                <input
                  type="text"
                  list="projects-autocomplete-list"
                  value={propForm.projectName}
                  onChange={(e) => setPropForm({ ...propForm, projectName: e.target.value })}
                  placeholder={isAr ? 'اختر أو اكتب اسم المشروع' : 'Select or type project'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
                <datalist id="projects-autocomplete-list">
                  {allProjectNames.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'كود الوحدة (اختياري)' : 'Unit Code (Optional)'}
                </label>
                <input
                  type="text"
                  value={propForm.code}
                  onChange={(e) => setPropForm({ ...propForm, code: e.target.value })}
                  placeholder="UNIT-101"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'السعر الإجمالي (EGP) (اختياري)' : 'Total Price (EGP) (Optional)'}
                </label>
                <input
                  type="number"
                  value={propForm.price}
                  onChange={(e) => setPropForm({ ...propForm, price: e.target.value })}
                  placeholder="6500000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'المساحة (متر مربع) (اختياري)' : 'Area (sqm) (Optional)'}
                </label>
                <input
                  type="number"
                  value={propForm.areaSqm}
                  onChange={(e) => setPropForm({ ...propForm, areaSqm: e.target.value })}
                  placeholder="185"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'نسبة المقدم (%) (اختياري)' : 'Down Payment (%) (Optional)'}
                </label>
                <input
                  type="number"
                  value={propForm.downPaymentPercent}
                  onChange={(e) =>
                    setPropForm({ ...propForm, downPaymentPercent: e.target.value })
                  }
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'سنوات التقسيط (اختياري)' : 'Installment Years (Optional)'}
                </label>
                <input
                  type="number"
                  value={propForm.installmentYears}
                  onChange={(e) =>
                    setPropForm({ ...propForm, installmentYears: e.target.value })
                  }
                  placeholder="8"
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
                  {isAr ? 'عنوان الصفقة' : 'Deal Title'}
                </label>
                <input
                  type="text"
                  value={dealForm.title}
                  onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                  placeholder="مثال: تعاقد فيلا بالم هيلز"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
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
