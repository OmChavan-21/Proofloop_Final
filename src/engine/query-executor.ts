
import type { Database } from "sql.js";
import { validateSql } from "./sql-validator";

const MAX_ROWS = 100;

export interface QueryExecutionResult {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  error: string | null;
}

export function executeReadOnlyQuery(
  db: Database,
  sql: string,
  parameters: Array<string | number | null> = []
): QueryExecutionResult {
  const validation = validateSql(sql);

  if (!validation.valid) {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: validation.errors.join(" ")
    };
  }

  try {
    const statement = db.prepare(sql);
    try {
      if (parameters.length > 0) statement.bind(parameters);
      const columns = statement.getColumnNames();
      const rows: Record<string, unknown>[] = [];
      let truncated = false;

      // Read at most MAX_ROWS rows, then step once more only to learn whether
      // the result was truncated. This avoids materializing an unbounded result.
      while (rows.length < MAX_ROWS && statement.step()) {
        rows.push(statement.getAsObject());
      }
      if (rows.length === MAX_ROWS) truncated = statement.step();

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        truncated,
        error: null
      };
    } finally {
      statement.free();
    }
  } catch {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: "Query execution failed. Check the SQL and try again."
    };
  }
}
