/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-17, con PER-2026-1 como
   período actual — ver backend/.env, DDL.sql y DML.sql, que ya reflejan
   esta columna. Se ejecutó sin la línea USE y sin los GO, con prisma db
   execute; el CREATE INDEX filtrado requiere SET QUOTED_IDENTIFIER ON.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU de trazabilidad de simulaciones, criterio 4): el estudiante
   debe poder consultar sus últimas simulaciones del período ACTUAL, y el
   catálogo "periodo" no tiene forma de decir cuál es: "habilitado" solo
   indica que está disponible (puede haber varios a la vez). El
   administrador marca el período actual desde SIMULA
   (PATCH /periodos/:id/actual).

   periodoActual: 1 = es el período actual, 0 = no lo es.
     - Solo puede haber UNO en 1: índice único filtrado
       UQ_periodo_periodoActual (Prisma no modela índices filtrados, por
       eso vive solo aquí y en DDL.sql).
     - El backend exige que esté habilitado para marcarlo, y no deja
       deshabilitar el período actual.

   Incremental (ALTER): la tabla periodo ya existe (ver
   2026-09-08_periodo.sql). NOT NULL con DEFAULT 0, así que las filas
   existentes quedan en 0 sin backfill. Después de aplicarla, el
   administrador marca el período actual (o se hace con el UPDATE de
   ejemplo del final, ajustando el id).

   Contenido:
     1) ALTER TABLE periodo ADD periodoActual BIT NOT NULL DEFAULT 0
     2) CREATE UNIQUE INDEX UQ_periodo_periodoActual ... WHERE periodoActual = 1
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE periodo
    ADD periodoActual BIT NOT NULL
        CONSTRAINT DF_periodo_periodoActual DEFAULT 0;
GO

CREATE UNIQUE INDEX UQ_periodo_periodoActual
    ON periodo (periodoActual)
    WHERE periodoActual = 1;
GO

-- Opcional, ajustando el id al período que corresponda en Azure:
-- UPDATE periodo SET periodoActual = 1 WHERE idperiodo = '<id del período actual>';
-- GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
