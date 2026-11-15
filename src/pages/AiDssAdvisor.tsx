import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Copy, Terminal } from 'lucide-react';
import { Toast } from '../components/Toast';
import { generateDssRecommendation } from '../lib/gemini';
import { supabase } from '../lib/supabase';
import type {
  ActionPriority,
  ActivityRecord,
  AiRecommendation,
  CalculationResult,
  Department,
  GroundedSummary,
  User,
} from '../types/database';

const PERIODS = [
  { value: '2026-10', label: '2026-10 (Tháng 10/2026)' },
  { value: '2026-09', label: '2026-09 (Tháng 09/2026)' },
  { value: '2026-08', label: '2026-08 (Tháng 08/2026)' },
  { value: '2026-07', label: '2026-07 (Tháng 07/2026)' },
];

const PREVIOUS_PERIOD_MAP: Record<string, string | null> = {
  '2026-10': '2026-09',
  '2026-09': '2026-08',
  '2026-08': '2026-07',
  '2026-07': null,
};

const PRIORITY_STYLES: Record<
  ActionPriority,
  { badge: string; label: string }
> = {
  HIGH: {
    badge: 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]',
    label: 'ƯU TIÊN: CAO (HIGH)',
  },
  MEDIUM: {
    badge: 'bg-[#FEFCE8] border-[#FEF08A] text-[#854D0E]',
    label: 'ƯU TIÊN: TRUNG BÌNH (MEDIUM)',
  },
  LOW: {
    badge: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]',
    label: 'ƯU TIÊN: THẤP (LOW)',
  },
};

function round6(n: number): number {
  return Number(n.toFixed(6));
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export interface AiDssAdvisorProps {
  user: User;
}

export function AiDssAdvisor({ user }: AiDssAdvisorProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');
  const [groundedSummary, setGroundedSummary] = useState<GroundedSummary | null>(
    null
  );
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  const [history, setHistory] = useState<AiRecommendation[]>([]);
  const [activeRec, setActiveRec] = useState<AiRecommendation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const buildGroundedSummaryForPeriod = useCallback(
    async (period: string): Promise<GroundedSummary> => {
      const prevPeriod = PREVIOUS_PERIOD_MAP[period] ?? null;
      const targetPeriods = prevPeriod ? [period, prevPeriod] : [period];

      const [calcRes, recRes, deptRes] = await Promise.all([
        supabase.from('calculation_results').select('*'),
        supabase
          .from('activity_records')
          .select('*')
          .eq('approval_status', 'APPROVED')
          .in('reporting_period', targetPeriods),
        supabase.from('departments').select('*'),
      ]);

      const deptMap = new Map<string, Department>();
      if (!deptRes.error && deptRes.data) {
        for (const d of deptRes.data as Department[]) {
          deptMap.set(d.department_id, d);
        }
      }

      const calcByRecord = new Map<string, number>();
      if (!calcRes.error && calcRes.data) {
        for (const c of calcRes.data as CalculationResult[]) {
          calcByRecord.set(c.record_id, Number(c.emission_tco2e) || 0);
        }
      }

      let curTotal = 0;
      let curScope1 = 0;
      let curScope2 = 0;
      let prevTotal = 0;
      const deptEmissions = new Map<string, number>();

      if (!recRes.error && recRes.data) {
        for (const rec of recRes.data as ActivityRecord[]) {
          const emission = calcByRecord.get(rec.record_id) ?? 0;
          if (rec.reporting_period === period) {
            curTotal += emission;
            if (rec.scope_type === 'SCOPE_1') curScope1 += emission;
            else curScope2 += emission;
            deptEmissions.set(
              rec.department_id,
              (deptEmissions.get(rec.department_id) ?? 0) + emission
            );
          } else if (prevPeriod && rec.reporting_period === prevPeriod) {
            prevTotal += emission;
          }
        }
      }

      const scope1Pct = curTotal > 0 ? round2((curScope1 / curTotal) * 100) : 0;
      const scope2Pct = curTotal > 0 ? round2((curScope2 / curTotal) * 100) : 0;
      const changePct =
        prevPeriod && prevTotal > 0
          ? round2(((curTotal - prevTotal) / prevTotal) * 100)
          : null;

      let hotspotDeptId = '';
      let hotspotVal = -1;
      for (const [deptId, val] of deptEmissions.entries()) {
        if (val > hotspotVal) {
          hotspotVal = val;
          hotspotDeptId = deptId;
        }
      }

      const hotspot =
        hotspotDeptId && hotspotVal >= 0
          ? {
              department_id: hotspotDeptId,
              department_name:
                deptMap.get(hotspotDeptId)?.department_name ?? hotspotDeptId,
              emission_tco2e: round6(hotspotVal),
              share_percent:
                curTotal > 0 ? round2((hotspotVal / curTotal) * 100) : 0,
            }
          : null;

      return {
        reporting_period: period,
        previous_period: prevPeriod,
        total_emission_tco2e: round6(curTotal),
        period_over_period_change_percent: changePct,
        breakdown: {
          scope_1_tco2e: round6(curScope1),
          scope_1_percent: scope1Pct,
          scope_2_tco2e: round6(curScope2),
          scope_2_percent: scope2Pct,
        },
        department_hotspot: hotspot,
      };
    },
    []
  );

  // Load saved recommendations once on mount
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      const { data, error } = await supabase
        .from('ai_recommendations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!active) return;
      if (!error && data) {
        const list = data as AiRecommendation[];
        setHistory(list);
        if (list.length > 0) {
          setActiveRec((prev) => prev ?? list[0]);
        }
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, []);

  // Recompute grounded_summary whenever selectedPeriod changes
  useEffect(() => {
    let active = true;
    const loadSummary = async () => {
      const summary = await buildGroundedSummaryForPeriod(selectedPeriod);
      if (!active) return;
      setGroundedSummary(summary);
      setIsLoadingSummary(false);
    };
    void loadSummary();
    return () => {
      active = false;
    };
  }, [selectedPeriod, buildGroundedSummaryForPeriod]);

  const generateNextRecommendationId = (): string => {
    let maxNum = 98;
    for (const item of history) {
      const match = /^REC-DSS-(\d+)$/i.exec(item.recommendation_id);
      if (match) {
        const n = Number.parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    return `REC-DSS-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const handleTriggerDss = async () => {
    if (!groundedSummary) return;
    setIsGenerating(true);
    try {
      const result = await generateDssRecommendation(groundedSummary);
      const newId = generateNextRecommendationId();

      const newRecord: Omit<AiRecommendation, 'created_at'> = {
        recommendation_id: newId,
        reporting_period: groundedSummary.reporting_period,
        grounded_summary: groundedSummary,
        executive_summary: result.executive_summary,
        suggested_actions: result.suggested_actions,
        model_version: result.modelUsed,
        created_by: user.user_id,
      };

      const { data, error } = await supabase
        .from('ai_recommendations')
        .insert(newRecord)
        .select('*')
        .single<AiRecommendation>();

      if (error || !data) {
        setToast({
          type: 'error',
          message: `Lưu kết quả vào Supabase thất bại: ${error?.message ?? 'Lỗi không xác định'}`,
        });
        return;
      }

      setHistory((prev) => [data, ...prev]);
      setActiveRec(data);
      setToast({
        type: 'success',
        message: `Đã phân tích và lưu phiên tư vấn ${newId} cho kỳ ${groundedSummary.reporting_period}.`,
      });
    } catch (err) {
      setToast({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Không thể kết nối tới Gemini API.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!activeRec) return;
    const lines = [
      `# BÁO CÁO KHUYẾN NGHỊ AI DSS (${activeRec.recommendation_id})`,
      `- Kỳ kiểm kê: ${activeRec.reporting_period}`,
      `- Engine: ${activeRec.model_version}`,
      '',
      '## Bản tóm lược điều hành',
      activeRec.executive_summary,
      '',
      '## Danh mục giải pháp hành động đề xuất',
      ...activeRec.suggested_actions.map(
        (a) => `- **[${a.code}] (${a.priority}) ${a.title}**: ${a.description}`
      ),
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
    setToast({
      type: 'success',
      message: 'Đã sao chép báo cáo Markdown vào khay nhớ tạm.',
    });
  };

  const activeSummaryChips = useMemo(() => {
    if (!activeRec) return null;
    const gs = activeRec.grounded_summary;
    const total = Number(gs.total_emission_tco2e ?? 0);
    const scope2 =
      gs.breakdown?.scope_2_tco2e ?? Number(gs.scope_2_tco2e ?? 0);
    const scope2Pct =
      gs.breakdown?.scope_2_percent ??
      (total > 0 ? round2((scope2 / total) * 100) : 0);
    const mom = gs.period_over_period_change_percent;
    const hotspot = gs.department_hotspot?.department_id ?? '—';

    return { total, scope2Pct, mom, hotspot };
  }, [activeRec]);

  return (
    <div className="w-full min-h-screen bg-[#FAFAFA] text-[#09090B]">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* 2-Column Analytical Grid (35% Left / 65% Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[35fr_65fr] w-full min-h-screen divide-y lg:divide-y-0 lg:divide-x divide-[#E4E4E7]">
        {/* LEFT COLUMN (35%): Grounding Context + Trigger + Saved History */}
        <div className="p-5 flex flex-col gap-6 bg-[#FAFAFA]">
          {/* Section 1: Grounding Context */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#E4E4E7]">
              <h2 className="text-[13px] font-semibold text-[#09090B] uppercase tracking-tight">
                1. Cấu hình neo ngữ cảnh dữ liệu
              </h2>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dss-period-select"
                className="text-[11px] text-[#3F3F46] uppercase tracking-wider font-semibold"
              >
                Kỳ kiểm kê phân tích
              </label>
              <select
                id="dss-period-select"
                value={selectedPeriod}
                onChange={(e) => {
                  setIsLoadingSummary(true);
                  setSelectedPeriod(e.target.value);
                }}
                className="w-full h-8 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] text-[#09090B] font-mono text-[13px] focus:border-[#18181B] focus:outline-none cursor-pointer"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Grounded Summary Payload Monospace Box */}
            <div className="flex flex-col border border-[#E4E4E7] rounded-[6px] bg-[#F4F4F5] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[#E4E4E7] flex items-center justify-between bg-[#FFFFFF]">
                <span className="font-mono text-[11px] font-semibold text-[#3F3F46]">
                  GROUNDED_SUMMARY PAYLOAD
                </span>
                <span className="font-mono text-[10px] text-[#71717A] uppercase">
                  JSON READONLY
                </span>
              </div>
              <pre className="p-3 font-mono text-[11px] text-[#09090B] overflow-x-auto leading-relaxed m-0 tabular-nums">
                {isLoadingSummary || !groundedSummary
                  ? '// Đang tổng hợp dữ liệu APPROVED từ Supabase...'
                  : JSON.stringify(groundedSummary, null, 2)}
              </pre>
            </div>

            {/* Technical Rule Note Box */}
            <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] flex items-start gap-2">
              <Terminal className="w-4 h-4 text-[#3F3F46] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#3F3F46] leading-snug">
                Thuật toán định lượng do CSDL thực thi 100%; mô hình Gemini chỉ
                suy luận khuyến nghị từ dữ liệu neo trong gói JSON trên.
              </p>
            </div>

            {/* Trigger Button */}
            <button
              type="button"
              disabled={isLoadingSummary || isGenerating || !groundedSummary}
              onClick={handleTriggerDss}
              className="w-full h-9 bg-[#18181B] hover:bg-[#27272A] text-[#FFFFFF] text-[13px] font-semibold rounded-[4px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <Bot className="w-4 h-4" />
              <span>
                {isGenerating
                  ? 'Đang phân tích Gemini DSS...'
                  : 'Kích hoạt Phân tích & Đề xuất DSS'}
              </span>
              {!isGenerating && <span className="font-mono text-[12px]">↵</span>}
            </button>
          </div>

          {/* Section 2: Consulting History */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-0.5 pb-1.5 border-b border-[#E4E4E7]">
              <h2 className="text-[13px] font-semibold text-[#09090B] uppercase tracking-tight">
                2. Lịch sử phiên tư vấn đã lưu vết
              </h2>
              <span className="text-[11px] text-[#71717A]">
                Bản ghi từ bảng ai_recommendations (Nhấn để xem lại)
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {history.length === 0 ? (
                <div className="p-3 bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono text-[11px] text-[#71717A] text-center">
                  Chưa có phiên tư vấn nào được lưu.
                </div>
              ) : (
                history.map((item) => {
                  const isActive =
                    activeRec?.recommendation_id === item.recommendation_id;
                  return (
                    <button
                      key={item.recommendation_id}
                      type="button"
                      onClick={() => setActiveRec(item)}
                      className={`w-full text-left p-3 rounded-[4px] flex flex-col gap-1.5 transition-colors border ${
                        isActive
                          ? 'bg-[#FFFFFF] border-[#18181B] border-l-[3px] border-l-[#18181B]'
                          : 'bg-[#F4F4F5] hover:bg-[#FFFFFF] border-[#E4E4E7]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-[#09090B]">
                          {item.recommendation_id}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 font-mono text-[10px] font-semibold rounded-[4px] border ${
                            isActive
                              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                              : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#71717A]'
                          }`}
                        >
                          {isActive ? 'ĐANG XEM' : 'ARCHIVED'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#3F3F46] font-mono text-[11px]">
                        <span>Kỳ {item.reporting_period}</span>
                        <span className="text-[#71717A]">
                          {new Date(item.created_at).toLocaleString('vi-VN')}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (65%): Structured Consulting Report */}
        <div className="flex flex-col bg-[#FFFFFF]">
          {/* Top Action & Meta Header Bar */}
          <div className="px-6 py-4 border-b border-[#E4E4E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-[16px] font-semibold text-[#09090B] tracking-tight">
                BÁO CÁO KHUYẾN NGHỊ QUẢN TRỊ NĂNG LƯỢNG &amp; GIẢM PHÁT THẢI
              </h1>
              <div className="font-mono text-[11px] text-[#71717A] flex items-center gap-2">
                <span>
                  MÃ PHIÊN TƯ VẤN:{' '}
                  <span className="text-[#09090B] font-medium">
                    {activeRec?.recommendation_id ?? '—'}
                  </span>
                </span>
                <span>//</span>
                <span>
                  ENGINE:{' '}
                  <span className="text-[#09090B] font-medium uppercase">
                    {activeRec?.model_version ?? 'GEMINI-3.5-FLASH-LITE'}
                  </span>
                </span>
              </div>
            </div>

            {activeRec && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="h-8 px-2.5 bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#18181B] hover:bg-[#F4F4F5] text-[12px] text-[#09090B] rounded-[4px] transition-colors flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép Markdown</span>
                </button>
              </div>
            )}
          </div>

          {/* Main Report Body */}
          {!activeRec ? (
            <div className="flex-1 flex items-center justify-center p-10 text-center">
              <div className="space-y-2 max-w-md">
                <Bot className="w-8 h-8 text-[#71717A] mx-auto" />
                <div className="text-[14px] font-semibold text-[#09090B]">
                  Chưa có báo cáo tư vấn được chọn
                </div>
                <p className="text-[12px] text-[#71717A]">
                  Chọn một kỳ kiểm kê ở cột trái và bấm &ldquo;Kích hoạt Phân tích
                  &amp; Đề xuất DSS&rdquo; hoặc chọn một phiên tư vấn trong lịch sử.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 flex flex-col gap-6">
              {/* Section A: Executive Summary */}
              <div className="flex flex-col gap-2.5">
                <div className="pb-1.5 border-b border-[#E4E4E7]">
                  <h2 className="text-[13px] font-semibold text-[#09090B] tracking-wide uppercase">
                    Bản tóm lược điều hành
                  </h2>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-5 flex flex-col gap-4">
                  <p className="text-[13px] text-[#09090B] leading-relaxed">
                    {activeRec.executive_summary}
                  </p>

                  {activeSummaryChips && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-3 border-t border-[#E4E4E7]">
                      <div className="p-2.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#71717A] uppercase">
                          Tổng phát thải
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-[#09090B] tabular-nums">
                          {activeSummaryChips.total.toFixed(6)} tCO2e
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#71717A] uppercase">
                          Scope 2 chiếm
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-[#0F766E] tabular-nums">
                          {activeSummaryChips.scope2Pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#71717A] uppercase">
                          Biến thiên MoM
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-[#09090B] tabular-nums">
                          {activeSummaryChips.mom !== undefined &&
                          activeSummaryChips.mom !== null
                            ? `${activeSummaryChips.mom > 0 ? '+' : ''}${activeSummaryChips.mom}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[4px] flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#71717A] uppercase">
                          Điểm nóng đơn vị
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-[#09090B]">
                          {activeSummaryChips.hotspot}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section B: Suggested Actions */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#E4E4E7]">
                  <h2 className="text-[13px] font-semibold text-[#09090B] tracking-wide uppercase">
                    Danh mục giải pháp hành động đề xuất
                  </h2>
                  <span className="font-mono text-[11px] text-[#71717A]">
                    ISO 50001 • SME GROUNDED
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {activeRec.suggested_actions.map((action) => {
                    const style =
                      PRIORITY_STYLES[action.priority] ?? PRIORITY_STYLES.MEDIUM;
                    return (
                      <div
                        key={action.code}
                        className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] flex flex-col divide-y divide-[#E4E4E7]"
                      >
                        <div className="px-4 py-3 bg-[#FAFAFA] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[13px] font-bold text-[#09090B]">
                              [{action.code}]
                            </span>
                            <span className="text-[13px] font-semibold text-[#09090B]">
                              {action.title}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 border font-mono text-[11px] font-semibold rounded-[4px] shrink-0 w-fit ${style.badge}`}
                          >
                            {style.label}
                          </span>
                        </div>
                        <div className="p-4">
                          <p className="text-[13px] text-[#3F3F46] leading-relaxed">
                            {action.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
