-- AlterTable
ALTER TABLE "grocery_stores"
ADD COLUMN "supports_online_ordering" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "online_ordering_provider" VARCHAR(50),
ADD COLUMN "online_ordering_config" JSONB;
