/*
  Warnings:

  - You are about to drop the column `token` on the `Invitation` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tokenHash]` on the table `Invitation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tokenHash` to the `Invitation` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Invitation_token_key";

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "token",
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
