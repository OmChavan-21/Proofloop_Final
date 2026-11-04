/**
 * Request validation schemas using Zod
 */

import { z } from "zod";
import type { ApprovalAction } from "./types";

export const AnalysisRequestSchema = z.object({
  question: z
    .string("A business question is required.")
    .trim()
    .min(3, { message: "The question must be at least 3 characters long." })
    .max(1000, { message: "The question must not exceed 1000 characters." }),
  dateRange: z
    .object({
      previousStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional(),
      previousEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional(),
      currentStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional(),
      currentEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional()
    })
    .optional()
});

export type AnalysisRequestInput = z.infer<typeof AnalysisRequestSchema>;

export const ApprovalRequestSchema = z.object({
  analysisId: z
    .string("Analysis ID is required.")
    .trim()
    .min(1, { message: "Analysis ID cannot be empty." }),
  action: z
    .string("Approval action is required.")
    .transform((val) => {
      const lower = val.toLowerCase().replace(/[\s-]+/g, "_");
      return lower;
    })
    .refine(
      (val): val is ApprovalAction =>
        ["approve", "reject", "request_changes"].includes(val),
      {
        message:
          "Action must be one of: 'approve', 'reject', or 'request_changes'."
      }
    ),
  // Legacy clients may still send reviewedBy; Zod strips it because reviewer
  // identity must eventually come from a trusted server session.
  notes: z
    .string()
    .trim()
    .max(2000, { message: "Notes cannot exceed 2000 characters." })
    .optional()
});

export type ApprovalRequestInput = z.infer<typeof ApprovalRequestSchema>;

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationErrorResponse {
  success: false;
  error: string;
  details: string[];
}

export type ValidationOutcome<T> = ValidationSuccess<T> | ValidationErrorResponse;

export function validateAnalysisRequest(
  payload: unknown
): ValidationOutcome<AnalysisRequestInput> {
  const result = AnalysisRequestSchema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message);
    return {
      success: false,
      error: "Invalid analysis request parameters.",
      details
    };
  }
  return { success: true, data: result.data };
}

export function validateApprovalRequest(
  payload: unknown
): ValidationOutcome<ApprovalRequestInput> {
  const result = ApprovalRequestSchema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message);
    return {
      success: false,
      error: "Invalid approval request parameters.",
      details
    };
  }
  return { success: true, data: result.data };
}
