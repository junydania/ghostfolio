-- CreateEnum
CREATE TYPE "NgxSignalDirection" AS ENUM ('AVOID', 'BUY', 'WATCH');

-- CreateTable
CREATE TABLE "NgxCompanySnapshot" (
    "change7dPercent" DOUBLE PRECISION,
    "change52wPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "dayHigh" DOUBLE PRECISION,
    "dayLow" DOUBLE PRECISION,
    "high52wk" DOUBLE PRECISION,
    "id" TEXT NOT NULL,
    "low52wk" DOUBLE PRECISION,
    "marketCap" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL,
    "prevClose" DOUBLE PRECISION,
    "priceChangePercent" DOUBLE PRECISION,
    "sector" TEXT,
    "sharesOutstanding" DOUBLE PRECISION,
    "subSector" TEXT,
    "symbol" TEXT NOT NULL,
    "volume" DOUBLE PRECISION,

    CONSTRAINT "NgxCompanySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NgxMarketSnapshot" (
    "advDecRatio" DOUBLE PRECISION,
    "advancers" INTEGER,
    "asi" DOUBLE PRECISION,
    "asiChangePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "deals" INTEGER,
    "decliners" INTEGER,
    "id" TEXT NOT NULL,
    "marketCapTotal" DOUBLE PRECISION,
    "turnoverRate" DOUBLE PRECISION,
    "unchanged" INTEGER,
    "valueTraded" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "ytdAsiChangePercent" DOUBLE PRECISION,

    CONSTRAINT "NgxMarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NgxSignal" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" "NgxSignalDirection" NOT NULL,
    "id" TEXT NOT NULL,
    "rationale" JSONB,
    "score" DOUBLE PRECISION NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "NgxSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NgxCompanySnapshot_date_idx" ON "NgxCompanySnapshot"("date");

-- CreateIndex
CREATE INDEX "NgxCompanySnapshot_sector_idx" ON "NgxCompanySnapshot"("sector");

-- CreateIndex
CREATE INDEX "NgxCompanySnapshot_symbol_idx" ON "NgxCompanySnapshot"("symbol");

-- CreateIndex
CREATE INDEX "NgxCompanySnapshot_symbol_date_idx" ON "NgxCompanySnapshot"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NgxCompanySnapshot_date_symbol_key" ON "NgxCompanySnapshot"("date", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "NgxMarketSnapshot_date_key" ON "NgxMarketSnapshot"("date");

-- CreateIndex
CREATE INDEX "NgxMarketSnapshot_date_idx" ON "NgxMarketSnapshot"("date");

-- CreateIndex
CREATE INDEX "NgxSignal_date_idx" ON "NgxSignal"("date");

-- CreateIndex
CREATE INDEX "NgxSignal_direction_idx" ON "NgxSignal"("direction");

-- CreateIndex
CREATE INDEX "NgxSignal_symbol_idx" ON "NgxSignal"("symbol");

-- CreateIndex
CREATE INDEX "NgxSignal_symbol_date_idx" ON "NgxSignal"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NgxSignal_date_symbol_type_key" ON "NgxSignal"("date", "symbol", "type");
