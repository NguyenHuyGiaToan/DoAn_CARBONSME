import { useEffect, useMemo, useState } from 'react';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import type {
  ActivityRecord,
  CalculationResult,
  Department,
} from '../types/database';

const DEFAULT_MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10'];

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-');
  if (year && month) {
    return `${period} (Tháng ${month}/${year})`;
  }
  return period;
}

interface EnrichedEmissionRow {
  result: CalculationResult;
  record: ActivityRecord;
}

function formatTco2e(value: number): string {
  return value.toFixed(6);
}

function formatActivity(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function Dashboard() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<EnrichedEmissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const [calcRes, recRes, deptRes] = await Promise.all([
        supabase.from('calculation_results').select('*'),
        supabase
          .from('activity_records')
          .select('*')
          .eq('approval_status', 'APPROVED'),
        supabase.from('departments').select('*').order('department_id'),
      ]);
      if (!active) return;

      if (!deptRes.error && deptRes.data) {
        setDepartments(deptRes.data as Department[]);
      }

      if (!calcRes.error && calcRes.data && !recRes.error && recRes.data) {
        const recordMap = new Map<string, ActivityRecord>();
        for (const rec of recRes.data as ActivityRecord[]) {
          recordMap.set(rec.record_id, rec);
        }

        const joined: EnrichedEmissionRow[] = [];
        for (const calc of calcRes.data as CalculationResult[]) {
          const matchedRecord = recordMap.get(calc.record_id);
          if (matchedRecord) {
            joined.push({ result: calc, record: matchedRecord });
          }
        }
        setRows(joined);
      }
      setIsLoading(false);
    };

    void init();
    return () => {
      active = false;
    };
  }, []);

  // Derive sorted reporting periods dynamically from live APPROVED records
  const availablePeriods = useMemo(() => {
    const periods = Array.from(
      new Set(rows.map((r) => r.record.reporting_period))
    ).sort();
    return periods.length > 0 ? periods : DEFAULT_MONTHS;
  }, [rows]);

  const periodOptions = useMemo(() => {
    const desc = [...availablePeriods].reverse().map((p) => ({
      value: p,
      label: formatPeriodLabel(p),
    }));
    return [{ value: 'ALL', label: 'Tất cả các kỳ (Lũy kế)' }, ...desc];
  }, [availablePeriods]);

  // Filter by department first (used by both KPI cards and monthly trend chart)
  const deptFilteredRows = useMemo(() => {
    if (selectedDepartment === 'ALL') return rows;
    return rows.filter((r) => r.record.department_id === selectedDepartment);
  }, [rows, selectedDepartment]);

  // Filter by selected period
  const filteredRows = useMemo(() => {
    if (selectedPeriod === 'ALL') return deptFilteredRows;
    return deptFilteredRows.filter(
      (r) => r.record.reporting_period === selectedPeriod
    );
  }, [deptFilteredRows, selectedPeriod]);

  // KPI Totals
  const kpi = useMemo(() => {
    let total = 0;
    let scope1 = 0;
    let scope2 = 0;
    let gasoline = 0;
    let diesel = 0;
    let electricityKwh = 0;

    for (const item of filteredRows) {
      const e = Number(item.result.emission_tco2e) || 0;
      total += e;
      if (item.record.scope_type === 'SCOPE_1') {
        scope1 += e;
        if (item.record.source_type === 'GASOLINE_RON95') gasoline += e;
        if (item.record.source_type === 'DIESEL_DO') diesel += e;
      } else {
        scope2 += e;
        electricityKwh += Number(item.record.consumption_value) || 0;
      }
    }

    const scope1Share = total > 0 ? (scope1 / total) * 100 : 0;
    const scope2Share = total > 0 ? (scope2 / total) * 100 : 0;

    // Period-over-period comparison
    let compareCurrentPeriod = selectedPeriod;
    if (selectedPeriod === 'ALL') {
      const availablePeriods = Array.from(
        new Set(deptFilteredRows.map((r) => r.record.reporting_period))
      ).sort();
      compareCurrentPeriod =
        availablePeriods[availablePeriods.length - 1] ?? '';
    }

    const idx = availablePeriods.indexOf(compareCurrentPeriod);
    const prevPeriod = idx > 0 ? availablePeriods[idx - 1] : null;

    let deltaTotal: number | null = null;
    let deltaScope1: number | null = null;
    let deltaScope2: number | null = null;

    if (prevPeriod && compareCurrentPeriod) {
      const curRows = deptFilteredRows.filter(
        (r) => r.record.reporting_period === compareCurrentPeriod
      );
      const prevRows = deptFilteredRows.filter(
        (r) => r.record.reporting_period === prevPeriod
      );

      const sumBy = (list: EnrichedEmissionRow[], scope?: 'SCOPE_1' | 'SCOPE_2') =>
        list.reduce((acc, r) => {
          if (scope && r.record.scope_type !== scope) return acc;
          return acc + (Number(r.result.emission_tco2e) || 0);
        }, 0);

      deltaTotal = computeDeltaPercent(sumBy(curRows), sumBy(prevRows));
      deltaScope1 = computeDeltaPercent(
        sumBy(curRows, 'SCOPE_1'),
        sumBy(prevRows, 'SCOPE_1')
      );
      deltaScope2 = computeDeltaPercent(
        sumBy(curRows, 'SCOPE_2'),
        sumBy(prevRows, 'SCOPE_2')
      );
    }

    return {
      total,
      scope1,
      scope2,
      gasoline,
      diesel,
      electricityKwh,
      scope1Share,
      scope2Share,
      prevPeriod,
      compareCurrentPeriod,
      deltaTotal,
      deltaScope1,
      deltaScope2,
    };
  }, [filteredRows, deptFilteredRows, selectedPeriod, availablePeriods]);

  // Donut Chart SVG geometry (r=64 => circumference = 2 * PI * 64 = 402.12386)
  const donutGeometry = useMemo(() => {
    const r = 64;
    const circumference = 2 * Math.PI * r;
    const s2Len = (kpi.scope2Share / 100) * circumference;
    const s1Len = (kpi.scope1Share / 100) * circumference;
    return {
      circumference,
      s2Len,
      s1Len,
      s1Offset: -s2Len,
    };
  }, [kpi.scope1Share, kpi.scope2Share]);

  // Stacked Bar Chart Data: responds dynamically to newly added months and selectedPeriod
  const monthlySeries = useMemo(() => {
    const targetPeriods =
      selectedPeriod === 'ALL'
        ? availablePeriods
        : availablePeriods.filter((p) => p <= selectedPeriod);

    const months =
      targetPeriods.length > 0 ? targetPeriods : [selectedPeriod];

    const series = months.map((period) => {
      let scope1 = 0;
      let scope2 = 0;
      for (const item of deptFilteredRows) {
        if (item.record.reporting_period !== period) continue;
        const e = Number(item.result.emission_tco2e) || 0;
        if (item.record.scope_type === 'SCOPE_1') scope1 += e;
        else scope2 += e;
      }
      return {
        period,
        shortLabel: `${period.slice(5, 7)}/${period.slice(2, 4)}`,
        scope1,
        scope2,
        total: scope1 + scope2,
      };
    });

    const rawMax = Math.max(...series.map((s) => s.total), 1);
    const yMax = Math.ceil(rawMax / 3) * 3 || 12;
    const peak = series.reduce(
      (best, cur) => (cur.total > best.total ? cur : best),
      series[0]
    );

    return { series, yMax, peak, months };
  }, [deptFilteredRows, availablePeriods, selectedPeriod]);

  // Departmental Breakdown Table
  const departmentBreakdown = useMemo(() => {
    const targetDepts =
      selectedDepartment === 'ALL'
        ? departments
        : departments.filter((d) => d.department_id === selectedDepartment);

    const list = targetDepts.map((dept) => {
      const deptRows = filteredRows.filter(
        (r) => r.record.department_id === dept.department_id
      );
      let kwh = 0;
      let lit = 0;
      let scope1 = 0;
      let scope2 = 0;

      for (const item of deptRows) {
        const val = Number(item.record.consumption_value) || 0;
        const e = Number(item.result.emission_tco2e) || 0;
        if (item.record.scope_type === 'SCOPE_1') {
          lit += val;
          scope1 += e;
        } else {
          kwh += val;
          scope2 += e;
        }
      }
      const total = scope1 + scope2;
      const share = kpi.total > 0 ? (total / kpi.total) * 100 : 0;

      return {
        department_id: dept.department_id,
        department_name: dept.department_name,
        kwh,
        lit,
        scope1,
        scope2,
        total,
        share,
      };
    });

    const sumKwh = list.reduce((a, b) => a + b.kwh, 0);
    const sumLit = list.reduce((a, b) => a + b.lit, 0);
    const sumScope1 = list.reduce((a, b) => a + b.scope1, 0);
    const sumScope2 = list.reduce((a, b) => a + b.scope2, 0);
    const sumTotal = list.reduce((a, b) => a + b.total, 0);

    return { list, sumKwh, sumLit, sumScope1, sumScope2, sumTotal };
  }, [departments, filteredRows, selectedDepartment, kpi.total]);

  const handleExportCsv = () => {
    const headers = [
      'Mã bản ghi',
      'Kỳ kiểm kê',
      'Phòng ban',
      'Phạm vi',
      'Nguồn phát thải',
      'Sản lượng (AD)',
      'Đơn vị',
      'Số hóa đơn',
      'Phát thải (tCO2e)',
      'Ngày phê duyệt',
    ];

    const csvRows = filteredRows.map(({ record, result }) => [
      record.record_id,
      record.reporting_period,
      record.department_id,
      record.scope_type,
      record.source_type,
      record.consumption_value,
      record.unit,
      record.invoice_number,
      formatTco2e(Number(result.emission_tco2e) || 0),
      record.approved_at ?? '',
    ]);

    const escapeCell = (cell: string | number) =>
      `"${String(cell).replace(/"/g, '""')}"`;

    const csvContent =
      '\uFEFF' +
      [headers, ...csvRows]
        .map((row) => row.map(escapeCell).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix =
      selectedPeriod === 'ALL' ? '2026' : selectedPeriod.replace('-', '');
    link.download = `CARBONSME_BaoCaoKiemKe_${suffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToast({
      type: 'success',
      message: `Đã xuất báo cáo kiểm kê (${filteredRows.length} bản ghi APPROVED).`,
    });
  };

  const renderDeltaBadge = (
    delta: number | null,
    prevPeriod: string | null
  ) => {
    if (delta === null || !prevPeriod) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A] font-mono text-[11px] rounded-[4px]">
          Chưa có dữ liệu kỳ trước để đối chiếu
        </span>
      );
    }
    const isUp = delta > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono text-[11px] rounded-[4px] tabular-nums ${
          isUp
            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
            : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
        }`}
      >
        {isUp ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        <span>
          {isUp ? '+' : ''}
          {delta.toFixed(2)}% so với {prevPeriod}
        </span>
      </span>
    );
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

      {/* Top Filter & Export Control Bar */}
      <section className="w-full bg-[#FFFFFF] border-b border-[#E4E4E7] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-[#18181B] rounded-[1px]" />
          <h1 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#09090B]">
            Bảng điều khiển kiểm kê phát thải (Dashboard)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Lọc theo kỳ kiểm kê"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="h-8 px-2.5 text-[12px] text-[#09090B] bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] font-mono focus:outline-none focus:border-[#18181B] cursor-pointer"
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Kỳ: {opt.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo phòng ban"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="h-8 px-2.5 text-[12px] text-[#09090B] bg-[#FFFFFF] border border-[#E4E4E7] rounded-[4px] focus:outline-none focus:border-[#18181B] cursor-pointer"
          >
            <option value="ALL">
              Cơ sở: Toàn doanh nghiệp ({departments.length} Phòng ban)
            </option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>
                {d.department_id}: {d.department_name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading}
            className="h-8 px-3 inline-flex items-center gap-1.5 bg-[#18181B] text-[#FFFFFF] text-[12px] font-semibold rounded-[4px] hover:bg-[#27272A] transition-colors disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất báo cáo kiểm kê (.CSV)</span>
          </button>
        </div>
      </section>

      {/* Main Content */}
      <div className="p-5 space-y-4">
        {/* ROW 1: 3 Exposed-Grid KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total Emissions */}
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Tổng phát thải (E_TOTAL)
                </span>
                <span className="px-1.5 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] font-mono text-[11px] text-[#3F3F46] rounded-[4px]">
                  TOTAL
                </span>
              </div>
              <div className="mt-3 flex items-baseline">
                <span className="font-mono text-[26px] font-bold text-[#09090B] tracking-tight tabular-nums">
                  {formatTco2e(kpi.total)}
                </span>
                <span className="ml-1.5 font-mono text-[12px] text-[#3F3F46]">
                  tCO2e
                </span>
              </div>
              <div className="mt-2.5">
                {renderDeltaBadge(kpi.deltaTotal, kpi.prevPeriod)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4E4E7] text-[11px] text-[#71717A] flex items-center justify-between">
              <span>Tổng hợp từ {filteredRows.length} bản ghi APPROVED</span>
              <span className="font-mono text-[#3F3F46]">IPCC 2006</span>
            </div>
          </div>

          {/* Card 2: Scope 1 */}
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Phát thải trực tiếp — Scope 1
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] font-mono text-[11px] text-[#3F3F46] rounded-[4px]">
                  <span className="w-1.5 h-1.5 rounded-[1px] bg-[#B45309]" />
                  <span>DIRECT</span>
                </span>
              </div>
              <div className="mt-3 flex items-baseline">
                <span className="font-mono text-[26px] font-bold text-[#09090B] tracking-tight tabular-nums">
                  {formatTco2e(kpi.scope1)}
                </span>
                <span className="ml-1.5 font-mono text-[12px] text-[#3F3F46]">
                  tCO2e
                </span>
              </div>
              <div className="mt-2.5">
                {renderDeltaBadge(kpi.deltaScope1, kpi.prevPeriod)}
              </div>
              <div className="mt-3 w-full">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-[#71717A]">
                    Tỷ trọng Scope 1
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#B45309] tabular-nums">
                    {kpi.scope1Share.toFixed(2)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[2px] overflow-hidden">
                  <div
                    className="h-full bg-[#B45309]"
                    style={{ width: `${Math.min(100, kpi.scope1Share)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4E4E7] text-[11px] text-[#71717A] font-mono truncate tabular-nums">
              Xăng RON95 ({formatTco2e(kpi.gasoline)} t) • Dầu DO ({formatTco2e(kpi.diesel)} t)
            </div>
          </div>

          {/* Card 3: Scope 2 */}
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Phát thải gián tiếp — Scope 2
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] font-mono text-[11px] text-[#3F3F46] rounded-[4px]">
                  <span className="w-1.5 h-1.5 rounded-[1px] bg-[#0F766E]" />
                  <span>INDIRECT</span>
                </span>
              </div>
              <div className="mt-3 flex items-baseline">
                <span className="font-mono text-[26px] font-bold text-[#09090B] tracking-tight tabular-nums">
                  {formatTco2e(kpi.scope2)}
                </span>
                <span className="ml-1.5 font-mono text-[12px] text-[#3F3F46]">
                  tCO2e
                </span>
              </div>
              <div className="mt-2.5">
                {renderDeltaBadge(kpi.deltaScope2, kpi.prevPeriod)}
              </div>
              <div className="mt-3 w-full">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-[#71717A]">
                    Tỷ trọng Scope 2
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#0F766E] tabular-nums">
                    {kpi.scope2Share.toFixed(2)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[2px] overflow-hidden">
                  <div
                    className="h-full bg-[#0F766E]"
                    style={{ width: `${Math.min(100, kpi.scope2Share)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4E4E7] text-[11px] text-[#71717A] font-mono truncate tabular-nums">
              Tổng điện: {formatActivity(kpi.electricityKwh)} kWh • EVN Grid
            </div>
          </div>
        </section>

        {/* ROW 2: 40% Donut Chart / 60% Stacked Bar Chart */}
        <section className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
          {/* Left 40%: SVG Donut Breakdown */}
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7]">
                <h2 className="text-[12px] font-semibold text-[#09090B] uppercase tracking-wide">
                  Cơ cấu tỷ trọng phát thải theo phạm vi
                </h2>
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7] text-[#3F3F46] rounded-[4px]">
                  TỶ LỆ PHÂN BỔ
                </span>
              </div>

              <div className="py-4 flex flex-col items-center justify-center">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke="#F4F4F5"
                      strokeWidth="20"
                    />
                    {kpi.total > 0 && (
                      <>
                        <circle
                          cx="80"
                          cy="80"
                          r="64"
                          fill="none"
                          stroke="#0F766E"
                          strokeWidth="20"
                          strokeDasharray={`${donutGeometry.s2Len} ${donutGeometry.circumference}`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="80"
                          cy="80"
                          r="64"
                          fill="none"
                          stroke="#B45309"
                          strokeWidth="20"
                          strokeDasharray={`${donutGeometry.s1Len} ${donutGeometry.circumference}`}
                          strokeDashoffset={donutGeometry.s1Offset}
                        />
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <span className="font-mono text-[18px] font-bold text-[#09090B] tracking-tight tabular-nums">
                      {kpi.total.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-[#71717A]">tCO2e</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 border border-[#E4E4E7] rounded-[4px] overflow-hidden">
              <table className="w-full text-left text-[12px] border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#3F3F46] text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-1.5 px-2">Phạm vi</th>
                    <th className="py-1.5 px-2">Nguồn phát sinh</th>
                    <th className="py-1.5 px-2 text-right">Phát thải (tCO2e)</th>
                    <th className="py-1.5 px-2 text-right">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7]">
                  <tr className="bg-[#FFFFFF]">
                    <td className="py-1.5 px-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-[1px] bg-[#0F766E] shrink-0" />
                      <span className="font-mono text-[11px] text-[#09090B]">
                        Scope 2
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-[#3F3F46]">Điện lưới EVN</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#09090B] tabular-nums">
                      {formatTco2e(kpi.scope2)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] font-semibold text-[#0F766E] tabular-nums">
                      {kpi.scope2Share.toFixed(2)}%
                    </td>
                  </tr>
                  <tr className="bg-[#FFFFFF]">
                    <td className="py-1.5 px-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-[1px] bg-[#B45309] shrink-0" />
                      <span className="font-mono text-[11px] text-[#09090B]">
                        Scope 1
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-[#3F3F46]">
                      Xăng RON95 &amp; Dầu DO
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#09090B] tabular-nums">
                      {formatTco2e(kpi.scope1)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] font-semibold text-[#B45309] tabular-nums">
                      {kpi.scope1Share.toFixed(2)}%
                    </td>
                  </tr>
                  <tr className="bg-[#F4F4F5] font-semibold">
                    <td
                      className="py-1.5 px-2 text-[#09090B] uppercase text-[11px]"
                      colSpan={2}
                    >
                      Tổng cộng
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#09090B] tabular-nums">
                      {formatTco2e(kpi.total)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#09090B] tabular-nums">
                      {kpi.total > 0 ? '100.00%' : '0.00%'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right 60%: Stacked Monthly Trend SVG Chart */}
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-4 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E4E4E7] gap-2">
                <h2 className="text-[12px] font-semibold text-[#09090B] uppercase tracking-wide">
                  Xu hướng phát thải theo tháng (
                  {monthlySeries.months[0]} —{' '}
                  {monthlySeries.months[monthlySeries.months.length - 1]})
                </h2>
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#3F3F46]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-[#B45309]" />
                    <span>Scope 1</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-[#0F766E]" />
                    <span>Scope 2</span>
                  </span>
                  <span className="flex items-center gap-1 text-[#09090B]">
                    <span className="w-3 h-0.5 bg-[#09090B] inline-block" />
                    <span>Tổng (Trend)</span>
                  </span>
                </div>
              </div>

              <div className="w-full pt-4 pb-2 overflow-x-auto">
                {(() => {
                  const chartWidth = 560;
                  const chartLeft = 48;
                  const chartRight = 540;
                  const baselineY = 185;
                  const topY = 18;
                  const plotHeight = baselineY - topY;
                  const stepX =
                    (chartRight - chartLeft) /
                    Math.max(monthlySeries.series.length, 1);
                  const barWidth = Math.min(
                    44,
                    Math.max(20, Math.floor(stepX * 0.55))
                  );

                  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
                    val: (monthlySeries.yMax * ratio).toFixed(1),
                    y: baselineY - plotHeight * ratio,
                  }));

                  const points = monthlySeries.series.map((m, idx) => {
                    const cx = chartLeft + stepX * idx + stepX / 2;
                    const s2H = (m.scope2 / monthlySeries.yMax) * plotHeight;
                    const s1H = (m.scope1 / monthlySeries.yMax) * plotHeight;
                    const totalY = baselineY - (s1H + s2H);
                    return { ...m, cx, s2H, s1H, totalY };
                  });

                  const polyPoints = points
                    .map((p) => `${p.cx},${p.totalY}`)
                    .join(' ');

                  return (
                    <svg
                      className="w-full min-w-[440px] h-[220px] font-mono text-[10px]"
                      viewBox={`0 0 ${chartWidth} 215`}
                    >
                      {ticks.map((t, i) => (
                        <g key={t.val}>
                          <line
                            x1={chartLeft}
                            x2={chartRight}
                            y1={t.y}
                            y2={t.y}
                            stroke="#E4E4E7"
                            strokeWidth="1"
                            strokeDasharray={i === 0 ? undefined : '3 3'}
                          />
                          <text
                            x={chartLeft - 8}
                            y={t.y + 3}
                            textAnchor="end"
                            fill="#71717A"
                          >
                            {t.val}
                          </text>
                        </g>
                      ))}

                      {points.map((p) => {
                        const x = p.cx - barWidth / 2;
                        const s2Y = baselineY - p.s2H;
                        const s1Y = s2Y - p.s1H;
                        const isHighlighted =
                          selectedPeriod === 'ALL' ||
                          p.period === selectedPeriod;
                        return (
                          <g
                            key={p.period}
                            opacity={isHighlighted ? 1 : 0.4}
                          >
                            <rect
                              x={x}
                              y={s2Y}
                              width={barWidth}
                              height={Math.max(0, p.s2H)}
                              fill="#0F766E"
                            />
                            <rect
                              x={x}
                              y={s1Y}
                              width={barWidth}
                              height={Math.max(0, p.s1H)}
                              fill="#B45309"
                            />
                            <text
                              x={p.cx}
                              y={p.totalY - 8}
                              textAnchor="middle"
                              fill="#09090B"
                              fontSize="10"
                              fontWeight={isHighlighted ? '700' : '400'}
                            >
                              {p.total.toFixed(2)}
                            </text>
                            <text
                              x={p.cx}
                              y={202}
                              textAnchor="middle"
                              fill={isHighlighted ? '#09090B' : '#71717A'}
                              fontWeight={isHighlighted ? '700' : '400'}
                            >
                              {p.shortLabel}
                            </text>
                          </g>
                        );
                      })}

                      <polyline
                        fill="none"
                        stroke="#09090B"
                        strokeWidth="1.75"
                        points={polyPoints}
                      />

                      {points.map((p) => (
                        <rect
                          key={`pt-${p.period}`}
                          x={p.cx - 2.5}
                          y={p.totalY - 2.5}
                          width="5"
                          height="5"
                          fill="#09090B"
                        />
                      ))}
                    </svg>
                  );
                })()}
              </div>
            </div>

            <div className="pt-2 border-t border-[#E4E4E7] flex flex-wrap items-center justify-between text-[11px] text-[#71717A] gap-2">
              <span>
                Kỳ cao điểm: {monthlySeries.peak.period} (
                <span className="font-mono font-semibold text-[#09090B] tabular-nums">
                  {formatTco2e(monthlySeries.peak.total)} tCO2e
                </span>
                )
              </span>
              <span className="font-mono text-[#3F3F46]">
                CHỈ SỐ TÍNH TRÊN BẢN GHI APPROVED
              </span>
            </div>
          </div>
        </section>

        {/* ROW 3: Departmental Breakdown Ledger */}
        <section className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-semibold text-[#09090B] uppercase tracking-wider">
                Bảng phân rã phát thải theo cơ sở / phòng ban
              </h2>
              <p className="text-[11px] text-[#71717A] mt-0.5">
                Phân bổ tiêu thụ năng lượng và phát thải tCO2e theo từng đơn vị trực thuộc
              </p>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-[4px]">
              DATA: 100% RECONCILED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#52525B] text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-24">Mã đơn vị</th>
                  <th className="py-2.5 px-3">Tên Cơ sở / Phòng ban</th>
                  <th className="py-2.5 px-3 text-right">Điện tiêu thụ (kWh)</th>
                  <th className="py-2.5 px-3 text-right">Nhiên liệu (Lít)</th>
                  <th className="py-2.5 px-3 text-right text-[#B45309]">
                    Scope 1 (tCO2e)
                  </th>
                  <th className="py-2.5 px-3 text-right text-[#0F766E]">
                    Scope 2 (tCO2e)
                  </th>
                  <th className="py-2.5 px-3 text-right text-[#09090B]">
                    Tổng phát thải (tCO2e)
                  </th>
                  <th className="py-2.5 px-3 text-right w-44">Tỷ trọng (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[12px]">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-6 text-center font-mono text-[12px] text-[#71717A]"
                    >
                      Đang tổng hợp dữ liệu từ Supabase...
                    </td>
                  </tr>
                ) : (
                  departmentBreakdown.list.map((row) => (
                    <tr
                      key={row.department_id}
                      className="hover:bg-[#FAFAFA] transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-[#09090B]">
                        {row.department_id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#09090B]">
                        {row.department_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#09090B] tabular-nums">
                        {formatActivity(row.kwh)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#09090B] tabular-nums">
                        {formatActivity(row.lit)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#09090B] tabular-nums">
                        {formatTco2e(row.scope1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#09090B] tabular-nums">
                        {formatTco2e(row.scope2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#09090B] tabular-nums">
                        {formatTco2e(row.total)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-[11px] font-semibold text-[#09090B] w-12 text-right tabular-nums">
                            {row.share.toFixed(2)}%
                          </span>
                          <div className="w-16 h-2 bg-[#F4F4F5] border border-[#E4E4E7] rounded-[2px] overflow-hidden">
                            <div
                              className="h-full bg-[#18181B]"
                              style={{ width: `${Math.min(100, row.share)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-[#F4F4F5] border-t-2 border-[#E4E4E7] font-mono text-[12px] font-bold text-[#09090B]">
                  <td className="py-2.5 px-3">TỔNG CỘNG</td>
                  <td className="py-2.5 px-3 font-sans font-semibold text-[#3F3F46]">
                    {departmentBreakdown.list.length} Cơ sở trực thuộc
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatActivity(departmentBreakdown.sumKwh)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatActivity(departmentBreakdown.sumLit)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#B45309] tabular-nums">
                    {formatTco2e(departmentBreakdown.sumScope1)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#0F766E] tabular-nums">
                    {formatTco2e(departmentBreakdown.sumScope2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#09090B] tabular-nums">
                    {formatTco2e(departmentBreakdown.sumTotal)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {departmentBreakdown.sumTotal > 0 ? '100.00%' : '0.00%'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

