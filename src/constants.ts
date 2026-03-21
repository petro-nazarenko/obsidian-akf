export const VALID_TYPES = [
  "concept",
  "guide",
  "reference",
  "checklist",
  "project",
  "roadmap",
  "template",
  "audit",
] as const;

export const VALID_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export const VALID_STATUSES = ["draft", "review", "published", "archived"] as const;

export const VALID_RELATIONSHIP_TYPES = [
  "related",
  "prerequisite",
  "extends",
  "implements",
  "references",
  "part-of",
  "contains",
  "depends-on",
] as const;

export const REQUIRED_FIELDS = ["title", "type", "domain", "created", "updated"] as const;

export const DEFAULT_DOMAINS = [
  "ai-system",
  "api-design",
  "architecture",
  "automation",
  "backend",
  "cloud",
  "data",
  "database",
  "devops",
  "frontend",
  "infrastructure",
  "ml-ops",
  "mobile",
  "monitoring",
  "networking",
  "security",
  "testing",
  "ui-ux",
  "web",
];

export const MODAL_CLOSE_DELAY_MS = 1500;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_RETRIES = 3;
