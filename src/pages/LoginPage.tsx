import { useState, type FormEvent } from 'react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type { User, UserRole } from '../types/database';

export const SESSION_STORAGE_KEY = 'carbonsme_session';

const ROLE_DEFAULT_ROUTES: Record<UserRole, string> = {
  STAFF: '/staff/declare',
  MANAGER: '/manager/dashboard',
  ADMIN: '/admin/ef-config',
};

const QUICK_FILL_ACCOUNTS: Array<{
  label: string;
  role: UserRole;
  email: string;
  password: string;
}> = [
  { label: 'Staff', role: 'STAFF', email: 'an.nguyen@sme.vn', password: '123456' },
  { label: 'Manager', role: 'MANAGER', email: 'khoa.tran@sme.vn', password: '123456' },
  { label: 'Admin', role: 'ADMIN', email: 'nam.le@sme.vn', password: '123456' },
];

export interface LoginPageProps {
  onLoginSuccess?: (user: User, redirectPath: string) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSession, setKeepSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Forgot Password Modal state (UC-02)
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const handleQuickFill = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setEmailError(null);
    setPasswordError(null);
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);

    const normalizedEmail = email.trim().toLowerCase();
    let hasValidationError = false;

    if (!normalizedEmail) {
      setEmailError('Vui lòng nhập email công vụ.');
      hasValidationError = true;
    }

    if (!password) {
      setPasswordError('Vui lòng nhập mật khẩu.');
      hasValidationError = true;
    } else if (password !== '123456') {
      setPasswordError('Mật khẩu không chính xác.');
      hasValidationError = true;
    }

    if (hasValidationError) return;

    setIsSubmitting(true);
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle<User>();

      if (error) {
        setEmailError('Không thể kết nối máy chủ xác thực. Vui lòng thử lại.');
        return;
      }

      if (!user) {
        setEmailError('Email công vụ không tồn tại trong hệ thống.');
        return;
      }

      if (user.status !== 'ACTIVE') {
        setEmailError(
          `Tài khoản ${user.email} hiện đang ở trạng thái ${user.status} và không được phép truy cập.`
        );
        return;
      }

      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ user, keepSession, loggedInAt: new Date().toISOString() })
      );

      const targetPath = ROLE_DEFAULT_ROUTES[user.role];

      if (onLoginSuccess) {
        onLoginSuccess(user, targetPath);
      } else {
        window.history.pushState({}, '', targetPath);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverySubmit = () => {
    const trimmed = recoveryEmail.trim();
    if (!trimmed) {
      setRecoveryError('Vui lòng nhập email công vụ cần khôi phục.');
      return;
    }
    setRecoveryError(null);
    setIsForgotModalOpen(false);
    setToast({
      type: 'success',
      message: `Đã ghi nhận yêu cầu cấp lại mật khẩu cho ${trimmed}.`,
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#FAFAFA] text-[#09090B] overflow-x-hidden">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top System Bar */}
      <header className="w-full h-11 border-b border-[#E4E4E7] bg-[#FFFFFF] px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-7 h-7 bg-[#18181B] text-[#FFFFFF] font-mono text-[12px] font-bold rounded-[4px]">
            CS
          </div>
          <div className="h-3.5 w-[1px] bg-[#E4E4E7]" />
          <span className="text-[14px] font-bold tracking-[0.04em] text-[#09090B] uppercase">
            CARBONSME
          </span>
          <span className="text-[10px] font-mono bg-[#F4F4F5] border border-[#E4E4E7] px-1.5 py-0.5 rounded-[4px] text-[#71717A]">
            v1.0
          </span>
        </div>
      </header>

      {/* Main 50 / 50 Split Canvas */}
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 bg-[#FAFAFA]">
        {/* LEFT PANEL: Technical Specification & Governance Info */}
        <section className="h-full bg-[#F4F4F5] border-b lg:border-b-0 lg:border-r border-[#E4E4E7] p-8 lg:px-14 lg:py-10 flex flex-col justify-between space-y-8">
          <div className="space-y-6 flex-1 flex flex-col justify-center">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 bg-[#18181B] text-[#FFFFFF] font-mono text-[12px] font-bold tracking-tight rounded-[4px] flex items-center justify-center">
                  CS
                </div>
                <div>
                  <h1 className="text-[14px] font-bold tracking-[0.04em] text-[#09090B] uppercase leading-none">
                    CARBONSME
                  </h1>
                  <div className="text-[10px] font-mono text-[#71717A] tracking-[0.02em] mt-1 leading-none">
                    MRV &amp; ESG LEDGER
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <span className="text-[11px] font-mono font-medium text-[#09090B] bg-[#FFFFFF] border border-[#E4E4E7] px-2 py-0.5 rounded-[4px]">
                  ISO 14064-1
                </span>
                <span className="text-[#71717A] text-[11px] font-mono">/</span>
                <span className="text-[11px] font-mono font-medium text-[#09090B] bg-[#FFFFFF] border border-[#E4E4E7] px-2 py-0.5 rounded-[4px]">
                  GHG PROTOCOL STANDARD
                </span>
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-[#3F3F46] max-w-lg">
              Hệ thống giám sát, báo cáo và thẩm tra (MRV) phát thải khí nhà kính
              nội bộ dành cho Doanh nghiệp Vừa và Nhỏ (SMEs). Dữ liệu được bảo
              toàn tính toàn vẹn và đối soát chứng từ 1:1 theo niên độ kế toán.
            </p>

            {/* Technical Specification Table */}
            <div className="pt-2">
              <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E7]">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#52525B]">
                  THÔNG SỐ VẬN HÀNH HỆ THỐNG KIỂM KÊ NỘI BỘ
                </h2>
              </div>

              <div className="mt-3 border border-[#E4E4E7] rounded-[6px] overflow-hidden bg-[#FFFFFF]">
                <table className="w-full border-collapse text-left text-[12px]">
                  <tbody className="divide-y divide-[#E4E4E7]">
                    <tr className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="w-2/5 p-3.5 font-medium text-[#3F3F46] bg-[#FAFAFA] border-r border-[#E4E4E7]">
                        Phạm vi kiểm kê
                      </td>
                      <td className="w-3/5 p-3.5 text-[#09090B] font-mono">
                        Scope 1 (Nhiên liệu trực tiếp) &amp; Scope 2 (Điện lưới EVN)
                      </td>
                    </tr>
                    <tr className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="w-2/5 p-3.5 font-medium text-[#3F3F46] bg-[#FAFAFA] border-r border-[#E4E4E7]">
                        Cơ chế kiểm chứng
                      </td>
                      <td className="w-3/5 p-3.5 text-[#09090B]">
                        <span className="font-mono font-medium">MRV 1:1</span>{' '}
                        (Đối soát chứng từ gốc, bất biến sau phê duyệt)
                      </td>
                    </tr>
                    <tr className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="w-2/5 p-3.5 font-medium text-[#3F3F46] bg-[#FAFAFA] border-r border-[#E4E4E7]">
                        Căn cứ hệ số EF
                      </td>
                      <td className="w-3/5 p-3.5 text-[#09090B] font-mono">
                        IPCC (2006) &amp; Công văn 11232/BTNMT-BĐKH
                      </td>
                    </tr>
                    <tr className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="w-2/5 p-3.5 font-medium text-[#3F3F46] bg-[#FAFAFA] border-r border-[#E4E4E7]">
                        Chế độ bảo mật
                      </td>
                      <td className="w-3/5 p-3.5 text-[#09090B]">
                        Hệ thống đóng — Phân quyền RBAC (
                        <span className="font-mono text-[11px] font-semibold text-[#18181B]">
                          STAFF
                        </span>{' '}
                        /{' '}
                        <span className="font-mono text-[11px] font-semibold text-[#18181B]">
                          MANAGER
                        </span>{' '}
                        /{' '}
                        <span className="font-mono text-[11px] font-semibold text-[#18181B]">
                          ADMIN
                        </span>
                        )
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scope & Factor Matrix Pills */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px]">
                <div className="text-[11px] font-mono text-[#71717A] uppercase">
                  Scope 1; 2 Grid Factor
                </div>
              </div>
              <div className="p-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px]">
                <div className="text-[11px] font-mono text-[#71717A] uppercase">
                  Audit Trail Ledger
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Metadata Footer */}
          <div className="pt-6 border-t border-[#E4E4E7] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-[#71717A] gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#18181B]" />
              <span>Môi trường vận hành: Nội bộ Doanh nghiệp SME</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>Chuẩn dữ liệu 3NF</span>
              <span>•</span>
              <span>ENCODING: UTF-8</span>
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: Authentication Workspace */}
        <section className="h-full bg-[#FFFFFF] p-8 lg:px-14 lg:py-10 flex flex-col items-center justify-center">
          <div className="w-full max-w-[420px] flex flex-col space-y-5 my-auto">
            <div className="w-full border border-[#E4E4E7] rounded-[6px] bg-[#FFFFFF] p-6">
              {/* Card Header */}
              <div className="space-y-1.5 pb-5 border-b border-[#E4E4E7]">
                <h2 className="text-[16px] font-semibold tracking-tight text-[#09090B]">
                  Xác thực truy cập hệ thống
                </h2>
                <p className="text-[12px] text-[#71717A] leading-normal">
                  Sử dụng tài khoản nội bộ do Quản trị viên cấp phát
                </p>
              </div>

              {/* Auth Form Fields */}
              <form className="space-y-4 pt-5" onSubmit={handleLogin} noValidate>
                {/* Input 1: Email công vụ */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label
                      htmlFor="email"
                      className="text-[12px] font-medium text-[#09090B]"
                    >
                      Email công vụ
                    </label>
                    <span className="text-[11px] font-mono text-[#71717A]">
                      LDAP / SSO
                    </span>
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="ten.nhanvien@sme.vn"
                    spellCheck={false}
                    autoComplete="username"
                    className={`w-full h-9 px-3 bg-[#FFFFFF] border rounded-[6px] text-[13px] font-mono text-[#09090B] focus:outline-none transition-colors ${
                      emailError
                        ? 'border-[#ba1a1a] focus:border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                  {emailError && (
                    <p className="text-[12px] text-[#ba1a1a] leading-snug">
                      {emailError}
                    </p>
                  )}
                </div>

                {/* Input 2: Mật khẩu */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label
                      htmlFor="password"
                      className="text-[12px] font-medium text-[#09090B]"
                    >
                      Mật khẩu
                    </label>
                    <span className="text-[11px] font-mono text-[#71717A]">
                      Mật khẩu nội bộ
                    </span>
                  </div>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    placeholder="••••••"
                    autoComplete="current-password"
                    className={`w-full h-9 px-3 bg-[#FFFFFF] border rounded-[6px] text-[13px] font-mono tracking-wider text-[#09090B] focus:outline-none transition-colors ${
                      passwordError
                        ? 'border-[#ba1a1a] focus:border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                  {passwordError && (
                    <p className="text-[12px] text-[#ba1a1a] leading-snug">
                      {passwordError}
                    </p>
                  )}
                </div>

                {/* Utility Row */}
                <div className="pt-1 flex items-start justify-between text-[11px]">
                  <label className="flex items-start space-x-2 cursor-pointer text-[#52525B]">
                    <input
                      type="checkbox"
                      checked={keepSession}
                      onChange={(e) => setKeepSession(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded-[3px] border-[#D4D4D8] cursor-pointer accent-[#18181B]"
                    />
                    <span className="leading-tight">
                      Duy trì phiên làm việc{' '}
                      <span className="text-[#71717A]">(Tự khóa sau 30 phút chờ)</span>
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryEmail(email);
                      setRecoveryError(null);
                      setIsForgotModalOpen(true);
                    }}
                    className="text-[#09090B] font-medium hover:underline underline-offset-2 whitespace-nowrap ml-2 focus:outline-none"
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                {/* Primary Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-9 bg-[#18181B] text-[#FFFFFF] rounded-[4px] text-[13px] font-semibold hover:bg-[#27272A] active:bg-[#09090B] disabled:opacity-60 focus:outline-none transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>
                      {isSubmitting ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
                    </span>
                    {!isSubmitting && (
                      <span className="font-mono text-[11px] opacity-75">↵</span>
                    )}
                  </button>
                </div>

                {/* Quick-Fill Demo Buttons */}
                <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[#71717A] shrink-0">
                    Điền nhanh:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {QUICK_FILL_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.role}
                        type="button"
                        onClick={() => handleQuickFill(acc.email, acc.password)}
                        className="h-6 px-2 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] font-mono text-[11px] text-[#09090B] hover:bg-[#FFFFFF] hover:border-[#18181B] transition-colors"
                      >
                        {acc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            {/* Security Policy Callout Box */}
            <div className="w-full p-3.5 bg-[#FAFAFA] border border-[#E4E4E7] rounded-[6px] flex items-start space-x-3">
              <div className="mt-0.5 shrink-0 w-4 h-4 rounded-[3px] bg-[#18181B] text-[#FFFFFF] flex items-center justify-center font-mono text-[9px] font-bold">
                !
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[#09090B] uppercase tracking-wide">
                  Cơ chế an toàn
                </div>
                <p className="text-[11px] leading-relaxed text-[#52525B]">
                  Tài khoản đăng nhập lần đầu bằng mật khẩu tạm sẽ tự động chuyển
                  hướng sang màn hình{' '}
                  <span className="text-[#09090B] font-medium underline underline-offset-2">
                    Đổi mật khẩu bắt buộc
                  </span>
                  . Hệ thống nội bộ không hỗ trợ đăng ký công khai.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Interactive Modal: Quên mật khẩu? (UC-02 Password Recovery Protocol) */}
      {isForgotModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          className="fixed inset-0 bg-[#09090B]/30 z-50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[440px] bg-[#FFFFFF] border border-[#18181B] rounded-[6px] p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-[#E4E4E7] pb-3">
              <div>
                <div className="text-[10px] font-mono text-[#71717A] uppercase">
                  Quy trình UC-02
                </div>
                <h3
                  id="forgot-modal-title"
                  className="text-[15px] font-semibold text-[#09090B] tracking-tight"
                >
                  Yêu cầu đặt lại mật khẩu truy cập
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                aria-label="Đóng"
                className="text-[#71717A] hover:text-[#09090B] text-[16px] font-mono leading-none p-1 rounded-[4px] hover:bg-[#F4F4F5] transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-[12px] text-[#3F3F46] leading-relaxed">
              Nhập email công vụ đã được quản trị viên cấp phát trên hệ thống
              CARBONSME. Hệ thống sẽ kiểm tra tính hợp lệ và gửi liên kết xác
              thực dùng một lần (One-Time Token) có hiệu lực trong 15 phút.
            </p>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="modal-email"
                  className="text-[12px] font-medium text-[#09090B]"
                >
                  Email công vụ đã đăng ký
                </label>
                <span className="text-[10px] font-mono text-[#71717A]">
                  LDAP / SSO
                </span>
              </div>
              <input
                id="modal-email"
                type="email"
                value={recoveryEmail}
                onChange={(e) => {
                  setRecoveryEmail(e.target.value);
                  if (recoveryError) setRecoveryError(null);
                }}
                placeholder="khoa.tran@sme.vn"
                className={`w-full h-9 px-3 bg-[#FFFFFF] border rounded-[6px] text-[13px] font-mono text-[#09090B] focus:outline-none transition-colors ${
                  recoveryError
                    ? 'border-[#ba1a1a] focus:border-[#ba1a1a]'
                    : 'border-[#E4E4E7] focus:border-[#18181B]'
                }`}
              />
              {recoveryError && (
                <p className="text-[12px] text-[#ba1a1a] leading-snug">
                  {recoveryError}
                </p>
              )}
            </div>

            <div className="p-3 bg-[#FAFAFA] border border-[#E4E4E7] rounded-[6px] flex items-start space-x-2.5 text-[11px] leading-relaxed text-[#52525B]">
              <div className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-[2px] bg-[#18181B] text-[#FFFFFF] flex items-center justify-center font-mono text-[9px] font-bold">
                !
              </div>
              <div>
                <span className="font-semibold text-[#09090B]">
                  Giao thức an toàn:
                </span>{' '}
                Vì lý do bảo mật nội bộ, liên kết đặt lại mật khẩu chỉ áp dụng
                cho tài khoản đang kích hoạt và chỉ gửi về hòm thư công vụ doanh
                nghiệp (@sme.vn). Không hỗ trợ email cá nhân.
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#E4E4E7]">
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="h-8 px-3.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[12px] font-medium text-[#3F3F46] hover:bg-[#F4F4F5] hover:border-[#18181B] hover:text-[#09090B] transition-colors"
              >
                Hủy bỏ / Quay lại đăng nhập
              </button>
              <button
                type="button"
                onClick={handleRecoverySubmit}
                className="h-8 px-4 bg-[#18181B] text-[#FFFFFF] rounded-[4px] text-[12px] font-semibold hover:bg-[#27272A] active:bg-[#09090B] transition-colors flex items-center space-x-1.5"
              >
                <span>Gửi liên kết đặt lại mật khẩu</span>
                <span className="font-mono text-[11px] opacity-75">↵</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Global System Footer Strip */}
      <footer className="w-full h-8 border-t border-[#E4E4E7] bg-[#FFFFFF] px-6 flex items-center justify-between text-[11px] font-mono text-[#71717A] z-10">
        <div className="flex items-center space-x-4">
          <span>VIETNAM SME MRV COMPLIANCE PROTOCOL</span>
          <span className="text-[#E4E4E7]">|</span>
          <span>CARBON AUDIT READY</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>CARBONSME INTERNAL LEDGER</span>
        </div>
      </footer>
    </div>
  );
}

