import { describe, expect, it } from "vitest";
import {
  validateAnalysisRequest,
  validateApprovalRequest
} from "./validation";

describe("Request Validation", () => {
  describe("validateAnalysisRequest", () => {
    it("accepts a valid question", () => {
      const result = validateAnalysisRequest({
        question: "Which products are affecting our profit margin?"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.question).toBe(
          "Which products are affecting our profit margin?"
        );
      }
    });

    it("rejects an empty question", () => {
      const result = validateAnalysisRequest({ question: "   " });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid analysis request parameters.");
        expect(result.details.length).toBeGreaterThan(0);
      }
    });

    it("rejects non-string question", () => {
      const result = validateAnalysisRequest({ question: 12345 });
      expect(result.success).toBe(false);
    });

    it("rejects missing question field", () => {
      const result = validateAnalysisRequest({});
      expect(result.success).toBe(false);
    });

    it("rejects excessively long question", () => {
      const longQuestion = "a".repeat(1001);
      const result = validateAnalysisRequest({ question: longQuestion });
      expect(result.success).toBe(false);
    });

    it("validates optional dateRange if provided", () => {
      const valid = validateAnalysisRequest({
        question: "Why did margins drop?",
        dateRange: {
          previousStart: "2026-07-01",
          previousEnd: "2026-10-01",
          currentStart: "2026-10-01",
          currentEnd: "2026-12-01"
        }
      });
      expect(valid.success).toBe(true);

      const invalid = validateAnalysisRequest({
        question: "Why did margins drop?",
        dateRange: {
          previousStart: "not-a-date"
        }
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("validateApprovalRequest", () => {
    it("accepts valid approval actions", () => {
      for (const action of ["approve", "reject", "request_changes"]) {
        const result = validateApprovalRequest({
          analysisId: "analysis-123",
          action
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.action).toBe(action);
        }
      }
    });

    it("normalizes human-readable actions", () => {
      const result = validateApprovalRequest({
        analysisId: "analysis-123",
        action: "Request changes",
        reviewedBy: "sarah_cfo",
        notes: "Please recheck shipping discounts."
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe("request_changes");
        expect(result.data.reviewedBy).toBe("sarah_cfo");
        expect(result.data.notes).toBe("Please recheck shipping discounts.");
      }
    });

    it("rejects unknown action", () => {
      const result = validateApprovalRequest({
        analysisId: "analysis-123",
        action: "delete_database"
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing analysisId", () => {
      const result = validateApprovalRequest({
        action: "approve"
      });
      expect(result.success).toBe(false);
    });
  });
});
