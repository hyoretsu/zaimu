CREATE TABLE "public"."OutboxEvent" (
    "id" VARCHAR(36) NOT NULL,
    "eventType" VARCHAR(120) NOT NULL,
    "aggregateType" VARCHAR(80) NOT NULL,
    "aggregateId" VARCHAR(36) NOT NULL,
    "userIds" VARCHAR(36)[] NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" VARCHAR(36) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboxEvent_pending_idx" ON "public"."OutboxEvent" ("publishedAt", "lockedUntil", "occurredAt", "id");
CREATE INDEX "OutboxEvent_aggregate_idx" ON "public"."OutboxEvent" ("aggregateType", "aggregateId", "occurredAt");
