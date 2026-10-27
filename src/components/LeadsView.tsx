import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  ArrowLeftRight,
  Download,
  Phone,
  MessageSquare,
  Trash2,
  Edit3,
  X,
  CheckSquare,
  Square,
  LayoutList,
  Columns,
  LayoutGrid,
  Clock,
  Sparkles,
  Calendar,
  Building2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Send,
  UserCheck,
  Filter,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { Lead, LeadStatus, PropertyUnit, Role, UserProfile } from '../types/crm';
import { Lang, translations } from '../i18n/translations';
import { apiRequest } from '../services/api';

interface LeadsViewProps {
  lang: Lang;
  currentUser: UserProfile;
  currentRole: Role;
  users: UserProfile[];
  leads: Lead[];
  properties?: PropertyUnit[];
  projects: string[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead | null) => void;
  onRefresh: () => void;
  showTransferModal: boolean;
  setShowTransferModal: (v: boolean) => void;
  onToast: (msg: string) => void;
  onQuickSyncSheets?: () => void;
  isSyncingSheets?: boolean;
}

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Site Visit Scheduled',
  'Negotiation',
  'Won',
  'Lost',
  'Unqualified',
];

export const COMPACT_META_STATUSES: LeadStatus[] = [
  'New',
  'Qualified',
  'Won',
  'Lost',
  'Unqualified',
];

interface StageMetaConfig {
  shortAr: string;
  shortEn: string;
  emptyTitleAr: string;
  emptyTitleEn: string;
  emptyDescAr: string;
  emptyDescEn: string;
  badgeType: 'spinner' | 'check' | 'cross' | 'none';
  pct: number;
  color: string;
  bg: string;
  text: string;
  border: string;
}

const STAGE_META: Record<LeadStatus, StageMetaConfig> = {
  New: {
    shortAr: 'مسجل',
    shortEn: 'Registered',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "مسجل"',
    emptyTitleEn: 'No leads in "Registered" stage',
    emptyDescAr: 'سيظهر هنا العملاء المحتملون الجدد أو الذين تفاعلوا مؤخرًا مع صفحتك أو شيت الإعلانات.',
    emptyDescEn: 'New inbound leads from Meta Ads or Google Sheets will appear here.',
    badgeType: 'spinner',
    pct: 15,
    color: 'bg-blue-600',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  Contacted: {
    shortAr: 'قيد المتابعة',
    shortEn: 'In Progress',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "قيد المتابعة"',
    emptyTitleEn: 'No leads in "In Progress" stage',
    emptyDescAr: 'انقل العملاء المحتملين إلى هذه المرحلة عند بدء المكالمات الهاتفية أو إرسال تفاصيل المشروع عبر واتساب.',
    emptyDescEn: 'Move leads here once initial phone or WhatsApp contact has started.',
    badgeType: 'spinner',
    pct: 35,
    color: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  Qualified: {
    shortAr: 'مؤهل',
    shortEn: 'Qualified',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "مؤهل"',
    emptyTitleEn: 'No leads in "Qualified" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة إذا كانوا يولون اهتمامًا كبيرًا بالمنتجات أو الخدمات التي تقدمها ومن المحتمل أن يكونوا مناسبين لنشاطك التجاري.',
    emptyDescEn:
      'Move leads to this stage if they show strong interest in your properties and fit your target criteria.',
    badgeType: 'none',
    pct: 55,
    color: 'bg-indigo-600',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
  },
  'Site Visit Scheduled': {
    shortAr: 'معاينة مجدولة',
    shortEn: 'Site Visit',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "معاينة مجدولة"',
    emptyTitleEn: 'No leads in "Site Visit" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة عند تحديد موعد زيارة ميدانية لموقع المشروع العقاري.',
    emptyDescEn: 'Move leads here when an on-site property inspection is scheduled.',
    badgeType: 'none',
    pct: 75,
    color: 'bg-purple-600',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  Negotiation: {
    shortAr: 'تفاوض',
    shortEn: 'Negotiation',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "تفاوض"',
    emptyTitleEn: 'No leads in "Negotiation" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة أثناء التفاوض على خطة السداد ونسبة المقدم واختيار الوحدة.',
    emptyDescEn: 'Move leads here while negotiating payment plans and down payment terms.',
    badgeType: 'none',
    pct: 90,
    color: 'bg-cyan-600',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
  },
  Won: {
    shortAr: 'تم التحويل',
    shortEn: 'Converted',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "تم التحويل"',
    emptyTitleEn: 'No leads in "Converted" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة إذا أجروا اتفاقية أو معاملة مع نشاطك التجاري.',
    emptyDescEn: 'Move leads to this stage once they complete a deal or contract.',
    badgeType: 'check',
    pct: 100,
    color: 'bg-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  Lost: {
    shortAr: 'مفقود',
    shortEn: 'Lost',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "مفقود"',
    emptyTitleEn: 'No leads in "Lost" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة إذا أنهوا المحادثات معك. ويمكنك إعادة التفاعل معهم أو الاحتفاظ بهم للحملات الإعلانية المستقبلية التي تستند إلى إعادة الاستهداف.',
    emptyDescEn:
      'Move leads here if they ended conversations. You can re-engage them later in retargeting campaigns.',
    badgeType: 'none',
    pct: 0,
    color: 'bg-slate-500',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
  },
  Unqualified: {
    shortAr: 'غير مؤهل',
    shortEn: 'Unqualified',
    emptyTitleAr: 'لا يوجد عملاء محتملون بمرحلة "غير مؤهل"',
    emptyTitleEn: 'No leads in "Unqualified" stage',
    emptyDescAr:
      'انقل العملاء المحتملين إلى هذه المرحلة إذا لم يعودوا مناسبين لنشاطك التجاري.',
    emptyDescEn: 'Move leads to this stage if they are not a fit for your business.',
    badgeType: 'cross',
    pct: 0,
    color: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
};

/**
 * Custom SVG Empty Column Illustration matching Reference Image `image_445ed453.png`
 * Renders the 3 stacked cards (top grey card, middle glowing blue gradient card with badge, bottom grey card).
 */
const StageEmptyIllustration: React.FC<{ badgeType: StageMetaConfig['badgeType'] }> = ({
  badgeType,
}) => {
  return (
    <svg
      width="150"
      height="112"
      viewBox="0 0 150 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto mb-3 select-none"
    >
      <defs>
        <linearGradient id="metaBlueCard" x1="25" y1="36" x2="125" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6BB8FF" />
          <stop offset="55%" stopColor="#A9D7FF" />
          <stop offset="100%" stopColor="#E1F1FF" />
        </linearGradient>
        <linearGradient id="greyCardGrad" x1="42" y1="6" x2="108" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D5DCE6" />
          <stop offset="100%" stopColor="#F1F4F9" />
        </linearGradient>
      </defs>

      {/* Top Small Grey Card */}
      <rect
        x="42"
        y="6"
        width="66"
        height="22"
        rx="5"
        fill="url(#greyCardGrad)"
        stroke="#B8C2CC"
        strokeWidth="1.2"
      />
      <circle cx="52" cy="17" r="4.5" fill="#FFFFFF" />
      <rect x="61" y="15" width="16" height="4" rx="2" fill="#9AA5B1" />

      {/* Bottom Small Grey Card */}
      <rect
        x="42"
        y="84"
        width="66"
        height="22"
        rx="5"
        fill="url(#greyCardGrad)"
        stroke="#B8C2CC"
        strokeWidth="1.2"
      />
      <circle cx="52" cy="95" r="4.5" fill="#FFFFFF" />
      <rect x="61" y="93" width="16" height="4" rx="2" fill="#9AA5B1" />

      {/* Center Highlighted Blue Card (Shadow + Border) */}
      <rect
        x="24"
        y="37"
        width="102"
        height="38"
        rx="8"
        fill="#1E62B5"
      />
      <rect
        x="23"
        y="35"
        width="102"
        height="38"
        rx="8"
        fill="url(#metaBlueCard)"
        stroke="#529BE6"
        strokeWidth="1.2"
      />

      {/* White Avatar Circle & Blue Bars inside Middle Card */}
      <circle cx="38" cy="54" r="7.5" fill="#FFFFFF" />
      <rect x="53" y="48" width="28" height="4.5" rx="2.25" fill="#DCEEFF" />
      <rect x="53" y="57" width="18" height="5.5" rx="2" fill="#0B5FCC" />

      {/* Right-side Badge on Middle Card (Spinner / Check / Cross) */}
      {badgeType === 'spinner' && (
        <g transform="translate(115, 44)">
          <circle cx="0" cy="0" r="10.5" fill="#FFFFFF" stroke="#8ABFF5" strokeWidth="1.3" />
          <circle
            cx="0"
            cy="0"
            r="6.5"
            stroke="#0B5FCC"
            strokeWidth="1.8"
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        </g>
      )}

      {badgeType === 'check' && (
        <g transform="translate(115, 44)">
          <circle cx="0" cy="0" r="10.5" fill="#FFFFFF" stroke="#8ABFF5" strokeWidth="1.3" />
          <path
            d="M-4.5 0.5L-1.2 3.8L5.2 -3.2"
            stroke="#0B5FCC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {badgeType === 'cross' && (
        <g transform="translate(115, 44)">
          <circle cx="0" cy="0" r="10.5" fill="#FFFFFF" stroke="#8ABFF5" strokeWidth="1.3" />
          <path
            d="M-4 -4L4 4M4 -4L-4 4"
            stroke="#0B5FCC"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
};

const QUICK_FOLLOWUP_TEMPLATES = [
  {
    type: 'call' as const,
    labelAr: '📞 تم الاتصال - العميل مهتم وطلب عرض أسعار',
    labelEn: '📞 Called - Interested & requested offer',
    summaryAr:
      'تم الاتصال الهاتفي بالعميل، أبدى اهتماماً قوياً بالمشروع وطلب إرسال المخططات وخطة السداد عبر واتساب.',
    summaryEn:
      'Phone call completed. Client showed strong interest and requested floor plans & payment plan via WhatsApp.',
    suggestedStatus: 'Qualified' as LeadStatus,
  },
  {
    type: 'whatsapp' as const,
    labelAr: '💬 إرسال البروشور وخطة السداد عبر واتساب',
    labelEn: '💬 Sent Brochure & Payment Plan via WhatsApp',
    summaryAr:
      'تم إرسال بروشور المشروع والأسعار المحدثة وجدول الأقساط عبر واتساب وفي انتظار رد العميل.',
    summaryEn:
      'Sent project brochure, updated price list, and installment schedule via WhatsApp.',
    suggestedStatus: 'Contacted' as LeadStatus,
  },
  {
    type: 'visit' as const,
    labelAr: '📅 تأكيد موعد معاينة ميدانية للمشروع',
    labelEn: '📅 Confirmed Site Visit Appointment',
    summaryAr:
      'تم الاتفاق مع العميل على موعد معاينة ميدانية لموقع المشروع لاستعراض الوحدات المتاحة على الطبيعة.',
    summaryEn: 'Confirmed on-site property inspection appointment with the client.',
    suggestedStatus: 'Site Visit Scheduled' as LeadStatus,
  },
  {
    type: 'call' as const,
    labelAr: '⏳ لم يتم الرد (No Answer) - إعادة محاولة',
    labelEn: '⏳ No Answer - Schedule Retry',
    summaryAr:
      'تم الاتصال بالعميل أكثر من مرة ولم يتم الرد، تم إرسال رسالة تعريفية قصيرة وجدولة متابعة غداً.',
    summaryEn:
      'Called client with no answer. Sent intro message and scheduled follow-up for tomorrow.',
    suggestedStatus: 'Contacted' as LeadStatus,
  },
  {
    type: 'note' as const,
    labelAr: '✕ العميل غير مناسب / خارج الميزانية',
    labelEn: '✕ Client Unqualified / Out of Budget',
    summaryAr:
      'بعد التواصل تبين أن ميزانية العميل أو طلبه العقاري غير متوافق حالياً مع الوحدات المطروحة.',
    summaryEn: 'Client requirements or budget do not match current property inventory.',
    suggestedStatus: 'Unqualified' as LeadStatus,
  },
];

export const LeadsView: React.FC<LeadsViewProps> = ({
  lang,
  currentUser,
  currentRole,
  users,
  leads,
  properties = [],
  projects,
  selectedLead,
  onSelectLead,
  onRefresh,
  showTransferModal,
  setShowTransferModal,
  onToast,
  onQuickSyncSheets,
  isSyncingSheets = false,
}) => {
  const isAr = lang === 'ar';
  const t = translations[lang];

  // Default view mode is 'cards_list' so all leads are immediately visible and easy to work with on mobile & desktop
  const [viewMode, setViewMode] = useState<'board' | 'cards_list' | 'profile_grid'>('cards_list');
  // Toggle between the 5 exact columns in image_445ed453.png vs all 8 detailed real-estate columns
  const [boardColumnsMode, setBoardColumnsMode] = useState<'meta_5' | 'full_8'>('meta_5');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [followUpQueue, setFollowUpQueue] = useState<
    'ALL' | 'URGENT_NEW' | 'TODAY_FOLLOWUP' | 'VIP_BUDGET'
  >('ALL');

  // Drag & Drop State (`نقل بالإمساك`)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, LeadStatus>>({});
  const [hoveredStageInfo, setHoveredStageInfo] = useState<LeadStatus | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<Lead | null>(null);
  const [lastChangedLeadId, setLastChangedLeadId] = useState<string | null>(null);
  const [quickNoteLead, setQuickNoteLead] = useState<Lead | null>(null);
  const [quickNoteText, setQuickNoteText] = useState<string>('');
  const [isSavingQuickNote, setIsSavingQuickNote] = useState<boolean>(false);

  // Client Data Drawer Active Tab (`لوحة بيانات العميل`)
  const [drawerTab, setDrawerTab] = useState<'profile_data' | 'followup' | 'history'>('profile_data');
  const [clientPanelForm, setClientPanelForm] = useState({
    fullName: '',
    phone: '',
    secondaryPhone: '',
    email: '',
    source: '',
    campaignName: '',
    projectInterest: '',
    propertyType: 'Villa' as Lead['propertyType'],
    budgetMin: 0,
    budgetMax: 0,
    status: 'New' as LeadStatus,
    priority: 'High' as Lead['priority'],
    assignedTo: '',
    notes: '',
    nextFollowUpAt: '',
    formResponses: [] as { question: string; answer: string }[],
  });
  const [panelTransferNote, setPanelTransferNote] = useState('');

  // Sync clientPanelForm whenever selectedLead changes
  useEffect(() => {
    if (selectedLead) {
      setClientPanelForm({
        fullName: selectedLead.fullName || '',
        phone: selectedLead.phone || '',
        secondaryPhone: selectedLead.secondaryPhone || '',
        email: selectedLead.email || '',
        source: selectedLead.source || 'Google Drive - شيت CRM1',
        campaignName: selectedLead.campaignName || '',
        projectInterest: selectedLead.projectInterest || '',
        propertyType: selectedLead.propertyType || 'Apartment',
        budgetMin: Number(selectedLead.budgetMin) || 0,
        budgetMax: Number(selectedLead.budgetMax) || 0,
        status: optimisticStatuses[selectedLead.id] || selectedLead.status,
        priority: selectedLead.priority || 'High',
        assignedTo: selectedLead.assignedTo || currentUser.id,
        notes: selectedLead.notes || '',
        nextFollowUpAt:
          selectedLead.nextFollowUpAt || new Date().toISOString().slice(0, 10),
        formResponses: Array.isArray(selectedLead.formResponses)
          ? selectedLead.formResponses
          : [],
      });
    }
  }, [selectedLead, optimisticStatuses, projects, currentUser.id]);

  // Transfer Modal state
  const [transferFromUser, setTransferFromUser] = useState<string>('');
  const [transferToUser, setTransferToUser] = useState<string>(
    users.find((u) => u.roleId === 'role_employee')?.id || users[0]?.id || ''
  );
  const [transferReason, setTransferReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);

  // Follow-up Activity Form state inside Drawer
  const [activityType, setActivityType] = useState<'call' | 'whatsapp' | 'visit' | 'note'>('call');
  const [activitySummary, setActivitySummary] = useState('');
  const [activityNewStatus, setActivityNewStatus] = useState<string>('');
  const [activityNextDate, setActivityNextDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [activityFollowUpTime, setActivityFollowUpTime] = useState<string>('13:00');
  const [scheduleCalendarEvent, setScheduleCalendarEvent] = useState<boolean>(true);
  const [timelineFilter, setTimelineFilter] = useState<string>('ALL');

  // New / Edit Lead Modal Form state
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    secondaryPhone: '',
    email: '',
    source: 'Google Drive - شيت CRM1',
    campaignName: '',
    projectInterest: projects[0] || '',
    propertyType: 'Villa' as Lead['propertyType'],
    budgetMin: 0,
    budgetMax: 0,
    status: 'New' as LeadStatus,
    priority: 'High' as Lead['priority'],
    assignedTo: currentUser.id,
    notes: '',
    nextFollowUpAt: new Date().toISOString().slice(0, 10),
  });

  // Permissions checks
  const canAdd = currentRole.id === 'role_admin' || currentRole.permissions?.leads?.add !== 'none';
  const canEdit =
    currentRole.id === 'role_admin' ||
    currentRole.permissions?.leads?.edit !== 'none' ||
    (currentRole.id === 'role_observer' && currentRole.permissions?.leads?.editWhenObserver);
  const canDelete =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.delete !== 'none';
  const canExport =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.export !== 'none';
  const canTransfer =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.transfer !== 'none';
  const canSyncSheets =
    currentRole.id === 'role_admin' || currentRole.permissions?.sheets_sync?.import !== 'none';

  const todayStr = new Date().toISOString().slice(0, 10);

  // Apply strict RBAC scope + optimistic status overrides
  const scopedLeads =
    currentRole.id !== 'role_admin' && currentRole.permissions?.leads?.read === 'own'
      ? leads.filter((l) => l.assignedTo === currentUser.id)
      : leads;

  const effectiveLeads = scopedLeads.map((l) =>
    optimisticStatuses[l.id] ? { ...l, status: optimisticStatuses[l.id] } : l
  );

  // Queue counts
  const urgentNewLeadsCount = effectiveLeads.filter(
    (l) => l.status === 'New' && !l.lastContactedAt
  ).length;
  const todayFollowUpCount = effectiveLeads.filter(
    (l) =>
      l.nextFollowUpAt &&
      l.nextFollowUpAt <= todayStr &&
      !['Won', 'Lost', 'Unqualified'].includes(l.status)
  ).length;
  const vipBudgetCount = effectiveLeads.filter(
    (l) => (Number(l.budgetMax) || 0) >= 15000000
  ).length;

  // Filtered Leads
  const filteredLeads = effectiveLeads.filter((l) => {
    if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
    if (agentFilter !== 'ALL' && l.assignedTo !== agentFilter) return false;
    if (projectFilter !== 'ALL' && l.projectInterest !== projectFilter) return false;

    if (followUpQueue === 'URGENT_NEW' && !(l.status === 'New' && !l.lastContactedAt)) return false;
    if (
      followUpQueue === 'TODAY_FOLLOWUP' &&
      !(
        l.nextFollowUpAt &&
        l.nextFollowUpAt <= todayStr &&
        !['Won', 'Lost', 'Unqualified'].includes(l.status)
      )
    )
      return false;
    if (followUpQueue === 'VIP_BUDGET' && (Number(l.budgetMax) || 0) < 15000000) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        l.fullName.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.projectInterest.toLowerCase().includes(q) ||
        l.campaignName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalLeadsCount = effectiveLeads.length;
  const contactedOrFurtherCount = effectiveLeads.filter((l) => l.status !== 'New').length;
  const followUpCompletionRate =
    totalLeadsCount > 0 ? Math.round((contactedOrFurtherCount / totalLeadsCount) * 100) : 0;
  const totalBudgetVolume = filteredLeads.reduce((sum, l) => sum + (Number(l.budgetMax) || 0), 0);

  const salesTeam = users.filter(
    (u) =>
      u.roleId === 'role_employee' ||
      u.roleId === 'role_supervisor' ||
      u.roleId === 'role_deputy'
  );

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getUserName = (userId: string) => {
    return users.find((u) => u.id === userId)?.fullName || (isAr ? 'غير معين' : 'Unassigned');
  };

  const getInitials = (name: string) => {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase() || 'C'
    );
  };

  /**
   * Fast 1-tap note logging saved directly to Firebase
   */
  const handleSaveQuickNote = async () => {
    if (!quickNoteLead || !quickNoteText.trim()) return;
    setIsSavingQuickNote(true);
    try {
      await apiRequest(`/api/leads/${quickNoteLead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          summary: quickNoteText.trim(),
        }),
      });
      setLastChangedLeadId(quickNoteLead.id);
      setTimeout(() => setLastChangedLeadId((cur) => (cur === quickNoteLead.id ? null : cur)), 4000);
      onToast(
        isAr
          ? `تم حفظ الملاحظة للعميل "${quickNoteLead.fullName}" في Firebase بنجاح ✓`
          : `Note saved to Firebase for "${quickNoteLead.fullName}" ✓`
      );
      setQuickNoteLead(null);
      setQuickNoteText('');
      onRefresh();
    } catch (err: any) {
      onToast(err.message || (isAr ? 'حدث خطأ أثناء حفظ الملاحظة' : 'Failed to save note'));
    } finally {
      setIsSavingQuickNote(false);
    }
  };

  /**
   * Instant Stage Change (Used by Drag & Drop, Card Stage Selector, and Client Data Panel)
   */
  const handleQuickStatusChange = async (lead: Lead, newStatus: LeadStatus) => {
    if (!canEdit) {
      onToast(isAr ? 'ليس لديك صلاحية لتعديل مرحلة العميل' : 'No permission to change stage');
      return;
    }
    if (lead.status === newStatus) return;

    // 1. Optimistic immediate UI update & glowing visual highlight
    setOptimisticStatuses((prev) => ({ ...prev, [lead.id]: newStatus }));
    setLastChangedLeadId(lead.id);
    setTimeout(() => setLastChangedLeadId((cur) => (cur === lead.id ? null : cur)), 4000);

    if (selectedLead?.id === lead.id) {
      onSelectLead({ ...selectedLead, status: newStatus });
    }

    try {
      const res = await apiRequest(`/api/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      if (selectedLead?.id === lead.id) {
        onSelectLead(res.lead);
      }
      const stageName = isAr ? STAGE_META[newStatus].shortAr : STAGE_META[newStatus].shortEn;
      onToast(
        newStatus === 'Won'
          ? isAr
            ? `تم نقل العميل "${lead.fullName}" إلى مرحلة (تم التحويل ✓) وحفظ التغييرات في Firebase!`
            : `Moved "${lead.fullName}" to Converted (Won) & saved to Firebase!`
          : isAr
          ? `تم نقل العميل "${lead.fullName}" إلى مرحلة "${stageName}" وحفظها في Firebase بنجاح ✓`
          : `Moved "${lead.fullName}" to "${stageName}" and saved to Firebase ✓`
      );
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on error
      setOptimisticStatuses((prev) => {
        const copy = { ...prev };
        delete copy[lead.id];
        return copy;
      });
      onToast(err.message);
    }
  };

  // Drag & Drop Handlers (`نقل بالإمساك`)
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    if (!canEdit) {
      e.preventDefault();
      onToast(isAr ? 'ليس لديك صلاحية لسحب وتغيير مرحلة العميل' : 'No permission to drag leads');
      return;
    }
    setDraggedLeadId(lead.id);
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverColumn = (e: React.DragEvent, stage: LeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDropOnColumn = async (e: React.DragEvent, targetStage: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    setDraggedLeadId(null);
    setDragOverStage(null);

    if (!leadId) return;
    const leadObj = effectiveLeads.find((l) => l.id === leadId);
    if (!leadObj) return;

    await handleQuickStatusChange(leadObj, targetStage);
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStage(null);
  };

  /**
   * Inline or Client-Panel Sales Rep Transfer
   */
  const handleInlineAssignChange = async (
    lead: Lead,
    newAgentId: string,
    handoverNote?: string
  ) => {
    if (!canTransfer) {
      onToast(isAr ? 'ليس لديك صلاحية لنقل الليدز بين السيلز' : 'No permission to transfer leads');
      return;
    }
    if (lead.assignedTo === newAgentId) return;

    try {
      const res = await apiRequest(`/api/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          assignedTo: newAgentId,
          notes: handoverNote
            ? `${lead.notes ? lead.notes + ' | ' : ''}ملاحظة نقل: ${handoverNote}`
            : lead.notes,
        }),
      });
      if (selectedLead?.id === lead.id) {
        onSelectLead(res.lead);
      }
      setLastChangedLeadId(lead.id);
      setTimeout(() => setLastChangedLeadId((cur) => (cur === lead.id ? null : cur)), 4000);
      setPanelTransferNote('');
      const targetName = getUserName(newAgentId);
      onToast(
        isAr
          ? `تم نقل العميل "${lead.fullName}" إلى مسؤول المبيعات (${targetName}) وحفظها في Firebase!`
          : `Transferred "${lead.fullName}" to ${targetName} and saved in Firebase!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  /**
   * Save Full Client Profile Data from inside the Client Data Panel (`لوحة بيانات العميل`)
   */
  const handleSaveClientPanelProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    if (!canEdit) {
      onToast(isAr ? 'ليس لديك صلاحية لتعديل بيانات العميل' : 'No permission to edit client');
      return;
    }

    try {
      const res = await apiRequest(`/api/leads/${selectedLead.id}`, {
        method: 'PUT',
        body: JSON.stringify(clientPanelForm),
      });
      onSelectLead(res.lead);
      onToast(
        isAr
          ? `تم حفظ وتحديث لوحة بيانات العميل "${res.lead.fullName}" بنجاح!`
          : `Client profile data saved successfully!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleQuickWhatsAppFollowUp = async (lead: Lead) => {
    try {
      const msgSummary = `إرسال عرض أسعار ومخططات مشروع (${lead.projectInterest} - ${lead.propertyType}) عبر واتساب للعميل على الرقم ${lead.phone}`;
      const res = await apiRequest(`/api/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'whatsapp',
          summary: msgSummary,
          newStatus: lead.status === 'New' ? 'Contacted' : undefined,
        }),
      });
      if (selectedLead?.id === lead.id) {
        onSelectLead(res.lead);
      }
      onToast(
        isAr
          ? `تم توثيق متابعة واتساب للعميل "${lead.fullName}"!`
          : `Logged WhatsApp follow-up for "${lead.fullName}"!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleQuickRecommendUnit = async (lead: Lead, unit: PropertyUnit) => {
    try {
      const summary = `تم ترشيح وإرسال عرض الوحدة العقارية (${
        isAr ? unit.titleAr : unit.title
      } - مشروع ${unit.projectName} - مساحة ${unit.areaSqm}م² - بسعر ${(
        unit.price / 1000000
      ).toFixed(1)}M EGP ومقدم ${unit.downPaymentPercent}%) للعميل.`;
      const res = await apiRequest(`/api/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'whatsapp',
          summary,
          newStatus: lead.status === 'New' ? 'Contacted' : lead.status,
        }),
      });
      onSelectLead(res.lead);
      onToast(
        isAr
          ? `تم إرسال وتوثيق عرض الوحدة (${unit.titleAr}) في سجل متابعة العميل!`
          : `Recommended unit (${unit.title}) and logged in lead timeline!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleAutoRebalance = async () => {
    setIsRebalancing(true);
    try {
      const res = await apiRequest('/api/leads/auto-distribute', {
        method: 'POST',
      });
      onToast(
        isAr
          ? `تم تعيين ${res.distributedCount} ليدز جديدة تلقائياً إلى مدير الـ CRM الثاني: حسن شحاتة (Hassan shehata)!`
          : `Assigned ${res.distributedCount} new leads automatically to 2nd CRM Manager (Hassan shehata)!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsRebalancing(false);
    }
  };

  const openCreateModal = (initialStatus: LeadStatus = 'New') => {
    setEditingLead(null);
    const hassanAdmin =
      users.find(
        (u) =>
          u.id === 'usr_admin2' ||
          String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
      ) || currentUser;
    const defaultAssigneeId =
      currentRole.permissions?.leads?.add === 'own' ? currentUser.id : hassanAdmin.id;
    setFormData({
      fullName: '',
      phone: '',
      secondaryPhone: '',
      email: '',
      source: 'Google Drive - شيت CRM1',
      campaignName: '',
      projectInterest: projects[0] || '',
      propertyType: 'Villa',
      budgetMin: 0,
      budgetMax: 0,
      status: initialStatus,
      priority: 'High',
      assignedTo: defaultAssigneeId,
      notes: '',
      nextFollowUpAt: new Date().toISOString().slice(0, 10),
    });
    setShowAddModal(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLead) {
        const res = await apiRequest(`/api/leads/${editingLead.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        if (selectedLead?.id === editingLead.id) {
          onSelectLead(res.lead);
        }
        onToast(isAr ? 'تم تحديث بيانات الليد بنجاح' : 'Lead updated successfully');
      } else {
        await apiRequest('/api/leads', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        onToast(isAr ? 'تمت إضافة العميل وتوجيهه للمندوب بنجاح' : 'New lead created and assigned');
      }
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteConfirmLead) return;
    try {
      await apiRequest(`/api/leads/${deleteConfirmLead.id}`, {
        method: 'DELETE',
      });
      if (selectedLead?.id === deleteConfirmLead.id) {
        onSelectLead(null);
      }
      setDeleteConfirmLead(null);
      onToast(isAr ? 'تم حذف العميل من قاعدة البيانات' : 'Lead deleted');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !activitySummary.trim()) return;
    try {
      const res = await apiRequest(`/api/leads/${selectedLead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: activityType,
          summary: activitySummary,
          newStatus: activityNewStatus || undefined,
          nextFollowUpAt: activityNextDate || undefined,
          followUpTime: activityFollowUpTime,
          scheduleCalendarEvent,
        }),
      });
      setActivitySummary('');
      setActivityNewStatus('');
      onSelectLead(res.lead);
      onToast(
        scheduleCalendarEvent
          ? isAr
            ? 'تم تسجيل المتابعة وتحديث المرحلة وإضافة الموعد في التقويم تلقائياً!'
            : 'Follow-up logged and scheduled on calendar!'
          : isAr
          ? 'تم تسجيل المتابعة وتحديث ملف العميل بنجاح'
          : 'Follow-up activity logged'
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTransferring(true);
    try {
      const res = await apiRequest('/api/leads/transfer', {
        method: 'POST',
        body: JSON.stringify({
          leadIds: selectedIds.length > 0 ? selectedIds : undefined,
          fromUserId: selectedIds.length === 0 ? transferFromUser : undefined,
          toUserId: transferToUser,
          reason: transferReason,
        }),
      });
      setSelectedIds([]);
      setTransferReason('');
      setShowTransferModal(false);
      onToast(
        isAr
          ? `تم نقل ${res.transferredCount} ليدز إلى ${res.toUser} وإرسال تنبيه فوري له!`
          : `Transferred ${res.transferredCount} lead(s) to ${res.toUser} with instant alert!`
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Full Name',
      'Phone',
      'Email',
      'Project Interest',
      'Property Type',
      'Budget Max (EGP)',
      'Status',
      'Assigned Sales Agent',
      'Next Follow-up',
      'Source',
      'Campaign',
      'Created At',
    ];
    const rows = filteredLeads.map((l) => [
      `"${l.fullName}"`,
      `"${l.phone}"`,
      `"${l.email || ''}"`,
      `"${l.projectInterest}"`,
      `"${l.propertyType}"`,
      l.budgetMax,
      `"${l.status}"`,
      `"${getUserName(l.assignedTo)}"`,
      `"${l.nextFollowUpAt || ''}"`,
      `"${l.source}"`,
      `"${l.campaignName}"`,
      `"${l.createdAt}"`,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `propsphere_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Matching units for the selected lead inside the Follow-up Drawer
  const matchingProperties = selectedLead
    ? properties.filter(
        (p) =>
          p.status === 'Available' &&
          (p.projectName === selectedLead.projectInterest ||
            Math.abs(p.price - selectedLead.budgetMax) <= 6000000)
      )
    : [];

  // Columns to display in the Drag & Drop Stage Board
  const activeBoardStages: LeadStatus[] =
    boardColumnsMode === 'meta_5' ? COMPACT_META_STATUSES : ALL_LEAD_STATUSES;

  // Helper to get leads belonging to a column in either 5-column Meta mode or 8-column Full mode
  const getLeadsForBoardColumn = (stage: LeadStatus): Lead[] => {
    if (boardColumnsMode === 'full_8') {
      return filteredLeads.filter((l) => l.status === stage);
    }
    // In 5-column Meta mode (`مسجل` | `مؤهل` | `تم التحويل` | `مفقود` | `غير مؤهل`),
    // map intermediate real-estate stages so no lead is ever hidden:
    if (stage === 'New') {
      return filteredLeads.filter((l) => l.status === 'New' || l.status === 'Contacted');
    }
    if (stage === 'Qualified') {
      return filteredLeads.filter((l) =>
        ['Qualified', 'Site Visit Scheduled', 'Negotiation'].includes(l.status)
      );
    }
    return filteredLeads.filter((l) => l.status === stage);
  };

  const scrollBoard = (dir: 'left' | 'right') => {
    if (!boardScrollRef.current) return;
    const offset = dir === 'left' ? -320 : 320;
    boardScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      {/* 1. Top Hero Control Banner for All Users (Admin, Supervisor, Sales Rep) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border-2 border-blue-500 p-0.5"
            />
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white absolute bottom-0 end-0" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">
                {isAr
                  ? `مركز إدارة ومتابعة العملاء المحتملين (Leads Center)`
                  : `Leads Management & Follow-up Center`}
              </h1>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md">
                {currentUser.fullName} · {isAr ? currentRole.nameAr : currentRole.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'اسحب بطاقة العميل بالماوس (إمساك وإفلات) لنقله بين المراحل فوراً، أو اضغط على العميل لفتح لوحة بياناته الكاملة.'
                : 'Grab and drag any client card across stages, or click a client to open their full Client Data Panel.'}
            </p>

            {/* Quick Action Buttons */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canAdd && (
                <button
                  onClick={() => openCreateModal('New')}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إضافة عميل محتمل جديد' : 'Add New Lead'}</span>
                </button>
              )}

              {canSyncSheets && onQuickSyncSheets && (
                <button
                  onClick={onQuickSyncSheets}
                  disabled={isSyncingSheets}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingSheets
                      ? isAr
                        ? 'جاري سحب الليدز...'
                        : 'Syncing...'
                      : isAr
                      ? 'استيراد من Google Sheets'
                      : 'Sync Google Sheets'}
                  </span>
                </button>
              )}

              {canTransfer && (
                <>
                  <button
                    onClick={handleAutoRebalance}
                    disabled={isRebalancing}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isRebalancing
                        ? isAr
                          ? 'جاري التعيين...'
                          : 'Assigning...'
                        : isAr
                        ? 'تعيين أوتوماتيك إلى Hassan shehata'
                        : 'Auto-Assign to Hassan shehata'}
                    </span>
                  </button>

                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {selectedIds.length > 0
                        ? isAr
                          ? `نقل المحدد (${selectedIds.length}) لسيلز آخر`
                          : `Transfer Selected (${selectedIds.length})`
                        : isAr
                        ? 'نقل الليدز بين السيلز'
                        : 'Transfer Leads'}
                    </span>
                  </button>
                </>
              )}

              {canExport && (
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.common.exportCsv}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4 Live KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 pt-4 xl:pt-0 border-t xl:border-t-0 border-slate-100">
          <div className="text-center xl:text-start">
            <div className="text-2xl font-bold text-slate-900 font-mono-tabular">
              {filteredLeads.length}
              <span className="text-xs font-normal text-slate-400 ms-1">/ {totalLeadsCount}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'العملاء المحتملون' : 'Active Leads'}
            </div>
          </div>

          <div className="text-center xl:text-start">
            <div className="text-2xl font-bold text-blue-600 font-mono-tabular">
              {followUpCompletionRate}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'معدل المتابعة والتأهيل' : 'Follow-up Rate'}
            </div>
          </div>

          <div className="text-center xl:text-start">
            <div className="text-2xl font-bold text-amber-600 font-mono-tabular">
              {urgentNewLeadsCount + todayFollowUpCount}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'متابعات مطلوبة اليوم' : 'Due Today'}
            </div>
          </div>

          <div className="text-center xl:text-start">
            <div className="text-lg font-bold text-emerald-600 font-mono-tabular">
              {(totalBudgetVolume / 1000000).toFixed(1)}M EGP
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isAr ? 'إجمالي الميزانيات' : 'Pipeline Volume'}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Sales Team Filter Strip (For Admin/Supervisor/Team to switch between sales reps' boards in 1 click) */}
      {currentRole.permissions?.leads?.read !== 'own' && salesTeam.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0 me-1">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'تصفية حسب السيلز:' : 'Filter by Sales Rep:'}</span>
            </span>

            <button
              onClick={() => setAgentFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                agentFilter === 'ALL'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {isAr ? `كل الفريق (${effectiveLeads.length})` : `All Team (${effectiveLeads.length})`}
            </button>

            {salesTeam.map((member) => {
              const memberLeads = effectiveLeads.filter((l) => l.assignedTo === member.id);
              const isSelectedAgent = agentFilter === member.id;
              return (
                <button
                  key={member.id}
                  onClick={() => setAgentFilter(isSelectedAgent ? 'ALL' : member.id)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-xl border text-xs shrink-0 transition-all cursor-pointer ${
                    isSelectedAgent
                      ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold shadow-xs'
                      : 'bg-[#F8FAFC] hover:bg-slate-100 border-slate-200/80 text-slate-800'
                  }`}
                >
                  <img
                    src={member.avatarUrl}
                    alt={member.fullName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                  <span>{member.fullName.split(' ')[0]}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono-tabular font-bold text-blue-600">
                    {memberLeads.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Priority Queue Pills */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'ALL', label: isAr ? 'الكل' : 'All', count: totalLeadsCount },
              {
                id: 'URGENT_NEW',
                label: isAr ? '🔔 بانتظار أول مكالمة' : '🔔 Awaiting 1st Call',
                count: urgentNewLeadsCount,
              },
              {
                id: 'TODAY_FOLLOWUP',
                label: isAr ? '📅 متابعات اليوم' : '📅 Due Today',
                count: todayFollowUpCount,
              },
              {
                id: 'VIP_BUDGET',
                label: isAr ? '💎 VIP (+15M)' : '💎 VIP (+15M)',
                count: vipBudgetCount,
              },
            ].map((q) => (
              <button
                key={q.id}
                onClick={() => setFollowUpQueue(q.id as any)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                  followUpQueue === q.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-600 border border-slate-200/70'
                }`}
              >
                {q.label} ({q.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2.5 Quick Stage Filter Strip (1-tap Access with Live Counts on Web & Mobile) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            statusFilter === 'ALL'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>{isAr ? 'كل العملاء' : 'All Leads'}</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono-tabular font-bold ${
              statusFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {effectiveLeads.length}
          </span>
        </button>

        {ALL_LEAD_STATUSES.map((st) => {
          const count = effectiveLeads.filter((l) => l.status === st).length;
          const meta = STAGE_META[st];
          const isSelected = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(statusFilter === st ? 'ALL' : st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border ${
                isSelected
                  ? `${meta.color} text-white border-transparent shadow-xs`
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : meta.color}`}></span>
              <span>{isAr ? meta.shortAr : meta.shortEn}</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono-tabular font-bold ${
                  isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Filter, Search & Board Columns Mode Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">{isAr ? 'كل المشاريع العقارية' : 'All Real Estate Projects'}</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">{isAr ? 'كل مراحل العملاء' : 'All Pipeline Stages'}</option>
            {ALL_LEAD_STATUSES.map((st) => (
              <option key={st} value={st}>
                {t.status[st]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
          {/* Toggle between 5-Stage Meta Columns (Exact Image) and 8-Stage Detailed Real Estate Columns */}
          {viewMode === 'board' && (
            <div className="flex items-center p-1 bg-[#F4F7FE] rounded-xl border border-slate-200/80">
              <button
                onClick={() => setBoardColumnsMode('meta_5')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  boardColumnsMode === 'meta_5'
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isAr ? 'المراحل الأساسية (5 مراحل)' : 'Standard Stages (5)'}
              </button>
              <button
                onClick={() => setBoardColumnsMode('full_8')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  boardColumnsMode === 'full_8'
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isAr ? 'المراحل العقارية التفصيلية (8 مراحل)' : 'Detailed Real Estate (8)'}
              </button>
            </div>
          )}

          {/* View Mode Switcher: Stage Board (Default) | Horizontal Row Cards | Profile Grid */}
          <div className="flex items-center p-1 bg-[#F4F7FE] rounded-xl border border-slate-200/80">
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{isAr ? 'لوحة المراحل (سحب وإفلات)' : 'Stage Board (Drag & Drop)'}</span>
            </button>
            <button
              onClick={() => setViewMode('cards_list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'cards_list'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>{isAr ? 'بطاقات أفقية' : 'Row Cards'}</span>
            </button>
            <button
              onClick={() => setViewMode('profile_grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'profile_grid'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{isAr ? 'شبكة العملاء' : 'Profile Grid'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAIN WORKSPACE: MODE A — Meta Leads Center Drag & Drop Stage Board (Exact match to image_445ed453.png + Real Estate Enhancements) */}
      {viewMode === 'board' ? (
        <div className="relative rounded-2xl bg-gradient-to-l from-[#EBF5F5] via-[#F2F5FB] to-[#F5EFF9] p-4 border border-slate-200/80 shadow-inner">
          {/* Board Horizontal Scroll Controls */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <GripVertical className="w-4 h-4 text-blue-600" />
              <span>
                {isAr
                  ? 'أمسك بطاقة أي عميل واسحبها بالماوس إلى العمود المطلوب لتغيير مرحلته فوراً، أو اضغط على البطاقة لفتح لوحة بيانات العميل.'
                  : 'Grab & drag any lead card into a column to update its stage, or click a card to open the Client Data Panel.'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => scrollBoard('right')}
                className="p-1.5 rounded-lg bg-white/90 hover:bg-white border border-slate-200 text-slate-600 shadow-2xs cursor-pointer"
                title={isAr ? 'تمرير لليمين' : 'Scroll Right'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollBoard('left')}
                className="p-1.5 rounded-lg bg-white/90 hover:bg-white border border-slate-200 text-slate-600 shadow-2xs cursor-pointer"
                title={isAr ? 'تمرير لليسار' : 'Scroll Left'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stage Columns Container */}
          <div
            ref={boardScrollRef}
            className={`flex gap-3.5 overflow-x-auto pb-3 ${
              boardColumnsMode === 'meta_5' ? 'xl:grid xl:grid-cols-5' : ''
            }`}
          >
            {activeBoardStages.map((stage, stageIdx) => {
              const stageLeads = getLeadsForBoardColumn(stage);
              const meta = STAGE_META[stage];
              const isDragTarget = dragOverStage === stage;
              const stageBudget = stageLeads.reduce(
                (sum, l) => sum + (Number(l.budgetMax) || 0),
                0
              );
              const prevStage = activeBoardStages[stageIdx - 1];
              const nextStage = activeBoardStages[stageIdx + 1];

              return (
                <div
                  key={stage}
                  onDragOver={(e) => handleDragOverColumn(e, stage)}
                  onDragLeave={() => {
                    if (dragOverStage === stage) setDragOverStage(null);
                  }}
                  onDrop={(e) => handleDropOnColumn(e, stage)}
                  className={`bg-white rounded-xl border transition-all flex flex-col min-h-[540px] ${
                    boardColumnsMode === 'meta_5'
                      ? 'min-w-[260px] xl:min-w-0'
                      : 'min-w-[285px] w-[285px] shrink-0'
                  } ${
                    isDragTarget
                      ? 'border-2 border-dashed border-blue-600 bg-blue-50/40 ring-4 ring-blue-500/10 scale-[1.01]'
                      : 'border-slate-200/90 shadow-xs'
                  }`}
                >
                  {/* Column Header (Exact layout from image_445ed453.png: Stage Name + solid Info icon on Right, Counter badge on Left) */}
                  <div className="p-4 pb-3 border-b border-slate-100 flex items-center justify-between relative">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-slate-900">
                        {isAr ? meta.shortAr : meta.shortEn}
                      </h3>
                      {/* Solid dark circle 'i' info icon matching image_445ed453.png */}
                      <div
                        onMouseEnter={() => setHoveredStageInfo(stage)}
                        onMouseLeave={() => setHoveredStageInfo(null)}
                        className="w-4 h-4 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center cursor-help select-none"
                      >
                        i
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {stageBudget > 0 && (
                        <span className="text-[10px] font-mono-tabular font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                          {(stageBudget / 1000000).toFixed(1)}M
                        </span>
                      )}
                      <span className="min-w-6 h-6 px-2 rounded-full bg-slate-100 text-slate-800 text-xs font-mono-tabular font-bold flex items-center justify-center">
                        {stageLeads.length}
                      </span>
                    </div>

                    {/* Hover Info Tooltip */}
                    {hoveredStageInfo === stage && (
                      <div className="absolute top-12 start-3 end-3 z-30 bg-slate-900 text-white text-[11px] p-3 rounded-xl shadow-lg leading-relaxed">
                        {isAr ? meta.emptyDescAr : meta.emptyDescEn}
                      </div>
                    )}
                  </div>

                  {/* Drop Hint Banner when Dragging */}
                  {isDragTarget && (
                    <div className="mx-3 mt-2.5 p-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold text-center animate-pulse">
                      {isAr
                        ? `أفلت البطاقة هنا لنقل العميل إلى "${meta.shortAr}"`
                        : `Drop card here to move to "${meta.shortEn}"`}
                    </div>
                  )}

                  {/* Column Body: Either Exact Empty State from image_445ed453.png OR Draggable Lead Cards */}
                  {stageLeads.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
                      <StageEmptyIllustration badgeType={meta.badgeType} />
                      <h4 className="text-xs font-bold text-slate-900 leading-snug mt-1">
                        {isAr ? meta.emptyTitleAr : meta.emptyTitleEn}
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5 max-w-[220px]">
                        {isAr ? meta.emptyDescAr : meta.emptyDescEn}
                      </p>
                      {stage === 'New' && canAdd && (
                        <button
                          onClick={() => openCreateModal('New')}
                          className="mt-2.5 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                        >
                          {isAr ? 'كيفية إضافة العملاء المحتملين' : 'How to add new leads'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                      {stageLeads.map((lead) => {
                        const assignedAgent = users.find((u) => u.id === lead.assignedTo);
                        const isBeingDragged = draggedLeadId === lead.id;
                        const needsUrgentCall =
                          lead.status === 'New' && !lead.lastContactedAt;
                        const callCount = (lead.activities || []).filter(
                          (a) => a.type === 'call'
                        ).length;
                        const waCount = (lead.activities || []).filter(
                          (a) => a.type === 'whatsapp'
                        ).length;

                        return (
                          <div
                            key={lead.id}
                            draggable={canEdit}
                            onDragStart={(e) => handleDragStart(e, lead)}
                            onDragEnd={handleDragEnd}
                            className={`group bg-white rounded-xl border p-3.5 transition-all select-none ${
                              canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                            } ${
                              isBeingDragged
                                ? 'opacity-50 scale-95 border-blue-500 ring-2 ring-blue-400'
                                : needsUrgentCall
                                ? 'border-amber-200/90 hover:border-blue-400 shadow-2xs hover:shadow-md'
                                : 'border-slate-200/90 hover:border-blue-400 shadow-2xs hover:shadow-md'
                            }`}
                          >
                            {/* Card Top Bar: Drag Grip + Priority + Direct Stage Dropdown */}
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                              <div className="flex items-center gap-1 text-slate-400">
                                <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                    lead.priority === 'High'
                                      ? 'bg-rose-50 text-rose-700'
                                      : lead.priority === 'Medium'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {lead.priority}
                                </span>
                                {needsUrgentCall && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">
                                    {isAr ? 'جديد' : 'New'}
                                  </span>
                                )}
                              </div>

                              {/* Direct Stage Select Dropdown on Card */}
                              <select
                                value={lead.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  handleQuickStatusChange(lead, e.target.value as LeadStatus)
                                }
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer focus:outline-none ${
                                  STAGE_META[lead.status]?.bg || 'bg-slate-100'
                                } ${STAGE_META[lead.status]?.text || 'text-slate-700'}`}
                              >
                                {ALL_LEAD_STATUSES.map((st) => (
                                  <option key={st} value={st} className="bg-white text-slate-800">
                                    {isAr ? STAGE_META[st].shortAr : STAGE_META[st].shortEn}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Client Name, Phone & Project (Click opens Client Data Panel) */}
                            <div
                              onClick={() => {
                                setDrawerTab('profile_data');
                                onSelectLead(lead);
                              }}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                  {getInitials(lead.fullName)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">
                                    {lead.fullName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono-tabular truncate">
                                    {lead.phone}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-2.5 p-2 rounded-lg bg-[#F8FAFC] border border-slate-100 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-800 truncate">
                                    {lead.projectInterest}
                                  </span>
                                  <span className="text-slate-500 shrink-0">{lead.propertyType}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono-tabular font-bold text-blue-600">
                                    {lead.budgetMax > 0
                                      ? `${(lead.budgetMax / 1000000).toFixed(1)}M EGP`
                                      : lead.source || 'CRM1'}
                                  </span>
                                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">
                                    CRM1 · {(lead.formResponses || []).length}{' '}
                                    {isAr ? 'إجابات فورم' : 'Form Q&A'}
                                  </span>
                                </div>

                                {/* Preview of Form Questions Answered in CRM1 Sheet */}
                                {lead.formResponses && lead.formResponses.length > 0 && (
                                  <div className="pt-1.5 border-t border-slate-200/70 space-y-1">
                                    {lead.formResponses.slice(0, 2).map((qa, qaIdx) => (
                                      <div
                                        key={qaIdx}
                                        className="text-[10px] text-slate-600 leading-snug truncate"
                                        title={`${qa.question}: ${qa.answer}`}
                                      >
                                        <span className="font-semibold text-slate-500">
                                          {qa.question}:{' '}
                                        </span>
                                        <span className="font-bold text-slate-800">{qa.answer}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Assigned Sales Rep Row (with Inline Transfer if permitted) */}
                            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {assignedAgent && (
                                  <img
                                    src={assignedAgent.avatarUrl}
                                    alt={assignedAgent.fullName}
                                    referrerPolicy="no-referrer"
                                    className="w-5 h-5 rounded-full object-cover shrink-0"
                                  />
                                )}
                                {canTransfer ? (
                                  <select
                                    value={lead.assignedTo}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleInlineAssignChange(lead, e.target.value)
                                    }
                                    className="text-[11px] font-semibold text-slate-700 hover:text-blue-600 bg-transparent cursor-pointer focus:outline-none truncate max-w-[125px]"
                                    title={isAr ? 'نقل العميل لسيلز آخر' : 'Transfer to another rep'}
                                  >
                                    {users.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.fullName.split(' ').slice(0, 2).join(' ')}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-slate-600 font-medium truncate">
                                    {assignedAgent?.fullName.split(' ')[0]}
                                  </span>
                                )}
                              </div>

                              {/* 1-Click Previous / Next Stage Arrows */}
                              {canEdit && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {prevStage && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickStatusChange(lead, prevStage);
                                      }}
                                      title={
                                        isAr
                                          ? `إرجاع إلى: ${STAGE_META[prevStage].shortAr}`
                                          : `Move back to ${STAGE_META[prevStage].shortEn}`
                                      }
                                      className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                                    >
                                      {isAr ? (
                                        <ChevronRight className="w-3 h-3" />
                                      ) : (
                                        <ChevronLeft className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                  {nextStage && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickStatusChange(lead, nextStage);
                                      }}
                                      title={
                                        isAr
                                          ? `نقل للمرحلة التالية: ${STAGE_META[nextStage].shortAr}`
                                          : `Advance to ${STAGE_META[nextStage].shortEn}`
                                      }
                                      className="p-1 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white transition-colors cursor-pointer"
                                    >
                                      {isAr ? (
                                        <ChevronLeft className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Card Footer: Quick Follow-up + Open Client Data Panel */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickWhatsAppFollowUp(lead);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'توثيق رسالة واتساب' : 'Log WhatsApp'}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>{waCount}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActivityType('call');
                                    setDrawerTab('followup');
                                    onSelectLead(lead);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'تسجيل مكالمة' : 'Log Call'}
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{callCount}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDrawerTab('profile_data');
                                  onSelectLead(lead);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3 h-3" />
                                <span>{isAr ? 'لوحة بيانات العميل' : 'Client Panel'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Column Footer Quick Add */}
                  {canAdd && (
                    <div className="p-2.5 border-t border-slate-100">
                      <button
                        onClick={() => openCreateModal(stage)}
                        className="w-full py-1.5 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-blue-600 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {isAr
                            ? `إضافة عميل في "${meta.shortAr}"`
                            : `Add lead to "${meta.shortEn}"`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'cards_list' ? (
        /* MODE B: Easy Horizontal Row Cards View (Default for Fast Employee Follow-up) */
        <div className="space-y-3">
          {filteredLeads.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
              <p className="text-sm font-bold text-slate-800 mb-1">
                {isAr ? 'لا توجد نتائج مطابقة للفلاتر الحالية' : 'No leads match current filters'}
              </p>
              <p className="text-xs text-slate-500 mb-4">
                {isAr
                  ? `إجمالي العملاء المتاحين في حسابك: ${leads.length} عميل`
                  : `Total leads in your account: ${leads.length}`}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setAgentFilter('ALL');
                  setProjectFilter('ALL');
                  setFollowUpQueue('ALL');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                {isAr ? 'إظهار كل العملاء (إلغاء الفلاتر)' : 'Show All Leads (Reset Filters)'}
              </button>
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const isSelected = selectedIds.includes(lead.id);
              const isJustChanged = lastChangedLeadId === lead.id;
              const assignedAgent = users.find((u) => u.id === lead.assignedTo);
              const needsUrgentCall = lead.status === 'New' && !lead.lastContactedAt;
              const stMeta = STAGE_META[lead.status] || STAGE_META.New;
              const waCount = (lead.activities || []).filter((a) => a.type === 'whatsapp').length;
              const cleanPhone = String(lead.phone || '').replace(/[^\d+]/g, '');
              const waPhone = cleanPhone.startsWith('0')
                ? `20${cleanPhone.slice(1)}`
                : cleanPhone.replace(/^\+/, '');

              return (
                <div
                  key={lead.id}
                  className={`bg-white rounded-2xl border transition-all duration-300 p-4 shadow-xs ${
                    isJustChanged
                      ? 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/30 scale-[1.01] shadow-lg'
                      : isSelected
                      ? 'border-blue-500 bg-blue-50/20'
                      : 'border-slate-200/90 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
                    <div className="lg:col-span-3 flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => toggleSelectId(lead.id)}
                        className="cursor-pointer shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                        )}
                      </button>

                      <div
                        onClick={() => {
                          setDrawerTab('profile_data');
                          onSelectLead(lead);
                        }}
                        className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
                      >
                        {getInitials(lead.fullName)}
                      </div>

                      <div
                        onClick={() => {
                          setDrawerTab('profile_data');
                          onSelectLead(lead);
                        }}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 hover:text-blue-600 truncate">
                            {lead.fullName}
                          </span>
                          {isJustChanged && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 animate-pulse">
                              <span>✓</span>
                              <span>{isAr ? 'تم الحفظ في Firebase' : 'Saved to Firebase'}</span>
                            </span>
                          )}
                          {needsUrgentCall && !isJustChanged && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">
                              {isAr ? 'جديد' : 'New'}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-xs font-bold text-blue-700 font-mono-tabular mt-0.5 truncate"
                          dir="ltr"
                        >
                          {lead.phone}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {lead.projectInterest}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{lead.propertyType}</span>
                        <span
                          className={`inline-flex items-center gap-0.5 font-semibold ${
                            lead.priority === 'High'
                              ? 'text-rose-600'
                              : lead.priority === 'Medium'
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {lead.priority === 'Low' ? (
                            <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUp className="w-3 h-3" />
                          )}
                          {lead.priority}
                        </span>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <div className="text-xs font-bold text-slate-900 font-mono-tabular">
                        {(lead.budgetMax / 1000000).toFixed(1)}M EGP
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">
                        {lead.nextFollowUpAt || todayStr}
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          handleQuickStatusChange(lead, e.target.value as LeadStatus)
                        }
                        className={`w-full sm:w-auto px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer focus:outline-none ${stMeta.bg} ${stMeta.text}`}
                      >
                        {ALL_LEAD_STATUSES.map((st) => (
                          <option key={st} value={st} className="bg-white text-slate-800">
                            {t.status[st]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-3 flex flex-wrap items-center justify-between lg:justify-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {assignedAgent && (
                          <img
                            src={assignedAgent.avatarUrl}
                            alt={assignedAgent.fullName}
                            referrerPolicy="no-referrer"
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        )}
                        {canTransfer ? (
                          <select
                            value={lead.assignedTo}
                            onChange={(e) => handleInlineAssignChange(lead, e.target.value)}
                            className="text-xs font-semibold text-slate-700 bg-transparent cursor-pointer"
                          >
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName.split(' ').slice(0, 2).join(' ')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-semibold text-slate-700">
                            {assignedAgent?.fullName.split(' ')[0]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <a
                          href={`tel:${cleanPhone}`}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1"
                          title={isAr ? 'اتصال هاتفي مباشر' : 'Call Now'}
                        >
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                          <span>{isAr ? 'اتصال' : 'Call'}</span>
                        </a>
                        <a
                          href={`https://wa.me/${waPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => handleQuickWhatsAppFollowUp(lead)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1"
                          title={isAr ? 'فتح محادثة واتساب' : 'Open WhatsApp'}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{waCount > 0 ? waCount : isAr ? 'واتساب' : 'WA'}</span>
                        </a>
                        <button
                          onClick={() => {
                            setQuickNoteLead(lead);
                            setQuickNoteText('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title={isAr ? 'إضافة ملاحظة سريعة للعميل' : 'Add Quick Note'}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{isAr ? 'ملاحظة' : 'Note'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setDrawerTab('profile_data');
                            onSelectLead(lead);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{isAr ? 'متابعة' : 'Open'}</span>
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteConfirmLead(lead)}
                            className="p-1.5 rounded-xl hover:bg-red-50 text-red-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Form Q&A Pills for immediate context */}
                  {lead.formResponses && lead.formResponses.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                      {lead.formResponses.slice(0, 3).map((qa, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-[11px] bg-slate-50 border border-slate-200/80 text-slate-700 px-2 py-0.5 rounded-lg"
                        >
                          <span className="text-slate-400 font-medium">{qa.question}:</span>
                          <span className="font-bold text-slate-800">{qa.answer}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* MODE C: Profile Cards Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredLeads.map((lead) => {
            const assignedAgent = users.find((u) => u.id === lead.assignedTo);
            const stMeta = STAGE_META[lead.status] || STAGE_META.New;
            const callCount = (lead.activities || []).filter((a) => a.type === 'call').length;
            const waCount = (lead.activities || []).filter((a) => a.type === 'whatsapp').length;
            const visitCount = (lead.activities || []).filter((a) => a.type === 'visit').length;

            return (
              <div
                key={lead.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <select
                      value={lead.status}
                      onChange={(e) =>
                        handleQuickStatusChange(lead, e.target.value as LeadStatus)
                      }
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${stMeta.bg} ${stMeta.text}`}
                    >
                      {ALL_LEAD_STATUSES.map((st) => (
                        <option key={st} value={st} className="bg-white text-slate-800">
                          {isAr ? STAGE_META[st].shortAr : STAGE_META[st].shortEn}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-mono-tabular font-bold text-blue-600">
                      {(lead.budgetMax / 1000000).toFixed(1)}M EGP
                    </span>
                  </div>

                  <div
                    onClick={() => {
                      setDrawerTab('profile_data');
                      onSelectLead(lead);
                    }}
                    className="text-center my-3 cursor-pointer"
                  >
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center mx-auto shadow-sm border-2 border-blue-100">
                      {getInitials(lead.fullName)}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-2.5 hover:text-blue-600 truncate">
                      {lead.fullName}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">{lead.phone}</p>
                    <p className="text-[11px] font-semibold text-slate-700 mt-1 truncate">
                      {lead.projectInterest} · {lead.propertyType}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 text-center my-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900 font-mono-tabular">
                        {callCount}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isAr ? 'مكالمات' : 'Calls'}
                      </div>
                    </div>
                    <div className="border-x border-slate-200/70">
                      <div className="text-sm font-bold text-emerald-600 font-mono-tabular">
                        {waCount}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isAr ? 'واتساب' : 'WhatsApp'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-blue-600 font-mono-tabular">
                        {visitCount}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isAr ? 'معاينات' : 'Visits'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {assignedAgent && (
                      <img
                        src={assignedAgent.avatarUrl}
                        alt={assignedAgent.fullName}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    )}
                    <span className="text-[11px] font-semibold text-slate-700 truncate">
                      {assignedAgent?.fullName.split(' ')[0]}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setDrawerTab('profile_data');
                      onSelectLead(lead);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    {isAr ? 'لوحة بيانات العميل' : 'Client Panel'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. COMPREHENSIVE CLIENT DATA & STAGE/REP CONTROL PANEL (`لوحة بيانات العميل وتغيير المراحل والنقل`) */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl border-s border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Top Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-xs">
                    {getInitials(selectedLead.fullName)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {isAr ? 'لوحة بيانات العميل' : 'Client Data Panel'}
                      </span>
                      <h2 className="text-lg font-bold text-slate-900">
                        {selectedLead.fullName}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                      {selectedLead.phone} · {selectedLead.projectInterest} ·{' '}
                      {(selectedLead.budgetMax / 1000000).toFixed(1)}M EGP
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onSelectLead(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* A. Direct Stage Control Bar inside Client Data Panel (`تغيير مرحلة العميل من داخل لوحة بيانات العميل`) */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {isAr
                        ? 'تغيير مرحلة العميل فوراً (اضغط على المرحلة المطلوبة للنقل الفوري):'
                        : 'Change Client Stage (Click any stage to move immediately):'}
                    </span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                      STAGE_META[selectedLead.status]?.bg
                    } ${STAGE_META[selectedLead.status]?.text}`}
                  >
                    {isAr
                      ? STAGE_META[selectedLead.status]?.shortAr
                      : STAGE_META[selectedLead.status]?.shortEn}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_LEAD_STATUSES.map((st) => {
                    const active = selectedLead.status === st;
                    const meta = STAGE_META[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleQuickStatusChange(selectedLead, st)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold text-center transition-all cursor-pointer border ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isAr ? meta.shortAr : meta.shortEn}
                      </button>
                    );
                  })}
                </div>

                {/* Direct Sales Rep Transfer inside Client Data Panel (`نقل العميل لسيلز آخر من داخل اللوحة`) */}
                <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      {isAr ? 'مسؤول المبيعات المعين للعميل:' : 'Assigned Sales Representative:'}
                    </span>
                  </div>

                  {canTransfer ? (
                    <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
                      <select
                        value={selectedLead.assignedTo}
                        onChange={(e) =>
                          handleInlineAssignChange(
                            selectedLead,
                            e.target.value,
                            panelTransferNote
                          )
                        }
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} (@{u.username})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={panelTransferNote}
                        onChange={(e) => setPanelTransferNote(e.target.value)}
                        placeholder={
                          isAr ? 'ملاحظة تسليم عند النقل (اختياري)...' : 'Handover note...'
                        }
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs w-44"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-900">
                      {getUserName(selectedLead.assignedTo)}
                    </span>
                  )}
                </div>
              </div>

              {/* B. 3-Tab Switcher inside Client Data Panel */}
              <div className="flex items-center p-1 bg-[#F4F7FE] rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDrawerTab('profile_data')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    drawerTab === 'profile_data'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? '1. بيانات العميل وتعديلها' : '1. Client Profile Data'}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab('followup')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    drawerTab === 'followup'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? '2. تسجيل متابعة وعروض وحدات' : '2. Follow-up & Unit Offers'}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab('history')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    drawerTab === 'history'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr
                    ? `3. سجل التحركات (${(selectedLead.activities || []).length})`
                    : `3. History (${(selectedLead.activities || []).length})`}
                </button>
              </div>

              {/* TAB 1: Full Editable Client Profile Data & Form Q&A (`الاسم + رقم التليفون + الأسئلة المجاب عليها في الفورم بدون أي ID`) */}
              {drawerTab === 'profile_data' && (
                <form
                  onSubmit={handleSaveClientPanelProfile}
                  className="p-4 rounded-2xl border border-slate-200 bg-white space-y-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <span className="font-bold text-slate-900">
                      {isAr
                        ? 'بيانات العميل الأساسية والأسئلة المجاب عليها في الفورم (شيت CRM1)'
                        : 'Client Essential Info & Form Questions Answered (CRM1 Sheet)'}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md">
                      {isAr
                        ? 'مستورد من Google Drive (CRM1) · بدون خانات ID غير مفيدة'
                        : 'Synced from Google Drive (CRM1) · Clean Data'}
                    </span>
                  </div>

                  {/* Form Questions & Answers Card (`الأسئلة التي تم الإجابة عليها في الفورم`) */}
                  <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {isAr
                            ? 'الأسئلة التي تم الإجابة عليها في الفورم (Form Responses):'
                            : 'Form Questions & Answers:'}
                        </span>
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setClientPanelForm({
                              ...clientPanelForm,
                              formResponses: [
                                ...(clientPanelForm.formResponses || []),
                                { question: 'سؤال إضافي في الفورم', answer: '' },
                              ],
                            })
                          }
                          className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{isAr ? 'إضافة سؤال وإجابة' : 'Add Q&A'}</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(clientPanelForm.formResponses || []).map((qa, qaIdx) => (
                        <div
                          key={qaIdx}
                          className="p-2.5 rounded-xl bg-white border border-blue-100 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                        >
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              {isAr ? `السؤال (${qaIdx + 1})` : `Question #${qaIdx + 1}`}
                            </label>
                            <input
                              type="text"
                              value={qa.question}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const updated = [...(clientPanelForm.formResponses || [])];
                                updated[qaIdx] = { ...updated[qaIdx], question: e.target.value };
                                setClientPanelForm({ ...clientPanelForm, formResponses: updated });
                              }}
                              className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-[#F8FAFC] focus:bg-white"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              {isAr ? 'إجابة العميل في الفورم' : 'Client Answer'}
                            </label>
                            <input
                              type="text"
                              value={qa.answer}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const updated = [...(clientPanelForm.formResponses || [])];
                                updated[qaIdx] = { ...updated[qaIdx], answer: e.target.value };
                                setClientPanelForm({ ...clientPanelForm, formResponses: updated });
                              }}
                              className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-blue-900 bg-white"
                            />
                          </div>
                          {canEdit && (
                            <div className="sm:col-span-1 flex justify-end pt-3">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (clientPanelForm.formResponses || []).filter(
                                    (_, idx) => idx !== qaIdx
                                  );
                                  setClientPanelForm({
                                    ...clientPanelForm,
                                    formResponses: updated,
                                  });
                                }}
                                className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title={isAr ? 'حذف السؤال' : 'Remove Q&A'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'اسم العميل الكامل *' : 'Client Full Name *'}
                      </label>
                      <input
                        type="text"
                        value={clientPanelForm.fullName}
                        onChange={(e) =>
                          setClientPanelForm({ ...clientPanelForm, fullName: e.target.value })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'رقم الهاتف الأساسي *' : 'Primary Phone *'}
                      </label>
                      <input
                        type="text"
                        value={clientPanelForm.phone}
                        onChange={(e) =>
                          setClientPanelForm({ ...clientPanelForm, phone: e.target.value })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white font-mono-tabular"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'رقم هاتف إضافي / واتساب' : 'Secondary Phone'}
                      </label>
                      <input
                        type="text"
                        value={clientPanelForm.secondaryPhone}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            secondaryPhone: e.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                      </label>
                      <input
                        type="email"
                        value={clientPanelForm.email}
                        onChange={(e) =>
                          setClientPanelForm({ ...clientPanelForm, email: e.target.value })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'المشروع العقاري المهتم به' : 'Real Estate Project'}
                      </label>
                      <select
                        value={clientPanelForm.projectInterest}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            projectInterest: e.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
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
                        {isAr ? 'نوع الوحدة المطلوبة' : 'Property Unit Type'}
                      </label>
                      <select
                        value={clientPanelForm.propertyType}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            propertyType: e.target.value as any,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      >
                        <option value="Villa">Villa (فيلا)</option>
                        <option value="Apartment">Apartment (شقة)</option>
                        <option value="Townhouse">Townhouse (تاون هاوس)</option>
                        <option value="Penthouse">Penthouse (بنتهاوس)</option>
                        <option value="Admin Office">Admin Office (مقر إداري)</option>
                        <option value="Commercial">Commercial (تجاري)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'الميزانية القصوى (EGP)' : 'Max Budget (EGP)'}
                      </label>
                      <input
                        type="number"
                        value={clientPanelForm.budgetMax}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            budgetMax: Number(e.target.value),
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'درجة الأولوية' : 'Priority'}
                      </label>
                      <select
                        value={clientPanelForm.priority}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            priority: e.target.value as any,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      >
                        <option value="High">High (عالية - VIP)</option>
                        <option value="Medium">Medium (متوسطة)</option>
                        <option value="Low">Low (منخفضة)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'المرحلة الحالية للعميل' : 'Current Stage'}
                      </label>
                      <select
                        value={clientPanelForm.status}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            status: e.target.value as LeadStatus,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-blue-50/40 font-bold text-blue-900"
                      >
                        {ALL_LEAD_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {t.status[st]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'موعد المتابعة القادم' : 'Next Follow-up Date'}
                      </label>
                      <input
                        type="date"
                        value={clientPanelForm.nextFollowUpAt}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            nextFollowUpAt: e.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white font-mono-tabular"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'المصدر' : 'Source'}
                      </label>
                      <input
                        type="text"
                        value={clientPanelForm.source}
                        onChange={(e) =>
                          setClientPanelForm({ ...clientPanelForm, source: e.target.value })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'اسم الحملة الإعلانية (Meta Campaign)' : 'Campaign Name'}
                      </label>
                      <input
                        type="text"
                        value={clientPanelForm.campaignName}
                        onChange={(e) =>
                          setClientPanelForm({
                            ...clientPanelForm,
                            campaignName: e.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        {isAr ? 'ملاحظات العميل وتفاصيل الطلب العقاري' : 'Client Notes'}
                      </label>
                      <textarea
                        rows={3}
                        value={clientPanelForm.notes}
                        onChange={(e) =>
                          setClientPanelForm({ ...clientPanelForm, notes: e.target.value })
                        }
                        disabled={!canEdit}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white"
                      />
                    </div>
                  </div>

                  {canEdit && (
                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        type="submit"
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        {isAr
                          ? 'حفظ تحديثات بيانات ومرحلة العميل'
                          : 'Save Client Profile & Stage'}
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* TAB 2: Log Follow-up Activity, Smart Templates & Property Unit Recommender */}
              {drawerTab === 'followup' && (
                <div className="space-y-4">
                  <form
                    onSubmit={handleLogActivity}
                    className="p-4 rounded-2xl border border-blue-200/80 bg-blue-50/20 space-y-3.5"
                  >
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        {isAr
                          ? 'تسجيل مكالمة أو متابعة جديدة (أو اختر قالباً جاهزاً بضغطة واحدة)'
                          : 'Log Follow-up Activity or Use 1-Click Smart Templates'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_FOLLOWUP_TEMPLATES.map((tpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setActivityType(tpl.type);
                            setActivitySummary(isAr ? tpl.summaryAr : tpl.summaryEn);
                            setActivityNewStatus(tpl.suggestedStatus);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-600 hover:text-white border border-slate-200 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                        >
                          {isAr ? tpl.labelAr : tpl.labelEn}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          {isAr ? 'نوع التواصل' : 'Activity Type'}
                        </label>
                        <select
                          value={activityType}
                          onChange={(e) => setActivityType(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                        >
                          <option value="call">
                            {isAr ? '📞 مكالمة هاتفية (Phone Call)' : '📞 Phone Call'}
                          </option>
                          <option value="whatsapp">
                            {isAr ? '💬 رسالة واتساب (WhatsApp)' : '💬 WhatsApp'}
                          </option>
                          <option value="visit">
                            {isAr ? '🏠 معاينة موقع (Site Visit)' : '🏠 Site Visit'}
                          </option>
                          <option value="note">
                            {isAr ? '📝 ملاحظة متابعة (Note)' : '📝 Internal Note'}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          {isAr ? 'تغيير مرحلة العميل مع المتابعة' : 'Update Stage'}
                        </label>
                        <select
                          value={activityNewStatus}
                          onChange={(e) => setActivityNewStatus(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                        >
                          <option value="">
                            {isAr
                              ? '-- الإبقاء على المرحلة الحالية --'
                              : '-- Keep Current Stage --'}
                          </option>
                          {ALL_LEAD_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {t.status[st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <textarea
                      value={activitySummary}
                      onChange={(e) => setActivitySummary(e.target.value)}
                      rows={2}
                      placeholder={
                        isAr
                          ? 'اكتب ملخص المكالمة أو رد العميل...'
                          : 'Write call summary or client feedback...'
                      }
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-blue-600"
                      required
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          {isAr ? 'تاريخ المتابعة القادمة' : 'Next Follow-up Date'}
                        </label>
                        <input
                          type="date"
                          value={activityNextDate}
                          onChange={(e) => setActivityNextDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-mono-tabular"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          {isAr ? 'الوقت' : 'Time'}
                        </label>
                        <input
                          type="time"
                          value={activityFollowUpTime}
                          onChange={(e) => setActivityFollowUpTime(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-mono-tabular"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleCalendarEvent}
                          onChange={(e) => setScheduleCalendarEvent(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>{isAr ? 'إضافة للتقويم تلقائياً' : 'Sync to Calendar'}</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      {isAr
                        ? 'حفظ المتابعة وتحديث المرحلة والتقويم'
                        : 'Save Follow-up & Update Stage'}
                    </button>
                  </form>

                  {/* Matching Property Units Recommender */}
                  {matchingProperties.length > 0 && (
                    <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          {isAr
                            ? `وحدات عقارية مرشحة لميزانية ومشروع العميل (${matchingProperties.length})`
                            : `Recommended Property Units (${matchingProperties.length})`}
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {matchingProperties.slice(0, 3).map((unit) => (
                          <div
                            key={unit.id}
                            className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {isAr ? unit.titleAr : unit.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {unit.projectName} · {unit.areaSqm}m² ·{' '}
                                <strong className="text-blue-600 font-mono-tabular">
                                  {(unit.price / 1000000).toFixed(1)}M EGP
                                </strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleQuickRecommendUnit(selectedLead, unit)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                            >
                              {isAr ? 'إرسال عرض للعميل' : 'Send Offer'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Chronological Activity & Transfer History */}
              {drawerTab === 'history' && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        {isAr
                          ? 'سجل تاريخ العميل وتغييرات المراحل والتنقلات'
                          : 'Activity, Stage Changes & Transfer Timeline'}
                      </span>
                    </h3>

                    <div className="flex items-center gap-1 text-[11px]">
                      {[
                        { id: 'ALL', label: isAr ? 'الكل' : 'All' },
                        { id: 'call', label: isAr ? 'مكالمات' : 'Calls' },
                        { id: 'whatsapp', label: isAr ? 'واتساب' : 'WhatsApp' },
                        { id: 'status_change', label: isAr ? 'المراحل' : 'Stages' },
                        { id: 'transfer', label: isAr ? 'النقل' : 'Transfers' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setTimelineFilter(f.id)}
                          className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                            timelineFilter === f.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {(selectedLead.activities || [])
                      .filter((act) => timelineFilter === 'ALL' || act.type === timelineFilter)
                      .map((act) => (
                        <div
                          key={act.id}
                          className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-100 text-xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span className="font-bold text-slate-800">{act.userName}</span>
                            <span className="font-mono-tabular">
                              {new Date(act.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{act.summary}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk / Modal Lead Transfer */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {isAr
                    ? 'نقل الليدز من سيلز إلى سيلز آخر'
                    : 'Transfer Leads Between Sales Representatives'}
                </h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="mt-4 space-y-4 text-xs">
              {selectedIds.length > 0 ? (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-medium">
                  {isAr
                    ? `تم تحديد ${selectedIds.length} ليد لنقلها فوراً إلى مندوب جديد.`
                    : `You have selected ${selectedIds.length} lead(s) to reassign.`}
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    {isAr
                      ? 'نقل جميع الليدز الخاصة بالمندوب (من سيلز):'
                      : 'Transfer all leads currently owned by (From Sales Rep):'}
                  </label>
                  <select
                    value={transferFromUser}
                    onChange={(e) => setTransferFromUser(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white"
                    required
                  >
                    <option value="">
                      {isAr ? '-- اختر المندوب الحالي --' : '-- Select Current Sales Rep --'}
                    </option>
                    {users.map((u) => {
                      const count = effectiveLeads.filter((l) => l.assignedTo === u.id).length;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({count} {isAr ? 'ليد' : 'leads'})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  {isAr
                    ? 'إلى مسؤول المبيعات المستلم (إلى سيلز):'
                    : 'Target Sales Representative (To Sales Rep):'}
                </label>
                <select
                  value={transferToUser}
                  onChange={(e) => setTransferToUser(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white"
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  {isAr
                    ? 'سبب النقل / توجيهات للمندوب الجديد:'
                    : 'Transfer Reason / Handover Note:'}
                </label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder={
                    isAr
                      ? 'مثال: إعادة توزيع ضغط العمل أو تخصص مشروع بالم هيلز...'
                      : 'e.g. Workload balancing or project specialization...'
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {isTransferring
                    ? isAr
                      ? 'جاري النقل...'
                      : 'Transferring...'
                    : isAr
                    ? 'تأكيد النقل وإرسال إشعار فوري'
                    : 'Confirm Transfer & Notify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'إضافة عميل محتمل جديد' : 'Create New Real Estate Lead'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveLead}
              className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم العميل الكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'رقم الهاتف *' : 'Phone Number *'}
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'المشروع المهتم به' : 'Project Interest'}
                </label>
                <select
                  value={formData.projectInterest}
                  onChange={(e) => setFormData({ ...formData, projectInterest: e.target.value })}
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
                  {isAr ? 'نوع الوحدة' : 'Property Type'}
                </label>
                <select
                  value={formData.propertyType}
                  onChange={(e) =>
                    setFormData({ ...formData, propertyType: e.target.value as any })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="Villa">Villa (فيلا)</option>
                  <option value="Apartment">Apartment (شقة)</option>
                  <option value="Townhouse">Townhouse (تاون هاوس)</option>
                  <option value="Penthouse">Penthouse (بنتهاوس)</option>
                  <option value="Admin Office">Admin Office (مقر إداري)</option>
                  <option value="Commercial">Commercial (تجاري)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'الميزانية القصوى (EGP)' : 'Max Budget (EGP)'}
                </label>
                <input
                  type="number"
                  value={formData.budgetMax}
                  onChange={(e) =>
                    setFormData({ ...formData, budgetMax: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'تعيين إلى مسؤول المبيعات' : 'Assign to Sales Rep'}
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
                  {isAr ? 'المرحلة' : 'Stage'}
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as LeadStatus })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  {ALL_LEAD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {t.status[st]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'موعد المتابعة القادم' : 'Next Follow-up Date'}
                </label>
                <input
                  type="date"
                  value={formData.nextFollowUpAt}
                  onChange={(e) =>
                    setFormData({ ...formData, nextFollowUpAt: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات الطلب العقاري' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {isAr ? 'تأكيد حذف العميل' : 'Confirm Lead Deletion'}
            </h3>
            <p className="text-xs text-slate-600 mt-2">
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف العميل "${deleteConfirmLead.fullName}" نهائياً من قاعدة البيانات؟`
                : `Are you sure you want to permanently delete "${deleteConfirmLead.fullName}"?`}
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirmLead(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleDeleteLead}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast 1-Tap Quick Note Modal Saved Directly to Firebase */}
      {quickNoteLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr
                    ? `إضافة ملاحظة سريعة لـ: ${quickNoteLead.fullName}`
                    : `Add Quick Note for: ${quickNoteLead.fullName}`}
                </h3>
              </div>
              <button
                onClick={() => setQuickNoteLead(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 font-mono-tabular" dir="ltr">
                {quickNoteLead.phone} · {quickNoteLead.projectInterest}
              </div>
              <textarea
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                rows={3}
                placeholder={
                  isAr
                    ? 'اكتب تفاصيل المكالمة أو الملاحظة هنا (مثال: تم الاتصال، العميل مهتم بمساحة 180م)...'
                    : 'Enter note or call summary here...'
                }
                className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-900 bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-blue-600"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickNoteLead(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveQuickNote}
                disabled={isSavingQuickNote || !quickNoteText.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isSavingQuickNote ? (
                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{isAr ? 'حفظ في Firebase' : 'Save to Firebase'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
