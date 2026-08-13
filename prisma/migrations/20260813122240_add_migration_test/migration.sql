-- CreateTable
CREATE TABLE "MigrationTest" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationTest_pkey" PRIMARY KEY ("id")
);
