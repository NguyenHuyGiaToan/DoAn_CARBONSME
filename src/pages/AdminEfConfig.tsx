import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Edit3, FileText, Lock, Plus, X } from 'lucide-react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type { EmissionFactor, ScopeType, SourceType } from '../types/database';

const SOURCE_OPTIONS: Array<{
  value: SourceType;
  label: string;
  defaultScope: ScopeType;
  defaultUnit: string;
}> = [
  {
    value: 'ELECTRICITY',
    label: 'ELECTRICITY (Điện lưới quốc gia EVN)',
    defaultScope: 'SCOPE_2',
    defaultUnit: 'tCO2/MWh',
  },
  {
    value: 'GASOLINE_RON95',
    label: 'GASOLINE_RON95 (Xăng động cơ RON 95)',
    defaultScope: 'SCOPE_1',
    defaultUnit: 'kgCO2e/lit',
  },
  {
    value: 'DIESEL_DO',
    label: 'DIESEL_DO (Dầu Diesel máy phát/đội xe)',
    defaultScope: 'SCOPE_1',
    defaultUnit: 'kgCO2e/lit',
  },
];

export function AdminEfConfig() {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Modal state for Add / Edit EF
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFactorId, setEditingFactorId] = useState<number | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('ELECTRICITY');
  const [scopeCategory, setScopeCategory] = useState<ScopeType>('SCOPE_2');
  const [factorValueInput, setFactorValueInput] = useState('');
  const [unitInput, setUnitInput] = useState('tCO2/MWh');
  const [applyYearInput, setApplyYearInput] = useState('2026');
  const [referenceDocInput, setReferenceDocInput] = useState('');

  // Inline Validation errors
  const [factorValueError, setFactorValueError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [referenceDocError, setReferenceDocError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const fetchFactors = useCallback(async () => {
    const { data, error } = await supabase
      .from('emission_factors')
      .select('*')
      .order('factor_id', { ascending: true });

    if (!error && data) {
      setFactors(data as EmissionFactor[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const { data, error } = await supabase
        .from('emission_factors')
        .select('*')
        .order('factor_id', { ascending: true });
      if (!active) return;
      if (!error && data) {
        setFactors(data as EmissionFactor[]);
      }
      setIsLoading(false);
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const openCreateModal = () => {
    setEditingFactorId(null);
    setSourceType('ELECTRICITY');
    setScopeCategory('SCOPE_2');
    setFactorValueInput('');
    setUnitInput('tCO2/MWh');
    setApplyYearInput('2026');
    setReferenceDocInput('');
    setFactorValueError(null);
    setUnitError(null);
    setReferenceDocError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (ef: EmissionFactor) => {
    setEditingFactorId(ef.factor_id);
    setSourceType(ef.source_type);
    setScopeCategory(ef.scope_category);
    setFactorValueInput(ef.factor_value.toFixed(6));
    setUnitInput(ef.unit);
    setApplyYearInput(String(ef.apply_year));
    setReferenceDocInput(ef.reference_document);
    setFactorValueError(null);
    setUnitError(null);
    setReferenceDocError(null);
    setIsModalOpen(true);
  };

  const handleSourceChange = (nextSource: SourceType) => {
    setSourceType(nextSource);
    const meta = SOURCE_OPTIONS.find((s) => s.value === nextSource);
    if (meta) {
      setScopeCategory(meta.defaultScope);
      if (!editingFactorId) {
        setUnitInput(meta.defaultUnit);
      }
    }
  };

  const handleSaveFactor = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let hasError = false;

    const parsedVal = Number.parseFloat(factorValueInput);
    if (!factorValueInput.trim() || Number.isNaN(parsedVal) || parsedVal <= 0) {
      setFactorValueError('Giá trị hệ số EF phải là số thực dương lớn hơn 0.');
      hasError = true;
    } else {
      setFactorValueError(null);
    }

    if (!unitInput.trim()) {
      setUnitError('Vui lòng nhập đơn vị tính.');
      hasError = true;
    } else {
      setUnitError(null);
    }

    if (!referenceDocInput.trim()) {
      setReferenceDocError(
        'Bắt buộc nhập trích dẫn văn bản pháp lý / căn cứ khoa học.'
      );
      hasError = true;
    } else {
      setReferenceDocError(null);
    }

    if (hasError) return;

    const parsedYear = Number.parseInt(applyYearInput, 10) || 2026;
    setIsSaving(true);
    try {
      if (editingFactorId !== null) {
        const { error } = await supabase
          .from('emission_factors')
          .update({
            source_type: sourceType,
            scope_category: scopeCategory,
            factor_value: parsedVal,
            unit: unitInput.trim(),
            apply_year: parsedYear,
            reference_document: referenceDocInput.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('factor_id', editingFactorId);

        if (error) {
          setToast({
            type: 'error',
            message: `Cập nhật hệ số thất bại: ${error.message}`,
          });
          return;
        }

        setToast({
          type: 'success',
          message: `Đã cập nhật hệ số EF #${editingFactorId} (${sourceType}).`,
        });
      } else {
        const { error } = await supabase.from('emission_factors').insert({
          source_type: sourceType,
          scope_category: scopeCategory,
          factor_value: parsedVal,
          unit: unitInput.trim(),
          apply_year: parsedYear,
          reference_document: referenceDocInput.trim(),
        });

        if (error) {
          setToast({
            type: 'error',
            message: `Thêm mới hệ số thất bại: ${error.message}`,
          });
          return;
        }

        setToast({
          type: 'success',
          message: `Đã thêm mới hệ số EF cho nguồn ${sourceType}.`,
        });
      }

      setIsModalOpen(false);
      await fetchFactors();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const [
        deptRes,
        userRes,
        efRes,
        recRes,
        calcRes,
        aiRes,
      ] = await Promise.all([
        supabase.from('departments').select('*'),
        supabase.from('users').select('*'),
        supabase.from('emission_factors').select('*'),
        supabase.from('activity_records').select('*'),
        supabase.from('calculation_results').select('*'),
        supabase.from('ai_recommendations').select('*'),
      ]);

      const backupPayload = {
        system: 'CARBONSME-MRV',
        standard: 'ISO 14064-1 / GHG Protocol',
        exported_at: new Date().toISOString(),
        tables: {
          departments: deptRes.data ?? [],
          users: userRes.data ?? [],
          emission_factors: efRes.data ?? [],
          activity_records: recRes.data ?? [],
          calculation_results: calcRes.data ?? [],
          ai_recommendations: aiRes.data ?? [],
        },
      };

      const today = new Date().toISOString().slice(0, 10);
      const fileName = `carbonsme_backup_${today}.json`;
      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setToast({
        type: 'success',
        message: `Đã trích xuất sao lưu toàn bộ 6 bảng về tệp ${fileName}.`,
      });
    } catch {
      setToast({
        type: 'error',
        message: 'Không thể trích xuất sao lưu dữ liệu. Vui lòng thử lại.',
      });
    } finally {
      setIsExporting(false);
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

      {/* Top Action Strip */}
      <section className="w-full bg-[#FFFFFF] border-b border-[#E4E4E7] px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-[#18181B] rounded-[1px]" />
          <h1 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#09090B]">
            Quản trị Hệ số Phát thải (EF) &amp; Sao lưu Dữ liệu
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-1 rounded-[4px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
            <span>ISO 14064-1 COMPLIANT</span>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportBackup}
            className="h-8 px-3 rounded-[4px] border border-[#E4E4E7] bg-[#FFFFFF] hover:border-[#18181B] hover:bg-[#F4F4F5] font-mono text-[11px] text-[#09090B] flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5 text-[#3F3F46]" />
            <span>
              {isExporting
                ? 'Đang trích xuất 6 bảng...'
                : 'Trích xuất sao lưu ngoại tuyến (.JSON)'}
            </span>
          </button>
        </div>
      </section>

      {/* Main Content */}
      <div className="p-5 flex flex-col gap-4">
        <section className="w-full bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col overflow-hidden">
          <div className="bg-[#F4F4F5] px-4 py-2.5 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[13px] font-semibold uppercase text-[#09090B] tracking-wide">
                Danh mục hệ số phát thải quy đổi
              </h2>
              <span className="font-mono text-[11px] bg-[#FFFFFF] border border-[#E4E4E7] text-[#3F3F46] px-2 py-0.5 rounded-[4px]">
                {factors.length} BẢN GHI
              </span>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="h-8 px-3 rounded-[4px] bg-[#18181B] text-[#FFFFFF] hover:bg-[#27272A] font-semibold text-[12px] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm mới / Cập nhật Hệ số EF</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E4E4E7] font-mono text-[11px] text-[#71717A] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-14 text-center">Mã ID</th>
                  <th className="py-2.5 px-3">Phân loại nguồn</th>
                  <th className="py-2.5 px-3 w-32">Phạm vi</th>
                  <th className="py-2.5 px-3 text-right">Giá trị EF</th>
                  <th className="py-2.5 px-3">Đơn vị tính</th>
                  <th className="py-2.5 px-3 text-center w-24">Năm áp dụng</th>
                  <th className="py-2.5 px-3">Trích dẫn văn bản pháp lý</th>
                  <th className="py-2.5 px-3 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center font-mono text-[12px] text-[#71717A]"
                    >
                      Đang tải dữ liệu từ Supabase...
                    </td>
                  </tr>
                ) : factors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center font-mono text-[12px] text-[#71717A]"
                    >
                      Chưa có hệ số phát thải nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  factors.map((ef) => {
                    const isScope2 = ef.scope_category === 'SCOPE_2';
                    return (
                      <tr
                        key={ef.factor_id}
                        className="hover:bg-[#FAFAFA] transition-colors"
                      >
                        <td className="py-3 px-3 font-mono text-center text-[#71717A]">
                          {ef.factor_id}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-[#09090B]">
                          {ef.source_type}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] font-mono text-[11px] bg-[#F4F4F5] border border-[#E4E4E7] font-semibold ${
                              isScope2 ? 'text-[#0F766E]' : 'text-[#B45309]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isScope2 ? 'bg-[#0F766E]' : 'bg-[#B45309]'
                              }`}
                            />
                            {ef.scope_category}
                          </span>
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono text-[13px] font-bold tabular-nums ${
                            isScope2 ? 'text-[#0F766E]' : 'text-[#B45309]'
                          }`}
                        >
                          {Number(ef.factor_value).toFixed(6)}
                        </td>
                        <td className="py-3 px-3 font-mono text-[12px] text-[#3F3F46]">
                          {ef.unit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-mono text-[11px] bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5 rounded-[4px] text-[#09090B]">
                            {ef.apply_year}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#3F3F46]">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
                            <span>{ef.reference_document}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openEditModal(ef)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-[#E4E4E7] bg-[#FFFFFF] hover:border-[#18181B] font-mono text-[11px] text-[#09090B] transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Sửa</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-[#F4F4F5] px-4 py-2.5 border-t border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#71717A]">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              <span>
                Hệ số EF cập nhật sẽ áp dụng cho các bản ghi mới được phê duyệt
                tiếp theo.
              </span>
            </div>
            <span className="text-[#3F3F46] font-semibold">
              PRECISION: 6 DECIMALS
            </span>
          </div>
        </section>
      </div>

      {/* Modal: Thêm mới / Cập nhật Hệ số EF */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#09090B]/30 z-50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[480px] bg-[#FFFFFF] border border-[#18181B] rounded-[6px] p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-[#E4E4E7] pb-3">
              <div>
                <div className="font-mono text-[10px] text-[#71717A] uppercase">
                  {editingFactorId !== null
                    ? `Cập nhật bản ghi EF #${editingFactorId}`
                    : 'Khởi tạo hệ số EF mới'}
                </div>
                <h3 className="text-[15px] font-semibold text-[#09090B]">
                  {editingFactorId !== null
                    ? 'Cập nhật Hệ số Phát thải (EF)'
                    : 'Thêm mới Hệ số Phát thải (EF)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#71717A] hover:text-[#09090B] p-1 rounded-[4px] hover:bg-[#F4F4F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFactor} className="space-y-3" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#09090B]">
                    Phân loại nguồn
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) =>
                      handleSourceChange(e.target.value as SourceType)
                    }
                    className="w-full h-9 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] font-mono text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#09090B]">
                    Phạm vi (Scope)
                  </label>
                  <select
                    value={scopeCategory}
                    onChange={(e) =>
                      setScopeCategory(e.target.value as ScopeType)
                    }
                    className="w-full h-9 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] font-mono text-[12px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  >
                    <option value="SCOPE_1">SCOPE_1</option>
                    <option value="SCOPE_2">SCOPE_2</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#09090B]">
                    Giá trị EF *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={factorValueInput}
                    onChange={(e) => {
                      setFactorValueInput(e.target.value);
                      if (factorValueError) setFactorValueError(null);
                    }}
                    placeholder="0.618700"
                    className={`w-full h-9 px-2.5 bg-[#FFFFFF] border rounded-[6px] font-mono text-[13px] text-[#09090B] focus:outline-none tabular-nums ${
                      factorValueError
                        ? 'border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#09090B]">
                    Đơn vị tính *
                  </label>
                  <input
                    type="text"
                    value={unitInput}
                    onChange={(e) => {
                      setUnitInput(e.target.value);
                      if (unitError) setUnitError(null);
                    }}
                    placeholder="tCO2/MWh"
                    className={`w-full h-9 px-2.5 bg-[#FFFFFF] border rounded-[6px] font-mono text-[12px] text-[#09090B] focus:outline-none ${
                      unitError
                        ? 'border-[#ba1a1a]'
                        : 'border-[#E4E4E7] focus:border-[#18181B]'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#09090B]">
                    Năm áp dụng
                  </label>
                  <input
                    type="number"
                    value={applyYearInput}
                    onChange={(e) => setApplyYearInput(e.target.value)}
                    className="w-full h-9 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] font-mono text-[13px] text-[#09090B] focus:outline-none focus:border-[#18181B]"
                  />
                </div>
              </div>
              {factorValueError && (
                <p className="text-[12px] text-[#ba1a1a]">{factorValueError}</p>
              )}
              {unitError && (
                <p className="text-[12px] text-[#ba1a1a]">{unitError}</p>
              )}

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[#09090B]">
                  Trích dẫn văn bản pháp lý / Căn cứ khoa học *
                </label>
                <input
                  type="text"
                  value={referenceDocInput}
                  onChange={(e) => {
                    setReferenceDocInput(e.target.value);
                    if (referenceDocError) setReferenceDocError(null);
                  }}
                  placeholder="Ví dụ: Công văn số 11232/BTNMT-BĐKH (Bộ TN&MT)"
                  className={`w-full h-9 px-3 bg-[#FFFFFF] border rounded-[6px] text-[12px] text-[#09090B] focus:outline-none ${
                    referenceDocError
                      ? 'border-[#ba1a1a]'
                      : 'border-[#E4E4E7] focus:border-[#18181B]'
                  }`}
                />
                {referenceDocError && (
                  <p className="text-[12px] text-[#ba1a1a]">
                    {referenceDocError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E4E7]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-8 px-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[12px] font-medium text-[#3F3F46] hover:border-[#18181B]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-8 px-4 bg-[#18181B] hover:bg-[#27272A] text-[#FFFFFF] rounded-[4px] text-[12px] font-semibold disabled:opacity-60"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu hệ số EF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

