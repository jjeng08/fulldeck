/*
  Warnings:

  - You are about to drop the `game_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `games` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "game_results" DROP CONSTRAINT "game_results_gameId_fkey";

-- DropForeignKey
ALTER TABLE "game_results" DROP CONSTRAINT "game_results_userId_fkey";

-- DropTable
DROP TABLE "game_results";

-- DropTable
DROP TABLE "games";

-- DropTable
DROP TABLE "users";

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "password_hash" VARCHAR(255) NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "winnings" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_logs" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameType" INTEGER,
    "gameId" TEXT,
    "actionId" TEXT,
    "credit" INTEGER,
    "debit" INTEGER,
    "balance" INTEGER NOT NULL,
    "winnings" INTEGER,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blackjack_logs" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "handIndex" INTEGER NOT NULL,
    "handValue" INTEGER NOT NULL,
    "betAmount" INTEGER NOT NULL,
    "cards" TEXT NOT NULL,
    "dealerShowing" TEXT,
    "totalHands" INTEGER NOT NULL,
    "gameState" JSONB,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blackjack_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");

-- CreateIndex
CREATE UNIQUE INDEX "players_email_key" ON "players"("email");

-- CreateIndex
CREATE INDEX "players_username_idx" ON "players"("username");

-- AddForeignKey
ALTER TABLE "accounts_logs" ADD CONSTRAINT "accounts_logs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackjack_logs" ADD CONSTRAINT "blackjack_logs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
