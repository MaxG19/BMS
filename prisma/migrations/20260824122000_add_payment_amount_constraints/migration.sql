ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amount_positive"
CHECK ("amount" > 0);

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_amount_positive"
CHECK ("amount" > 0);