-- CreateEnum
CREATE TYPE "EstadoHistorial" AS ENUM ('APROBADA', 'REPROBADA', 'EN_CURSO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "codigoEstudiantil" TEXT,
ADD COLUMN     "nombreCompleto" TEXT;

-- CreateTable
CREATE TABLE "historial_academico" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "estado" "EstadoHistorial" NOT NULL,
    "nota" DOUBLE PRECISION,
    "periodo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historial_academico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscripciones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historial_academico_userId_idx" ON "historial_academico"("userId");

-- CreateIndex
CREATE INDEX "historial_academico_claseId_idx" ON "historial_academico"("claseId");

-- CreateIndex
CREATE UNIQUE INDEX "historial_academico_userId_claseId_periodo_key" ON "historial_academico"("userId", "claseId", "periodo");

-- CreateIndex
CREATE INDEX "inscripciones_userId_idx" ON "inscripciones"("userId");

-- CreateIndex
CREATE INDEX "inscripciones_claseId_idx" ON "inscripciones"("claseId");

-- CreateIndex
CREATE UNIQUE INDEX "inscripciones_userId_claseId_periodo_key" ON "inscripciones"("userId", "claseId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "users_codigoEstudiantil_key" ON "users"("codigoEstudiantil");

-- AddForeignKey
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "clases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "clases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

