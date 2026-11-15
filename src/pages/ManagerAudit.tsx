import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type {
  ActivityRecord,
  Department,
  EmissionFactor,
  SourceType,
  User,
} from '../types/database';

const SOURCE_LABELS: Record<SourceType, string> = {
  ELECTRICITY: 'Điện lưới EVN',
  GASOLINE_RON95: 'Xăng RON 95',
  DIESEL_DO: 'Dầu Diesel DO',
};

function formatNumber(val: number, decimals = 3): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function isPdfUrl(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return clean.endsWith('.pdf');
}

export interface ManagerAuditProps {
  user: User;
}

export function ManagerAudit({ user }: ManagerAuditProps) {
  const [pendingRecords, setPendingRecords] = useState<ActivityRecord[]>([]);
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [departments, setDepartments] = useState<Record<string, Department>>({});
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Decision Console state
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Evidence Viewer Zoom state
  const [zoomPercent, setZoomPercent] = useState(100);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const applyAuditData = useCallback(
    (
      recData: ActivityRecord[] | null,
      efData: EmissionFactor[] | null,
      deptData: Department[] | null,
      userData: User[] | null
    ) => {
      if (recData) {
        setPendingRecords(recData);
        setSelectedId((prev) =>
          prev && recData.some((r) => r.record_id === prev)
            ? prev
            : recData[0]?.record_id ?? null
        );
      }
      if (efData) setFactors(efData);
      if (deptData) {
        const map: Record<string, Department> = {};
        for (const d of deptData) map[d.department_id] = d;
        setDepartments(map);
      }
      if (userData) {
        const map: Record<string, User> = {};
        for (const u of userData) map[u.user_id] = u;
        setUsersMap(map);
      }
    },
    []
  );

  const loadAuditData = useCallback(async () => {
    try {
      const [recRes, efRes, deptRes, userRes] = await Promise.all([
        supabase
          .from('activity_records')
          .select('*')
          .eq('approval_status', 'PENDING')
          .order('record_id', { ascending: true }),
        supabase
          .from('emission_factors')
          .select('*')
          .order('apply_year', { ascending: false }),
        supabase.from('departments').select('*'),
        supabase.from('users').select('*'),
      ]);

      applyAuditData(
        !recRes.error ? (recRes.data as ActivityRecord[]) : null,
        !efRes.error ? (efRes.data as EmissionFactor[]) : null,
        !deptRes.error ? (deptRes.data as Department[]) : null,
        !userRes.error ? (userRes.data as User[]) : null
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyAuditData]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const [recRes, efRes, deptRes, userRes] = await Promise.all([
        supabase
          .from('activity_records')
          .select('*')
          .eq('approval_status', 'PENDING')
          .order('record_id', { ascending: true }),
        supabase
          .from('emission_factors')
          .select('*')
          .order('apply_year', { ascending: false }),
        supabase.from('departments').select('*'),
        supabase.from('users').select('*'),
      ]);
      if (!active) return;

      applyAuditData(
        !recRes.error ? (recRes.data as ActivityRecord[]) : null,
        !efRes.error ? (efRes.data as EmissionFactor[]) : null,
        !deptRes.error ? (deptRes.data as Department[]) : null,
        !userRes.error ? (userRes.data as User[]) : null
      );
      setIsLoading(false);
    };
    void init();
    return () => {
      active = false;
    };
  }, [applyAuditData]);

  const filteredQueue = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pendingRecords;
    return pendingRecords.filter(
      (r) =>
        r.record_id.toLowerCase().includes(q) ||
        r.reporting_period.toLowerCase().includes(q) ||
        r.invoice_number.toLowerCase().includes(q)
    );
  }, [pendingRecords, searchQuery]);

  const selectedRecord = useMemo(
    () => pendingRecords.find((r) => r.record_id === selectedId) ?? null,
    [pendingRecords, selectedId]
  );

  const matchedFactor = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      factors.find((ef) => ef.source_type === selectedRecord.source_type) ?? null
    );
  }, [factors, selectedRecord]);

  const draftEmissionTco2e = useMemo(() => {
    if (!selectedRecord || !matchedFactor) return null;
    return (
      selectedRecord.consumption_value *
      matchedFactor.factor_value *
      1e-3
    ).toFixed(6);
  }, [selectedRecord, matchedFactor]);

  const handleSelectRecord = (recordId: string) => {
    setSelectedId(recordId);
    setRejectionReason('');
    setRejectionError(null);
    setZoomPercent(100);
  };

  const handleReject = async () => {
    if (!selectedRecord) return;
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setRejectionError(
        'Bắt buộc nhập lý do từ chối trước khi trả lại bản ghi cho nhân sự.'
      );
      return;
    }
    setRejectionError(null);
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('activity_records')
        .update({
          approval_status: 'REJECTED',
          rejection_reason: trimmedReason,
        })
        .eq('record_id', selectedRecord.record_id);

      if (error) {
        setToast({
          type: 'error',
          message: `Từ chối bản ghi thất bại: ${error.message}`,
        });
        return;
      }

      setToast({
        type: 'warning',
        message: `Đã từ chối bản ghi ${selectedRecord.record_id} và trả lại nhân sự chỉnh sửa.`,
      });
      setRejectionReason('');
      await loadAuditData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRecord) return;
    setRejectionError(null);
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('activity_records')
        .update({
          approval_status: 'APPROVED',
          approved_by: user.user_id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('record_id', selectedRecord.record_id);

      if (error) {
        setToast({
          type: 'error',
          message: `Phê duyệt thất bại: ${error.message}`,
        });
        return;
      }

      setToast({
        type: 'success',
        message: `Đã phê duyệt & khóa bản ghi ${selectedRecord.record_id}. Trigger đã ghi nhận kết quả phát thải.`,
      });
      setRejectionReason('');
      await loadAuditData();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-[#FAFAFA] text-[#09090B] overflow-hidden">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top Verification Status Subheader */}
      <div className="w-full shrink-0 bg-[#FFFFFF] border-b border-[#E4E4E7] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 bg-[#18181B] rounded-[1px]" />
          <span className="font-semibold uppercase tracking-[0.04em] text-[#09090B]">
            Đối soát &amp; Kiểm duyệt MRV 1:1
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-[4px] flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
          {pendingRecords.length} BẢN GHI CẦN XỬ LÝ
        </span>
      </div>

      {/* Main Split-Screen 3-Column Container */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN (260px): PENDING Queue */}
        <section className="w-full lg:w-[260px] shrink-0 bg-[#FFFFFF] border-b lg:border-b-0 lg:border-r border-[#E4E4E7] flex flex-col max-h-[260px] lg:max-h-none lg:h-full overflow-hidden">
          <div className="bg-[#F4F4F5] border-b border-[#E4E4E7] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[#09090B]">
                Hàng đợi Pending
              </span>
              <span className="font-mono text-[11px] text-[#71717A]">
                ({String(filteredQueue.length).padStart(2, '0')})
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc theo mã / kỳ..."
                className="w-full h-7 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] pl-7 pr-2 font-mono text-[11px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#E4E4E7]">
            {isLoading ? (
              <div className="p-4 text-center font-mono text-[11px] text-[#71717A]">
                Đang tải hàng đợi...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="p-4 text-center font-mono text-[11px] text-[#71717A]">
                Không có bản ghi PENDING.
              </div>
            ) : (
              filteredQueue.map((rec) => {
                const isSelected = rec.record_id === selectedId;
                const dept = departments[rec.department_id];
                const submitter = usersMap[rec.user_id];
                const ef = factors.find((f) => f.source_type === rec.source_type);
                const est = ef
                  ? (rec.consumption_value * ef.factor_value * 1e-3).toFixed(4)
                  : null;
                const isScope2 = rec.scope_type === 'SCOPE_2';

                return (
                  <button
                    key={rec.record_id}
                    type="button"
                    onClick={() => handleSelectRecord(rec.record_id)}
                    className={`w-full text-left p-3 flex flex-col gap-1.5 transition-colors ${
                      isSelected
                        ? 'bg-[#FFFFFF] border-l-4 border-l-[#18181B]'
                        : 'bg-[#FAFAFA] hover:bg-[#F4F4F5] opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-semibold text-[#09090B]">
                          {rec.record_id}
                        </span>
                        <span className="font-mono text-[10px] text-[#3F3F46] bg-[#F4F4F5] px-1 rounded-[3px] border border-[#E4E4E7]">
                          {rec.reporting_period}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] bg-[#FEFCE8] border border-[#FEF08A] text-[#854D0E] px-1.5 py-0.5 rounded-[4px] font-medium">
                        PENDING
                      </span>
                    </div>

                    <div className="text-[12px] font-semibold text-[#09090B] leading-tight">
                      {SOURCE_LABELS[rec.source_type]} —{' '}
                      <span className="font-mono tabular-nums">
                        {formatNumber(rec.consumption_value)} {rec.unit}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#71717A] truncate">
                      {dept?.department_id ?? rec.department_id} •{' '}
                      {submitter?.full_name ?? 'Nhân sự'}
                    </div>

                    {est && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isScope2 ? 'bg-[#0F766E]' : 'bg-[#B45309]'
                          }`}
                        />
                        <span className="font-mono text-[10px] text-[#3F3F46] uppercase tabular-nums">
                          {isScope2 ? 'Scope 2' : 'Scope 1'}: ~{est} tCO2e
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* CENTER + RIGHT SPLIT WORKBENCH */}
        {!selectedRecord ? (
          <div className="flex-1 flex items-center justify-center bg-[#FFFFFF] p-8 text-center">
            <div className="space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#15803D] mx-auto" />
              <div className="text-[14px] font-semibold text-[#09090B]">
                Tất cả bản ghi đã được xử lý
              </div>
              <p className="text-[12px] text-[#71717A]">
                Hiện không còn bản ghi nào ở trạng thái PENDING trong hàng đợi.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E4E4E7] overflow-hidden">
            {/* CENTER COLUMN: Declared Details + Formula Preview + Decision Console */}
            <div className="bg-[#FFFFFF] flex flex-col h-full min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E7]">
                  <span className="text-[11px] text-[#71717A] uppercase font-mono">
                    Tự động đối soát
                  </span>
                  <span className="font-mono text-[11px] bg-[#18181B] text-[#FFFFFF] px-2 py-0.5 rounded-[4px] font-medium">
                    CHẾ ĐỘ THẨM ĐỊNH 1:1
                  </span>
                </div>

                {/* 1. Declared Activity Data */}
                <div className="space-y-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#09090B] flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#18181B]" />
                    <span>1. Thông tin khai báo hoạt động</span>
                  </h2>

                  <div className="border border-[#E4E4E7] rounded-[6px] overflow-hidden text-[12px]">
                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Mã bản ghi (Record ID)
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] font-mono font-semibold text-[#09090B] flex items-center justify-between gap-2">
                        <span>{selectedRecord.record_id}</span>
                        <span className="text-[10px] text-[#854D0E] bg-[#FEFCE8] px-1.5 py-0.5 rounded-[4px] border border-[#FEF08A]">
                          PENDING
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Đơn vị phát sinh
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] font-medium text-[#09090B]">
                        {selectedRecord.department_id}
                        {departments[selectedRecord.department_id]
                          ? ` (${departments[selectedRecord.department_id].department_name})`
                          : ''}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Nhân sự khai báo
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] text-[#09090B]">
                        {usersMap[selectedRecord.user_id]?.full_name ?? selectedRecord.user_id}{' '}
                        {usersMap[selectedRecord.user_id]?.email && (
                          <span className="font-mono text-[11px] text-[#71717A]">
                            ({usersMap[selectedRecord.user_id].email})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Kỳ kiểm kê &amp; Tạo lúc
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] font-mono text-[11px] text-[#09090B]">
                        {selectedRecord.reporting_period} •{' '}
                        <span className="text-[#71717A]">
                          {new Date(selectedRecord.created_at).toLocaleString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Phân loại phát thải
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF]">
                        <span
                          className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] font-medium ${
                            selectedRecord.scope_type === 'SCOPE_2'
                              ? 'text-[#0F766E]'
                              : 'text-[#B45309]'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              selectedRecord.scope_type === 'SCOPE_2'
                                ? 'bg-[#0F766E]'
                                : 'bg-[#B45309]'
                            }`}
                          />
                          {selectedRecord.scope_type} ({SOURCE_LABELS[selectedRecord.source_type]})
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Sản lượng khai báo (AD)
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] font-mono text-[15px] font-bold text-[#09090B] tabular-nums">
                        {formatNumber(selectedRecord.consumption_value)}{' '}
                        <span className="text-[12px] font-medium text-[#3F3F46]">
                          {selectedRecord.unit}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2">
                      <div className="p-2.5 bg-[#F4F4F5] border-r border-[#E4E4E7] text-[11px] uppercase text-[#3F3F46]">
                        Số hóa đơn đối soát
                      </div>
                      <div className="p-2.5 bg-[#FFFFFF] font-mono font-semibold text-[#09090B]">
                        {selectedRecord.invoice_number}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Formula Preview Well */}
                <div className="space-y-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#09090B] flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#18181B]" />
                    <span>2. Thuật toán quy đổi nháp (E = AD × EF × 10⁻³)</span>
                  </h2>

                  <div className="bg-[#F4F4F5] border border-[#E4E4E7] rounded-[6px] p-3.5 space-y-3">
                    <div className="bg-[#FFFFFF] border border-[#E4E4E7] p-2 rounded-[4px] font-mono text-[12px] text-[#09090B] text-center">
                      E (tCO2e) = AD ({selectedRecord.unit}) × EF × 10⁻³
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-[#FFFFFF] p-2 rounded-[4px] border border-[#E4E4E7] flex flex-col">
                        <span className="text-[#71717A] uppercase">AD Đầu vào</span>
                        <span className="font-mono text-[13px] font-semibold text-[#09090B] mt-1 tabular-nums">
                          {formatNumber(selectedRecord.consumption_value)}{' '}
                          {selectedRecord.unit}
                        </span>
                      </div>

                      <div className="bg-[#FFFFFF] p-2 rounded-[4px] border border-[#E4E4E7] flex flex-col">
                        <span className="text-[#71717A] uppercase">Hệ số EF</span>
                        <span className="font-mono text-[13px] font-semibold text-[#0F766E] mt-1 tabular-nums">
                          {matchedFactor
                            ? matchedFactor.factor_value.toFixed(6)
                            : 'N/A'}
                        </span>
                        {matchedFactor && (
                          <span className="text-[10px] text-[#71717A] truncate mt-0.5">
                            {matchedFactor.unit}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#FFFFFF] p-2 rounded-[4px] border border-[#E4E4E7] flex flex-col">
                        <span className="text-[#71717A] uppercase">Độ chính xác</span>
                        <span className="font-mono text-[13px] font-semibold text-[#09090B] mt-1">
                          6 chữ số
                        </span>
                        <span className="text-[10px] text-[#71717A] mt-0.5">
                          ISO 14064-1
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#FFFFFF] border-2 border-[#18181B] p-3 rounded-[4px] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase text-[#3F3F46] font-semibold">
                          Lượng phát thải quy đổi tạm tính
                        </div>
                        <div className="font-mono text-[11px] text-[#71717A] mt-0.5 tabular-nums">
                          {selectedRecord.consumption_value} ×{' '}
                          {matchedFactor
                            ? matchedFactor.factor_value.toFixed(6)
                            : '?'}{' '}
                          × 10⁻³ =
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[20px] font-bold text-[#09090B] tracking-tight tabular-nums">
                          {draftEmissionTco2e ?? '—'}{' '}
                          <span className="text-[12px] font-semibold text-[#3F3F46]">
                            tCO2e
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Bottom Decision Console */}
              <div className="shrink-0 border-t border-[#E4E4E7] bg-[#FFFFFF] p-4 space-y-3">
                <div className="bg-[#F4F4F5] border-l-2 border-[#18181B] p-2 text-[11px] text-[#3F3F46] flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-[#09090B] shrink-0 mt-0.5" />
                  <span>
                    Bắt buộc nhập lý do chi tiết nếu chọn &ldquo;Từ chối &amp; Trả lại&rdquo;.
                    Khi phê duyệt, Trigger PostgreSQL sẽ tự động tính và khóa kết
                    quả vào bảng <code className="font-mono">calculation_results</code>.
                  </span>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="reject-reason"
                    className="text-[11px] uppercase text-[#3F3F46] font-semibold block"
                  >
                    Lý do từ chối (Bắt buộc nếu Từ chối)
                  </label>
                  <textarea
                    id="reject-reason"
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value);
                      if (rejectionError) setRejectionError(null);
                    }}
                    placeholder="Nhập chi tiết sai lệch số liệu hoặc lỗi chứng từ..."
                    className={`w-full bg-[#FFFFFF] border rounded-[6px] p-2 text-[12px] text-[#09090B] focus:outline-none placeholder:text-[#71717A] ${
                      rejectionError
                        ? 'border-[#ba1a1a] focus:border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                  {rejectionError && (
                    <p className="text-[12px] text-[#ba1a1a]">{rejectionError}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleReject}
                    className="h-9 px-3.5 bg-[#FFFFFF] border border-[#FECACA] text-[#991B1B] hover:bg-[#FEF2F2] text-[12px] font-semibold rounded-[4px] flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Từ chối &amp; Trả lại</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleApprove}
                    className="flex-1 h-9 px-4 bg-[#15803D] hover:bg-[#166534] text-[#FFFFFF] text-[12px] font-semibold rounded-[4px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    <span>Phê duyệt &amp; Khóa bản ghi</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Evidence Viewer */}
            <div className="bg-[#F4F4F5] flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
              <div className="shrink-0 bg-[#FFFFFF] border-b border-[#E4E4E7] px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-[#3F3F46] shrink-0" />
                  <span className="font-mono text-[11px] text-[#09090B] font-medium truncate">
                    {selectedRecord.evidence_url}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.max(50, z - 25))}
                    title="Thu nhỏ"
                    className="h-7 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[#3F3F46] hover:border-[#18181B] flex items-center justify-center"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] text-[#3F3F46] px-1.5 tabular-nums">
                    {zoomPercent}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.min(200, z + 25))}
                    title="Phóng to"
                    className="h-7 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[#3F3F46] hover:border-[#18181B] flex items-center justify-center"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <div className="h-3.5 w-px bg-[#E4E4E7] mx-1" />
                  <a
                    href={selectedRecord.evidence_url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-7 px-2 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[11px] text-[#09090B] hover:border-[#18181B] flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải gốc</span>
                  </a>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto p-4 flex justify-center items-start">
                {isPdfUrl(selectedRecord.evidence_url) ? (
                  <div
                    className="w-full h-full min-h-[540px] bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] overflow-hidden origin-top transition-transform"
                    style={{
                      transform: `scale(${zoomPercent / 100})`,
                    }}
                  >
                    <iframe
                      title={`Chứng từ ${selectedRecord.record_id}`}
                      src={selectedRecord.evidence_url}
                      className="w-full h-full border-0"
                    />
                  </div>
                ) : (
                  <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] p-2">
                    <img
                      src={selectedRecord.evidence_url}
                      alt={`Chứng từ ${selectedRecord.record_id}`}
                      style={{
                        transform: `scale(${zoomPercent / 100})`,
                        transformOrigin: 'top center',
                      }}
                      className="max-w-full h-auto block transition-transform"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
