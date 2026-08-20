-- Create partial unique index for non-null product barcodes per business
CREATE UNIQUE INDEX "Product_businessId_barcode_key"
ON "Product"("businessId", "barcode")
WHERE "barcode" IS NOT NULL;

-- Enforce non-negative product prices
ALTER TABLE "Product"
ADD CONSTRAINT "Product_basePrice_non_negative"
CHECK ("basePrice" >= 0);

ALTER TABLE "Product"
ADD CONSTRAINT "Product_costPrice_non_negative"
CHECK ("costPrice" >= 0 OR "costPrice" IS NULL);