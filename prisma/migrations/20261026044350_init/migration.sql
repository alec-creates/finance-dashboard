-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH', 'OTHER_ASSET', 'LOAN', 'OTHER_LIABILITY');

-- CreateEnum
CREATE TYPE "InvestmentAccountType" AS ENUM ('TAXABLE_BROKERAGE', 'TRADITIONAL_IRA', 'ROTH_IRA', 'CRYPTO_EXCHANGE', 'OTHER_INVESTMENT');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('MANUAL', 'CSV', 'PLAID', 'KRAKEN', 'WEBULL');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SnapshotSource" AS ENUM ('PROVIDER', 'STATEMENT', 'MANUAL', 'COMPUTED');

-- CreateEnum
CREATE TYPE "TxnKind" AS ENUM ('INCOME', 'EXPENSE', 'REFUND', 'TRANSFER', 'CREDIT_CARD_PAYMENT', 'INVESTMENT_CONTRIBUTION', 'INVESTMENT_WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('PENDING', 'POSTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NEEDS_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('RULE', 'MERCHANT_MEMORY', 'PROVIDER', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "RuleField" AS ENUM ('DESCRIPTION', 'MERCHANT');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('CONTAINS', 'EQUALS', 'STARTS_WITH', 'REGEX');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('CSV', 'PROVIDER_SYNC');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'REVERTED');

-- CreateEnum
CREATE TYPE "AmountConvention" AS ENUM ('NEGATIVE_IS_OUTFLOW', 'POSITIVE_IS_OUTFLOW', 'SEPARATE_DEBIT_CREDIT_COLUMNS');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'ETF', 'MUTUAL_FUND', 'CRYPTO', 'CASH', 'OPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "InvTxnType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'STAKING_REWARD', 'SPLIT', 'CORPORATE_ACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ValuationSource" AS ENUM ('PROVIDER', 'PRICE_HISTORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('HOURLY', 'SALARY', 'COMMISSION', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "ContributionRuleType" AS ENUM ('FIXED_AMOUNT', 'PERCENT_OF_INCOME', 'PERCENT_OF_PAYCHECK');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalEntryType" AS ENUM ('ALLOCATE', 'RELEASE', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "ForecastBaseline" AS ENUM ('HISTORICAL', 'BUDGET');

-- CreateEnum
CREATE TYPE "SafeToSpendHorizon" AS ENUM ('NEXT_PAYDAY', 'END_OF_MONTH', 'DAYS');

-- CreateEnum
CREATE TYPE "LayoutBreakpoint" AS ENUM ('MOBILE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "CostBasisMethod" AS ENUM ('FIFO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "costBasisMethod" "CostBasisMethod" NOT NULL DEFAULT 'FIFO',
    "forecastLookbackMonths" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SafeToSpendSettings" (
    "userId" TEXT NOT NULL,
    "applyCushion" BOOLEAN NOT NULL DEFAULT true,
    "horizon" "SafeToSpendHorizon" NOT NULL DEFAULT 'NEXT_PAYDAY',
    "horizonDays" INTEGER,
    "includeGoalContributions" BOOLEAN NOT NULL DEFAULT true,
    "includePlannedInvestments" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SafeToSpendSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "institutionName" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedCredentials" BYTEA,
    "credentialKeyVersion" INTEGER,
    "syncCursor" TEXT,
    "lastSyncAttemptAt" TIMESTAMPTZ(3),
    "lastSyncSuccessAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "name" TEXT NOT NULL,
    "institutionName" TEXT,
    "mask" TEXT,
    "externalId" TEXT,
    "type" "AccountType" NOT NULL,
    "investmentType" "InvestmentAccountType",
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "includeInSafeToSpend" BOOLEAN NOT NULL DEFAULT false,
    "minimumBalanceCents" INTEGER,
    "historyCompleteFrom" DATE,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "availableCents" INTEGER,
    "source" "SnapshotSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "authorizedDate" DATE,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "merchantId" TEXT,
    "kind" "TxnKind" NOT NULL,
    "status" "TxnStatus" NOT NULL DEFAULT 'POSTED',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "categorySource" "CategorySource" NOT NULL DEFAULT 'NONE',
    "appliedRuleId" TEXT,
    "incomeSourceId" TEXT,
    "recurringSeriesId" TEXT,
    "contributionPlanId" TEXT,
    "excludeFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "transferPairId" TEXT,
    "externalId" TEXT,
    "pendingExternalId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "importBatchId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "CategoryType" NOT NULL,
    "isEssential" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "defaultCategoryId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "field" "RuleField" NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "accountId" TEXT,
    "minAmountCents" INTEGER,
    "maxAmountCents" INTEGER,
    "setCategoryId" TEXT,
    "setKind" "TxnKind",
    "setMerchantId" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "adapterId" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSha256" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvImportProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "columnMap" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "amountConvention" "AmountConvention" NOT NULL,
    "hasHeader" BOOLEAN NOT NULL DEFAULT true,
    "delimiter" TEXT NOT NULL DEFAULT ',',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CsvImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
    "externalIds" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPrice" (
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "close" DECIMAL(24,10) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPrice_pkey" PRIMARY KEY ("assetId","date","source")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("base","quote","date","source")
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT,
    "tradeDate" DATE NOT NULL,
    "settleDate" DATE,
    "type" "InvTxnType" NOT NULL,
    "quantity" DECIMAL(38,18),
    "unitPrice" DECIMAL(24,10),
    "cashAmountCents" INTEGER NOT NULL DEFAULT 0,
    "usdValueCents" INTEGER,
    "usdValueSource" "ValuationSource",
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "feeAssetId" TEXT,
    "feeQuantity" DECIMAL(38,18),
    "groupRef" TEXT,
    "linkedCashTransactionId" TEXT,
    "contributionTaxYear" INTEGER,
    "externalId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "importBatchId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "costBasisCents" INTEGER,
    "priceUsed" DECIMAL(24,10),
    "marketValueCents" INTEGER,
    "source" "SnapshotSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HoldingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioValuation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "marketValueCents" INTEGER NOT NULL,
    "cashCents" INTEGER NOT NULL,
    "source" "SnapshotSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PortfolioValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IncomeType" NOT NULL,
    "schedule" JSONB,
    "depositAccountId" TEXT NOT NULL,
    "matchPattern" TEXT,
    "hourlyRateCents" INTEGER,
    "typicalWeeklyHours" DECIMAL(6,2),
    "takeHomeRatio" DECIMAL(7,6),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "ruleType" "ContributionRuleType" NOT NULL,
    "fixedAmountCents" INTEGER,
    "percent" DECIMAL(7,6),
    "minimumCents" INTEGER,
    "incomeSourceId" TEXT,
    "schedule" JSONB,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContributionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "share" DECIMAL(7,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContributionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "amountCents" INTEGER,
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContributionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "merchantId" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" "TxnKind" NOT NULL,
    "expectedAmountCents" INTEGER NOT NULL,
    "toleranceCents" INTEGER NOT NULL DEFAULT 0,
    "schedule" JSONB NOT NULL,
    "nextExpectedDate" DATE,
    "status" "RecurringStatus" NOT NULL DEFAULT 'SUGGESTED',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "targetDate" DATE,
    "linkedAccountId" TEXT,
    "monthlyTargetCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "type" "GoalEntryType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoalLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastScenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseline" "ForecastBaseline" NOT NULL,
    "lookbackMonths" INTEGER NOT NULL DEFAULT 6,
    "contributionPercentOverride" DECIMAL(7,6),
    "categoryAdjustments" JSONB NOT NULL DEFAULT '[]',
    "marketGrowthAnnual" DECIMAL(7,6),
    "includeGoals" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ForecastScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "userId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "assetsCents" INTEGER NOT NULL,
    "liabilitiesCents" INTEGER NOT NULL,
    "cashCents" INTEGER NOT NULL,
    "investmentsCents" INTEGER NOT NULL,
    "otherAssetsCents" INTEGER NOT NULL,
    "completeness" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("userId","asOfDate")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "breakpoint" "LayoutBreakpoint" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_id_userId_key" ON "Connection"("id", "userId");

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_idx" ON "FinancialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_id_userId_key" ON "FinancialAccount"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_connectionId_externalId_key" ON "FinancialAccount"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "BalanceSnapshot_userId_asOfDate_idx" ON "BalanceSnapshot"("userId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSnapshot_accountId_asOfDate_source_key" ON "BalanceSnapshot"("accountId", "asOfDate", "source");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_reviewStatus_idx" ON "Transaction"("userId", "reviewStatus");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_fingerprint_idx" ON "Transaction"("accountId", "fingerprint");

-- CreateIndex
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");

-- CreateIndex
CREATE INDEX "Transaction_recurringSeriesId_idx" ON "Transaction"("recurringSeriesId");

-- CreateIndex
CREATE INDEX "Transaction_contributionPlanId_idx" ON "Transaction"("contributionPlanId");

-- CreateIndex
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_externalId_key" ON "Transaction"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionSplit_userId_categoryId_idx" ON "TransactionSplit"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Category_userId_parentId_idx" ON "Category"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_id_userId_key" ON "Merchant"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_matchKey_key" ON "Merchant"("userId", "matchKey");

-- CreateIndex
CREATE INDEX "CategorizationRule_userId_priority_idx" ON "CategorizationRule"("userId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationRule_id_userId_key" ON "CategorizationRule"("id", "userId");

-- CreateIndex
CREATE INDEX "ImportBatch_accountId_idx" ON "ImportBatch"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_id_userId_key" ON "ImportBatch"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CsvImportProfile_userId_name_key" ON "CsvImportProfile"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetClass_symbol_key" ON "Asset"("assetClass", "symbol");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_accountId_tradeDate_idx" ON "InvestmentTransaction"("accountId", "tradeDate");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_userId_assetId_idx" ON "InvestmentTransaction"("userId", "assetId");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_groupRef_idx" ON "InvestmentTransaction"("groupRef");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_linkedCashTransactionId_idx" ON "InvestmentTransaction"("linkedCashTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentTransaction_accountId_externalId_key" ON "InvestmentTransaction"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "HoldingSnapshot_userId_asOfDate_idx" ON "HoldingSnapshot"("userId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingSnapshot_accountId_assetId_asOfDate_source_key" ON "HoldingSnapshot"("accountId", "assetId", "asOfDate", "source");

-- CreateIndex
CREATE INDEX "PortfolioValuation_userId_asOfDate_idx" ON "PortfolioValuation"("userId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioValuation_accountId_asOfDate_source_key" ON "PortfolioValuation"("accountId", "asOfDate", "source");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSource_id_userId_key" ON "IncomeSource"("id", "userId");

-- CreateIndex
CREATE INDEX "ContributionPlan_userId_status_idx" ON "ContributionPlan"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionPlan_id_userId_key" ON "ContributionPlan"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionAllocation_planId_targetAccountId_key" ON "ContributionAllocation"("planId", "targetAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionOverride_planId_scheduledDate_key" ON "ContributionOverride"("planId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_month_categoryId_key" ON "Budget"("userId", "month", "categoryId");

-- CreateIndex
CREATE INDEX "RecurringSeries_userId_status_idx" ON "RecurringSeries"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSeries_id_userId_key" ON "RecurringSeries"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGoal_id_userId_key" ON "SavingsGoal"("id", "userId");

-- CreateIndex
CREATE INDEX "GoalLedgerEntry_goalId_idx" ON "GoalLedgerEntry"("goalId");

-- CreateIndex
CREATE INDEX "GoalLedgerEntry_accountId_idx" ON "GoalLedgerEntry"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastScenario_userId_name_key" ON "ForecastScenario"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_breakpoint_key" ON "DashboardLayout"("userId", "breakpoint");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SafeToSpendSettings" ADD CONSTRAINT "SafeToSpendSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "Connection"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_userId_fkey" FOREIGN KEY ("merchantId", "userId") REFERENCES "Merchant"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_appliedRuleId_userId_fkey" FOREIGN KEY ("appliedRuleId", "userId") REFERENCES "CategorizationRule"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_incomeSourceId_userId_fkey" FOREIGN KEY ("incomeSourceId", "userId") REFERENCES "IncomeSource"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringSeriesId_userId_fkey" FOREIGN KEY ("recurringSeriesId", "userId") REFERENCES "RecurringSeries"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_contributionPlanId_userId_fkey" FOREIGN KEY ("contributionPlanId", "userId") REFERENCES "ContributionPlan"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_userId_fkey" FOREIGN KEY ("importBatchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_userId_fkey" FOREIGN KEY ("parentId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_defaultCategoryId_userId_fkey" FOREIGN KEY ("defaultCategoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_setCategoryId_userId_fkey" FOREIGN KEY ("setCategoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_setMerchantId_userId_fkey" FOREIGN KEY ("setMerchantId", "userId") REFERENCES "Merchant"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CsvImportProfile" ADD CONSTRAINT "CsvImportProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AssetPrice" ADD CONSTRAINT "AssetPrice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_feeAssetId_fkey" FOREIGN KEY ("feeAssetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_linkedCashTransactionId_userId_fkey" FOREIGN KEY ("linkedCashTransactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_importBatchId_userId_fkey" FOREIGN KEY ("importBatchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PortfolioValuation" ADD CONSTRAINT "PortfolioValuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PortfolioValuation" ADD CONSTRAINT "PortfolioValuation_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_depositAccountId_userId_fkey" FOREIGN KEY ("depositAccountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_sourceAccountId_userId_fkey" FOREIGN KEY ("sourceAccountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_incomeSourceId_userId_fkey" FOREIGN KEY ("incomeSourceId", "userId") REFERENCES "IncomeSource"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "ContributionPlan"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_targetAccountId_userId_fkey" FOREIGN KEY ("targetAccountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionOverride" ADD CONSTRAINT "ContributionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContributionOverride" ADD CONSTRAINT "ContributionOverride_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "ContributionPlan"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_merchantId_userId_fkey" FOREIGN KEY ("merchantId", "userId") REFERENCES "Merchant"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_linkedAccountId_userId_fkey" FOREIGN KEY ("linkedAccountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "SavingsGoal"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ForecastScenario" ADD CONSTRAINT "ForecastScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NetWorthSnapshot" ADD CONSTRAINT "NetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- =====================================================================================================================
-- Hand-written constraints (ADR-0009). Prisma cannot express these, and does not manage or drop them.
-- =====================================================================================================================

-- Settings ------------------------------------------------------------------------------------------------------------
ALTER TABLE "UserSettings"
  ADD CONSTRAINT "UserSettings_currency_usd_check" CHECK ("currency" = 'USD'),
  ADD CONSTRAINT "UserSettings_lookback_check" CHECK ("forecastLookbackMonths" BETWEEN 1 AND 60);

ALTER TABLE "SafeToSpendSettings"
  ADD CONSTRAINT "SafeToSpendSettings_horizon_days_check"
    CHECK ((("horizon" = 'DAYS') = ("horizonDays" IS NOT NULL)) AND ("horizonDays" IS NULL OR "horizonDays" BETWEEN 1 AND 366));

-- Accounts ------------------------------------------------------------------------------------------------------------
ALTER TABLE "FinancialAccount"
  ADD CONSTRAINT "FinancialAccount_investment_type_check" CHECK (("investmentType" IS NOT NULL) = ("type" = 'INVESTMENT')),
  ADD CONSTRAINT "FinancialAccount_minimum_balance_check" CHECK ("minimumBalanceCents" IS NULL OR "minimumBalanceCents" >= 0),
  ADD CONSTRAINT "FinancialAccount_safe_to_spend_cash_only_check"
    CHECK (NOT "includeInSafeToSpend" OR "type" IN ('CHECKING', 'SAVINGS', 'CASH')),
  -- All money math assumes USD today; relax with a migration when multi-currency is implemented.
  ADD CONSTRAINT "FinancialAccount_currency_usd_check" CHECK ("currency" = 'USD');

-- Categories and rules ------------------------------------------------------------------------------------------------
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_not_own_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  ADD CONSTRAINT "Category_name_not_blank_check" CHECK (btrim("name") <> '');

-- One name per user and parent, case-insensitive; NULLS NOT DISTINCT makes top-level names unique too (PostgreSQL 15+).
CREATE UNIQUE INDEX "Category_userId_parentId_lower_name_key"
  ON "Category" ("userId", "parentId", lower("name")) NULLS NOT DISTINCT;

ALTER TABLE "CategorizationRule"
  ADD CONSTRAINT "CategorizationRule_amount_range_check"
    CHECK ("minAmountCents" IS NULL OR "maxAmountCents" IS NULL OR "minAmountCents" <= "maxAmountCents"),
  ADD CONSTRAINT "CategorizationRule_has_action_check"
    CHECK ("setCategoryId" IS NOT NULL OR "setKind" IS NOT NULL OR "setMerchantId" IS NOT NULL),
  ADD CONSTRAINT "CategorizationRule_pattern_not_blank_check" CHECK ("pattern" <> '');

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_counts_check"
    CHECK ("rowCount" >= 0 AND "importedCount" >= 0 AND "duplicateCount" >= 0 AND "errorCount" >= 0);

-- Investments ---------------------------------------------------------------------------------------------------------
ALTER TABLE "AssetPrice" ADD CONSTRAINT "AssetPrice_close_positive_check" CHECK ("close" > 0);
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_rate_positive_check" CHECK ("rate" > 0);

ALTER TABLE "InvestmentTransaction"
  -- quantity is a magnitude; direction comes from the type.
  ADD CONSTRAINT "InvestmentTransaction_magnitudes_check"
    CHECK (("quantity" IS NULL OR "quantity" >= 0) AND ("feeQuantity" IS NULL OR "feeQuantity" >= 0)
       AND ("unitPrice" IS NULL OR "unitPrice" >= 0) AND "feeCents" >= 0
       AND ("usdValueCents" IS NULL OR "usdValueCents" >= 0)),
  ADD CONSTRAINT "InvestmentTransaction_trade_needs_asset_check"
    CHECK ("type" NOT IN ('BUY', 'SELL', 'STAKING_REWARD') OR ("assetId" IS NOT NULL AND "quantity" > 0)),
  -- Cash moves in the direction the type implies (crypto-to-crypto legs have no cash and pass with 0).
  ADD CONSTRAINT "InvestmentTransaction_cash_direction_check"
    CHECK (CASE "type"
             WHEN 'BUY' THEN "cashAmountCents" <= 0
             WHEN 'SELL' THEN "cashAmountCents" >= 0
             WHEN 'DIVIDEND' THEN "cashAmountCents" >= 0
             WHEN 'INTEREST' THEN "cashAmountCents" >= 0
             WHEN 'FEE' THEN "cashAmountCents" <= 0
             WHEN 'DEPOSIT' THEN "cashAmountCents" >= 0
             WHEN 'WITHDRAWAL' THEN "cashAmountCents" <= 0
             ELSE true
           END),
  ADD CONSTRAINT "InvestmentTransaction_usd_value_source_check"
    CHECK (("usdValueCents" IS NULL) = ("usdValueSource" IS NULL)),
  -- Rewards have no USD cash leg, so their fair value is required for cost basis.
  ADD CONSTRAINT "InvestmentTransaction_reward_value_check"
    CHECK ("type" <> 'STAKING_REWARD' OR "usdValueCents" IS NOT NULL),
  ADD CONSTRAINT "InvestmentTransaction_tax_year_check"
    CHECK ("contributionTaxYear" IS NULL
       OR ("contributionTaxYear" BETWEEN 1974 AND 2200 AND "type" IN ('DEPOSIT', 'TRANSFER_IN')));

ALTER TABLE "HoldingSnapshot"
  ADD CONSTRAINT "HoldingSnapshot_non_negative_check"
    CHECK ("quantity" >= 0 AND ("costBasisCents" IS NULL OR "costBasisCents" >= 0)
       AND ("marketValueCents" IS NULL OR "marketValueCents" >= 0) AND ("priceUsed" IS NULL OR "priceUsed" >= 0));

ALTER TABLE "PortfolioValuation"
  ADD CONSTRAINT "PortfolioValuation_market_value_check" CHECK ("marketValueCents" >= 0);

-- Income and contributions --------------------------------------------------------------------------------------------
ALTER TABLE "IncomeSource"
  ADD CONSTRAINT "IncomeSource_ranges_check"
    CHECK (("hourlyRateCents" IS NULL OR "hourlyRateCents" >= 0)
       AND ("typicalWeeklyHours" IS NULL OR "typicalWeeklyHours" BETWEEN 0 AND 168)
       AND ("takeHomeRatio" IS NULL OR "takeHomeRatio" BETWEEN 0 AND 1));

ALTER TABLE "ContributionPlan"
  ADD CONSTRAINT "ContributionPlan_fixed_amount_check"
    CHECK ((("ruleType" = 'FIXED_AMOUNT') = ("fixedAmountCents" IS NOT NULL)) AND ("fixedAmountCents" IS NULL OR "fixedAmountCents" >= 0)),
  ADD CONSTRAINT "ContributionPlan_percent_check"
    CHECK ((("ruleType" <> 'FIXED_AMOUNT') = ("percent" IS NOT NULL)) AND ("percent" IS NULL OR ("percent" > 0 AND "percent" <= 1))),
  ADD CONSTRAINT "ContributionPlan_paycheck_source_check"
    CHECK ("ruleType" <> 'PERCENT_OF_PAYCHECK' OR "incomeSourceId" IS NOT NULL),
  -- Fixed and percent-of-income plans run on their own schedule; percent-of-paycheck plans follow paydays.
  ADD CONSTRAINT "ContributionPlan_schedule_check"
    CHECK ("ruleType" = 'PERCENT_OF_PAYCHECK' OR "schedule" IS NOT NULL),
  ADD CONSTRAINT "ContributionPlan_minimum_check" CHECK ("minimumCents" IS NULL OR "minimumCents" >= 0),
  ADD CONSTRAINT "ContributionPlan_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "ContributionAllocation"
  ADD CONSTRAINT "ContributionAllocation_share_check" CHECK ("share" > 0 AND "share" <= 1);

ALTER TABLE "ContributionOverride"
  ADD CONSTRAINT "ContributionOverride_skip_or_amount_check"
    CHECK (("skip" AND "amountCents" IS NULL) OR (NOT "skip" AND "amountCents" IS NOT NULL AND "amountCents" >= 0));

-- Budgets, recurring items, goals, forecasts, net worth, dashboard ----------------------------------------------------
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_first_of_month_check" CHECK (EXTRACT(DAY FROM "month") = 1),
  ADD CONSTRAINT "Budget_amount_check" CHECK ("amountCents" >= 0);

ALTER TABLE "RecurringSeries"
  ADD CONSTRAINT "RecurringSeries_tolerance_check" CHECK ("toleranceCents" >= 0);

ALTER TABLE "SavingsGoal"
  ADD CONSTRAINT "SavingsGoal_amounts_check"
    CHECK ("targetCents" > 0 AND ("monthlyTargetCents" IS NULL OR "monthlyTargetCents" >= 0));

ALTER TABLE "GoalLedgerEntry"
  ADD CONSTRAINT "GoalLedgerEntry_sign_check"
    CHECK (("type" = 'ALLOCATE' AND "amountCents" > 0) OR ("type" IN ('RELEASE', 'WITHDRAW') AND "amountCents" < 0));

ALTER TABLE "ForecastScenario"
  ADD CONSTRAINT "ForecastScenario_ranges_check"
    CHECK ("lookbackMonths" BETWEEN 1 AND 60
       AND ("contributionPercentOverride" IS NULL OR "contributionPercentOverride" BETWEEN 0 AND 1)
       AND ("marketGrowthAnnual" IS NULL OR "marketGrowthAnnual" BETWEEN -1 AND 1));

ALTER TABLE "NetWorthSnapshot"
  ADD CONSTRAINT "NetWorthSnapshot_signs_check" CHECK ("assetsCents" >= 0 AND "liabilitiesCents" <= 0);

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_version_check" CHECK ("version" >= 1);

-- Deferred invariants (checked at COMMIT, so a transaction and its splits can be written in any order) ----------------

-- Every transaction has at least one split, and its splits sum exactly to its amount.
CREATE FUNCTION "assert_transaction_splits_balance"(target_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  txn_amount INTEGER;
  split_total BIGINT;
  split_count INTEGER;
BEGIN
  SELECT "amountCents" INTO txn_amount FROM "Transaction" WHERE "id" = target_id;
  IF NOT FOUND THEN
    RETURN; -- the transaction itself was deleted in this database transaction
  END IF;
  SELECT COALESCE(SUM("amountCents"), 0), COUNT(*) INTO split_total, split_count
    FROM "TransactionSplit" WHERE "transactionId" = target_id;
  IF split_count = 0 THEN
    RAISE EXCEPTION 'Transaction % has no splits', target_id USING ERRCODE = '23514';
  END IF;
  IF split_total <> txn_amount THEN
    RAISE EXCEPTION 'Splits of transaction % do not sum to its amount', target_id USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "check_transaction_splits_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Transaction' THEN
    PERFORM "assert_transaction_splits_balance"(NEW."id");
  ELSE
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM "assert_transaction_splits_balance"(NEW."transactionId");
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."transactionId" <> NEW."transactionId") THEN
      PERFORM "assert_transaction_splits_balance"(OLD."transactionId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Transaction_splits_balance"
  AFTER INSERT OR UPDATE OF "amountCents" ON "Transaction"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_transaction_splits_trigger"();

CREATE CONSTRAINT TRIGGER "TransactionSplit_balance"
  AFTER INSERT OR UPDATE OR DELETE ON "TransactionSplit"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_transaction_splits_trigger"();

-- A contribution plan's allocation shares sum to exactly 1 whenever it has allocations.
CREATE FUNCTION "assert_contribution_shares_sum"(target_plan TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  share_total NUMERIC;
BEGIN
  SELECT SUM("share") INTO share_total FROM "ContributionAllocation" WHERE "planId" = target_plan;
  IF share_total IS NOT NULL AND share_total <> 1 THEN
    RAISE EXCEPTION 'Allocation shares of contribution plan % do not sum to 1', target_plan USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "check_contribution_shares_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM "assert_contribution_shares_sum"(NEW."planId");
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."planId" <> NEW."planId") THEN
    PERFORM "assert_contribution_shares_sum"(OLD."planId");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ContributionAllocation_shares_sum"
  AFTER INSERT OR UPDATE OR DELETE ON "ContributionAllocation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_contribution_shares_trigger"();
