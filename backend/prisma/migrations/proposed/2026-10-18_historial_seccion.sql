/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-18 — ver backend/.env y
   DDL.sql, que ya refleja esta columna. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización explícita del
   ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo: registrar en HistorialAcademico la sección en la que el
   estudiante cursó la clase.

   seccion: VARCHAR(45) NULL.
     NULL -- registros previos a esta migración o sin sección conocida.

   Incremental (ALTER): la tabla HistorialAcademico ya existe. Columna
   NULL, así que no afecta filas existentes ni requiere backfill.

   Contenido:
     1) ALTER TABLE HistorialAcademico ADD seccion VARCHAR(45) NULL
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE HistorialAcademico
    ADD seccion VARCHAR(45) NULL;
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
