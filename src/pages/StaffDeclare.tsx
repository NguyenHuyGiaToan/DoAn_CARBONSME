import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  Upload,
} from 'lucide-react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type {
  ActivityRecord,
  ApprovalStatus,
  Department,
  ScopeType,
  SourceType,
  User,
} from '../types/database';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];

const SOURCE_LABELS: Record<SourceType, string> = {
  ELECTRICITY: 'Điện lưới EVN',
  GASOLINE_RON95: 'Xăng RON 95',
  DIESEL_DO: 'Dầu DO',
};

const REPORTING_PERIODS = ['2026-10', '2026-09', '2026-08', '2026-07'];

function formatNumber(val: number): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function getFileExtension(urlOrName: string): string {
  const clean = urlOrName.split('?')[0].toLowerCase();
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export interface StaffDeclareProps {
  user: User;
}

export function StaffDeclare({ user }: StaffDeclareProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reference data & history
  const [departments, setDepartments] = useState<Department[]>([]);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ApprovalStatus>('ALL');

  // Form state
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [existingEvidenceUrl, setExistingEvidenceUrl] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>('SCOPE_2');
  const [sourceType, setSourceType] = useState<SourceType>('ELECTRICITY');
  const [reportingPeriod, setReportingPeriod] = useState('2026-10');
  const [departmentId, setDepartmentId] = useState(user.department_id || 'DEP-01');
  const [consumptionInput, setConsumptionInput] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Inline validation errors
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const lockedUnit: 'kWh' | 'LIT' = scopeType === 'SCOPE_2' ? 'kWh' : 'LIT';

  const loadData = useCallback(async () => {
    try {
      const [deptRes, recRes] = await Promise.all([
        supabase.from('departments').select('*').order('department_id'),
        supabase
          .from('activity_records')
          .select('*')
          .order('record_id', { ascending: false }),
      ]);

      if (!deptRes.error && deptRes.data) {
        const deptList = deptRes.data as Department[];
        setDepartments(deptList);
        setDepartmentId((prev) =>
          deptList.length > 0 && !deptList.some((d) => d.department_id === prev)
            ? deptList[0].department_id
            : prev
        );
      }

      if (!recRes.error && recRes.data) {
        setRecords(recRes.data as ActivityRecord[]);
      }
    } finally {
      setIsLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const [deptRes, recRes] = await Promise.all([
        supabase.from('departments').select('*').order('department_id'),
        supabase
          .from('activity_records')
          .select('*')
          .order('record_id', { ascending: false }),
      ]);
      if (!active) return;

      if (!deptRes.error && deptRes.data) {
        const deptList = deptRes.data as Department[];
        setDepartments(deptList);
        setDepartmentId((prev) =>
          deptList.length > 0 && !deptList.some((d) => d.department_id === prev)
            ? deptList[0].department_id
            : prev
        );
      }
      if (!recRes.error && recRes.data) {
        setRecords(recRes.data as ActivityRecord[]);
      }
      setIsLoadingRecords(false);
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const handleScopeSwitch = (nextScope: ScopeType) => {
    setScopeType(nextScope);
    if (nextScope === 'SCOPE_2') {
      setSourceType('ELECTRICITY');
    } else if (sourceType === 'ELECTRICITY') {
      setSourceType('GASOLINE_RON95');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Định dạng không hợp lệ. Chỉ chấp nhận .JPG, .PNG hoặc .PDF.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError('Dung lượng tệp vượt quá giới hạn tối đa 5MB.');
      setSelectedFile(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);
  };

  const resetForm = () => {
    setEditingRecordId(null);
    setExistingEvidenceUrl(null);
    setScopeType('SCOPE_2');
    setSourceType('ELECTRICITY');
    setReportingPeriod('2026-10');
    setDepartmentId(user.department_id || 'DEP-01');
    setConsumptionInput('');
    setInvoiceNumber('');
    setSelectedFile(null);
    setConsumptionError(null);
    setInvoiceError(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const generateNextRecordId = (): string => {
    let maxNum = 811;
    for (const r of records) {
      const match = /^REC-(\d+)$/i.exec(r.record_id);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `REC-${maxNum + 1}`;
  };

  const handleEditRejected = (record: ActivityRecord) => {
    setEditingRecordId(record.record_id);
    setExistingEvidenceUrl(record.evidence_url);
    setScopeType(record.scope_type);
    setSourceType(record.source_type);
    setReportingPeriod(record.reporting_period);
    setDepartmentId(record.department_id);
    setConsumptionInput(String(record.consumption_value));
    setInvoiceNumber(record.invoice_number);
    setSelectedFile(null);
    setConsumptionError(null);
    setInvoiceError(null);
    setFileError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const parsedConsumption = Number.parseFloat(consumptionInput.replace(/,/g, ''));
    let hasError = false;

    if (!consumptionInput.trim() || Number.isNaN(parsedConsumption) || parsedConsumption <= 0) {
      setConsumptionError('Sản lượng tiêu thụ phải là số thực dương lớn hơn 0.');
      hasError = true;
    } else {
      setConsumptionError(null);
    }

    if (!invoiceNumber.trim()) {
      setInvoiceError('Vui lòng nhập số ký hiệu hóa đơn tài chính.');
      hasError = true;
    } else {
      setInvoiceError(null);
    }

    if (!selectedFile && !existingEvidenceUrl) {
      setFileError('Vui lòng đính kèm tệp chứng từ gốc (.JPG, .PNG, .PDF ≤ 5MB).');
      hasError = true;
    } else if (selectedFile && selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setFileError('Dung lượng tệp vượt quá giới hạn tối đa 5MB.');
      hasError = true;
    } else {
      setFileError(null);
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      let evidenceUrl = existingEvidenceUrl ?? '';

      if (selectedFile) {
        const ext = getFileExtension(selectedFile.name) || 'pdf';
        const targetId = editingRecordId ?? generateNextRecordId();
        const filePath = `${reportingPeriod}/${targetId}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) {
          setFileError(`Lỗi tải tệp lên Storage: ${uploadError.message}`);
          return;
        }

        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(filePath);
        evidenceUrl = urlData.publicUrl;
      }

      if (editingRecordId) {
        const { error: updateError } = await supabase
          .from('activity_records')
          .update({
            department_id: departmentId,
            scope_type: scopeType,
            source_type: sourceType,
            reporting_period: reportingPeriod,
            consumption_value: parsedConsumption,
            unit: lockedUnit,
            invoice_number: invoiceNumber.trim(),
            evidence_url: evidenceUrl,
            approval_status: 'PENDING',
            rejection_reason: null,
          })
          .eq('record_id', editingRecordId);

        if (updateError) {
          setToast({
            type: 'error',
            message: `Không thể cập nhật bản ghi ${editingRecordId}: ${updateError.message}`,
          });
          return;
        }

        setToast({
          type: 'success',
          message: `Đã cập nhật và gửi lại bản ghi ${editingRecordId} ở trạng thái PENDING.`,
        });
      } else {
        const newRecordId = generateNextRecordId();
        const { error: insertError } = await supabase
          .from('activity_records')
          .insert({
            record_id: newRecordId,
            department_id: departmentId,
            user_id: user.user_id,
            scope_type: scopeType,
            source_type: sourceType,
            reporting_period: reportingPeriod,
            consumption_value: parsedConsumption,
            unit: lockedUnit,
            invoice_number: invoiceNumber.trim(),
            evidence_url: evidenceUrl,
            approval_status: 'PENDING',
            rejection_reason: null,
          });

        if (insertError) {
          setToast({
            type: 'error',
            message: `Không thể lưu dữ liệu: ${insertError.message}`,
          });
          return;
        }

        setToast({
          type: 'success',
          message: `Đã ghi nhận bản ghi ${newRecordId} ở trạng thái PENDING chờ Quản lý đối soát.`,
        });
      }

      resetForm();
      await loadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const counts = useMemo(() => {
    return {
      ALL: records.length,
      PENDING: records.filter((r) => r.approval_status === 'PENDING').length,
      APPROVED: records.filter((r) => r.approval_status === 'APPROVED').length,
      REJECTED: records.filter((r) => r.approval_status === 'REJECTED').length,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === 'ALL') return records;
    return records.filter((r) => r.approval_status === statusFilter);
  }, [records, statusFilter]);

  return (
    <div className="flex flex-col w-full gap-4 p-4 bg-[#FAFAFA] min-h-screen">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* TOP SECTION: BIỂU MẪU KHAI BÁO DỮ LIỆU HOẠT ĐỘNG */}
      <section className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col">
        {/* Section Header Bar */}
        <div className="px-4 py-3 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#09090B] rounded-[1px]" />
            <h1 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#3F3F46]">
              Biểu mẫu khai báo dữ liệu hoạt động
            </h1>
            {editingRecordId && (
              <span className="font-mono text-[11px] px-2 py-0.5 bg-[#FEFCE8] border border-[#FEF08A] text-[#854D0E] rounded-[4px] font-medium">
                Đang chỉnh sửa: {editingRecordId}
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7] rounded-[4px]">
            SPEC: ISO 14064-1
          </span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="p-4 flex flex-col">
            {/* Segmented Mechanical Switch */}
            <div
              className="inline-flex self-start border border-[#E4E4E7] rounded-[4px] mb-4 overflow-hidden bg-[#F4F4F5]"
              role="tablist"
            >
              <button
                type="button"
                onClick={() => handleScopeSwitch('SCOPE_2')}
                className={`px-4 py-2 text-[13px] font-semibold flex items-center gap-2 transition-colors ${
                  scopeType === 'SCOPE_2'
                    ? 'bg-[#18181B] text-[#FFFFFF]'
                    : 'bg-[#F4F4F5] text-[#3F3F46] hover:text-[#09090B]'
                }`}
              >
                <span className="w-2 h-2 rounded-[1px] bg-[#0F766E]" />
                <span>SCOPE 2: ĐIỆN LƯỚI QUỐC GIA (EVN)</span>
              </button>
              <button
                type="button"
                onClick={() => handleScopeSwitch('SCOPE_1')}
                className={`px-4 py-2 text-[13px] font-semibold border-l border-[#E4E4E7] flex items-center gap-2 transition-colors ${
                  scopeType === 'SCOPE_1'
                    ? 'bg-[#18181B] text-[#FFFFFF]'
                    : 'bg-[#F4F4F5] text-[#3F3F46] hover:text-[#09090B]'
                }`}
              >
                <span className="w-2 h-2 rounded-[1px] bg-[#B45309]" />
                <span>SCOPE 1: NHIÊN LIỆU ĐỐT TẠI CHỖ (XĂNG RON95 / DẦU DO)</span>
              </button>
            </div>

            {/* 3-Column Technical Form Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Col 1 */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="period-select"
                    className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between"
                  >
                    <span>Kỳ kiểm kê (YYYY-MM)</span>
                    <span className="font-mono text-[11px] font-normal text-[#ba1a1a]">
                      * Bắt buộc
                    </span>
                  </label>
                  <select
                    id="period-select"
                    value={reportingPeriod}
                    onChange={(e) => setReportingPeriod(e.target.value)}
                    className="w-full h-9 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] px-3 font-mono text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B] transition-colors"
                  >
                    {REPORTING_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[#71717A]">
                    Chu kỳ khóa sổ báo cáo: Ngày 05 hàng tháng
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="dept-select"
                    className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between"
                  >
                    <span>Cơ sở / Phòng ban phát sinh</span>
                    <span className="font-mono text-[11px] font-normal text-[#71717A]">
                      NODE REF
                    </span>
                  </label>
                  <select
                    id="dept-select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full h-9 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] px-3 text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B] transition-colors"
                  >
                    {departments.length === 0 ? (
                      <option value={departmentId}>{departmentId}</option>
                    ) : (
                      departments.map((d) => (
                        <option key={d.department_id} value={d.department_id}>
                          {d.department_id} — {d.department_name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {scopeType === 'SCOPE_1' && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="source-select"
                      className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between"
                    >
                      <span>Loại nhiên liệu tiêu thụ</span>
                      <span className="font-mono text-[11px] font-normal text-[#B45309]">
                        SCOPE_1
                      </span>
                    </label>
                    <select
                      id="source-select"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as SourceType)}
                      className="w-full h-9 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] px-3 text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B] transition-colors"
                    >
                      <option value="GASOLINE_RON95">
                        GASOLINE_RON95 — Xăng RON 95 (LIT)
                      </option>
                      <option value="DIESEL_DO">
                        DIESEL_DO — Dầu Diesel DO (LIT)
                      </option>
                    </select>
                  </div>
                )}
              </div>

              {/* Col 2 */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="ad-input"
                    className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between"
                  >
                    <span>Sản lượng tiêu thụ thực tế (AD)</span>
                    <span className="font-mono text-[11px] font-normal text-[#ba1a1a]">
                      * Bắt buộc
                    </span>
                  </label>
                  <div
                    className={`flex items-center h-9 border rounded-[6px] overflow-hidden bg-[#FFFFFF] transition-colors ${
                      consumptionError
                        ? 'border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus-within:border-[#18181B]'
                    }`}
                  >
                    <input
                      id="ad-input"
                      type="number"
                      step="any"
                      min="0"
                      value={consumptionInput}
                      onChange={(e) => {
                        setConsumptionInput(e.target.value);
                        if (consumptionError) setConsumptionError(null);
                      }}
                      placeholder="0.000"
                      className="w-full h-full px-3 font-mono text-[13px] font-semibold text-[#09090B] focus:outline-none tabular-nums text-right"
                    />
                    <div className="h-full px-3 bg-[#F4F4F5] border-l border-[#E4E4E7] flex items-center justify-center font-mono text-[11px] font-semibold text-[#3F3F46] shrink-0">
                      {lockedUnit}
                    </div>
                  </div>
                  {consumptionError ? (
                    <span className="text-[12px] text-[#ba1a1a]">
                      {consumptionError}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#71717A]">
                      Ràng buộc: Số thực dương &gt; 0, tự động khóa đơn vị theo Scope
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="invoice-input"
                    className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between"
                  >
                    <span>Số ký hiệu hóa đơn tài chính</span>
                    <span className="font-mono text-[11px] font-normal text-[#71717A]">
                      E-INVOICE
                    </span>
                  </label>
                  <input
                    id="invoice-input"
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => {
                      setInvoiceNumber(e.target.value);
                      if (invoiceError) setInvoiceError(null);
                    }}
                    placeholder={
                      scopeType === 'SCOPE_2' ? 'EVN-2026-009182' : 'PLX-2026-00412'
                    }
                    className={`w-full h-9 bg-[#FFFFFF] border rounded-[6px] px-3 font-mono text-[13px] text-[#09090B] focus:outline-none transition-colors ${
                      invoiceError
                        ? 'border-[#ba1a1a] focus:border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                  {invoiceError ? (
                    <span className="text-[12px] text-[#ba1a1a]">
                      {invoiceError}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#71717A]">
                      Kiểm tra khớp mã hóa đơn điện tử chứng từ gốc
                    </span>
                  )}
                </div>
              </div>

              {/* Col 3: MRV Evidence Attachment */}
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-semibold text-[#3F3F46] flex items-center justify-between">
                  <span>Tệp chứng từ gốc đính kèm</span>
                  <span className="font-mono text-[11px] font-normal text-[#ba1a1a]">
                    Bắt buộc • ≤ 5MB
                  </span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`h-[128px] border border-dashed rounded-[6px] p-3 bg-[#FAFAFA] flex flex-col justify-between cursor-pointer transition-colors ${
                    fileError
                      ? 'border-[#ba1a1a]'
                      : 'border-[#77767b] hover:border-[#18181B]'
                  }`}
                >
                  {selectedFile ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#18181B] text-[#FFFFFF] font-bold rounded-[4px] uppercase shrink-0">
                          {getFileExtension(selectedFile.name)}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-medium text-[#09090B] truncate">
                            {selectedFile.name}
                          </span>
                          <span className="font-mono text-[11px] text-[#71717A]">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-[4px] shrink-0 font-medium">
                        Hợp lệ
                      </span>
                    </div>
                  ) : existingEvidenceUrl ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#18181B] text-[#FFFFFF] font-bold rounded-[4px] uppercase shrink-0">
                          FILE
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[12px] font-medium text-[#09090B] truncate">
                            Chứng từ hiện có
                          </span>
                          <span className="font-mono text-[11px] text-[#71717A] truncate">
                            {existingEvidenceUrl}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-[4px] shrink-0 font-medium">
                        Đã đính kèm
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 text-[#3F3F46] my-auto">
                      <Upload className="w-5 h-5 text-[#71717A] shrink-0" />
                      <div className="text-[12px]">
                        <div className="font-semibold text-[#09090B]">
                          Nhấn để chọn tệp hóa đơn
                        </div>
                        <div className="text-[11px] text-[#71717A]">
                          Kéo thả hoặc tải lên tệp .JPG, .PNG, .PDF (tối đa 5MB)
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#E4E4E7]">
                    <span className="text-[11px] text-[#71717A]">
                      Định dạng: .JPG, .PNG, .PDF
                    </span>
                    <span className="h-6 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[#09090B] font-semibold text-[11px] flex items-center">
                      {selectedFile || existingEvidenceUrl ? 'Thay đổi tệp' : 'Chọn tệp'}
                    </span>
                  </div>
                </div>

                {fileError ? (
                  <span className="text-[12px] text-[#ba1a1a]">{fileError}</span>
                ) : (
                  <span className="text-[11px] text-[#71717A]">
                    Cung cấp bản chụp/PDF hóa đơn có mã tra cứu điện tử
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Form Footer Bar */}
          <div className="bg-[#F4F4F5] border-t border-[#E4E4E7] px-4 py-3 flex flex-wrap items-center justify-between gap-2 rounded-b-[6px]">
            <span className="text-[12px] text-[#3F3F46]">
              {editingRecordId
                ? `Cập nhật bản ghi ${editingRecordId} và đưa trở lại hàng đợi PENDING.`
                : 'Bản ghi sẽ khởi tạo ở trạng thái PENDING chờ Quản lý đối soát.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-8 px-3 bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#18181B] text-[#09090B] rounded-[4px] text-[13px] font-semibold transition-colors"
              >
                {editingRecordId ? 'Hủy chỉnh sửa' : 'Hủy bỏ'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-8 px-4 bg-[#15803D] hover:bg-[#166534] text-[#FFFFFF] rounded-[4px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                <span>
                  {isSubmitting
                    ? 'Đang gửi dữ liệu...'
                    : editingRecordId
                      ? 'Cập nhật & Gửi lại'
                      : 'Gửi dữ liệu phê duyệt'}
                </span>
                {!isSubmitting && <span className="font-mono text-[11px]">↵</span>}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* BOTTOM SECTION: SỔ GHI LỊCH SỬ KHAI BÁO & PHẢN HỒI KIỂM DUYỆT */}
      <section className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col">
        <div className="px-4 py-3 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#09090B] rounded-[1px]" />
            <h2 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#3F3F46]">
              Sổ ghi lịch sử khai báo &amp; Phản hồi kiểm duyệt
            </h2>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#71717A] mr-1">
              Trạng thái:
            </span>
            {(
              [
                { key: 'ALL', label: `Tất cả (${counts.ALL})` },
                { key: 'PENDING', label: `PENDING (${counts.PENDING})` },
                { key: 'APPROVED', label: `APPROVED (${counts.APPROVED})` },
                { key: 'REJECTED', label: `REJECTED (${counts.REJECTED})` },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`h-6 px-2.5 rounded-[4px] font-mono text-[11px] transition-colors ${
                    active
                      ? 'bg-[#18181B] text-[#FFFFFF] font-medium'
                      : 'bg-[#FFFFFF] border border-[#E4E4E7] text-[#3F3F46] hover:border-[#18181B]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ledger Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#52525B] text-[12px] font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Mã bản ghi</th>
                <th className="py-2.5 px-3">Kỳ kiểm kê</th>
                <th className="py-2.5 px-3">Phạm vi &amp; Nguồn</th>
                <th className="py-2.5 px-3 text-right">Sản lượng (AD)</th>
                <th className="py-2.5 px-3">Số hóa đơn</th>
                <th className="py-2.5 px-3 text-center">Minh chứng</th>
                <th className="py-2.5 px-3">Trạng thái xét duyệt</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] bg-[#FFFFFF] text-[13px]">
              {isLoadingRecords ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center font-mono text-[12px] text-[#71717A]"
                  >
                    Đang tải dữ liệu từ Supabase...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center font-mono text-[12px] text-[#71717A]"
                  >
                    Không có bản ghi nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const ext = getFileExtension(rec.evidence_url);
                  const isPdf = ext === 'pdf';
                  const isScope2 = rec.scope_type === 'SCOPE_2';

                  return (
                    <tr
                      key={rec.record_id}
                      className="hover:bg-[#FAFAFA] transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-[#09090B]">
                        {rec.record_id}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#3F3F46]">
                        {rec.reporting_period}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-[11px] px-1.5 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] font-semibold inline-flex items-center gap-1 ${
                              isScope2 ? 'text-[#0F766E]' : 'text-[#B45309]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-[1px] ${
                                isScope2 ? 'bg-[#0F766E]' : 'bg-[#B45309]'
                              }`}
                            />
                            {rec.scope_type}
                          </span>
                          <span className="font-medium text-[#09090B]">
                            {SOURCE_LABELS[rec.source_type]}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className="font-mono font-semibold text-[#09090B] tabular-nums">
                          {formatNumber(rec.consumption_value)}
                        </span>
                        <span className="font-mono text-[11px] text-[#71717A] ml-1">
                          {rec.unit}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] text-[#3F3F46] bg-[#F4F4F5] px-1.5 py-0.5 rounded-[4px] border border-[#E4E4E7]">
                          {rec.invoice_number}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <a
                          href={rec.evidence_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-[#09090B] hover:border-[#18181B] bg-[#F4F4F5] px-2 py-0.5 rounded-[4px] border border-[#E4E4E7] transition-colors"
                        >
                          {isPdf ? (
                            <FileText className="w-3.5 h-3.5" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5" />
                          )}
                          <span>{ext ? ext.toUpperCase() : 'FILE'}</span>
                          <ExternalLink className="w-3 h-3 text-[#71717A]" />
                        </a>
                      </td>
                      <td className="py-3 px-3">
                        {rec.approval_status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEFCE8] border border-[#FEF08A] text-[#854D0E] rounded-[4px] font-mono text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#854D0E]" />
                            PENDING
                          </span>
                        )}
                        {rec.approval_status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-[4px] font-mono text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                            APPROVED
                          </span>
                        )}
                        {rec.approval_status === 'REJECTED' && (
                          <div className="flex flex-col gap-1 max-w-[320px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] rounded-[4px] font-mono text-[11px] font-semibold w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#991B1B]" />
                              REJECTED
                            </span>
                            {rec.rejection_reason && (
                              <span className="text-[11px] text-[#991B1B] leading-snug">
                                Lý do: {rec.rejection_reason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {rec.approval_status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#71717A]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Read-only</span>
                          </span>
                        )}
                        {rec.approval_status === 'REJECTED' && (
                          <button
                            type="button"
                            onClick={() => handleEditRejected(rec)}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-[#09090B] bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#18181B] hover:bg-[#F4F4F5] rounded-[4px] transition-colors whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Chỉnh sửa &amp; Gửi lại</span>
                          </button>
                        )}
                        {rec.approval_status === 'PENDING' && (
                          <span className="font-mono text-[11px] text-[#71717A]">
                            Chờ đối soát
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="bg-[#F4F4F5] border-t border-[#E4E4E7] px-4 py-2.5 flex items-center justify-between text-[#71717A] rounded-b-[6px]">
          <span className="font-mono text-[11px]">
            HIỂN THỊ: {filteredRecords.length} / {records.length} BẢN GHI
          </span>
          <span className="font-mono text-[11px] text-[#3F3F46]">
            MRV LEDGER • SANITY-CHECK OK
          </span>
        </div>
      </section>
    </div>
  );
}
