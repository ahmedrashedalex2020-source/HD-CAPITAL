import { hashPasswordSecure } from '../security';

export function hashPassword(password: string): string {
  return hashPasswordSecure(password);
}

export function createAvatarSvg(initials: string, bgStart: string, bgEnd: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="60" fill="url(#g)" />
    <circle cx="60" cy="44" r="20" fill="rgba(255,255,255,0.22)" />
    <path d="M24 106 C24 78, 96 78, 96 106" fill="rgba(255,255,255,0.22)" />
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Plus Jakarta Sans, Cairo, sans-serif" font-weight="700" font-size="34">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Projects list strictly reflects the CRM1 sheet campaigns/projects only (zero fake projects)
export const DEFAULT_PROJECTS = ['ليدز مغتربين'];

export function getInitialDatabase() {
  const nowIso = new Date().toISOString();

  const roles = [
    {
      id: 'role_admin',
      name: 'Administrator',
      nameAr: 'مدير النظام (Admin)',
      description: 'Full control over all modules, permissions, users, and Google Sheets routing',
      isSystem: true,
      permissions: {
        leads: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        deals: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        contacts: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        properties: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        calendar: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        reports: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        sheets_sync: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        users: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      },
    },
    {
      id: 'role_supervisor',
      name: 'Supervisor',
      nameAr: 'مشرف مبيعات (Supervisor)',
      description: 'Supervises sales team, views all leads & daily reports, and can transfer leads',
      isSystem: true,
      permissions: {
        leads: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'team', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        deals: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        contacts: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        properties: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
        calendar: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'own', export: 'all', import: 'none', transfer: 'all', allowCustomView: true },
        reports: { read: 'all', add: 'all', edit: 'none', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
        sheets_sync: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'team', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
    {
      id: 'role_deputy',
      name: 'Deputy supervisor',
      nameAr: 'نائب المشرف (Deputy)',
      description: 'Assists supervisor with team items, pipeline follow-up, and lead routing',
      isSystem: true,
      permissions: {
        leads: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'team', transfer: 'team', allowCustomView: true },
        deals: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'none', transfer: 'team', allowCustomView: true },
        contacts: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'team', transfer: 'none', allowCustomView: true },
        properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: false },
        calendar: { read: 'team', add: 'team', edit: 'own', editWhenObserver: false, delete: 'own', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        reports: { read: 'team', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'team', import: 'none', transfer: 'none', allowCustomView: false },
        sheets_sync: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'all', transfer: 'none', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
    {
      id: 'role_employee',
      name: 'Employee',
      nameAr: 'مسؤول مبيعات (Sales)',
      description: 'Works on own assigned leads, logs calls & visits, and closes deals',
      isSystem: true,
      permissions: {
        leads: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'own', transfer: 'none', allowCustomView: false },
        deals: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        contacts: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'own', transfer: 'none', allowCustomView: false },
        properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        calendar: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'own', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        reports: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        sheets_sync: { read: 'none', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        users: { read: 'own', add: 'none', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
    {
      id: 'role_observer',
      name: 'Observer',
      nameAr: 'مراقب (Observer)',
      description: 'Read-only visibility into assigned items and analytics without mutation access',
      isSystem: true,
      permissions: {
        leads: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        deals: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        contacts: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        calendar: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        reports: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        sheets_sync: { read: 'none', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
  ];

  const users = [
    {
      id: 'usr_admin',
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      fullName: 'أحمد راشد (Ahmed Rashed)',
      roleId: 'role_admin',
      jobTitle: 'CEO & System Administrator',
      jobTitleAr: 'المدير التنفيذي ومدير النظام',
      avatarUrl: createAvatarSvg('AR', '#1D4ED8', '#3B82F6'),
      email: 'ahmedrashedalex2020@gmail.com',
      phone: '',
      location: 'القاهرة الجديدة · التجمع الخامس',
      assignedProjects: [...DEFAULT_PROJECTS],
      isActiveForRouting: false,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-01-10T09:00:00.000Z',
    },
    {
      id: 'usr_1793010490703_1p0c',
      username: 'omarahmed1',
      passwordHash: hashPassword('123456'),
      fullName: 'عمر احمد',
      roleId: 'role_employee',
      jobTitle: 'Property Sales Consultant',
      jobTitleAr: 'مسؤول مبيعات عقارية',
      avatarUrl: createAvatarSvg('عا', '#2563EB', '#60A5FA'),
      email: 'omarahmed1@propsphere.eg',
      phone: '01114477605',
      location: 'القاهرة الجديدة',
      assignedProjects: [...DEFAULT_PROJECTS],
      isActiveForRouting: true,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-10-26T10:28:10.763Z',
    },
  ];

  // Zero mock data: All leads, deals, properties, events, syncLogs, and notifications start empty and are populated exclusively from the CRM1 Google Sheet
  const leads: any[] = [];
  const properties: any[] = [];
  const deals: any[] = [];
  const events: any[] = [];
  const syncLogs: any[] = [];
  const notifications: any[] = [];

  const sheetConnections = [
    {
      id: 'sheet_conn_1',
      name: 'CRM1 (المصدر الأساسي لبيانات العملاء - Google Drive)',
      driveFileName: 'CRM1',
      spreadsheetId: '1QnxeqejR7-xtjK2aC7qSlwxkUMEPiOCHCYn2ChdLc3A',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1QnxeqejR7-xtjK2aC7qSlwxkUMEPiOCHCYn2ChdLc3A/edit?usp=drivesdk',
      sheetTabName: 'CRM1',
      routingMode: 'project_then_round_robin',
      defaultProject: 'ليدز مغتربين',
      campaignTag: 'CRM1_GoogleDrive_Form',
      autoSyncEnabled: true,
      syncIntervalMinutes: 15,
      ignoreIdColumns: true,
      columnMapping: {
        fullName: 'الاسم',
        phone: 'رقم التليفون',
        email: 'email',
        projectInterest: 'campaign_name',
        campaignName: 'campaign_name',
        propertyType: 'ما_المساحة_المناسبة_؟',
        budgetMax: 'السعر_المناسب',
        notes: 'نظام_السداد',
      },
      lastSyncedAt: '',
      totalImportedCount: 0,
      createdAt: nowIso,
    },
  ];

  return {
    roles,
    users,
    leads,
    properties,
    deals,
    events,
    sheetConnections,
    syncLogs,
    notifications,
    projects: [...DEFAULT_PROJECTS],
    roundRobinCursor: 0,
  };
}
