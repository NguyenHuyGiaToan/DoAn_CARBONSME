export type UserRole = 'STAFF' | 'MANAGER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type ScopeType = 'SCOPE_1' | 'SCOPE_2';
export type SourceType = 'ELECTRICITY' | 'GASOLINE_RON95' | 'DIESEL_DO';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Department {
  department_id: string;
  department_name: string;
  facility_location: string;
  created_at: string;
}

export interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string;
  status: UserStatus;
  created_at: string;
}

export interface EmissionFactor {
  factor_id: number;
  source_type: SourceType;
  scope_category: ScopeType;
  factor_value: number;
  unit: string;
  apply_year: number;
  reference_document: string;
  updated_at: string;
}

export interface ActivityRecord {
  record_id: string;
  department_id: string;
  user_id: string;
  scope_type: ScopeType;
  source_type: SourceType;
  reporting_period: string;
  consumption_value: number;
  unit: 'kWh' | 'LIT';
  invoice_number: string;
  evidence_url: string;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface CalculationResult {
  result_id: string;
  record_id: string;
  factor_id: number;
  emission_tco2e: number;
  calculated_at: string;
}

export interface GroundedSummaryBreakdown {
  scope_1_tco2e: number;
  scope_1_percent: number;
  scope_2_tco2e: number;
  scope_2_percent: number;
}

export interface DepartmentHotspot {
  department_id: string;
  department_name: string;
  emission_tco2e: number;
  share_percent: number;
}

export interface GroundedSummary {
  reporting_period: string;
  previous_period?: string | null;
  total_emission_tco2e: number;
  period_over_period_change_percent?: number | null;
  scope_1_tco2e?: number;
  scope_2_tco2e?: number;
  breakdown?: GroundedSummaryBreakdown;
  department_hotspot?: DepartmentHotspot | null;
}

export interface SuggestedAction {
  code: string;
  title: string;
  priority: ActionPriority;
  description: string;
}

export interface AiRecommendation {
  recommendation_id: string;
  reporting_period: string;
  grounded_summary: GroundedSummary;
  executive_summary: string;
  suggested_actions: SuggestedAction[];
  model_version: string;
  created_by: string;
  created_at: string;
}

