-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('PASSWORD', 'GOOGLE');

-- CreateTable
CREATE TABLE "AuthenticationProvider" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationProvider_identityId_providerType_key" ON "AuthenticationProvider"("identityId", "providerType");

-- AddForeignKey
ALTER TABLE "AuthenticationProvider" ADD CONSTRAINT "AuthenticationProvider_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
