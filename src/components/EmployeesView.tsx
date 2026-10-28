import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  User,
  Lock,
  Mail,
  Phone,
  MapPin,
  Building2,
  ArrowLeftRight,
  Upload,
  Check,
  X,
  Shield,
} from 'lucide-react';
import {
  AgentLeadCountBreakdown,
  Lead,
  normalizeLeadStatus,
  PaginatedLeadsResponse,
  Role,
  UserProfile,
} from '../types/crm';
import { Lang, translations } from '../i18n/translations';
import { apiRequest, swrFetch } from '../services/api';

interface EmployeesViewProps {
  lang: Lang;
  currentUser: UserProfile;
  currentRole: Role;
  users: UserProfile[];
  roles: Role[];
  agentLeadCounts?: Record<string, AgentLeadCountBreakdown>;
  leads?: Lead[];
  projects: string[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
  onOpenTransferForAgent: (fromUserId?: string, toUserId?: string) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  lang,
  currentUser,
  currentRole,
  users,
  roles,
  agentLeadCounts = {},
  leads = [],
  projects,
  onRefresh,
  onToast,
  onOpenTransferForAgent,
}) => {
  const isAr = lang === 'ar';
  const t = translations[lang];

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfileLeads, setSelectedProfileLeads] = useState<Lead[]>([]);
  const [loadingProfileLeads, setLoadingProfileLeads] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  React.useEffect(() => {
    if (!selectedProfileId) {
      setSelectedProfileLeads([]);
      return;
    }
    let cancelled = false;
    const path = `/api/leads?assignedTo=${encodeURIComponent(selectedProfileId)}&limit=30`;
    setLoadingProfileLeads(true);
    swrFetch<PaginatedLeadsResponse>(path, {
      onCached: (cached) => {
        if (!cancelled && cached?.items) {
          setSelectedProfileLeads(cached.items);
          setLoadingProfileLeads(false);
        }
      },
    })
      .then((res) => {
        if (!cancelled && res?.items) {
          setSelectedProfileLeads(res.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingProfileLeads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProfileId]);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    roleId: 'role_employee',
    jobTitle: 'Senior Property Advisor',
    jobTitleAr: 'مستشار مبيعات عقارية',
    avatarUrl: '',
    email: '',
    phone: '',
    location: 'القاهرة الجديدة · التجمع الخامس',
    assignedProjects: [] as string[],
    isActiveForRouting: true,
    routingWeight: 1,
  });

  const canManageUsers =
    currentRole.id === 'role_admin' || currentRole.permissions?.users?.add !== 'none';
  const canTransfer =
    currentRole.id === 'role_admin' || currentRole.permissions?.leads?.transfer !== 'none';

  const visibleUsers =
    currentRole.id === 'role_admin' ||
    currentRole.permissions?.users?.read === 'all' ||
    currentRole.permissions?.users?.read === 'team'
      ? users
      : users.filter((u) => u.id === currentUser.id);

  const selectedProfile = visibleUsers.find((u) => u.id === selectedProfileId) || null;

  const openAddEmployeeModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      fullName: '',
      roleId: 'role_employee',
      jobTitle: 'Property Sales Consultant',
      jobTitleAr: 'مسؤول مبيعات عقارية',
      avatarUrl: '',
      email: '',
      phone: '',
      location: 'القاهرة الجديدة',
      assignedProjects: [projects[0] || 'ليدز مغتربين'],
      isActiveForRouting: true,
      routingWeight: 1,
    });
    setShowUserModal(true);
  };

  const openEditEmployeeModal = (u: UserProfile) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '', // leave blank unless changing password
      fullName: u.fullName,
      roleId: u.roleId,
      jobTitle: u.jobTitle,
      jobTitleAr: u.jobTitleAr,
      avatarUrl: u.avatarUrl,
      email: u.email,
      phone: u.phone,
      location: u.location,
      assignedProjects: u.assignedProjects || [],
      isActiveForRouting: u.isActiveForRouting,
      routingWeight: u.routingWeight || 1,
    });
    setShowUserModal(true);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 160;
          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, MAX_SIZE, MAX_SIZE);
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            setFormData((prev) => ({ ...prev, avatarUrl: compressed }));
          } else {
            setFormData((prev) => ({ ...prev, avatarUrl: reader.result as string }));
          }
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleProjectSelection = (proj: string) => {
    setFormData((prev) => {
      const exists = prev.assignedProjects.includes(proj);
      return {
        ...prev,
        assignedProjects: exists
          ? prev.assignedProjects.filter((p) => p !== proj)
          : [...prev.assignedProjects, proj],
      };
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        onToast(
          isAr
            ? 'تم تحديث بيانات البروفايل وحساب المستخدم بنجاح'
            : 'Employee profile and credentials updated'
        );
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        onToast(
          isAr
            ? `تم إنشاء حساب الموظف (@${formData.username}) وبروفايله بنجاح!`
            : `Created employee account (@${formData.username})!`
        );
      }
      setShowUserModal(false);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (u.id === 'usr_admin') {
      onToast(isAr ? 'لا يمكن حذف حساب مدير النظام الرئيسي' : 'Cannot delete primary Admin');
      return;
    }
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
      if (selectedProfileId === u.id) setSelectedProfileId(null);
      onToast(isAr ? 'تم حذف حساب المستخدم' : 'User deleted');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const getRoleName = (roleId: string) => {
    const r = roles.find((item) => item.id === roleId);
    if (!r) return roleId;
    return isAr ? r.nameAr : r.name;
  };

  return (
    <div className="space-y-6">
      {/* Top Bar matching Reference Image 3 ("Employees (N) | List | Activity | + Add Employee") */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isAr
              ? `فريق المبيعات وحسابات المستشارين (${visibleUsers.length})`
              : `Sales Team & Advisors (${visibleUsers.length})`}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr
              ? 'إدارة حسابات مستشاري المبيعات، الصلاحيات، والمشروعات العقارية المعينة لكل موظف'
              : 'Manage sales advisor accounts, permissions, and assigned real estate projects'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() =>
              setSelectedProfileId(
                selectedProfileId === currentUser.id ? null : currentUser.id
              )
            }
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'ملفي الشخصي (My Profile)' : 'My Profile'}</span>
          </button>

          {canManageUsers && (
            <button
              onClick={openAddEmployeeModal}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة مستخدم جديد' : 'Add Employee'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected User Detailed Profile View (Matches Reference Image 3 "My Profile" screen) */}
      {selectedProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white rounded-2xl border border-blue-200 p-6 shadow-xs">
          {/* Left Profile Card */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-e border-slate-100 pb-6 lg:pb-0 lg:pe-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <img
                    src={selectedProfile.avatarUrl}
                    alt={selectedProfile.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 p-0.5"
                  />
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedProfile.fullName}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {isAr ? selectedProfile.jobTitleAr : selectedProfile.jobTitle}
                    </p>
                    <p className="text-[11px] font-mono-tabular text-blue-600 mt-0.5">
                      @{selectedProfile.username} · {getRoleName(selectedProfile.roleId)}
                    </p>
                  </div>
                </div>
                {(canManageUsers || selectedProfile.id === currentUser.id) && (
                  <button
                    onClick={() => openEditEmployeeModal(selectedProfile)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    title={isAr ? 'تعديل البروفايل وكلمة المرور' : 'Edit Profile & Password'}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mt-6 space-y-3 text-xs">
                {(canManageUsers || selectedProfile.id === currentUser.id) && (
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                    <div className="text-blue-700 font-semibold mb-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {isAr ? 'بيانات تسجيل الدخول للنظام' : 'System Login Credentials'}
                      </span>
                    </div>
                    <div className="font-mono-tabular text-slate-800 flex items-center justify-between">
                      <span>User: {selectedProfile.username}</span>
                      <span className="font-bold text-blue-700">
                        Pass:{' '}
                        {selectedProfile.accessPassword ||
                          (selectedProfile.id === 'usr_admin2'
                            ? 'HD_CAPITAL'
                            : selectedProfile.username === 'admin'
                            ? 'admin123'
                            : '123456')}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100">
                  <div className="text-slate-400 mb-0.5">{isAr ? 'البريد الإلكتروني' : 'Email'}</div>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    <span>{selectedProfile.email}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100">
                  <div className="text-slate-400 mb-0.5">{isAr ? 'رقم الهاتف' : 'Phone Number'}</div>
                  <div className="font-mono-tabular font-medium text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    <span>{selectedProfile.phone}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100">
                  <div className="text-slate-400 mb-0.5">{isAr ? 'المنطقة / الفرع' : 'Location'}</div>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>{selectedProfile.location}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              {canTransfer && (
                <button
                  onClick={() => onOpenTransferForAgent(selectedProfile.id)}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>
                    {isAr ? 'نقل ليدز هذا المندوب لسيلز آخر' : 'Transfer Agent Leads'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setSelectedProfileId(null)}
                className="py-2 px-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>

          {/* Right Profile Assigned Leads & Projects */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr
                    ? 'المشاريع العقارية المسندة في التوزيع التلقائي'
                    : 'Assigned Real Estate Projects for Auto-Routing'}
                </h3>
                <span className="text-xs font-semibold text-blue-600">
                  {selectedProfile.isActiveForRouting
                    ? isAr
                      ? 'نشط في استلام ليدز Google Sheets'
                      : 'Active in Google Sheets Routing'
                    : isAr
                    ? 'غير مفعل في التوزيع التلقائي'
                    : 'Excluded from Auto-Routing'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedProfile.assignedProjects || []).map((proj) => (
                  <span
                    key={proj}
                    className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-slate-200 text-xs font-medium text-slate-700"
                  >
                    {proj}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                {isAr
                  ? `الليدز المعينة حالياً لـ ${selectedProfile.fullName}`
                  : `Leads Currently Assigned to ${selectedProfile.fullName}`}
              </h3>
              <div className="space-y-2.5 max-h-60 overflow-y-auto pe-1">
                {loadingProfileLeads && selectedProfileLeads.length === 0 ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className="h-12 rounded-xl bg-slate-100 animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  (selectedProfileLeads.length > 0
                    ? selectedProfileLeads
                    : leads.filter((l) => l.assignedTo === selectedProfile.id)
                  ).map((l) => (
                    <div
                      key={l.id}
                      className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{l.fullName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {l.phone} · {l.projectInterest} · {l.propertyType}
                        </div>
                      </div>
                      <div className="text-end font-mono-tabular">
                        <div className="font-bold text-blue-600">
                          {(l.budgetMax / 1000000).toFixed(1)}M EGP
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.status[normalizeLeadStatus(l.status)]}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Cards Grid matching Reference Image 3 ("Employees (28)" 4-column card layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {visibleUsers.map((emp) => {
          const agentStats = agentLeadCounts[emp.id];
          const empLeads = leads.filter((l) => l.assignedTo === emp.id);
          const backlogCount = agentStats
            ? agentStats.newCount
            : empLeads.filter((l) => normalizeLeadStatus(l.status) === 'Fresh Lead').length;
          const inProgressCount = agentStats
            ? agentStats.inProgressCount
            : empLeads.filter((l) =>
                [
                  'No Answer',
                  'Follow Up',
                  'Interested',
                  'Inspection',
                  'Visit',
                  'Reservation',
                ].includes(normalizeLeadStatus(l.status))
              ).length;
          const wonCount = agentStats
            ? agentStats.wonCount
            : empLeads.filter((l) => normalizeLeadStatus(l.status) === 'Contracted').length;

          return (
            <div
              key={emp.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between hover:border-blue-400 transition-colors"
            >
              <div>
                {/* Top Card Actions */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                  <span className="font-mono-tabular">@{emp.username}</span>
                  <div className="flex items-center gap-1">
                    {(canManageUsers || emp.id === currentUser.id) && (
                      <button
                        onClick={() => openEditEmployeeModal(emp)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                        title={isAr ? 'تعديل الموظف' : 'Edit'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canManageUsers && emp.id !== 'usr_admin' && emp.id !== 'usr_admin2' && (
                      <button
                        onClick={() => handleDeleteUser(emp)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer"
                        title={isAr ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Centered Avatar & Name matching Reference Image 3 */}
                <div
                  onClick={() => setSelectedProfileId(emp.id)}
                  className="text-center cursor-pointer"
                >
                  <img
                    src={emp.avatarUrl}
                    alt={emp.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-blue-500/30 p-0.5"
                  />
                  <h3 className="text-sm font-bold text-slate-900 mt-3 hover:text-blue-600">
                    {emp.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isAr ? emp.jobTitleAr : emp.jobTitle}
                  </p>
                  <p className="text-[11px] text-blue-600 font-medium mt-1">
                    {getRoleName(emp.roleId)}
                  </p>
                  {canManageUsers && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono-tabular text-slate-700">
                      <Lock className="w-3 h-3 text-blue-600" />
                      <span>
                        Pass:{' '}
                        <strong className="text-blue-700">
                          {emp.accessPassword ||
                            (emp.id === 'usr_admin2'
                              ? 'HD_CAPITAL'
                              : emp.username === 'admin'
                              ? 'admin123'
                              : '123456')}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3 Bottom Metrics matching Reference Image 3 (Backlog / Tasks in Progress / Tasks in Review) */}
              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-base font-bold text-slate-900 font-mono-tabular">
                    {backlogCount}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isAr ? 'ليد جديد' : 'New Leads'}
                  </div>
                </div>
                <div>
                  <div className="text-base font-bold text-blue-600 font-mono-tabular">
                    {inProgressCount}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isAr ? 'قيد المتابعة' : 'In Progress'}
                  </div>
                </div>
                <div>
                  <div className="text-base font-bold text-emerald-600 font-mono-tabular">
                    {wonCount}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isAr ? 'تعاقد ناجح' : 'Closed Won'}
                  </div>
                </div>
              </div>

              {canTransfer && (
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenTransferForAgent(undefined, emp.id)}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title={isAr ? `إسناد ليدز إلى ${emp.fullName}` : `Assign leads to ${emp.fullName}`}
                  >
                    <ArrowLeftRight className="w-3 h-3 text-blue-600" />
                    <span>{isAr ? 'إسناد ليدز له' : 'Assign Leads'}</span>
                  </button>
                  <button
                    onClick={() => onOpenTransferForAgent(emp.id, undefined)}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title={isAr ? `نقل ليدز من ${emp.fullName} لسيلز آخر` : `Transfer leads from ${emp.fullName}`}
                  >
                    <span>{isAr ? 'نقل منه' : 'Transfer Out'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Employee Modal (Username, Password, Name, Photo Upload, Role, Projects) */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingUser
                  ? isAr
                    ? `تعديل بروفايل وبيانات دخول: ${editingUser.fullName}`
                    : `Edit Profile & Credentials: ${editingUser.fullName}`
                  : isAr
                  ? 'إضافة مستخدم جديد للنظام (يوزرنيم وباسورد وبروفايل)'
                  : 'Create New CRM User (Username, Password & Profile)'}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="mt-4 space-y-4 text-xs">
              {/* Profile Photo Upload & Preview */}
              <div className="flex items-center gap-4 p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                {formData.avatarUrl ? (
                  <img
                    src={formData.avatarUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                    {formData.fullName ? formData.fullName[0] : 'U'}
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <label className="block font-semibold text-slate-800">
                    {isAr ? 'صورة البروفايل الشخصية' : 'Profile Photo'}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>{isAr ? 'رفع صورة من الجهاز' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="text"
                      value={formData.avatarUrl}
                      onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                      placeholder={isAr ? 'أو الصق رابط صورة مباشر...' : 'Or paste image URL...'}
                      className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الاسم الكامل للموظف *' : 'Full Name *'}
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder={isAr ? 'مثال: كريم محمود' : 'e.g. Karim Mahmoud'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الدور الوظيفي والصلاحية (Role) *' : 'Access Role *'}
                  </label>
                  <select
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {isAr ? r.nameAr : r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'اسم المستخدم للدخول (Username) *' : 'Login Username *'}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. karim_sales"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {editingUser
                      ? isAr
                        ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)'
                        : 'New Password (leave blank to keep)'
                      : isAr
                      ? 'كلمة المرور (Password) *'
                      : 'Login Password *'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                    required={!editingUser}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'المسمى الوظيفي (بالعربية)' : 'Job Title (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.jobTitleAr}
                    onChange={(e) => setFormData({ ...formData, jobTitleAr: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono-tabular"
                  />
                </div>
              </div>

              {/* Project Specialization for Google Sheets Auto-Routing */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  {isAr
                    ? 'المشاريع العقارية المخصصة لهذا المندوب (لتوجيه ليدز Google Sheets تلقائياً):'
                    : 'Assigned Real Estate Projects (for Google Sheets Lead Auto-Routing):'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {projects.map((proj) => {
                    const selected = formData.assignedProjects.includes(proj);
                    return (
                      <button
                        key={proj}
                        type="button"
                        onClick={() => toggleProjectSelection(proj)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        <span>{proj}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-slate-100">
                <div>
                  <div className="font-semibold text-slate-800">
                    {isAr
                      ? 'تفعيل استلام الليدز التلقائي من شيت جوجل'
                      : 'Receive Automatic Leads from Google Sheets'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr
                      ? 'إدراج الموظف في دورة التوزيع الدائري (Round-Robin) اليومية'
                      : 'Include employee in daily Round-Robin lead distribution'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.isActiveForRouting}
                  onChange={(e) =>
                    setFormData({ ...formData, isActiveForRouting: e.target.checked })
                  }
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'حفظ بيانات المستخدم' : 'Save User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
