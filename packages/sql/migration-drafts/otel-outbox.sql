-- Prepared additive change. Do not run against a shared database from an agent.
-- Apply through the repository migration workflow before OTEL_OUTBOX_CONTEXT_ENABLED=true.
ALTER TABLE "public"."OutboxEvent" ADD COLUMN IF NOT EXISTS "telemetryContext" jsonb NULL;
