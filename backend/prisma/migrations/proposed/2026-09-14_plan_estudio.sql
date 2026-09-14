/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-09-14 — ver backend/.env y
   DDL.sql, que ya refleja estas tablas.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo: el sistema necesita ofrecer al estudiante un "plan de estudio"
   recomendado -- una secuencia sugerida de clases por periodo (ej.
   "primer periodo: Matematica I, Fisica I, Programacion I") dentro de una
   malla (PlantillaMalla) puntual. Es solo una RECOMENDACION: el estudiante
   puede no seguirla, y por eso NO se amarra al catalogo "periodo" (HU-03-03,
   ver migrations/proposed/2026-09-08_periodo.sql) -- ese catalogo modela un
   periodo academico REAL con fechas, compartido por todos los estudiantes;
   distintos estudiantes de la misma malla no necesariamente arrancan en el
   mismo periodo real, y no completar lo sugerido en su "primer periodo" no
   debe bloquearlos. Aqui "periodo" es solo una etiqueta de secuencia
   ("primer periodo", "segundo periodo", ...) propia de la malla.

   El esquema real (DDL.sql / Azure db-simula) no tiene ningun catalogo para
   esto todavia.

   Contenido:
     1) CREATE TABLE plan_estudio
          -- un periodo recomendado dentro de una malla puntual.
     2) CREATE TABLE plan_estudio_has_PlantillaMalla_has_Clase
          -- que clases (de esa MISMA malla) se recomiendan en ese periodo.
   ===================================================================== */

USE [db-simula];
GO

CREATE TABLE plan_estudio (
    idplan_estudio     VARCHAR(45) NOT NULL,
    idPlantillaMalla   VARCHAR(45) NOT NULL,
    periodo            VARCHAR(45) NULL,
    createdAt          DATETIME2   NULL,
    updatedAt          DATETIME2   NULL,
    CONSTRAINT PK_plan_estudio PRIMARY KEY (idplan_estudio)
);
GO

CREATE TABLE plan_estudio_has_PlantillaMalla_has_Clase (
    idplan_estudio              VARCHAR(45) NOT NULL,
    idPlantillaMalla_has_Clase  VARCHAR(45) NOT NULL,
    CONSTRAINT PK_plan_estudio_has_PlantillaMalla_has_Clase PRIMARY KEY
        (idplan_estudio, idPlantillaMalla_has_Clase)
);
GO

ALTER TABLE plan_estudio
    ADD CONSTRAINT fk_plan_estudio_PlantillaMalla1
    FOREIGN KEY (idPlantillaMalla) REFERENCES PlantillaMalla (idPlantillaMalla);
GO

-- Una misma malla no puede tener dos filas de "primer periodo", etc.
ALTER TABLE plan_estudio
    ADD CONSTRAINT UQ_plan_estudio_malla_periodo UNIQUE (idPlantillaMalla, periodo);
GO

ALTER TABLE plan_estudio_has_PlantillaMalla_has_Clase
    ADD CONSTRAINT fk_plan_estudio_has_PlantillaMalla_has_Clase_plan_estudio1
    FOREIGN KEY (idplan_estudio) REFERENCES plan_estudio (idplan_estudio);
GO

ALTER TABLE plan_estudio_has_PlantillaMalla_has_Clase
    ADD CONSTRAINT fk_plan_estudio_has_PlantillaMalla_has_Clase_PMhC1
    FOREIGN KEY (idPlantillaMalla_has_Clase) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
