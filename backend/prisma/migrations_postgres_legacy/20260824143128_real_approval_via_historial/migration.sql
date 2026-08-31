/*
  Warnings:

  - You are about to drop the `clases_autorreportadas` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrigenHistorial" AS ENUM ('ADMIN', 'AUTOREPORTE');

-- DropForeignKey
ALTER TABLE "clases_autorreportadas" DROP CONSTRAINT "clases_autorreportadas_claseId_fkey";

-- DropForeignKey
ALTER TABLE "clases_autorreportadas" DROP CONSTRAINT "clases_autorreportadas_userId_fkey";

-- AlterTable
ALTER TABLE "historial_academico" ADD COLUMN     "origen" "OrigenHistorial" NOT NULL DEFAULT 'ADMIN';

-- DropTable
DROP TABLE "clases_autorreportadas";
