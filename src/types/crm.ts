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
  | 'New'
  | 'Contacted'
  | 'Qualified'
  | 'Site Visit Scheduled'
  | 'Negotiation'
  | 'Won'
  | 'Lost'
  | 'Unqualified';

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
  createdAt: string;
  updatedAt: string;
  activities: LeadActivity[];
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
  wonDealsCount: number;
  wonRevenue: number;
  conversionRate: number;
  avgResponseMinutes: number;
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
