export type PermissionScope = 'all' | 'team' | 'own' | 'none';

export type ModuleKey =
  | 'leads'
  | 'deals'
  | 'contacts'
  | 'properties'
  | 'calendar'
  | 'reports'
  | 'sheets_sync'
  | 'users';

export interface ModulePermission {
  read: PermissionScope;
  add: PermissionScope;
  edit: PermissionScope;
  editWhenObserver: boolean;
  delete: PermissionScope;
  export: PermissionScope;
  import: PermissionScope;
  transfer: PermissionScope;
  allowCustomView: boolean;
}

export interface Role {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  isSystem?: boolean;
  permissions: Record<ModuleKey, ModulePermission>;
}

export interface UserProfile {
  id: string;
  username: string;
  accessPassword?: string;
  clientAuthDigest?: string;
  fullName: string;
  roleId: string;
  jobTitle: string;
  jobTitleAr: string;
  avatarUrl: string;
  email: string;
  phone: string;
  location: string;
  assignedProjects: string[];
  isActiveForRouting: boolean;
  routingWeight: number;
  lastAssignedAt?: string;
  preferredLang: 'ar' | 'en';
  createdAt: string;
}

export type LeadStatus =
  | 'Fresh Lead'
  | 'No Answer'
  | 'Follow Up'
  | 'Interested'
  | 'Inspection'
  | 'Visit'
  | 'Contracted'
  | 'Reservation'
  | 'Not Interested';

export const ALL_LEAD_STATUS_LIST: LeadStatus[] = [
  'Fresh Lead',
  'No Answer',
  'Follow Up',
  'Interested',
  'Inspection',
  'Visit',
  'Contracted',
  'Reservation',
  'Not Interested',
];

export const LEAD_STATUS_ORDER = ALL_LEAD_STATUS_LIST;

export const LEAD_SOURCES = ['حملة اعلانية', 'اورجانيك', 'بروكر'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export function normalizeLeadStatus(rawStatus?: string | null): LeadStatus {
  const s = String(rawStatus || '').trim();
  if (!s) return 'Fresh Lead';
  if ((ALL_LEAD_STATUS_LIST as string[]).includes(s)) {
    return s as LeadStatus;
  }
  switch (s) {
    case 'New':
    case 'فريش ليدز':
      return 'Fresh Lead';
    case 'No Answer':
    case 'لم يرد':
      return 'No Answer';
    case 'Contacted':
    case 'متابعة':
      return 'Follow Up';
    case 'Qualified':
    case 'مهتم':
      return 'Interested';
    case 'Site Visit Scheduled':
    case 'معاينه':
    case 'معاينة':
      return 'Inspection';
    case 'Visit':
    case 'زيارة':
      return 'Visit';
    case 'Won':
    case 'Closed Won':
    case 'تعاقد':
      return 'Contracted';
    case 'Negotiation':
    case 'حجز':
      return 'Reservation';
    case 'Lost':
    case 'Unqualified':
    case 'غير مهتم':
      return 'Not Interested';
    default:
      return 'Fresh Lead';
  }
}

export interface LeadActivity {
  id: string;
  leadId: string;
  userId: string;
  userName: string;
  type: 'call' | 'whatsapp' | 'visit' | 'note' | 'status_change' | 'transfer' | 'created' | 'sheet_import';
  summary: string;
  createdAt: string;
}

export interface FormQuestionResponse {
  question: string;
  answer: string;
}

export interface Lead {
  id: string;
  fullName: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  source: string;
  campaignName: string;
  projectInterest: string;
  propertyType: 'Apartment' | 'Villa' | 'Townhouse' | 'Commercial' | 'Admin Office' | 'Penthouse';
  budgetMin: number;
  budgetMax: number;
  status: LeadStatus;
  priority: 'High' | 'Medium' | 'Low';
  assignedTo: string; // UserProfile.id
  assignedBy?: string;
  sheetRowId?: string;
  notes: string;
  formResponses?: FormQuestionResponse[];
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  reminderDateTime?: string; // ISO string or 'YYYY-MM-DDTHH:mm'
  reminderNote?: string;
  reminderNotified?: boolean;
  createdAt: string;
  updatedAt: string;
  activities: LeadActivity[];
}

export interface RealEstateProject {
  id: string;
  name: string; // الحقل الوحيد المطلوب (أو حتى يتم توليده تلقائياً إذا ترك فارغاً)
  developer?: string; // اسم شركة التطوير العقاري
  location?: string; // المدينة / المنطقة (التجمع، العاصمة، الساحل، الشيخ زايد...)
  projectType?: 'Residential' | 'Commercial' | 'Administrative' | 'Medical' | 'Coastal' | 'Mixed Use' | string; // تصنيف المشروع
  unitTypes?: string[]; // أنواع الوحدات المتاحة (شقق، فيلات، تاون هاوس، مكاتب، عيادات، محلات...)
  areaMinSqm?: number; // المساحات تبدأ من (م²)
  areaMaxSqm?: number; // المساحات تصل إلى (م²)
  priceMin?: number; // الأسعار تبدأ من (ج.م)
  priceMax?: number; // الأسعار تصل إلى (ج.م)
  pricePerSqm?: number; // متوسط سعر المتر (ج.م)
  downPaymentPercent?: number; // أقل مقدم تعاقد (%)
  installmentYears?: number; // أطول فترة سداد (سنوات)
  deliveryDate?: string; // موعد الاستلام (فوري / 2026 / 2027 / 2028...)
  finishingType?: string; // نوع التشطيب (كامل بالتكييفات، نصف تشطيب، طوب أحمر...)
  commissionPercent?: number; // نسبة عمولة المبيعات / البروكر (%)
  maintenancePercent?: number; // وديعة الصيانة (%)
  brochureUrl?: string; // رابط البروشور أو Google Drive للمشروع
  masterPlanImageUrl?: string; // رابط صورة المشروع / الماستر بلان
  facilities?: string; // الخدمات والمميزات الرئيسية
  sellingPoints?: string; // نقاط البيع القوية (USP) لمساعدة السيلز في الإقناع
  notes?: string; // ملاحظات إضافية عامة
  status?: 'Active' | 'Launching Soon' | 'Sold Out'; // حالة الطرح
  createdAt: string;
}

export interface PropertyUnit {
  id: string;
  code: string;
  title: string;
  titleAr: string;
  projectName: string;
  developer: string;
  location: string;
  type: 'Apartment' | 'Villa' | 'Townhouse' | 'Commercial' | 'Admin Office' | 'Penthouse';
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  price: number;
  downPaymentPercent: number;
  installmentYears: number;
  status: 'Available' | 'Reserved' | 'Sold';
  deliveryYear: number;
}

export interface Deal {
  id: string;
  title: string;
  leadId: string;
  leadName: string;
  propertyId: string;
  propertyName: string;
  projectName: string;
  assignedTo: string;
  stage: 'Reservation' | 'Contract Review' | 'Down Payment' | 'Closed Won' | 'Cancelled';
  dealValue: number;
  commissionPercent: number;
  expectedCloseDate: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: 'Site Visit' | 'Client Call' | 'Contract Signing' | 'Team Meeting' | 'Follow Up';
  priority: 'High' | 'Medium' | 'Low';
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  leadId?: string;
  leadName?: string;
  projectName?: string;
  assignedTo: string;
  description: string;
  completed: boolean;
  createdAt: string;
}

export interface ColumnMapping {
  fullName: string;
  phone: string;
  email: string;
  projectInterest: string;
  campaignName: string;
  propertyType: string;
  budgetMax: string;
  notes: string;
}

export interface SheetConnection {
  id: string;
  name: string;
  driveFileName?: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTabName: string;
  routingMode: 'project_then_round_robin' | 'round_robin_only';
  defaultProject: string;
  campaignTag: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  autoDistributionEnabled?: boolean;
  selectedSalesUserIds?: string[];
  ignoreIdColumns?: boolean;
  columnMapping: ColumnMapping;
  lastSyncedAt?: string;
  totalImportedCount: number;
  createdAt: string;
}

export interface SyncLog {
  id: string;
  connectionId: string;
  connectionName: string;
  timestamp: string;
  rowsScanned: number;
  newLeadsImported: number;
  duplicatesSkipped: number;
  status: 'success' | 'error';
  message: string;
  assignmentsSummary: { userId: string; userName: string; count: number }[];
}

export interface AppNotification {
  id: string;
  userId: string; // target user id or 'all'
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  type: 'lead_assigned' | 'lead_transferred' | 'sheet_sync' | 'visit_reminder' | 'deal_won';
  relatedLeadId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DailyAgentStat {
  userId: string;
  fullName: string;
  avatarUrl: string;
  jobTitle: string;
  jobTitleAr: string;
  isActiveForRouting: boolean;
  assignedProjects: string[];
  totalAssignedLeads: number;
  leadsAssignedToday: number;
  contactedToday: number;
  callsToday: number;
  whatsappToday: number;
  visitsScheduledToday: number;
  qualifiedCount: number;
  interestedCount: number;
  wonDealsCount: number;
  wonRevenue: number;
  conversionRate: number;
  dailyConversionRate: number;
  avgResponseMinutes: number;
  dailyPoints: number;
}

export interface WeeklyLeagueAgentStat {
  userId: string;
  fullName: string;
  avatarUrl: string;
  jobTitle: string;
  jobTitleAr: string;
  rank: number;
  weeklyPoints: number;
  weeklyCalls: number;
  weeklyWhatsapp: number;
  weeklyAssignedLeads: number;
  weeklyInterested: number;
  weeklyVisits: number;
  weeklyWonDeals: number;
  weeklyWonRevenue: number;
  weeklyConversionRate: number;
  badge?: 'gold' | 'silver' | 'bronze' | 'top_converter' | 'call_master';
  trend: 'up' | 'stable' | 'down';
}

export interface AgentLeadCountBreakdown {
  total: number;
  newCount: number;
  inProgressCount?: number;
  qualifiedCount: number;
  wonCount: number;
}

export interface BootstrapCounts {
  totalLeadsCount: number;
  statusCounts: Partial<Record<LeadStatus, number>>;
  agentCounts?: Record<string, AgentLeadCountBreakdown>;
  agentLeadCounts?: Record<string, AgentLeadCountBreakdown>;
  dealsSummary?: {
    totalCount: number;
    totalDealsCount?: number;
    totalPipelineValue: number;
    wonCount?: number;
    wonDealsCount?: number;
    wonDealsValue: number;
  };
  eventsSummary?: {
    upcomingCount: number;
    totalEventsCount: number;
    upcomingEvents: CalendarEvent[];
    nearestEvents?: CalendarEvent[];
  };
  recentActivities?: Array<
    LeadActivity & {
      leadName: string;
      projectInterest: string;
      leadObj?: Lead;
    }
  >;
}

export interface PaginatedLeadsResponse {
  items: Lead[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatching: number;
  statusCounts?: Partial<Record<LeadStatus, number>>;
}

export interface PaginatedDealsResponse {
  items: Deal[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatching: number;
  summary: {
    totalCount: number;
    totalPipelineValue: number;
    wonDealsValue: number;
  };
}

export interface PaginatedEventsResponse {
  items: CalendarEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatching: number;
}
