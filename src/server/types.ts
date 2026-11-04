/**
 * Server-side types for Proofloop V2
 * Based on CONTRACT.md specification
 */

import type { ProductEvidence } from "../engine/evidence";

export type AnalysisStatus =
  | "pending"
  | "understanding"
  | "inspecting"
  | "generating_sql"
  | "validating"
  | "executing"
  | "explaining"
  | "completed"
  | "failed";

export interface ValidationState {
  status: "passed" | "failed";
  errors: string[];
}

export interface ExecutionState {
  status: "completed" | "failed";
  rowCount: number;
  error?: string | null;
  truncated?: boolean;
  columns?: string[];
}

export type FindingImpact = "negative" | "positive" | "neutral";

export interface CausalDriverComparison {
  previous: number;
  current: number;
  delta: number;
  verified: boolean;
  detail?: string;
}

export interface CausalAnalysis {
  verifiedDrivers: string[];
  hypotheses: string[];
  unitCostComparison: CausalDriverComparison;
  discountComparison: CausalDriverComparison;
  supportingTransactions: string[];
}

export interface Finding {
  id: string;
  title: string;
  productId?: string;
  productName?: string;
  description: string;
  metric: string;
  previousValue?: number;
  currentValue?: number;
  change?: number;
  unit?: "percentage points" | "pp" | string;
  impact: FindingImpact;
  evidenceRef?: string[];
  verified: boolean;
  suggestedAction?: string;
  causalAnalysis?: CausalAnalysis;
}

export interface ExplanationState {
  summary: string;
  findings: Finding[];
}

export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type ApprovalAction = "approve" | "reject" | "request_changes";

export interface ApprovalState {
  status: ApprovalStatus;
  action?: ApprovalAction | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  notes?: string | null;
  recommendations?: string[];
}

export interface PendingApprovalItem {
  analysisId: string;
  question: string;
  generatedAt: string;
  approvalStatus: "pending";
  recommendations: string[];
  findingsCount: number;
  declinedProducts: string[];
}

export interface QuarterPeriodDetail {
  label: string;
  quarterType: "complete" | "partial_quarter";
  isPartial: boolean;
  calendarQuarter: {
    start: string;
    endExclusive: string;
  };
  actualDataCoverage: {
    start: string;
    end: string;
  };
  latestDataDate: string;
  coverageNote: string;
}

export interface AnalysisMetadata {
  dataSource: "seeded_demo_data";
  isDemoData: true;
  generatedAt: string;
  latestDataDate: string;
  isPartialQuarter: boolean;
  dataCoverage: {
    q3Comparison: "complete Q3";
    q4Coverage: string;
    latestSeededDate: string;
  };
  quarterComparison: {
    previousQuarter: string;
    currentQuarter: string;
    previousDateRange: { start: string; endExclusive: string };
    currentDateRange: { start: string; endExclusive: string };
    comparisonPeriod: QuarterPeriodDetail;
    currentPeriod: QuarterPeriodDetail;
    calendarQuarter: { start: string; endExclusive: string };
    actualDataCoverage: { start: string; end: string };
    coverageDistinction: string;
  };
  aiProvider: {
    name: string;
    model: string;
    type: "ai_model" | "deterministic_engine";
    verified: boolean;
    status: "connected" | "disconnected" | "unconfigured";
  };
}

/**
 * Response contract matching CONTRACT.md Section 6
 */
export interface AnalysisResponse {
  analysisId: string;
  status: AnalysisStatus;
  question: string;
  sql: string;
  validation: ValidationState;
  execution: ExecutionState;
  results: Record<string, unknown>[];
  evidence: ProductEvidence[] | Record<string, unknown>[];
  explanation: ExplanationState;
  approval: ApprovalState;
  metadata?: AnalysisMetadata;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  analysisId: string;
  action: ApprovalAction;
  previousStatus: ApprovalStatus;
  newStatus: ApprovalStatus;
  reviewedBy: string;
  notes?: string;
}

export interface AIProviderStatus {
  name: string;
  targetModel: string;
  connected: boolean;
  status: "connected" | "disconnected" | "unconfigured";
  lastVerifiedAt?: string;
  errorMessage?: string;
}
