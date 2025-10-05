/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `crmleads` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phone]` on the table `crmleads` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[legalnamessn]` on the table `crmleads` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[last4ssn]` on the table `crmleads` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[firstname,lastname]` on the table `crmleads` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."crmleads" ADD COLUMN     "otherSource" TEXT;

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" SERIAL NOT NULL,
    "jti" TEXT NOT NULL,
    "userid" INTEGER NOT NULL,
    "expiresat" TIMESTAMPTZ NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdat" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "public"."refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_userid_idx" ON "public"."refresh_tokens"("userid");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresat_idx" ON "public"."refresh_tokens"("expiresat");

-- CreateIndex
CREATE UNIQUE INDEX "crmleads_email_key" ON "public"."crmleads"("email");

-- CreateIndex
CREATE UNIQUE INDEX "crmleads_phone_key" ON "public"."crmleads"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "crmleads_legalnamessn_key" ON "public"."crmleads"("legalnamessn");

-- CreateIndex
CREATE UNIQUE INDEX "crmleads_last4ssn_key" ON "public"."crmleads"("last4ssn");

-- CreateIndex
CREATE UNIQUE INDEX "crmleads_firstname_lastname_key" ON "public"."crmleads"("firstname", "lastname");
