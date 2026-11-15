import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Edit3,
  Lock,
  MapPin,
  Plus,
  Unlock,
  UserPlus,
  X,
} from 'lucide-react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type { Department, User, UserRole, UserStatus } from '../types/database';

export interface AdminUsersDeptsProps {
  user: User;
}

export function AdminUsersDepts({ user: currentAdmin }: AdminUsersDeptsProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add User Form
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STAFF');
  const [newDeptId, setNewDeptId] = useState('DEP-01');
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Department Modal (Add / Edit)
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [deptIdInput, setDeptIdInput] = useState('');
  const [deptNameInput, setDeptNameInput] = useState('');
  const [deptLocationInput, setDeptLocationInput] = useState('');
  const [deptFormError, setDeptFormError] = useState<string | null>(null);
  const [isSavingDept, setIsSavingDept] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const refreshData = useCallback(async () => {
    const [uRes, dRes] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: true }),
      supabase
        .from('departments')
        .select('*')
        .order('department_id', { ascending: true }),
    ]);

    if (!uRes.error && uRes.data) {
      setUsers(uRes.data as User[]);
    }
    if (!dRes.error && dRes.data) {
      const deptList = dRes.data as Department[];
      setDepartments(deptList);
      setNewDeptId((prev) =>
        deptList.length > 0 && !deptList.some((d) => d.department_id === prev)
          ? deptList[0].department_id
          : prev
      );
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const [uRes, dRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: true }),
        supabase
          .from('departments')
          .select('*')
          .order('department_id', { ascending: true }),
      ]);
      if (!active) return;

      if (!uRes.error && uRes.data) setUsers(uRes.data as User[]);
      if (!dRes.error && dRes.data) {
        const deptList = dRes.data as Department[];
        setDepartments(deptList);
        setNewDeptId((prev) =>
          deptList.length > 0 && !deptList.some((d) => d.department_id === prev)
            ? deptList[0].department_id
            : prev
        );
      }
      setIsLoading(false);
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const handleCreateUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const emailTrimmed = newEmail.trim().toLowerCase();
    const nameTrimmed = newFullName.trim();

    if (!emailTrimmed || !nameTrimmed) {
      setUserFormError('Vui lòng nhập đầy đủ Email công vụ và Họ và tên.');
      return;
    }

    setUserFormError(null);
    setIsCreatingUser(true);
    try {
      const { error } = await supabase.from('users').insert({
        user_id: crypto.randomUUID(),
        email: emailTrimmed,
        full_name: nameTrimmed,
        role: newRole,
        department_id: newDeptId,
        status: 'ACTIVE',
      });

      if (error) {
        setUserFormError(`Không thể tạo tài khoản: ${error.message}`);
        return;
      }

      setToast({
        type: 'success',
        message: `Đã cấp phát tài khoản ${emailTrimmed} (${newRole}).`,
      });
      setNewEmail('');
      setNewFullName('');
      setShowAddUser(false);
      await refreshData();
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleRoleChange = async (targetUser: User, nextRole: UserRole) => {
    if (targetUser.role === nextRole) return;
    const { error } = await supabase
      .from('users')
      .update({ role: nextRole })
      .eq('user_id', targetUser.user_id);

    if (error) {
      setToast({
        type: 'error',
        message: `Đổi vai trò thất bại: ${error.message}`,
      });
      return;
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === targetUser.user_id ? { ...u, role: nextRole } : u
      )
    );
    setToast({
      type: 'success',
      message: `Đã cập nhật vai trò của ${targetUser.email} thành ${nextRole}.`,
    });
  };

  const handleToggleStatus = async (targetUser: User) => {
    const nextStatus: UserStatus =
      targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const { error } = await supabase
      .from('users')
      .update({ status: nextStatus })
      .eq('user_id', targetUser.user_id);

    if (error) {
      setToast({
        type: 'error',
        message: `Cập nhật trạng thái thất bại: ${error.message}`,
      });
      return;
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === targetUser.user_id ? { ...u, status: nextStatus } : u
      )
    );
    setToast({
      type: nextStatus === 'ACTIVE' ? 'success' : 'warning',
      message: `Tài khoản ${targetUser.email} đã chuyển sang ${nextStatus}.`,
    });
  };

  const openAddDeptModal = () => {
    setEditingDeptId(null);
    setDeptIdInput(`DEP-0${departments.length + 1}`);
    setDeptNameInput('');
    setDeptLocationInput('');
    setDeptFormError(null);
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (dept: Department) => {
    setEditingDeptId(dept.department_id);
    setDeptIdInput(dept.department_id);
    setDeptNameInput(dept.department_name);
    setDeptLocationInput(dept.facility_location);
    setDeptFormError(null);
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const idTrimmed = deptIdInput.trim().toUpperCase();
    const nameTrimmed = deptNameInput.trim();
    const locTrimmed = deptLocationInput.trim();

    if (!idTrimmed || !nameTrimmed || !locTrimmed) {
      setDeptFormError(
        'Vui lòng nhập đầy đủ Mã đơn vị, Tên phòng ban và Địa điểm cơ sở.'
      );
      return;
    }

    setDeptFormError(null);
    setIsSavingDept(true);
    try {
      if (editingDeptId) {
        const { error } = await supabase
          .from('departments')
          .update({
            department_name: nameTrimmed,
            facility_location: locTrimmed,
          })
          .eq('department_id', editingDeptId);

        if (error) {
          setDeptFormError(`Cập nhật phòng ban thất bại: ${error.message}`);
          return;
        }

        setToast({
          type: 'success',
          message: `Đã cập nhật thông tin cơ sở ${editingDeptId}.`,
        });
      } else {
        const { error } = await supabase.from('departments').insert({
          department_id: idTrimmed,
          department_name: nameTrimmed,
          facility_location: locTrimmed,
        });

        if (error) {
          setDeptFormError(`Thêm cơ sở mới thất bại: ${error.message}`);
          return;
        }

        setToast({
          type: 'success',
          message: `Đã thêm mới cơ sở ${idTrimmed} — ${nameTrimmed}.`,
        });
      }

      setIsDeptModalOpen(false);
      await refreshData();
    } finally {
      setIsSavingDept(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen bg-[#FAFAFA] text-[#09090B]">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top Header Strip */}
      <section className="w-full bg-[#FFFFFF] border-b border-[#E4E4E7] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-[#18181B] rounded-[1px]" />
          <h1 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#09090B]">
            Quản lý Tài khoản nội bộ RBAC &amp; Danh mục Phòng ban
          </h1>
        </div>
        <span className="font-mono text-[11px] bg-[#F4F4F5] border border-[#E4E4E7] text-[#3F3F46] px-2.5 py-1 rounded-[4px]">
          {users.length} TÀI KHOẢN • {departments.length} PHÒNG BAN
        </span>
      </section>

      <div className="p-5 flex flex-col gap-5">
        {/* KHU VỰC TRÊN: QUẢN LÝ TÀI KHOẢN NỘI BỘ RBAC */}
        <section className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col overflow-hidden">
          <div className="bg-[#F4F4F5] px-4 py-2.5 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold uppercase text-[#09090B] tracking-wide">
                1. Danh sách tài khoản nội bộ &amp; Phân quyền RBAC
              </h2>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#FFFFFF] border border-[#E4E4E7] text-[#71717A] rounded-[4px]">
                SEC-AUDIT
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddUser((v) => !v);
                setUserFormError(null);
              }}
              className="h-8 px-3 rounded-[4px] bg-[#18181B] text-[#FFFFFF] hover:bg-[#27272A] text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cấp phát tài khoản mới</span>
            </button>
          </div>

          {/* Inline Create User Drawer */}
          {showAddUser && (
            <form
              onSubmit={handleCreateUser}
              noValidate
              className="p-4 bg-[#FAFAFA] border-b border-[#E4E4E7] space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-[#3F3F46]">
                    Email công vụ
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="ten.nhanvien@sme.vn"
                    className="w-full h-8 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-[#3F3F46]">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Nguyễn Văn B"
                    className="w-full h-8 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-[#3F3F46]">
                    Vai trò RBAC
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full h-8 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-[#3F3F46]">
                    Phòng ban
                  </label>
                  <select
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    className="w-full h-8 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  >
                    {departments.map((d) => (
                      <option key={d.department_id} value={d.department_id}>
                        {d.department_id} — {d.department_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {userFormError && (
                <p className="text-[12px] text-[#ba1a1a]">{userFormError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="h-8 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[12px] text-[#3F3F46] hover:border-[#18181B]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="h-8 px-3.5 bg-[#18181B] text-[#FFFFFF] rounded-[4px] text-[12px] font-semibold hover:bg-[#27272A] disabled:opacity-60"
                >
                  {isCreatingUser ? 'Đang tạo...' : 'Lưu tài khoản mới'}
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E4E4E7] font-mono text-[11px] text-[#71717A] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Email công vụ</th>
                  <th className="py-2.5 px-3">Họ và tên</th>
                  <th className="py-2.5 px-3">Vai trò RBAC</th>
                  <th className="py-2.5 px-3">Phòng ban</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Thao tác quản trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center font-mono text-[12px] text-[#71717A]"
                    >
                      Đang tải danh sách nhân sự...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isSelf = u.user_id === currentAdmin.user_id;
                    const isActive = u.status === 'ACTIVE';

                    return (
                      <tr
                        key={u.user_id}
                        className="hover:bg-[#FAFAFA] transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono font-medium text-[#09090B]">
                          <div className="flex items-center gap-1.5">
                            <span>{u.email}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-[#18181B] text-[#FFFFFF] px-1.5 py-0.5 rounded-[3px]">
                                BẠN
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#09090B]">
                          {u.full_name}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            aria-label={`Vai trò của ${u.email}`}
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) =>
                              void handleRoleChange(u, e.target.value as UserRole)
                            }
                            className="h-7 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[11px] font-semibold text-[#09090B] focus:outline-none focus:border-[#18181B] disabled:opacity-60"
                          >
                            <option value="STAFF">STAFF</option>
                            <option value="MANAGER">MANAGER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#3F3F46]">
                          {u.department_id}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] font-mono text-[11px] font-semibold border ${
                              isActive
                                ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                                : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isSelf ? (
                            <span className="font-mono text-[11px] text-[#71717A]">
                              Đang đăng nhập
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border font-mono text-[11px] font-medium transition-colors ${
                                isActive
                                  ? 'bg-[#FFFFFF] border-[#FECACA] text-[#991B1B] hover:bg-[#FEF2F2]'
                                  : 'bg-[#FFFFFF] border-[#BBF7D0] text-[#166534] hover:bg-[#F0FDF4]'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Khóa tài khoản</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>Kích hoạt lại</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* KHU VỰC DƯỚI: QUẢN LÝ DANH MỤC CƠ SỞ & PHÒNG BAN */}
        <section className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col overflow-hidden">
          <div className="bg-[#F4F4F5] px-4 py-2.5 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#3F3F46]" />
              <h2 className="text-[13px] font-semibold uppercase text-[#09090B] tracking-wide">
                2. Danh mục Cơ sở &amp; Phòng ban phát sinh phát thải
              </h2>
            </div>
            <button
              type="button"
              onClick={openAddDeptModal}
              className="h-8 px-3 rounded-[4px] bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#18181B] text-[12px] font-semibold text-[#09090B] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm cơ sở / phòng ban</span>
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {departments.map((dept) => {
              const memberCount = users.filter(
                (u) => u.department_id === dept.department_id
              ).length;

              return (
                <div
                  key={dept.department_id}
                  className="border border-[#E4E4E7] bg-[#FFFFFF] hover:border-[#18181B] transition-colors rounded-[6px] p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] bg-[#18181B] text-[#FFFFFF] px-2 py-0.5 rounded-[4px] font-bold">
                        {dept.department_id}
                      </span>
                      <span className="font-mono text-[11px] text-[#71717A]">
                        {memberCount} Nhân sự
                      </span>
                    </div>
                    <h3 className="text-[13px] font-semibold text-[#09090B]">
                      {dept.department_name}
                    </h3>
                    <div className="flex items-start gap-1.5 text-[12px] text-[#3F3F46]">
                      <MapPin className="w-3.5 h-3.5 text-[#71717A] shrink-0 mt-0.5" />
                      <span>{dept.facility_location}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => openEditDeptModal(dept)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-[#E4E4E7] bg-[#FAFAFA] hover:border-[#18181B] font-mono text-[11px] text-[#09090B] transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Chỉnh sửa</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Modal: Thêm mới / Chỉnh sửa Phòng ban */}
      {isDeptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#09090B]/30 z-50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[440px] bg-[#FFFFFF] border border-[#18181B] rounded-[6px] p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-[#E4E4E7] pb-3">
              <div>
                <div className="font-mono text-[10px] text-[#71717A] uppercase">
                  {editingDeptId
                    ? `Cập nhật ${editingDeptId}`
                    : 'Thêm mới ranh giới kiểm kê'}
                </div>
                <h3 className="text-[15px] font-semibold text-[#09090B]">
                  {editingDeptId
                    ? 'Chỉnh sửa Cơ sở / Phòng ban'
                    : 'Thêm Cơ sở / Phòng ban mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="text-[#71717A] hover:text-[#09090B] p-1 rounded-[4px] hover:bg-[#F4F4F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="space-y-3" noValidate>
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[#09090B]">
                  Mã phòng ban (Department ID) *
                </label>
                <input
                  type="text"
                  disabled={editingDeptId !== null}
                  value={deptIdInput}
                  onChange={(e) => setDeptIdInput(e.target.value)}
                  placeholder="DEP-04"
                  className="w-full h-9 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] font-mono text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B] disabled:bg-[#F4F4F5] disabled:text-[#71717A]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[#09090B]">
                  Tên Cơ sở / Phòng ban *
                </label>
                <input
                  type="text"
                  value={deptNameInput}
                  onChange={(e) => setDeptNameInput(e.target.value)}
                  placeholder="Kho trung chuyển Bình Tân"
                  className="w-full h-9 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[#09090B]">
                  Địa chỉ / Vị trí cơ sở *
                </label>
                <input
                  type="text"
                  value={deptLocationInput}
                  onChange={(e) => setDeptLocationInput(e.target.value)}
                  placeholder="Quận Bình Tân, TP.HCM"
                  className="w-full h-9 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                />
              </div>

              {deptFormError && (
                <p className="text-[12px] text-[#ba1a1a]">{deptFormError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E4E7]">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="h-8 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[12px] font-medium text-[#3F3F46] hover:border-[#18181B]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingDept}
                  className="h-8 px-4 bg-[#18181B] hover:bg-[#27272A] text-[#FFFFFF] rounded-[4px] text-[12px] font-semibold disabled:opacity-60"
                >
                  {isSavingDept ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

