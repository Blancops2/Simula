-- AlterTable
ALTER TABLE "clases" DROP COLUMN "creditos",
ADD COLUMN     "posX" DOUBLE PRECISION,
ADD COLUMN     "posY" DOUBLE PRECISION,
ADD COLUMN     "unidadesValorativas" INTEGER NOT NULL;

