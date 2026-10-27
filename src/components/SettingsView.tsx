import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import {
  Role,
  SheetConnection,
  SyncLog,
  UserProfile,
} from '../types/crm';
import { Lang } from '../i18n/translations';
import { GoogleSheetsView } from './GoogleSheetsView';
import { PermissionsMatrixView } from './PermissionsMatrixView';

interface SettingsViewProps {
  lang: Lang;
  currentRole: Role;
  users: UserProfile[];
  roles: Role[];
  projects: string[];
  sheetConnections: SheetConnection[];
  syncLogs: SyncLog[];
  initialSubTab?: 'sheets' | 'permissions';
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  currentRole,
  users,
  roles,
  projects,
  sheetConnections,
  syncLogs,
  initialSubTab = 'sheets',
  onRefresh,
  onToast,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = currentRole.id === 'role_admin';
  const canAccessSheets =
    isAdmin || (Boolean(currentRole.permissions?.sheets_sync?.read) && currentRole.permissions.sheets_sync.read !== 'none');
  const canAccessPermissions = isAdmin;

  const [activeSubTab, setActiveSubTab] = useState<'sheets' | 'permissions'>(
    initialSubTab === 'permissions' && canAccessPermissions ? 'permissions' : 'sheets'
  );

  return (
    <div className="space-y-6">
      {/* Settings Navigation Subtabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
            <Settings className="w-4 h-4" />
            <span>{isAr ? 'إعدادات النظام وإدارة المصادر' : 'System & Integration Settings'}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {isAr ? 'الإعدادات العامة للنظام' : 'General CRM Settings'}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit border border-slate-200/80">
          {canAccessSheets && (
            <button
              onClick={() => setActiveSubTab('sheets')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'sheets'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'ربط مصدر العملاء (Google Sheets)' : 'Client Source Sync'}</span>
            </button>
          )}

          {canAccessPermissions && (
            <button
              onClick={() => setActiveSubTab('permissions')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'permissions'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>{isAr ? 'إدارة الصلاحيات والأدوار' : 'Permissions & Roles'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Render Selected Settings Subview */}
      {activeSubTab === 'sheets' && canAccessSheets && (
        <GoogleSheetsView
          lang={lang}
          currentRole={currentRole}
          users={users}
          projects={projects}
          sheetConnections={sheetConnections}
          syncLogs={syncLogs}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      )}

      {activeSubTab === 'permissions' && canAccessPermissions && (
        <PermissionsMatrixView
          lang={lang}
          currentRole={currentRole}
          roles={roles}
          users={users}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      )}
    </div>
  );
};
