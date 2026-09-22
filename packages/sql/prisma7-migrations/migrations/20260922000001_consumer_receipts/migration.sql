CREATE TABLE "public"."ConsumerReceipt" (
    "consumer" VARCHAR(120) NOT NULL,
    "eventId" VARCHAR(36) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumerReceipt_pkey" PRIMARY KEY ("consumer", "eventId")
);

CREATE INDEX "ConsumerReceipt_cleanup_idx" ON "public"."ConsumerReceipt" ("completedAt", "createdAt");
