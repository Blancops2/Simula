-- CreateEnum
CREATE TYPE "TipoClase" AS ENUM ('OBLIGATORIA', 'ELECTIVA');

-- CreateEnum
CREATE TYPE "TipoRequisito" AS ENUM ('PRERREQUISITO', 'CORREQUISITO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plantillaMallaId" TEXT;

-- CreateTable
CREATE TABLE "carreras" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carreras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_malla" (
    "id" TEXT NOT NULL,
    "carreraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "plantillaOrigenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_malla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clases" (
    "id" TEXT NOT NULL,
    "plantillaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creditos" INTEGER NOT NULL,
    "nivel" INTEGER NOT NULL,
    "tipo" "TipoClase" NOT NULL DEFAULT 'OBLIGATORIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relaciones_requisito" (
    "id" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "requisitoId" TEXT NOT NULL,
    "tipo" "TipoRequisito" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relaciones_requisito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carreras_nombre_key" ON "carreras"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "carreras_codigo_key" ON "carreras"("codigo");

-- CreateIndex
CREATE INDEX "plantillas_malla_carreraId_idx" ON "plantillas_malla"("carreraId");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_malla_carreraId_nombre_version_key" ON "plantillas_malla"("carreraId", "nombre", "version");

-- CreateIndex
CREATE INDEX "clases_plantillaId_idx" ON "clases"("plantillaId");

-- CreateIndex
CREATE UNIQUE INDEX "clases_plantillaId_codigo_key" ON "clases"("plantillaId", "codigo");

-- CreateIndex
CREATE INDEX "relaciones_requisito_claseId_idx" ON "relaciones_requisito"("claseId");

-- CreateIndex
CREATE INDEX "relaciones_requisito_requisitoId_idx" ON "relaciones_requisito"("requisitoId");

-- CreateIndex
CREATE UNIQUE INDEX "relaciones_requisito_claseId_requisitoId_tipo_key" ON "relaciones_requisito"("claseId", "requisitoId", "tipo");

-- CreateIndex
CREATE INDEX "users_plantillaMallaId_idx" ON "users"("plantillaMallaId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_plantillaMallaId_fkey" FOREIGN KEY ("plantillaMallaId") REFERENCES "plantillas_malla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_malla" ADD CONSTRAINT "plantillas_malla_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_malla" ADD CONSTRAINT "plantillas_malla_plantillaOrigenId_fkey" FOREIGN KEY ("plantillaOrigenId") REFERENCES "plantillas_malla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases" ADD CONSTRAINT "clases_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "plantillas_malla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relaciones_requisito" ADD CONSTRAINT "relaciones_requisito_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "clases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relaciones_requisito" ADD CONSTRAINT "relaciones_requisito_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "clases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
