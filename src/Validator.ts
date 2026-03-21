import {
  VALID_TYPES,
  VALID_LEVELS,
  VALID_STATUSES,
  VALID_RELATIONSHIP_TYPES,
  REQUIRED_FIELDS,
  DEFAULT_DOMAINS,
} from "./constants";

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function validate(
  frontmatter: Record<string, unknown>,
  content = "",
  allowedDomains: string[] = DEFAULT_DOMAINS
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // E002: missing required fields
  for (const field of REQUIRED_FIELDS) {
    const val = frontmatter[field];
    if (val === undefined || val === null || val === "") {
      errors.push({ code: "E002", message: `Required field missing: '${field}'` });
    }
  }

  // E004: type mismatches
  if (frontmatter.title !== undefined && typeof frontmatter.title !== "string") {
    errors.push({ code: "E004", message: "Field 'title' must be a string" });
  }
  if (frontmatter.tags !== undefined && !Array.isArray(frontmatter.tags)) {
    errors.push({ code: "E004", message: "Field 'tags' must be an array, not a string" });
  }
  if (frontmatter.summary !== undefined && typeof frontmatter.summary !== "string") {
    errors.push({ code: "E004", message: "Field 'summary' must be a string" });
  }

  // E001: invalid enum values
  const validTypes: readonly string[] = VALID_TYPES;
  const validLevels: readonly string[] = VALID_LEVELS;
  const validStatuses: readonly string[] = VALID_STATUSES;
  const validRelTypes: readonly string[] = VALID_RELATIONSHIP_TYPES;

  if (frontmatter.type && !validTypes.includes(String(frontmatter.type))) {
    errors.push({
      code: "E001",
      message: `Invalid type: '${frontmatter.type}'. Must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }
  if (frontmatter.level && !validLevels.includes(String(frontmatter.level))) {
    errors.push({
      code: "E001",
      message: `Invalid level: '${frontmatter.level}'. Must be one of: ${VALID_LEVELS.join(", ")}`,
    });
  }
  if (frontmatter.status && !validStatuses.includes(String(frontmatter.status))) {
    errors.push({
      code: "E001",
      message: `Invalid status: '${frontmatter.status}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  // E003: date format not ISO 8601
  if (frontmatter.created && !ISO_DATE_RE.test(String(frontmatter.created))) {
    errors.push({
      code: "E003",
      message: `'created' is not a valid ISO 8601 date: ${frontmatter.created}`,
    });
  }
  if (frontmatter.updated && !ISO_DATE_RE.test(String(frontmatter.updated))) {
    errors.push({
      code: "E003",
      message: `'updated' is not a valid ISO 8601 date: ${frontmatter.updated}`,
    });
  }

  // E007: created > updated
  if (frontmatter.created && frontmatter.updated) {
    const created = new Date(String(frontmatter.created));
    const updated = new Date(String(frontmatter.updated));
    if (!isNaN(created.getTime()) && !isNaN(updated.getTime()) && created > updated) {
      errors.push({
        code: "E007",
        message: `'created' (${frontmatter.created}) is after 'updated' (${frontmatter.updated})`,
      });
    }
  }

  // E006: domain not in taxonomy
  if (frontmatter.domain && typeof frontmatter.domain === "string") {
    const domain = frontmatter.domain as string;
    const isKnown = allowedDomains.some(
      (d) => domain === d || domain.startsWith(d + "/")
    );
    if (!isKnown) {
      errors.push({
        code: "E006",
        message: `Domain '${domain}' not in taxonomy. Known domains: ${allowedDomains.slice(0, 6).join(", ")}...`,
      });
    }
  }

  // E008: invalid relationship types in [[Note|type]] syntax
  for (const match of content.matchAll(/\[\[[^\]|]+\|([^\]]+)\]\]/g)) {
    const relType = match[1].trim();
    if (!validRelTypes.includes(relType)) {
      errors.push({
        code: "E008",
        message: `Invalid relationship type: '${relType}'. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`,
      });
    }
  }

  // E005: general schema violation — unexpected non-string scalar where object expected
  for (const [key, val] of Object.entries(frontmatter)) {
    if (
      key !== "tags" &&
      val !== null &&
      val !== undefined &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      !["title", "type", "domain", "level", "status", "created", "updated", "summary"].includes(key)
    ) {
      warnings.push(`E005: Unexpected nested object in field '${key}'`);
    }
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
  };
}
