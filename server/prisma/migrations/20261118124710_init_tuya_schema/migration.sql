-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "productName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "testerName" TEXT,
    "stdPasscode" TEXT,
    "defaultCycles" INTEGER NOT NULL DEFAULT 100,
    "defaultUnlockTime" INTEGER NOT NULL DEFAULT 5,
    "defaultInterval" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CyclicTest" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "totalCycles" INTEGER NOT NULL,
    "completedCycles" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delayBetweenCycles" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL,
    "totalFailures" INTEGER NOT NULL DEFAULT 0,
    "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 3,
    "lowBatteryThreshold" INTEGER NOT NULL DEFAULT 20,
    "battery" INTEGER,
    "batteryStart" INTEGER,
    "batteryEnd" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CyclicTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CyclicTestLog" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CyclicTestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityAudit" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "testerName" TEXT,
    "params" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QualityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityAuditStep" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityAuditStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT NOT NULL,
    "cyclicTestId" TEXT,
    "qualityAuditId" TEXT,
    "deviceName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "testerName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "CyclicTest_userId_idx" ON "CyclicTest"("userId");

-- CreateIndex
CREATE INDEX "CyclicTest_deviceId_idx" ON "CyclicTest"("deviceId");

-- CreateIndex
CREATE INDEX "CyclicTest_status_idx" ON "CyclicTest"("status");

-- CreateIndex
CREATE INDEX "CyclicTestLog_testId_idx" ON "CyclicTestLog"("testId");

-- CreateIndex
CREATE INDEX "QualityAudit_userId_idx" ON "QualityAudit"("userId");

-- CreateIndex
CREATE INDEX "QualityAudit_deviceId_idx" ON "QualityAudit"("deviceId");

-- CreateIndex
CREATE INDEX "QualityAuditStep_auditId_idx" ON "QualityAuditStep"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_cyclicTestId_key" ON "Report"("cyclicTestId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_qualityAuditId_key" ON "Report"("qualityAuditId");

-- CreateIndex
CREATE INDEX "Report_userId_createdAt_idx" ON "Report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_deviceId_idx" ON "Report"("deviceId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CyclicTest" ADD CONSTRAINT "CyclicTest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CyclicTest" ADD CONSTRAINT "CyclicTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CyclicTestLog" ADD CONSTRAINT "CyclicTestLog_testId_fkey" FOREIGN KEY ("testId") REFERENCES "CyclicTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAudit" ADD CONSTRAINT "QualityAudit_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAudit" ADD CONSTRAINT "QualityAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAuditStep" ADD CONSTRAINT "QualityAuditStep_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "QualityAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_cyclicTestId_fkey" FOREIGN KEY ("cyclicTestId") REFERENCES "CyclicTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_qualityAuditId_fkey" FOREIGN KEY ("qualityAuditId") REFERENCES "QualityAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
