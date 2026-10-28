import { adminFirestore, isCloudFirestoreActive } from './firestoreClient';
import { FirestoreRepository, getFallbackCollection } from './baseRepository';
import { normalizePhone } from './phoneUtils';
import { DEFAULT_PROJECTS, getInitialDatabase } from './seedData';
import { normalizeLeadStatus } from '../../src/types/crm';

export interface SystemSettings {
  id: 'global';
  projects: string[];
  roundRobinCursor: number;
  updatedAt?: string;
}

export class UsersRepository extends FirestoreRepository<any> {
  constructor() {
    super('users', 'createdAt', 'asc');
  }

  async findByUsername(username: string): Promise<any | null> {
    const clean = String(username || '').trim().toLowerCase();
    if (!clean) return null;

    if (isCloudFirestoreActive()) {
      const snap = await adminFirestore
        .collection('users')
        .where('username', '==', clean)
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0]!;
        return { id: doc.id, ...doc.data() };
      }
    }

    const all = await this.getAll();
    return all.find((u) => String(u.username || '').toLowerCase() === clean) || null;
  }
}

export class RolesRepository extends FirestoreRepository<any> {
  constructor() {
    super('roles');
  }
}

export class PropertiesRepository extends FirestoreRepository<any> {
  constructor() {
    super('properties');
  }
}

export class DealsRepository extends FirestoreRepository<any> {
  constructor() {
    super('deals', 'createdAt', 'desc');
  }

  filterByScope(
    allDeals: any[],
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ): any[] {
    if (scope === 'none') return [];
    if (scope === 'own') return allDeals.filter((d) => d.assignedTo === userId);
    if (scope === 'team') {
      return allDeals.filter(
        (d) => d.assignedTo === userId || userProjects.includes(d.projectName)
      );
    }
    return allDeals;
  }

  async getSummaryForScope(
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ) {
    const allDeals = await this.getAll();
    const visible = this.filterByScope(allDeals, scope, userId, userProjects);
    const totalPipelineValue = visible.reduce(
      (sum, d) => sum + (Number(d.dealValue) || 0),
      0
    );
    const wonDeals = visible.filter((d) => d.stage === 'Closed Won');
    const wonDealsValue = wonDeals.reduce(
      (sum, d) => sum + (Number(d.dealValue) || 0),
      0
    );
    return {
      totalCount: visible.length,
      totalDealsCount: visible.length,
      totalPipelineValue,
      wonCount: wonDeals.length,
      wonDealsCount: wonDeals.length,
      wonDealsValue,
    };
  }

  async queryPaginated(params: {
    scope: 'all' | 'team' | 'own' | 'none';
    userId: string;
    userProjects: string[];
    stage?: string;
    assignedTo?: string;
    project?: string;
    q?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) {
    const {
      scope,
      userId,
      userProjects,
      stage,
      assignedTo,
      project,
      q,
      from,
      to,
      cursor,
      limit = 30,
    } = params;

    const allDeals = await this.getAll();
    const visible = this.filterByScope(allDeals, scope, userId, userProjects);

    const totalPipelineValue = visible.reduce(
      (sum, d) => sum + (Number(d.dealValue) || 0),
      0
    );
    const wonDealsValue = visible
      .filter((d) => d.stage === 'Closed Won')
      .reduce((sum, d) => sum + (Number(d.dealValue) || 0), 0);

    const filtered = visible.filter((d) => {
      if (stage && stage !== 'ALL' && d.stage !== stage) return false;
      if (assignedTo && assignedTo !== 'ALL' && d.assignedTo !== assignedTo) return false;
      if (project && project !== 'ALL' && d.projectName !== project) return false;
      if (from) {
        const dealDate = String(d.expectedCloseDate || d.createdAt || '').slice(0, 10);
        if (dealDate && dealDate < from) return false;
      }
      if (to) {
        const dealDate = String(d.expectedCloseDate || d.createdAt || '').slice(0, 10);
        if (dealDate && dealDate > to) return false;
      }
      if (q && q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${d.title || ''} ${d.leadName || ''} ${d.projectName || ''} ${
          d.propertyName || ''
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 100);
    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }

    const items = filtered.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      hasMore,
      totalMatching: filtered.length,
      summary: {
        totalCount: visible.length,
        totalPipelineValue,
        wonDealsValue,
      },
    };
  }
}

export class EventsRepository extends FirestoreRepository<any> {
  constructor() {
    super('events', 'date', 'asc');
  }

  filterByScope(
    allEvents: any[],
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ): any[] {
    if (scope === 'none') return [];
    if (scope === 'own') return allEvents.filter((e) => e.assignedTo === userId);
    if (scope === 'team') {
      return allEvents.filter(
        (e) =>
          e.assignedTo === userId ||
          !e.projectName ||
          userProjects.includes(e.projectName)
      );
    }
    return allEvents;
  }

  async getUpcomingForScope(
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[],
    maxItems = 4
  ) {
    const allEvents = await this.getAll();
    const visible = this.filterByScope(allEvents, scope, userId, userProjects);
    const upcoming = visible.filter((e) => !e.completed);
    const sliced = upcoming.slice(0, maxItems);
    return {
      upcomingCount: upcoming.length,
      totalEventsCount: visible.length,
      upcomingEvents: sliced,
      nearestEvents: sliced,
    };
  }

  async queryPaginated(params: {
    scope: 'all' | 'team' | 'own' | 'none';
    userId: string;
    userProjects: string[];
    category?: string;
    assignedTo?: string;
    project?: string;
    q?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) {
    const {
      scope,
      userId,
      userProjects,
      category,
      assignedTo,
      project,
      q,
      from,
      to,
      cursor,
      limit = 30,
    } = params;

    const allEvents = await this.getAll();
    const visible = this.filterByScope(allEvents, scope, userId, userProjects);

    const filtered = visible.filter((e) => {
      if (category && category !== 'ALL' && e.category !== category) return false;
      if (assignedTo && assignedTo !== 'ALL' && e.assignedTo !== assignedTo) return false;
      if (project && project !== 'ALL' && e.projectName !== project) return false;
      if (from && e.date && String(e.date).slice(0, 10) < from) return false;
      if (to && e.date && String(e.date).slice(0, 10) > to) return false;
      if (q && q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${e.title || ''} ${e.description || ''} ${e.projectName || ''} ${
          e.leadName || ''
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 100);
    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }

    const items = filtered.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      hasMore,
      totalMatching: filtered.length,
      upcomingCount: visible.filter((e) => !e.completed).length,
    };
  }
}

export class SheetConnectionsRepository extends FirestoreRepository<any> {
  constructor() {
    super('sheetConnections', 'createdAt', 'desc');
  }
}

export class SyncLogsRepository extends FirestoreRepository<any> {
  constructor() {
    super('syncLogs', 'timestamp', 'desc');
  }
}

export class NotificationsRepository extends FirestoreRepository<any> {
  constructor() {
    super('notifications', 'createdAt', 'desc');
  }

  async getForUser(userId: string, maxItems = 30): Promise<any[]> {
    if (isCloudFirestoreActive()) {
      const [userSnap, allSnap] = await Promise.all([
        adminFirestore
          .collection('notifications')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(maxItems)
          .get(),
        adminFirestore
          .collection('notifications')
          .where('userId', '==', 'all')
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get(),
      ]);
      const combined = new Map<string, any>();
      userSnap.docs.forEach((d) => combined.set(d.id, { id: d.id, ...d.data() }));
      allSnap.docs.forEach((d) => combined.set(d.id, { id: d.id, ...d.data() }));
      return Array.from(combined.values())
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, maxItems);
    }

    const all = await this.getAll();
    return all
      .filter((n) => n.userId === userId || n.userId === 'all')
      .slice(0, maxItems);
  }

  async markAllReadForUser(userId: string): Promise<void> {
    if (isCloudFirestoreActive()) {
      const [unreadUserSnap, unreadAllSnap] = await Promise.all([
        adminFirestore
          .collection('notifications')
          .where('userId', '==', userId)
          .where('isRead', '==', false)
          .get(),
        adminFirestore
          .collection('notifications')
          .where('userId', '==', 'all')
          .where('isRead', '==', false)
          .get(),
      ]);
      const batch = adminFirestore.batch();
      unreadUserSnap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
      unreadAllSnap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
      await batch.commit();
      return;
    }

    const col = getFallbackCollection('notifications');
    for (const [id, n] of col.entries()) {
      if (n.userId === userId || n.userId === 'all') {
        col.set(id, { ...n, isRead: true });
      }
    }
  }
}

export class SettingsRepository extends FirestoreRepository<SystemSettings> {
  constructor() {
    super('settings');
  }

  async getGlobal(): Promise<SystemSettings> {
    const existing = await this.getById('global');
    if (existing) {
      return {
        id: 'global',
        projects:
          Array.isArray(existing.projects) && existing.projects.length > 0
            ? existing.projects
            : [...DEFAULT_PROJECTS],
        roundRobinCursor: Number(existing.roundRobinCursor) || 0,
      };
    }
    const initial: SystemSettings = {
      id: 'global',
      projects: [...DEFAULT_PROJECTS],
      roundRobinCursor: 0,
      updatedAt: new Date().toISOString(),
    };
    await this.save(initial);
    return initial;
  }

  async addProjectIfMissing(projectName: string): Promise<string[]> {
    const clean = String(projectName || '').trim();
    const globalSettings = await this.getGlobal();
    if (!clean || globalSettings.projects.includes(clean)) {
      return globalSettings.projects;
    }
    const updatedProjects = [...globalSettings.projects, clean];
    await this.update('global', {
      projects: updatedProjects,
      updatedAt: new Date().toISOString(),
    });
    return updatedProjects;
  }
}

/**
 * Helper to select a candidate pool of active sales agents for a given project.
 */
function pickCandidatePool(users: any[], projectInterest: string, routingMode: string): any[] {
  const activeAgents = users.filter((u: any) => u.isActiveForRouting);
  if (activeAgents.length === 0) {
    const fallback = users.find((u: any) => u.roleId === 'role_employee') || users[0];
    return fallback ? [fallback] : [];
  }

  if (routingMode === 'project_then_round_robin' && projectInterest) {
    const specialists = activeAgents.filter(
      (u: any) =>
        Array.isArray(u.assignedProjects) &&
        u.assignedProjects.some(
          (p: string) => p.toLowerCase().trim() === projectInterest.toLowerCase().trim()
        )
    );
    if (specialists.length > 0) {
      return specialists;
    }
  }
  return activeAgents;
}

const ALL_STATUS_KEYS = [
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

/**
 * LeadsRepository:
 * - Stores lead documents in `leads/{leadId}` WITHOUT the embedded `activities` array.
 * - Stores activities as a subcollection in `leads/{leadId}/activities/{activityId}`.
 * - Stores normalized phone uniqueness keys in `leadPhones/{phoneNormalized}`.
 * - Hydrates `activities` when returning lead objects so the API contract to the client is unchanged.
 */
export class LeadsRepository extends FirestoreRepository<any> {
  constructor() {
    super('leads', 'createdAt', 'desc');
  }

  private subcollectionKey(leadId: string): string {
    return `leads/${leadId}/activities`;
  }

  async getActivities(leadId: string): Promise<any[]> {
    if (isCloudFirestoreActive()) {
      const snap = await adminFirestore
        .collection('leads')
        .doc(leadId)
        .collection('activities')
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    const subCol = getFallbackCollection(this.subcollectionKey(leadId));
    return Array.from(subCol.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  }

  async hydrateLead(leadDoc: any): Promise<any> {
    if (!leadDoc) return null;
    const activities = await this.getActivities(leadDoc.id);
    return {
      ...leadDoc,
      status: normalizeLeadStatus(leadDoc.status),
      phoneNormalized: leadDoc.phoneNormalized || normalizePhone(leadDoc.phone || ''),
      activities,
    };
  }

  override async getAll(): Promise<any[]> {
    const rawLeads = await super.getAll();
    return Promise.all(rawLeads.map((l) => this.hydrateLead(l)));
  }

  override async getById(id: string): Promise<any | null> {
    const raw = await super.getById(id);
    if (!raw) return null;
    return this.hydrateLead(raw);
  }

  private filterRawByScope(
    rawLeads: any[],
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ): any[] {
    if (scope === 'none') return [];
    if (scope === 'own') return rawLeads.filter((l) => l.assignedTo === userId);
    if (scope === 'team') {
      return rawLeads.filter(
        (l) => l.assignedTo === userId || userProjects.includes(l.projectInterest)
      );
    }
    return rawLeads;
  }

  private computeAggregates(leadsList: any[]) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const statusCounts: Record<string, number> = {};
    ALL_STATUS_KEYS.forEach((k) => {
      statusCounts[k] = 0;
    });
    const agentLeadCounts: Record<string, number> = {};
    const sourcesSet = new Set<string>();

    let urgentNew = 0;
    let todayFollowUp = 0;
    let vipBudget = 0;
    let totalBudgetVolume = 0;

    for (const l of leadsList) {
      const st = normalizeLeadStatus(l.status || 'Fresh Lead');
      statusCounts[st] = (statusCounts[st] || 0) + 1;
      if (l.assignedTo) {
        agentLeadCounts[l.assignedTo] = (agentLeadCounts[l.assignedTo] || 0) + 1;
      }
      if (l.source) {
        sourcesSet.add(String(l.source));
      }
      if (st === 'Fresh Lead' && !l.lastContactedAt) {
        urgentNew++;
      }
      if (
        l.nextFollowUpAt &&
        String(l.nextFollowUpAt) <= todayStr &&
        !['Contracted', 'Not Interested'].includes(st)
      ) {
        todayFollowUp++;
      }
      const bMax = Number(l.budgetMax) || 0;
      if (bMax >= 15000000) {
        vipBudget++;
      }
      totalBudgetVolume += bMax;
    }

    return {
      totalLeadsCount: leadsList.length,
      statusCounts,
      agentLeadCounts,
      sources: Array.from(sourcesSet),
      queueCounts: {
        urgentNew,
        todayFollowUp,
        vipBudget,
        totalBudgetVolume,
      },
    };
  }

  /**
   * Constant-size O(1) payload summary for `/api/bootstrap`.
   * Does NOT return the leads array; returns only counts, status breakdown, and recent 6 activities.
   */
  async getBootstrapSummary(
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ) {
    const allRaw = await super.getAll();
    const visibleRaw = this.filterRawByScope(allRaw, scope, userId, userProjects);
    const aggregates = this.computeAggregates(visibleRaw);

    // Hydrate only the 6 most recently updated leads to extract the latest 6 activities for the dashboard stream
    const topRecentLeads = [...visibleRaw]
      .sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(
          String(a.updatedAt || a.createdAt || '')
        )
      )
      .slice(0, 6);
    const hydratedRecent = await Promise.all(topRecentLeads.map((l) => this.hydrateLead(l)));
    const recentActivities = hydratedRecent
      .flatMap((l) =>
        (l?.activities || []).map((act: any) => ({
          ...act,
          leadId: l.id,
          leadName: l.fullName,
          projectInterest: l.projectInterest,
          leadObj: l,
        }))
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 6);

    return {
      ...aggregates,
      allSystemLeadsCount: allRaw.length,
      recentActivities,
    };
  }

  /**
   * Server-side Paginated & Filtered Leads Query (`GET /api/leads`)
   * Supports: cursor, limit=30, status, assignedTo, project, source, q (name/phone), from, to, queue,
   * and enforces permission scopes (all / team / own / none).
   * Hydrates `activities` ONLY for the current page slice (<= limit).
   */
  async queryPaginated(params: {
    scope: 'all' | 'team' | 'own' | 'none';
    userId: string;
    userProjects: string[];
    status?: string;
    assignedTo?: string;
    project?: string;
    source?: string;
    q?: string;
    from?: string;
    to?: string;
    queue?: string;
    cursor?: string;
    limit?: number;
  }) {
    const {
      scope,
      userId,
      userProjects,
      status,
      assignedTo,
      project,
      source,
      q,
      from,
      to,
      queue,
      cursor,
      limit = 30,
    } = params;

    const allRaw = await super.getAll();
    const visibleRaw = this.filterRawByScope(allRaw, scope, userId, userProjects);
    const scopeAggregates = this.computeAggregates(visibleRaw);

    const todayStr = new Date().toISOString().slice(0, 10);
    const qTrim = q ? String(q).trim().toLowerCase() : '';
    const qNormPhone = qTrim ? normalizePhone(qTrim) : '';

    const filteredRaw = visibleRaw.filter((l) => {
      const normStatus = normalizeLeadStatus(l.status);
      if (status && status !== 'ALL') {
        const allowedStatuses = status.split(',').map((s) => normalizeLeadStatus(s.trim()));
        if (!allowedStatuses.includes(normStatus)) return false;
      }
      if (assignedTo && assignedTo !== 'ALL' && l.assignedTo !== assignedTo) {
        return false;
      }
      if (project && project !== 'ALL' && l.projectInterest !== project) {
        return false;
      }
      if (source && source !== 'ALL' && l.source !== source) {
        return false;
      }
      if (from) {
        const createdDate = String(l.createdAt || '').slice(0, 10);
        if (createdDate && createdDate < from) return false;
      }
      if (to) {
        const createdDate = String(l.createdAt || '').slice(0, 10);
        if (createdDate && createdDate > to) return false;
      }
      if (queue && queue !== 'ALL') {
        if (queue === 'URGENT_NEW' && !(normStatus === 'Fresh Lead' && !l.lastContactedAt)) {
          return false;
        }
        if (
          queue === 'TODAY_FOLLOWUP' &&
          !(
            l.nextFollowUpAt &&
            String(l.nextFollowUpAt) <= todayStr &&
            !['Contracted', 'Not Interested'].includes(normStatus)
          )
        ) {
          return false;
        }
        if (queue === 'VIP_BUDGET' && (Number(l.budgetMax) || 0) < 15000000) {
          return false;
        }
      }
      if (qTrim) {
        const nameMatch = String(l.fullName || '')
          .toLowerCase()
          .includes(qTrim);
        const rawPhoneMatch = String(l.phone || '')
          .toLowerCase()
          .includes(qTrim);
        const normPhoneMatch =
          qNormPhone.length >= 3 &&
          String(l.phoneNormalized || normalizePhone(l.phone || '')).includes(qNormPhone);
        const projectMatch = String(l.projectInterest || '')
          .toLowerCase()
          .includes(qTrim);
        const campaignMatch = String(l.campaignName || '')
          .toLowerCase()
          .includes(qTrim);
        if (
          !nameMatch &&
          !rawPhoneMatch &&
          !normPhoneMatch &&
          !projectMatch &&
          !campaignMatch
        ) {
          return false;
        }
      }
      return true;
    });

    const filteredAggregates = this.computeAggregates(filteredRaw);

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 100);
    let startIdx = 0;
    if (cursor) {
      const idx = filteredRaw.findIndex((item) => item.id === cursor);
      if (idx !== -1) {
        startIdx = idx + 1;
      }
    }

    const pageRawSlice = filteredRaw.slice(startIdx, startIdx + pageSize);
    const items = await Promise.all(pageRawSlice.map((l) => this.hydrateLead(l)));
    const hasMore = startIdx + pageSize < filteredRaw.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      hasMore,
      totalMatching: filteredRaw.length,
      totalScopeLeads: scopeAggregates.totalLeadsCount,
      statusCounts: filteredAggregates.statusCounts,
      scopeStatusCounts: scopeAggregates.statusCounts,
      agentLeadCounts: scopeAggregates.agentLeadCounts,
      sources: scopeAggregates.sources,
      queueCounts: scopeAggregates.queueCounts,
      filteredBudgetVolume: filteredAggregates.queueCounts.totalBudgetVolume,
    };
  }

  /**
   * Query leads by scope using Firestore composite indexes:
   * - assignedTo + status + createdAt
   * - assignedTo + createdAt
   * - projectInterest + createdAt
   */
  async getByVisibilityScope(
    scope: 'all' | 'team' | 'own' | 'none',
    userId: string,
    userProjects: string[]
  ): Promise<{ visibleLeads: any[]; allLeadsCount: number }> {
    const allHydrated = await this.getAll();
    const allLeadsCount = allHydrated.length;

    if (scope === 'none') {
      return { visibleLeads: [], allLeadsCount };
    }

    if (scope === 'own') {
      if (isCloudFirestoreActive()) {
        const snap = await adminFirestore
          .collection('leads')
          .where('assignedTo', '==', userId)
          .orderBy('createdAt', 'desc')
          .get();
        const ownHydrated = await Promise.all(
          snap.docs.map((d) => this.hydrateLead({ id: d.id, ...d.data() }))
        );
        return { visibleLeads: ownHydrated, allLeadsCount };
      }
      return {
        visibleLeads: allHydrated.filter((l) => l.assignedTo === userId),
        allLeadsCount,
      };
    }

    if (scope === 'team') {
      return {
        visibleLeads: allHydrated.filter(
          (l) => l.assignedTo === userId || userProjects.includes(l.projectInterest)
        ),
        allLeadsCount,
      };
    }

    return { visibleLeads: allHydrated, allLeadsCount };
  }

  /**
   * Check if a normalized phone number is already registered in `leadPhones/{phoneNormalized}`.
   */
  async findLeadIdByPhone(rawPhone: string): Promise<string | null> {
    const phoneNormalized = normalizePhone(rawPhone);
    if (!phoneNormalized) return null;

    if (isCloudFirestoreActive()) {
      const snap = await adminFirestore.collection('leadPhones').doc(phoneNormalized).get();
      if (snap.exists) {
        return (snap.data() as any)?.leadId || null;
      }
      return null;
    }

    const phoneCol = getFallbackCollection('leadPhones');
    return phoneCol.get(phoneNormalized)?.leadId || null;
  }

  /**
   * Create a new lead inside a Firestore transaction:
   * 1. Verifies `leadPhones/{phoneNormalized}` does not already exist (duplicate guard).
   * 2. Reserves `leadPhones/{phoneNormalized}`.
   * 3. Writes `leads/{leadId}` (without embedded `activities`).
   * 4. Writes the initial activity in subcollection `leads/{leadId}/activities/{actId}`.
   */
  async createLeadWithActivity(leadInput: any, initialActivity: any): Promise<any> {
    const phoneNormalized = normalizePhone(leadInput.phone);
    if (!phoneNormalized) {
      throw new Error('رقم الهاتف غير صالح');
    }

    const { activities: _ignored, ...leadDocData } = {
      ...leadInput,
      phoneNormalized,
    };
    const cleanLeadDoc = JSON.parse(JSON.stringify(leadDocData));
    const cleanActivity = JSON.parse(
      JSON.stringify({
        ...initialActivity,
        leadId: cleanLeadDoc.id,
      })
    );

    if (isCloudFirestoreActive()) {
      await adminFirestore.runTransaction(async (tx) => {
        const phoneRef = adminFirestore.collection('leadPhones').doc(phoneNormalized);
        const phoneSnap = await tx.get(phoneRef);
        if (phoneSnap.exists) {
          throw new Error('رقم الهاتف مسجل بالفعل لعميل آخر في قاعدة البيانات');
        }

        const leadRef = adminFirestore.collection('leads').doc(cleanLeadDoc.id);
        const actRef = leadRef.collection('activities').doc(cleanActivity.id);

        tx.set(phoneRef, {
          phoneNormalized,
          leadId: cleanLeadDoc.id,
          createdAt: cleanLeadDoc.createdAt,
        });
        tx.set(leadRef, cleanLeadDoc);
        tx.set(actRef, cleanActivity);
      });

      return this.hydrateLead(cleanLeadDoc);
    }

    // Fallback transactional execution
    const phoneCol = getFallbackCollection('leadPhones');
    if (phoneCol.has(phoneNormalized)) {
      throw new Error('رقم الهاتف مسجل بالفعل لعميل آخر في قاعدة البيانات');
    }
    phoneCol.set(phoneNormalized, {
      phoneNormalized,
      leadId: cleanLeadDoc.id,
      createdAt: cleanLeadDoc.createdAt,
    });
    getFallbackCollection('leads').set(cleanLeadDoc.id, cleanLeadDoc);
    getFallbackCollection(this.subcollectionKey(cleanLeadDoc.id)).set(
      cleanActivity.id,
      cleanActivity
    );
    return this.hydrateLead(cleanLeadDoc);
  }

  /**
   * Update a lead inside a Firestore transaction / batch:
   * - Updates `leadPhones/{phoneNormalized}` if phone changed (preventing duplicates).
   * - Appends subcollection activities in `leads/{leadId}/activities`.
   * - Optionally creates a Closed Won deal in `deals/{dealId}` if status transitioned to Won.
   */
  async updateLeadTransactional(params: {
    leadId: string;
    updates: Record<string, any>;
    newActivities: any[];
    autoCreateDealIfWon?: any | null;
  }): Promise<any> {
    const { leadId, updates, newActivities, autoCreateDealIfWon } = params;
    const existing = await super.getById(leadId);
    if (!existing) {
      throw new Error('العميل غير موجود');
    }

    const oldPhoneNorm = existing.phoneNormalized || normalizePhone(existing.phone || '');
    const newPhoneRaw = updates.phone !== undefined ? updates.phone : existing.phone;
    const newPhoneNorm = normalizePhone(newPhoneRaw);
    if (!newPhoneNorm) {
      throw new Error('رقم الهاتف غير صالح');
    }

    const { activities: _ignored, ...mergedDoc } = {
      ...existing,
      ...updates,
      id: leadId,
      phoneNormalized: newPhoneNorm,
    };
    const cleanDoc = JSON.parse(JSON.stringify(mergedDoc));

    if (isCloudFirestoreActive()) {
      await adminFirestore.runTransaction(async (tx) => {
        if (newPhoneNorm !== oldPhoneNorm) {
          const newPhoneRef = adminFirestore.collection('leadPhones').doc(newPhoneNorm);
          const newPhoneSnap = await tx.get(newPhoneRef);
          if (newPhoneSnap.exists && (newPhoneSnap.data() as any)?.leadId !== leadId) {
            throw new Error('رقم الهاتف الجديد مسجل بالفعل لعميل آخر');
          }
          if (oldPhoneNorm) {
            tx.delete(adminFirestore.collection('leadPhones').doc(oldPhoneNorm));
          }
          tx.set(newPhoneRef, {
            phoneNormalized: newPhoneNorm,
            leadId,
            createdAt: cleanDoc.updatedAt || new Date().toISOString(),
          });
        }

        const leadRef = adminFirestore.collection('leads').doc(leadId);
        tx.set(leadRef, cleanDoc, { merge: true });

        for (const act of newActivities) {
          const cleanAct = JSON.parse(JSON.stringify({ ...act, leadId }));
          tx.set(leadRef.collection('activities').doc(cleanAct.id), cleanAct);
        }

        if (autoCreateDealIfWon) {
          const dealRef = adminFirestore.collection('deals').doc(autoCreateDealIfWon.id);
          tx.set(dealRef, JSON.parse(JSON.stringify(autoCreateDealIfWon)));
        }
      });

      return this.hydrateLead(cleanDoc);
    }

    const phoneCol = getFallbackCollection('leadPhones');
    if (newPhoneNorm !== oldPhoneNorm) {
      const owner = phoneCol.get(newPhoneNorm);
      if (owner && owner.leadId !== leadId) {
        throw new Error('رقم الهاتف الجديد مسجل بالفعل لعميل آخر');
      }
      if (oldPhoneNorm) phoneCol.delete(oldPhoneNorm);
      phoneCol.set(newPhoneNorm, {
        phoneNormalized: newPhoneNorm,
        leadId,
        createdAt: cleanDoc.updatedAt || new Date().toISOString(),
      });
    }

    getFallbackCollection('leads').set(leadId, cleanDoc);
    const subCol = getFallbackCollection(this.subcollectionKey(leadId));
    for (const act of newActivities) {
      const cleanAct = JSON.parse(JSON.stringify({ ...act, leadId }));
      subCol.set(cleanAct.id, cleanAct);
    }
    if (autoCreateDealIfWon) {
      getFallbackCollection('deals').set(
        autoCreateDealIfWon.id,
        JSON.parse(JSON.stringify(autoCreateDealIfWon))
      );
    }

    return this.hydrateLead(cleanDoc);
  }

  /**
   * Add a follow-up activity to subcollection `leads/{leadId}/activities/{actId}`
   * and atomically update the lead document + optional calendar event + optional Won deal.
   */
  async addActivityTransactional(params: {
    leadId: string;
    activity: any;
    leadUpdates: Record<string, any>;
    calendarEvent?: any | null;
    wonDeal?: any | null;
  }): Promise<{ lead: any; activity: any }> {
    const { leadId, activity, leadUpdates, calendarEvent, wonDeal } = params;
    const existing = await super.getById(leadId);
    if (!existing) {
      throw new Error('العميل غير موجود');
    }

    const { activities: _ignored, ...mergedLead } = {
      ...existing,
      ...leadUpdates,
      id: leadId,
    };
    const cleanLead = JSON.parse(JSON.stringify(mergedLead));
    const cleanActivity = JSON.parse(JSON.stringify({ ...activity, leadId }));

    if (isCloudFirestoreActive()) {
      const batch = adminFirestore.batch();
      const leadRef = adminFirestore.collection('leads').doc(leadId);
      batch.set(leadRef, cleanLead, { merge: true });
      batch.set(leadRef.collection('activities').doc(cleanActivity.id), cleanActivity);

      if (calendarEvent) {
        batch.set(
          adminFirestore.collection('events').doc(calendarEvent.id),
          JSON.parse(JSON.stringify(calendarEvent))
        );
      }
      if (wonDeal) {
        batch.set(
          adminFirestore.collection('deals').doc(wonDeal.id),
          JSON.parse(JSON.stringify(wonDeal))
        );
      }
      await batch.commit();
      return { lead: await this.hydrateLead(cleanLead), activity: cleanActivity };
    }

    getFallbackCollection('leads').set(leadId, cleanLead);
    getFallbackCollection(this.subcollectionKey(leadId)).set(cleanActivity.id, cleanActivity);
    if (calendarEvent) {
      getFallbackCollection('events').set(
        calendarEvent.id,
        JSON.parse(JSON.stringify(calendarEvent))
      );
    }
    if (wonDeal) {
      getFallbackCollection('deals').set(wonDeal.id, JSON.parse(JSON.stringify(wonDeal)));
    }
    return { lead: await this.hydrateLead(cleanLead), activity: cleanActivity };
  }

  /**
   * Delete a lead, its `leadPhones/{phoneNormalized}` uniqueness record, and all its `activities` subcollection docs.
   */
  override async delete(leadId: string): Promise<boolean> {
    const existing = await super.getById(leadId);
    if (!existing) return false;
    const phoneNorm = existing.phoneNormalized || normalizePhone(existing.phone || '');

    if (isCloudFirestoreActive()) {
      const leadRef = adminFirestore.collection('leads').doc(leadId);
      const actsSnap = await leadRef.collection('activities').get();
      const batch = adminFirestore.batch();
      actsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(leadRef);
      if (phoneNorm) {
        batch.delete(adminFirestore.collection('leadPhones').doc(phoneNorm));
      }
      await batch.commit();
      return true;
    }

    getFallbackCollection('leads').delete(leadId);
    getFallbackCollection(this.subcollectionKey(leadId)).clear();
    if (phoneNorm) {
      getFallbackCollection('leadPhones').delete(phoneNorm);
    }
    return true;
  }

  /**
   * Bulk or single lead transfer executed inside a Firestore WriteBatch / Transaction.
   */
  async transferLeadsBatch(params: {
    targetLeads: any[];
    toUser: any;
    performedByUser: any;
    allUsers: any[];
    reason?: string;
    nowIso: string;
  }): Promise<number> {
    const { targetLeads, toUser, performedByUser, allUsers, reason, nowIso } = params;
    if (targetLeads.length === 0) return 0;

    if (isCloudFirestoreActive()) {
      const batch = adminFirestore.batch();
      targetLeads.forEach((lead, idx) => {
        const oldAgent = allUsers.find((u) => u.id === lead.assignedTo);
        const leadRef = adminFirestore.collection('leads').doc(lead.id);
        batch.update(leadRef, {
          assignedTo: toUser.id,
          assignedBy: performedByUser.id,
          updatedAt: nowIso,
        });

        const actId = `act_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        const actDoc = {
          id: actId,
          leadId: lead.id,
          userId: performedByUser.id,
          userName: performedByUser.fullName,
          type: 'transfer',
          summary: `نقل الليد من (${oldAgent?.fullName || 'غير معين'}) إلى (${toUser.fullName}) بواسطة ${performedByUser.fullName}${reason ? ` — السبب: ${reason}` : ''}`,
          createdAt: nowIso,
        };
        batch.set(leadRef.collection('activities').doc(actId), actDoc);
      });
      await batch.commit();
      return targetLeads.length;
    }

    const leadsCol = getFallbackCollection('leads');
    targetLeads.forEach((lead, idx) => {
      const oldAgent = allUsers.find((u) => u.id === lead.assignedTo);
      const rawLead = leadsCol.get(lead.id);
      if (rawLead) {
        leadsCol.set(lead.id, {
          ...rawLead,
          assignedTo: toUser.id,
          assignedBy: performedByUser.id,
          updatedAt: nowIso,
        });
      }
      const actId = `act_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      getFallbackCollection(this.subcollectionKey(lead.id)).set(actId, {
        id: actId,
        leadId: lead.id,
        userId: performedByUser.id,
        userName: performedByUser.fullName,
        type: 'transfer',
        summary: `نقل الليد من (${oldAgent?.fullName || 'غير معين'}) إلى (${toUser.fullName}) بواسطة ${performedByUser.fullName}${reason ? ` — السبب: ${reason}` : ''}`,
        createdAt: nowIso,
      });
    });
    return targetLeads.length;
  }

  /**
   * Auto-rebalance all 'New' leads across project specialists using a Firestore Transaction
   * that reads and advances `settings/global.roundRobinCursor` atomically.
   */
  async autoDistributeNewLeadsTransaction(params: {
    performedByUser: any;
    allUsers: any[];
    nowIso: string;
  }): Promise<number> {
    const { performedByUser, allUsers, nowIso } = params;
    const allRawLeads = await super.getAll();
    const newLeads = allRawLeads.filter((l) => normalizeLeadStatus(l.status) === 'Fresh Lead');
    if (newLeads.length === 0) return 0;

    if (isCloudFirestoreActive()) {
      await adminFirestore.runTransaction(async (tx) => {
        const settingsRef = adminFirestore.collection('settings').doc('global');
        const settingsSnap = await tx.get(settingsRef);
        let cursor = settingsSnap.exists
          ? Number((settingsSnap.data() as any)?.roundRobinCursor) || 0
          : 0;

        newLeads.forEach((lead, idx) => {
          const pool = pickCandidatePool(
            allUsers,
            lead.projectInterest,
            'project_then_round_robin'
          );
          if (pool.length === 0) return;
          const chosen = pool[cursor % pool.length];
          cursor++;

          if (chosen && chosen.id !== lead.assignedTo) {
            const leadRef = adminFirestore.collection('leads').doc(lead.id);
            tx.update(leadRef, {
              assignedTo: chosen.id,
              assignedBy: performedByUser.id,
              updatedAt: nowIso,
            });
            const actId = `act_${Date.now()}_rb_${idx}`;
            tx.set(leadRef.collection('activities').doc(actId), {
              id: actId,
              leadId: lead.id,
              userId: performedByUser.id,
              userName: performedByUser.fullName,
              type: 'transfer',
              summary: `إعادة توزيع ذكي تلقائي إلى ${chosen.fullName} حسب تخصص مشروع (${lead.projectInterest})`,
              createdAt: nowIso,
            });
          }
        });

        tx.set(settingsRef, { roundRobinCursor: cursor, updatedAt: nowIso }, { merge: true });
      });
      return newLeads.length;
    }

    const settingsCol = getFallbackCollection('settings');
    const globalDoc = settingsCol.get('global') || {
      id: 'global',
      projects: [...DEFAULT_PROJECTS],
      roundRobinCursor: 0,
    };
    let cursor = Number(globalDoc.roundRobinCursor) || 0;
    const leadsCol = getFallbackCollection('leads');

    newLeads.forEach((lead, idx) => {
      const pool = pickCandidatePool(allUsers, lead.projectInterest, 'project_then_round_robin');
      if (pool.length === 0) return;
      const chosen = pool[cursor % pool.length];
      cursor++;

      if (chosen && chosen.id !== lead.assignedTo) {
        leadsCol.set(lead.id, {
          ...lead,
          assignedTo: chosen.id,
          assignedBy: performedByUser.id,
          updatedAt: nowIso,
        });
        const actId = `act_${Date.now()}_rb_${idx}`;
        getFallbackCollection(this.subcollectionKey(lead.id)).set(actId, {
          id: actId,
          leadId: lead.id,
          userId: performedByUser.id,
          userName: performedByUser.fullName,
          type: 'transfer',
          summary: `إعادة توزيع ذكي تلقائي إلى ${chosen.fullName} حسب تخصص مشروع (${lead.projectInterest})`,
          createdAt: nowIso,
        });
      }
    });

    settingsCol.set('global', { ...globalDoc, roundRobinCursor: cursor, updatedAt: nowIso });
    return newLeads.length;
  }

  /**
   * Google Sheets Lead Import & Round-Robin Distribution inside a Firestore Transaction:
   * - Checks & reserves `leadPhones/{phoneNormalized}` for duplicate prevention.
   * - Advances `settings/global.roundRobinCursor` atomically.
   * - Creates `leads/{leadId}` (without embedded `activities`) + `leads/{leadId}/activities/{actId}`.
   * - Updates `sheetConnections/{connId}` and creates `syncLogs/{logId}`.
   */
  async importSheetsBatchTransaction(params: {
    connection: any;
    parsedCandidates: Array<{
      fullName: string;
      phone: string;
      email: string;
      projectInterest: string;
      campaignName: string;
      propertyType: string;
      budgetMax: number;
      notes: string;
    }>;
    performedByUser: any;
    allUsers: any[];
    rowsScanned: number;
    nowIso: string;
  }): Promise<{
    syncLog: any;
    updatedConnection: any;
    newLeadsImported: number;
    duplicatesSkipped: number;
    notificationsToBroadcast: any[];
  }> {
    const {
      connection,
      parsedCandidates,
      performedByUser,
      allUsers,
      rowsScanned,
      nowIso,
    } = params;

    let newLeadsImported = 0;
    let duplicatesSkipped = 0;
    const assignmentCounter: Record<string, { userId: string; userName: string; count: number }> =
      {};
    const notificationsToBroadcast: any[] = [];

    if (isCloudFirestoreActive()) {
      await adminFirestore.runTransaction(async (tx) => {
        const settingsRef = adminFirestore.collection('settings').doc('global');
        const settingsSnap = await tx.get(settingsRef);
        let cursor = settingsSnap.exists
          ? Number((settingsSnap.data() as any)?.roundRobinCursor) || 0
          : 0;

        // Pre-fetch all candidate phoneNormalized refs in transaction
        const candidatePhones = parsedCandidates.map((c) => normalizePhone(c.phone));
        const uniquePhonesInBatch = Array.from(new Set(candidatePhones.filter(Boolean)));
        const phoneRefs = uniquePhonesInBatch.map((p) =>
          adminFirestore.collection('leadPhones').doc(p)
        );
        const phoneSnaps =
          phoneRefs.length > 0 ? await tx.getAll(...phoneRefs) : [];
        const existingPhoneSet = new Set<string>();
        phoneSnaps.forEach((snap) => {
          if (snap.exists) existingPhoneSet.add(snap.id);
        });

        parsedCandidates.forEach((cand, index) => {
          const phoneNorm = normalizePhone(cand.phone);
          if (!cand.fullName || !phoneNorm) return;

          if (existingPhoneSet.has(phoneNorm)) {
            duplicatesSkipped++;
            return;
          }
          existingPhoneSet.add(phoneNorm);

          const pool = pickCandidatePool(
            allUsers,
            cand.projectInterest,
            connection.routingMode || 'project_then_round_robin'
          );
          const agent = pool[cursor % pool.length] || allUsers[0];
          cursor++;

          const leadId = `lead_${Date.now()}_${index}`;
          const actId = `act_${Date.now()}_${index}`;

          const leadDoc = {
            id: leadId,
            fullName: cand.fullName,
            phone: cand.phone,
            phoneNormalized: phoneNorm,
            email: cand.email,
            source: 'Google Sheets - Meta Ads',
            campaignName: cand.campaignName,
            projectInterest: cand.projectInterest,
            propertyType: cand.propertyType,
            budgetMin: Math.round(cand.budgetMax * 0.8),
            budgetMax: cand.budgetMax,
            status: 'Fresh Lead',
            priority: 'High',
            assignedTo: agent.id,
            assignedBy: performedByUser.id,
            sheetRowId: `sheet_${connection.id}_${Date.now()}_${index}`,
            notes: cand.notes,
            nextFollowUpAt: nowIso.slice(0, 10),
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          const actDoc = {
            id: actId,
            leadId,
            userId: performedByUser.id,
            userName: 'Google Sheets Auto-Router',
            type: 'sheet_import',
            summary: `استيراد تلقائي من "${connection.name}" وتوجيهه فورياً إلى ${agent.fullName} (مشروع: ${cand.projectInterest})`,
            createdAt: nowIso,
          };

          const leadRef = adminFirestore.collection('leads').doc(leadId);
          tx.set(adminFirestore.collection('leadPhones').doc(phoneNorm), {
            phoneNormalized: phoneNorm,
            leadId,
            createdAt: nowIso,
          });
          tx.set(leadRef, leadDoc);
          tx.set(leadRef.collection('activities').doc(actId), actDoc);

          newLeadsImported++;
          if (!assignmentCounter[agent.id]) {
            assignmentCounter[agent.id] = {
              userId: agent.id,
              userName: agent.fullName,
              count: 0,
            };
          }
          assignmentCounter[agent.id].count++;

          notificationsToBroadcast.push({
            id: `notif_${Date.now()}_${index}`,
            userId: agent.id,
            title: 'New Meta Lead Assigned via Google Sheets',
            titleAr: 'ليد جديد من شيت جوجل (حملات Meta)',
            message: `${leadDoc.fullName} interested in ${leadDoc.projectInterest} has been routed to you.`,
            messageAr: `تم تعيين العميل "${leadDoc.fullName}" المهتم بمشروع (${leadDoc.projectInterest}) إليك تلقائياً للتواصل الفوري.`,
            type: 'lead_assigned',
            relatedLeadId: leadId,
            isRead: false,
            createdAt: nowIso,
          });
        });

        const syncLogId = `slog_${Date.now()}`;
        const txSyncLog = {
          id: syncLogId,
          connectionId: connection.id,
          connectionName: connection.name,
          timestamp: nowIso,
          rowsScanned,
          newLeadsImported,
          duplicatesSkipped,
          status: 'success',
          message: `تم فحص ${rowsScanned} صفوف، واستيراد ${newLeadsImported} ليدز جديدة وتوزيعها تلقائياً على فريق المبيعات.`,
          assignmentsSummary: Object.values(assignmentCounter),
        };

        const updatedTotal = (Number(connection.totalImportedCount) || 0) + newLeadsImported;
        const connRef = adminFirestore.collection('sheetConnections').doc(connection.id);
        tx.set(
          connRef,
          { lastSyncedAt: nowIso, totalImportedCount: updatedTotal },
          { merge: true }
        );
        tx.set(adminFirestore.collection('syncLogs').doc(syncLogId), txSyncLog);
        tx.set(settingsRef, { roundRobinCursor: cursor, updatedAt: nowIso }, { merge: true });
      });
    } else {
      // Fallback transactional execution
      const settingsCol = getFallbackCollection('settings');
      const globalDoc = settingsCol.get('global') || {
        id: 'global',
        projects: [...DEFAULT_PROJECTS],
        roundRobinCursor: 0,
      };
      let cursor = Number(globalDoc.roundRobinCursor) || 0;
      const phoneCol = getFallbackCollection('leadPhones');
      const leadsCol = getFallbackCollection('leads');

      parsedCandidates.forEach((cand, index) => {
        const phoneNorm = normalizePhone(cand.phone);
        if (!cand.fullName || !phoneNorm) return;

        if (phoneCol.has(phoneNorm)) {
          duplicatesSkipped++;
          return;
        }

        const pool = pickCandidatePool(
          allUsers,
          cand.projectInterest,
          connection.routingMode || 'project_then_round_robin'
        );
        const agent = pool[cursor % pool.length] || allUsers[0];
        cursor++;

        const leadId = `lead_${Date.now()}_${index}`;
        const actId = `act_${Date.now()}_${index}`;

        const leadDoc = {
          id: leadId,
          fullName: cand.fullName,
          phone: cand.phone,
          phoneNormalized: phoneNorm,
          email: cand.email,
          source: 'Google Sheets - Meta Ads',
          campaignName: cand.campaignName,
          projectInterest: cand.projectInterest,
          propertyType: cand.propertyType,
          budgetMin: Math.round(cand.budgetMax * 0.8),
          budgetMax: cand.budgetMax,
          status: 'Fresh Lead',
          priority: 'High',
          assignedTo: agent.id,
          assignedBy: performedByUser.id,
          sheetRowId: `sheet_${connection.id}_${Date.now()}_${index}`,
          notes: cand.notes,
          nextFollowUpAt: nowIso.slice(0, 10),
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const actDoc = {
          id: actId,
          leadId,
          userId: performedByUser.id,
          userName: 'Google Sheets Auto-Router',
          type: 'sheet_import',
          summary: `استيراد تلقائي من "${connection.name}" وتوجيهه فورياً إلى ${agent.fullName} (مشروع: ${cand.projectInterest})`,
          createdAt: nowIso,
        };

        phoneCol.set(phoneNorm, { phoneNormalized: phoneNorm, leadId, createdAt: nowIso });
        leadsCol.set(leadId, leadDoc);
        getFallbackCollection(this.subcollectionKey(leadId)).set(actId, actDoc);

        newLeadsImported++;
        if (!assignmentCounter[agent.id]) {
          assignmentCounter[agent.id] = {
            userId: agent.id,
            userName: agent.fullName,
            count: 0,
          };
        }
        assignmentCounter[agent.id].count++;

        notificationsToBroadcast.push({
          id: `notif_${Date.now()}_${index}`,
          userId: agent.id,
          title: 'New Meta Lead Assigned via Google Sheets',
          titleAr: 'ليد جديد من شيت جوجل (حملات Meta)',
          message: `${leadDoc.fullName} interested in ${leadDoc.projectInterest} has been routed to you.`,
          messageAr: `تم تعيين العميل "${leadDoc.fullName}" المهتم بمشروع (${leadDoc.projectInterest}) إليك تلقائياً للتواصل الفوري.`,
          type: 'lead_assigned',
          relatedLeadId: leadId,
          isRead: false,
          createdAt: nowIso,
        });
      });

      settingsCol.set('global', { ...globalDoc, roundRobinCursor: cursor, updatedAt: nowIso });
      const connCol = getFallbackCollection('sheetConnections');
      const updatedTotal = (Number(connection.totalImportedCount) || 0) + newLeadsImported;
      connCol.set(connection.id, {
        ...connection,
        lastSyncedAt: nowIso,
        totalImportedCount: updatedTotal,
      });
    }

    const updatedConnection = {
      ...connection,
      lastSyncedAt: nowIso,
      totalImportedCount: (Number(connection.totalImportedCount) || 0) + newLeadsImported,
    };

    const syncLog = {
      id: `slog_${Date.now()}`,
      connectionId: connection.id,
      connectionName: connection.name,
      timestamp: nowIso,
      rowsScanned,
      newLeadsImported,
      duplicatesSkipped,
      status: 'success',
      message: `تم فحص ${rowsScanned} صفوف، واستيراد ${newLeadsImported} ليدز جديدة وتوزيعها تلقائياً على فريق المبيعات.`,
      assignmentsSummary: Object.values(assignmentCounter),
    };

    if (!isCloudFirestoreActive()) {
      getFallbackCollection('syncLogs').set(syncLog.id, syncLog);
    }

    return {
      syncLog,
      updatedConnection,
      newLeadsImported,
      duplicatesSkipped,
      notificationsToBroadcast,
    };
  }
}

export const usersRepo = new UsersRepository();
export const rolesRepo = new RolesRepository();
export const leadsRepo = new LeadsRepository();
export const propertiesRepo = new PropertiesRepository();
export const dealsRepo = new DealsRepository();
export const eventsRepo = new EventsRepository();
export const sheetConnectionsRepo = new SheetConnectionsRepository();
export const syncLogsRepo = new SyncLogsRepository();
export const notificationsRepo = new NotificationsRepository();
export const settingsRepo = new SettingsRepository();

/**
 * Idempotent Dataset Seeder / Importer:
 * Writes all entities, `leadPhones/{phoneNormalized}` uniqueness docs, and `leads/{id}/activities/{actId}`
 * subcollection documents to Firestore using chunked batched writes (max 400 operations per batch).
 * Safe to run multiple times (idempotent).
 */
export async function seedOrMigrateDataset(dataset: ReturnType<typeof getInitialDatabase>): Promise<{
  users: number;
  roles: number;
  leads: number;
  activities: number;
  properties: number;
  deals: number;
  events: number;
  sheetConnections: number;
  syncLogs: number;
  notifications: number;
}> {
  let activitiesCount = 0;

  if (isCloudFirestoreActive()) {
    const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    for (const role of dataset.roles || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('roles').doc(role.id), role, { merge: true })
      );
    }
    for (const user of dataset.users || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('users').doc(user.id), user, { merge: true })
      );
    }
    for (const prop of dataset.properties || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('properties').doc(prop.id), prop, { merge: true })
      );
    }
    for (const deal of dataset.deals || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('deals').doc(deal.id), deal, { merge: true })
      );
    }
    for (const evt of dataset.events || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('events').doc(evt.id), evt, { merge: true })
      );
    }
    for (const conn of dataset.sheetConnections || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('sheetConnections').doc(conn.id), conn, { merge: true })
      );
    }
    for (const log of dataset.syncLogs || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('syncLogs').doc(log.id), log, { merge: true })
      );
    }
    for (const notif of dataset.notifications || []) {
      operations.push((b) =>
        b.set(adminFirestore.collection('notifications').doc(notif.id), notif, { merge: true })
      );
    }

    operations.push((b) =>
      b.set(
        adminFirestore.collection('settings').doc('global'),
        {
          id: 'global',
          projects: dataset.projects || DEFAULT_PROJECTS,
          roundRobinCursor: Number(dataset.roundRobinCursor) || 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
    );

    for (const rawLead of dataset.leads || []) {
      const { activities = [], ...leadDoc } = rawLead;
      const phoneNormalized = normalizePhone(leadDoc.phone || '');
      const cleanLead = {
        ...leadDoc,
        status: normalizeLeadStatus(leadDoc.status),
        phoneNormalized,
      };

      const leadRef = adminFirestore.collection('leads').doc(cleanLead.id);
      operations.push((b) => b.set(leadRef, cleanLead, { merge: true }));

      if (phoneNormalized) {
        operations.push((b) =>
          b.set(
            adminFirestore.collection('leadPhones').doc(phoneNormalized),
            {
              phoneNormalized,
              leadId: cleanLead.id,
              createdAt: cleanLead.createdAt || new Date().toISOString(),
            },
            { merge: true }
          )
        );
      }

      for (const act of activities) {
        activitiesCount++;
        const cleanAct = { ...act, leadId: cleanLead.id };
        operations.push((b) =>
          b.set(leadRef.collection('activities').doc(cleanAct.id), cleanAct, { merge: true })
        );
      }
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = adminFirestore.batch();
      chunk.forEach((op) => op(batch));
      await batch.commit();
    }
  } else {
    for (const role of dataset.roles || []) {
      getFallbackCollection('roles').set(role.id, role);
    }
    for (const user of dataset.users || []) {
      getFallbackCollection('users').set(user.id, user);
    }
    for (const prop of dataset.properties || []) {
      getFallbackCollection('properties').set(prop.id, prop);
    }
    for (const deal of dataset.deals || []) {
      getFallbackCollection('deals').set(deal.id, deal);
    }
    for (const evt of dataset.events || []) {
      getFallbackCollection('events').set(evt.id, evt);
    }
    for (const conn of dataset.sheetConnections || []) {
      getFallbackCollection('sheetConnections').set(conn.id, conn);
    }
    for (const log of dataset.syncLogs || []) {
      getFallbackCollection('syncLogs').set(log.id, log);
    }
    for (const notif of dataset.notifications || []) {
      getFallbackCollection('notifications').set(notif.id, notif);
    }

    getFallbackCollection('settings').set('global', {
      id: 'global',
      projects: dataset.projects || DEFAULT_PROJECTS,
      roundRobinCursor: Number(dataset.roundRobinCursor) || 0,
      updatedAt: new Date().toISOString(),
    });

    for (const rawLead of dataset.leads || []) {
      const { activities = [], ...leadDoc } = rawLead;
      const phoneNormalized = normalizePhone(leadDoc.phone || '');
      const cleanLead = {
        ...leadDoc,
        status: normalizeLeadStatus(leadDoc.status),
        phoneNormalized,
      };

      getFallbackCollection('leads').set(cleanLead.id, cleanLead);
      if (phoneNormalized) {
        getFallbackCollection('leadPhones').set(phoneNormalized, {
          phoneNormalized,
          leadId: cleanLead.id,
          createdAt: cleanLead.createdAt || new Date().toISOString(),
        });
      }
      const subCol = getFallbackCollection(`leads/${cleanLead.id}/activities`);
      for (const act of activities) {
        activitiesCount++;
        subCol.set(act.id, { ...act, leadId: cleanLead.id });
      }
    }
  }

  return {
    users: (dataset.users || []).length,
    roles: (dataset.roles || []).length,
    leads: (dataset.leads || []).length,
    activities: activitiesCount,
    properties: (dataset.properties || []).length,
    deals: (dataset.deals || []).length,
    events: (dataset.events || []).length,
    sheetConnections: (dataset.sheetConnections || []).length,
    syncLogs: (dataset.syncLogs || []).length,
    notifications: (dataset.notifications || []).length,
  };
}
