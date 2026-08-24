-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phone_key"
ON "Customer"("businessId", "phone")
WHERE "phone" IS NOT NULL;
