-- CreateIndex
CREATE INDEX "AuditLog_identityId_idx" ON "AuditLog"("identityId");

-- CreateIndex
CREATE INDEX "AuthenticationProvider_identityId_idx" ON "AuthenticationProvider"("identityId");

-- CreateIndex
CREATE INDEX "Branch_businessId_idx" ON "Branch"("businessId");

-- CreateIndex
CREATE INDEX "Business_organizationId_idx" ON "Business"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_businessId_idx" ON "Invitation"("businessId");

-- CreateIndex
CREATE INDEX "Invitation_roleId_idx" ON "Invitation"("roleId");

-- CreateIndex
CREATE INDEX "Membership_businessId_idx" ON "Membership"("businessId");

-- CreateIndex
CREATE INDEX "Membership_roleId_idx" ON "Membership"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Session_identityId_idx" ON "Session"("identityId");

-- CreateIndex
CREATE INDEX "Session_refreshTokenHash_idx" ON "Session"("refreshTokenHash");
