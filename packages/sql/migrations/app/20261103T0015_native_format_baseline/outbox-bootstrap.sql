-- Reference-rate backfill commands that the historical graph leaves queued on a fresh database.
INSERT INTO "OutboxEvent" ("id","aggregateType","aggregateId","eventType","correlationId","occurredAt","payload","userIds")
SELECT id, 'referenceRate', rate, 'command.reference-rate-fetch', id,
  now(),
  json_build_object('deduplicationKey', 'bootstrap:v2:' || rate || ':2020-01-01:2026-09-17', 'referenceType', rate, 'startDate', '2020-01-01', 'endDate', '2026-09-17'),
  '{}'
FROM (SELECT gen_random_uuid()::text AS id, rate FROM (VALUES ('CDI'),('SELIC')) AS r(rate)) AS bootstrap;
