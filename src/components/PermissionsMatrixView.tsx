import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Plus,
  Users,
  Building2,
  UserCheck,
  Briefcase,
  Calendar,
  BarChart3,
  FileSpreadsheet,
  Shield,
  Save,
  Check,
} from 'lucide-react';
import {
  ModuleKey,
  ModulePermission,
  PermissionScope,
  Role,
  UserProfile,
} from '../types/crm';
import { Lang } from '../i18n/translations';
import { apiRequest } from '../services/api';

interface PermissionsMatrixViewProps {
  lang: Lang;
  currentRole: Role;
  roles: Role[];
  users: UserProfile[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

const MODULES_META: {
  key: ModuleKey;
  labelEn: string;
  labelAr: string;
  color: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    key: 'contacts',
    labelEn: 'Contact',
    labelAr: 'جهات الاتصال والعملاء (Contact)',
    color: 'bg-lime-500',
    icon: UserCheck,
  },
  {
    key: 'properties',
    labelEn: 'Company & Properties Catalog',
    labelAr: 'الشركات وكتالوج العقارات (Company & Units)',
    color: 'bg-amber-500',
    icon: Building2,
  },
  {
    key: 'leads',
    labelEn: 'Lead',
    labelAr: 'إدارة الليدز والتوزيع (Lead)',
    color: 'bg-emerald-500',
    icon: Users,
  },
  {
    key: 'deals',
    labelEn: 'Deal Default pipeline',
    labelAr: 'مراحل الصفقات والمبيعات (Deal Pipeline)',
    color: 'bg-blue-600',
    icon: Briefcase,
  },
  {
    key: 'calendar',
    labelEn: 'Calendar & Site Visits',
    labelAr: 'التقويم والمعاينات الميدانية (Calendar)',
    color: 'bg-indigo-500',
    icon: Calendar,
  },
  {
    key: 'reports',
    labelEn: 'Sales Plan & Daily Analytics',
    labelAr: 'خطة المبيعات والتقارير اليومية (Analytics)',
    color: 'bg-purple-600',
    icon: BarChart3,
  },
  {
    key: 'sheets_sync',
    labelEn: 'Google Sheets Meta Sync',
    labelAr: 'استيراد وتوزيع شيتات جوجل (Google Sheets)',
    color: 'bg-teal-600',
    icon: FileSpreadsheet,
  },
  {
    key: 'users',
    labelEn: 'Users & Access Preferences',
    labelAr: 'إدارة المستخدمين والصلاحيات (Users)',
    color: 'bg-slate-700',
    icon: Shield,
  },
];

const PERMISSION_ROWS: {
  field: keyof ModulePermission;
  labelEn: string;
  labelAr: string;
  isBoolean?: boolean;
}[] = [
  { field: 'read', labelEn: 'Read', labelAr: 'قراءة وعرض (Read)' },
  { field: 'add', labelEn: 'Add', labelAr: 'إضافة جديد (Add)' },
  { field: 'edit', labelEn: 'Edit', labelAr: 'تعديل البيانات (Edit)' },
  {
    field: 'editWhenObserver',
    labelEn: 'Edit when observer',
    labelAr: 'السماح بالتعديل للمراقب (Edit when observer)',
    isBoolean: true,
  },
  { field: 'delete', labelEn: 'Delete', labelAr: 'حذف السجلات (Delete)' },
  { field: 'export', labelEn: 'Export', labelAr: 'تصدير البيانات (Export)' },
  { field: 'import', labelEn: 'Import', labelAr: 'استيراد من شيت (Import)' },
  { field: 'transfer', labelEn: 'Transfer Leads', labelAr: 'نقل الليدز بين السيلز (Transfer)' },
  {
    field: 'allowCustomView',
    labelEn: 'Allow custom view form',
    labelAr: 'تخصيص شاشات العرض (Allow custom view form)',
    isBoolean: true,
  },
];

const SCOPE_OPTIONS: { value: PermissionScope; labelEn: string; labelAr: string }[] = [
  {
    value: 'own',
    labelEn: 'Only their own items',
    labelAr: 'عناصرهم الخاصة فقط (Only their own items)',
  },
  {
    value: 'team',
    labelEn: 'Items of their ... and 1 more',
    labelAr: 'عناصر الفريق والفرعية (Team & Subordinates)',
  },
  {
    value: 'all',
    labelEn: 'All',
    labelAr: 'الكل (All)',
  },
  {
    value: 'none',
    labelEn: 'Deny access',
    labelAr: 'منع الوصول (Deny access)',
  },
];

export const PermissionsMatrixView: React.FC<PermissionsMatrixViewProps> = ({
  lang,
  currentRole,
  roles,
  users,
  onRefresh,
  onToast,
}) => {
  const isAr = lang === 'ar';
  const [localRoles, setLocalRoles] = useState<Role[]>(() =>
    JSON.parse(JSON.stringify(roles))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNavModule, setActiveNavModule] = useState<ModuleKey | 'ALL'>('ALL');
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add New Role Modal
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleNameAr, setNewRoleNameAr] = useState('');

  // Assign User to Role Modal
  const [assignModalRole, setAssignModalRole] = useState<Role | null>(null);

  const isAdmin = currentRole.id === 'role_admin';

  const handleScopeChange = (
    roleId: string,
    moduleKey: ModuleKey,
    field: keyof ModulePermission,
    newVal: PermissionScope | boolean
  ) => {
    if (!isAdmin) {
      onToast(
        isAr
          ? 'فقط مدير النظام (Admin) يمكنه تعديل مصفوفة الصلاحيات'
          : 'Only Administrator can modify the permissions matrix'
      );
      return;
    }
    setLocalRoles((prev) =>
      prev.map((r) => {
        if (r.id !== roleId) return r;
        return {
          ...r,
          permissions: {
            ...r.permissions,
            [moduleKey]: {
              ...r.permissions[moduleKey],
              [field]: newVal,
            },
          },
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleSaveMatrix = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/roles/matrix', {
        method: 'PUT',
        body: JSON.stringify({ roles: localRoles }),
      });
      setHasUnsavedChanges(false);
      onToast(
        isAr
          ? 'تم حفظ مصفوفة الصلاحيات وتطبيقها فوراً على كافة شاشات النظام!'
          : 'Access permissions matrix saved and enforced across all CRM views!'
      );
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      const res = await apiRequest('/api/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoleName,
          nameAr: newRoleNameAr || newRoleName,
        }),
      });
      setLocalRoles(res.roles);
      setNewRoleName('');
      setNewRoleNameAr('');
      setShowAddRoleModal(false);
      onToast(isAr ? 'تم إنشاء الدور الوظيفي الجديد بنجاح' : 'New role created');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleAssignUserRole = async (userId: string, roleId: string) => {
    try {
      await apiRequest(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ roleId }),
      });
      onToast(isAr ? 'تم تحديث دور الموظف بنجاح' : 'Employee role updated');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const toggleCollapse = (key: string) => {
    setCollapsedModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const visibleModules = MODULES_META.filter((m) => {
    if (activeNavModule !== 'ALL' && m.key !== activeNavModule) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        m.labelEn.toLowerCase().includes(q) ||
        m.labelAr.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Top Header Strip matching Reference Image 2 ("Access permissions | All employees | Search") */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F8FAFC]">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900">
            {isAr ? 'صلاحيات الوصول (Access permissions)' : 'Access permissions'}
          </h1>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700">
            <span>{isAr ? 'جميع الموظفين' : 'All employees'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث في الصلاحيات...' : 'Search'}
              className="w-full ps-8 pe-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <button
              onClick={() => setShowAddRoleModal(true)}
              className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'إضافة دور جديد' : 'Add Role'}</span>
            </button>
          )}
          {hasUnsavedChanges && (
            <button
              onClick={handleSaveMatrix}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? isAr
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'حفظ وتطبيق الصلاحيات'
                  : 'Save Permissions'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Body matching Reference Image 2 (Left CRM Sub-Nav + Right Role Columns Matrix) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[680px]">
        {/* Left Sub-Navigation */}
        <aside className="lg:col-span-2 border-b lg:border-b-0 lg:border-e border-slate-200 bg-[#F4F7FE]/60 p-4 space-y-1">
          <button
            onClick={() => setActiveNavModule('ALL')}
            className={`w-full text-start px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeNavModule === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'text-slate-700 hover:bg-slate-200/60'
            }`}
          >
            CRM ({MODULES_META.length})
          </button>

          {MODULES_META.map((mod) => (
            <button
              key={mod.key}
              onClick={() => setActiveNavModule(mod.key)}
              className={`w-full text-start px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate cursor-pointer ${
                activeNavModule === mod.key
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {isAr ? mod.labelAr.split('(')[0] : mod.labelEn}
            </button>
          ))}
        </aside>

        {/* Right Permissions Matrix Table */}
        <div className="lg:col-span-10 overflow-x-auto">
          <table className="w-full border-collapse min-w-[920px]">
            {/* Sticky Role Columns Header matching Reference Image 2 */}
            <thead>
              <tr className="border-b border-slate-200 bg-white">
                <th className="p-4 text-start w-60 align-top border-e border-slate-100">
                  <div className="text-xs font-semibold text-slate-800 mb-2">
                    {isAr ? 'الأدوار الوظيفية (Roles)' : 'Roles'}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 text-[11px] text-slate-600 font-mono-tabular">
                    <span>
                      {localRoles.length} out of {localRoles.length}
                    </span>
                  </div>
                </th>

                {localRoles.map((roleObj) => {
                  const roleUsers = users.filter((u) => u.roleId === roleObj.id);
                  return (
                    <th
                      key={roleObj.id}
                      className="p-4 text-center align-top border-e border-slate-100 min-w-[155px]"
                    >
                      <div className="text-xs font-semibold text-slate-800 mb-2.5">
                        {isAr ? roleObj.nameAr : roleObj.name}
                      </div>

                      <div className="flex items-center justify-center gap-1">
                        {roleUsers.slice(0, 2).map((u) => (
                          <img
                            key={u.id}
                            src={u.avatarUrl}
                            alt={u.fullName}
                            title={u.fullName}
                            referrerPolicy="no-referrer"
                            className="w-6 h-6 rounded-full object-cover border border-white -ms-1 first:ms-0"
                          />
                        ))}
                        <button
                          onClick={() => setAssignModalRole(roleObj)}
                          title={
                            isAr
                              ? 'تعيين أو عرض موظفي هذا الدور'
                              : 'Assign employees to this role'
                          }
                          className="w-6 h-6 rounded-full border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {visibleModules.map((mod) => {
                const isCollapsed = Boolean(collapsedModules[mod.key]);
                const IconComp = mod.icon;

                return (
                  <React.Fragment key={mod.key}>
                    {/* Module Section Header Row (e.g., ^ Contact / ^ Company) */}
                    <tr className="bg-[#F8FAFC] border-y border-slate-200">
                      <td colSpan={localRoles.length + 1} className="py-3 px-4">
                        <button
                          onClick={() => toggleCollapse(mod.key)}
                          className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          )}
                          <span
                            className={`w-5 h-5 rounded-full ${mod.color} text-white flex items-center justify-center`}
                          >
                            <IconComp className="w-3 h-3" />
                          </span>
                          <span>{isAr ? mod.labelAr : mod.labelEn}</span>
                        </button>
                      </td>
                    </tr>

                    {/* Permission Action Rows (Read, Add, Edit, Edit when observer, Delete, Export, Import, Transfer, Allow custom view form) */}
                    {!isCollapsed &&
                      PERMISSION_ROWS.map((row) => (
                        <tr
                          key={`${mod.key}_${row.field}`}
                          className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors text-xs"
                        >
                          <td className="py-3 px-5 text-slate-700 font-medium border-e border-slate-100">
                            {isAr ? row.labelAr : row.labelEn}
                          </td>

                          {localRoles.map((roleObj) => {
                            const modPerm = roleObj.permissions?.[mod.key];
                            const val = modPerm ? modPerm[row.field] : 'none';

                            return (
                              <td
                                key={`${roleObj.id}_${mod.key}_${row.field}`}
                                className="py-3 px-3 text-center border-e border-slate-100"
                              >
                                {row.isBoolean ? (
                                  /* Toggle Switch matching Reference Image 2 */
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleScopeChange(
                                        roleObj.id,
                                        mod.key,
                                        row.field,
                                        !Boolean(val)
                                      )
                                    }
                                    className={`w-9 h-5 rounded-full transition-colors inline-flex items-center px-0.5 cursor-pointer ${
                                      val ? 'bg-blue-600' : 'bg-slate-200'
                                    }`}
                                  >
                                    <span
                                      className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                                        val
                                          ? isAr
                                            ? '-translate-x-4'
                                            : 'translate-x-4'
                                          : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                ) : (
                                  /* Underlined Scope Selector matching Reference Image 2 ("Only their own items" / "All" / "Deny access") */
                                  <select
                                    value={String(val)}
                                    onChange={(e) =>
                                      handleScopeChange(
                                        roleObj.id,
                                        mod.key,
                                        row.field,
                                        e.target.value as PermissionScope
                                      )
                                    }
                                    className={`bg-transparent text-center text-xs underline decoration-dotted underline-offset-4 cursor-pointer focus:outline-none ${
                                      val === 'none'
                                        ? 'text-slate-400'
                                        : val === 'all'
                                        ? 'text-blue-600 font-medium'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {SCOPE_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {isAr ? opt.labelAr.split('(')[0] : opt.labelEn}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky Bottom Save Bar when modifications are made */}
      {hasUnsavedChanges && (
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <span className="text-xs">
            {isAr
              ? 'لديك تعديلات غير محفوظة في مصفوفة الصلاحيات. اضغط حفظ لتطبيقها فوراً على جميع المستخدمين.'
              : 'You have unsaved permission changes. Click Save to enforce them immediately across all users.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLocalRoles(JSON.parse(JSON.stringify(roles)));
                setHasUnsavedChanges(false);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold cursor-pointer"
            >
              { isAr ? 'تراجع' : 'Discard' }
            </button>
            <button
              onClick={handleSaveMatrix}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isAr ? 'حفظ وتطبيق الصلاحيات' : 'Save & Apply'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Add New Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {isAr ? 'إضافة دور وظيفي جديد للمصفوفة' : 'Add New Role to Permissions Matrix'}
            </h3>
            <form onSubmit={handleAddRole} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم الدور بالإنجليزية *' : 'Role Name (English) *'}
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Branch Manager"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'اسم الدور بالعربية' : 'Role Name (Arabic)'}
                </label>
                <input
                  type="text"
                  value={newRoleNameAr}
                  onChange={(e) => setNewRoleNameAr(e.target.value)}
                  placeholder="مثال: مدير فرع"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'إضافة الدور' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Employees to Role Modal (Triggered by the + button under Role column headers) */}
      {assignModalRole && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {isAr
                ? `تعيين الموظفين لدور: ${assignModalRole.nameAr}`
                : `Assign Employees to Role: ${assignModalRole.name}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAr
                ? 'اختر الموظفين لتعيينهم في هذا الدور وتطبيق صلاحياته عليهم فوراً:'
                : 'Click on any employee to assign them to this role:'}
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.map((u) => {
                const isInRole = u.roleId === assignModalRole.id;
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-[#F8FAFC]"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={u.avatarUrl}
                        alt={u.fullName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{u.fullName}</div>
                        <div className="text-[11px] text-slate-500">@{u.username}</div>
                      </div>
                    </div>
                    {isInRole ? (
                      <span className="text-xs font-semibold text-emerald-600">
                        {isAr ? 'معين حالياً' : 'Assigned'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAssignUserRole(u.id, assignModalRole.id)}
                        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isAr ? 'تعيين' : 'Assign'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setAssignModalRole(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
