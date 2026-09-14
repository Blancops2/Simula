/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-09-14 — ver backend/.env y
   DDL.sql, que ya refleja estas tablas.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo: el plan de estudio recomendado (ver 2026-09-14_plan_estudio.sql)
   se agrupaba solo por "periodo" (ej. "primer periodo"). El admin necesita
   además agruparlo por "año" (ej. "primer año"), de la misma forma: texto
   libre de secuencia dentro de la malla, NO un año calendario real (eso ya
   lo cubre el catálogo "periodo" de HU-03-03, que este plan sigue sin
   usar). Jerarquía resultante: año -> periodo -> clases.

   Esta migración es incremental (ALTER) porque la tabla plan_estudio ya
   existe -- se creó y se aplicó contra el entorno local de desarrollo
   (db_simula_local) el 2026-09-14 (ver esa migración y DDL.sql, que ya
   refleja el estado final con "anno" incluido).

   Contenido:
     1) ALTER TABLE plan_estudio ADD anno VARCHAR(45) NULL
     2) Reemplaza UQ_plan_estudio_malla_periodo (idPlantillaMalla, periodo)
        por UQ_plan_estudio_malla_anno_periodo (idPlantillaMalla, anno, periodo)
        -- con la columna vieja, dos periodos "primer periodo" en años
        distintos de la misma malla chocarían contra el UNIQUE anterior.
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE plan_estudio
    ADD anno VARCHAR(45) NULL;
GO

ALTER TABLE plan_estudio
    DROP CONSTRAINT UQ_plan_estudio_malla_periodo;
GO

ALTER TABLE plan_estudio
    ADD CONSTRAINT UQ_plan_estudio_malla_anno_periodo UNIQUE (idPlantillaMalla, anno, periodo);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
