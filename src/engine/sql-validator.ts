
import { Parser } from "node-sql-parser";

const parser = new Parser();

const ALLOWED_TABLES = new Set([
  "products",
  "sales",
  "sale_items"
]);

const TABLE_COLUMNS: Record<string, Set<string>> = {
  products: new Set(["id", "name", "category"]),
  sales: new Set(["id", "order_date", "status"]),
  sale_items: new Set([
    "id",
    "sale_id",
    "product_id",
    "quantity",
    "unit_price",
    "unit_cost",
    "discount"
  ])
};

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|GRANT|REVOKE)\b/i;

export interface SqlValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateSelect(
  node: Record<string, unknown>,
  errors: string[],
  depth = 0
): void {
  if (depth > 10) {
    errors.push("Query nesting exceeds the allowed depth.");
    return;
  }

  if (node.type !== "select") {
    errors.push("Only SELECT statements are allowed.");
    return;
  }

  if (node.for_update) {
    errors.push("Locking queries are not allowed.");
  }

  const cteNames = new Set<string>();

  if (Array.isArray(node.with)) {
    for (const cte of node.with) {
      if (!isRecord(cte) || !isRecord(cte.name)) {
        errors.push("Invalid CTE definition.");
        continue;
      }

      const name = String(cte.name.value ?? "").toLowerCase();

      if (!name || cteNames.has(name)) {
        errors.push("Invalid or duplicate CTE name.");
        continue;
      }

      cteNames.add(name);

      if (!isRecord(cte.stmt) || !isRecord(cte.stmt.ast)) {
        errors.push("CTE must contain a valid parsed query.");
        continue;
      }

      validateSelect(cte.stmt.ast, errors, depth + 1);
    }
  }

  const aliases = new Map<string, string>();
  const sources = node.from;

  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push("Queries must read from approved tables.");
    return;
  }

  for (const source of sources) {
    if (!isRecord(source)) {
      errors.push("Invalid table reference.");
      continue;
    }

    const table = String(source.table ?? "").toLowerCase();
    const alias = String(source.as ?? table).toLowerCase();

    if (!ALLOWED_TABLES.has(table) && !cteNames.has(table)) {
      errors.push(`Table is not allowed: ${table}`);
      continue;
    }

    aliases.set(alias, table);
  }

  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) inspect(item);
      return;
    }

    if (!isRecord(value)) return;

    // Inspect nested parser metadata containing subquery ASTs.
    if (isRecord(value.ast)) {
      validateSelect(value.ast, errors, depth + 1);
    }

    if (value.type === "column_ref") {
      const column = value.column;
      const tableAlias = value.table;

      if (typeof column !== "string") {
        errors.push("Invalid column reference.");
        return;
      }

      if (column === "*") return;

      if (typeof tableAlias === "string" && tableAlias) {
        const resolvedTable = aliases.get(tableAlias.toLowerCase());

        if (!resolvedTable) {
          errors.push(`Unknown table alias: ${tableAlias}`);
          return;
        }

        if (cteNames.has(resolvedTable)) return;

        if (!TABLE_COLUMNS[resolvedTable]?.has(column)) {
          errors.push(
            `Column ${column} is not allowed on ${resolvedTable}.`
          );
        }

        return;
      }

      // Unqualified columns must exist in at least one approved source.
      const sourceTables = [...aliases.values()].filter(
        (table) => !cteNames.has(table)
      );

      const exists = sourceTables.some(
        (table) => TABLE_COLUMNS[table]?.has(column)
      );

      if (!exists) {
        errors.push(`Unknown or disallowed column: ${column}`);
      }
    }

    if (value.type === "function") {
      const name = isRecord(value.name)
        ? String(value.name.name ?? "")
        : String(value.name ?? "");

      if (
        ["load_extension", "readfile", "writefile"].includes(
          name.toLowerCase()
        )
      ) {
        errors.push(`SQL function is not allowed: ${name}`);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key !== "ast") inspect(child);
    }
  };

  inspect(node.columns);
  inspect(node.where);
  inspect(node.groupby);
  inspect(node.having);
  inspect(node.orderby);

  // Inspect JOIN conditions as well.
  for (const source of sources) {
    if (isRecord(source)) inspect(source.on);
  }
}

export function validateSql(sql: string): SqlValidationResult {
  const errors: string[] = [];

  if (!sql.trim()) {
    return { valid: false, errors: ["SQL query is empty."] };
  }

  if (sql.length > 10000) {
    return { valid: false, errors: ["SQL query is too long."] };
  }

  if (sql.includes("--") || sql.includes("/*") || sql.includes("*/")) {
    return {
      valid: false,
      errors: ["SQL comments are not allowed."]
    };
  }

  if (sql.replace(/;+$/, "").includes(";")) {
    return {
      valid: false,
      errors: ["Multiple SQL statements are not allowed."]
    };
  }

  if (FORBIDDEN_KEYWORDS.test(sql)) {
    return {
      valid: false,
      errors: ["A prohibited SQL operation was detected."]
    };
  }

  let ast: unknown;

  try {
    ast = parser.astify(sql, { database: "SQLite" });
  } catch {
    return {
      valid: false,
      errors: ["SQL syntax could not be parsed."]
    };
  }

  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      return {
        valid: false,
        errors: ["Exactly one SQL statement is allowed."]
      };
    }

    ast = ast[0];
  }

  if (!isRecord(ast)) {
    return {
      valid: false,
      errors: ["Invalid SQL statement."]
    };
  }

  validateSelect(ast, errors);

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)]
  };
}
