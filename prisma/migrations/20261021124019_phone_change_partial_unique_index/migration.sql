-- Partial unique index: only one PENDING phone-change request per user at a time.
-- Prisma schema cannot express partial unique indexes, so this is raw SQL.
CREATE UNIQUE INDEX "PhoneChangeRequest_one_pending_per_user"
  ON "PhoneChangeRequest" ("userId")
  WHERE "status" = 'PENDING';