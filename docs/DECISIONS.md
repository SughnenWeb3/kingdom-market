# Decisions log

One line per assumption or decision made during implementation: `YYYY-MM-DD: decision (reason)`.

2026-10-21: Used ports 5435/5436 for Docker DBs instead of PRD's 5433/5434 (host ports already in use by other containers).
2026-10-21: Used process.env.DATABASE_URL with fallback to '' in prisma.config.ts instead of env() helper (so prisma generate works without DATABASE_URL in CI).
2026-10-21: Prisma junction table is named "ProviderCategory" (camelCase, not "_ProviderCategory") — Prisma 7 uses the @@id name as the table name.
2026-10-21: Seed uses 20 predefined categories relevant to Nigerian marketplace, slugs stable.
