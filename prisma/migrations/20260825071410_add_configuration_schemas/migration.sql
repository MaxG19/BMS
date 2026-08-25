-- CreateTable
CREATE TABLE "TaxConfiguration" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "taxName" TEXT NOT NULL,

    CONSTRAINT "TaxConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptConfiguration" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "headerText" TEXT,
    "footerText" TEXT,
    "logoUrl" TEXT,
    "showTaxBreakdown" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReceiptConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxConfiguration_businessId_key" ON "TaxConfiguration"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptConfiguration_businessId_key" ON "ReceiptConfiguration"("businessId");

-- AddForeignKey
ALTER TABLE "TaxConfiguration" ADD CONSTRAINT "TaxConfiguration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptConfiguration" ADD CONSTRAINT "ReceiptConfiguration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
