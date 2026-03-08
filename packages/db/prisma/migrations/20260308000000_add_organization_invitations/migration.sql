-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'member',
    "token" VARCHAR(128) NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "accepted_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_key" ON "organization_invitations"("token");

-- CreateIndex
CREATE INDEX "organization_invitations_org_id_idx" ON "organization_invitations"("org_id");

-- CreateIndex
CREATE INDEX "organization_invitations_email_idx" ON "organization_invitations"("email");

-- CreateIndex
CREATE INDEX "organization_invitations_token_idx" ON "organization_invitations"("token");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
