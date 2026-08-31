-- CreateTable
CREATE TABLE "clases_autorreportadas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clases_autorreportadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clases_autorreportadas_userId_idx" ON "clases_autorreportadas"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clases_autorreportadas_userId_claseId_key" ON "clases_autorreportadas"("userId", "claseId");

-- AddForeignKey
ALTER TABLE "clases_autorreportadas" ADD CONSTRAINT "clases_autorreportadas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_autorreportadas" ADD CONSTRAINT "clases_autorreportadas_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "clases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
