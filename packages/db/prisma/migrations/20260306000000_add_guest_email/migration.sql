-- AlterTable
ALTER TABLE "threads" ADD COLUMN "guest_email" VARCHAR(255);

-- AlterTable
ALTER TABLE "comments" ADD COLUMN "guest_email" VARCHAR(255);
