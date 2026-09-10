/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local — ver backend/.env y DDL.sql. Esa
   base estaba vacía en HistorialAcademico, así que no necesitó el
   backfill que sí es obligatorio aquí si Azure real tiene filas.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU-03-03): el administrador necesita poder crear y
   habilitar/deshabilitar períodos académicos; solo los habilitados deben
   quedar disponibles para consulta/selección del estudiante (HU1/HU2) y
   para simulaciones (HU-03-04, referencia futura). El esquema real
   (DDL.sql / Azure db-simula) no tiene ningún catálogo de períodos: hoy
   HistorialAcademico.periodo es un string libre "AAAA-P" calculado por
   periodo.util.ts, sin catálogo ni estado habilitado/deshabilitado.

   Contenido:
     1) CREATE TABLE periodo            (catálogo nuevo)
     2) CREATE TABLE Auditoria          (genérica, AC5: quién/cuándo/
                                          estado anterior-nuevo)
     3) ALTER TABLE HistorialAcademico  (agrega idperiodo, quita periodo
                                          Y anno: el año ya vive en
                                          periodo.anno vía idperiodo)

   ADVERTENCIA — orden obligatorio para el paso 3 si la tabla real ya
   tiene filas (a diferencia de Inscripcion, HistorialAcademico SÍ es una
   tabla en uso hoy):
     a) Agregar idperiodo como NULL (no NOT NULL todavía).
     b) Backfill: para cada fila existente, resolver o crear en "periodo"
        la fila que corresponda a su combinación (anno, periodo actual) e
        igualar idperiodo a ese id.
     c) Verificar que ninguna fila quedó con idperiodo NULL.
     d) Recién entonces ALTER COLUMN idperiodo a NOT NULL y agregar la FK.
     e) Solo al final, DROP COLUMN periodo y DROP COLUMN anno (el backfill
        del paso b ya deja el año accesible vía idperiodo -> periodo.anno,
        así que en ese punto anno por fila es puramente redundante).
   Este script deja comentado ese orden paso a paso; NO ejecuta un ALTER
   directo a NOT NULL sobre una tabla con datos.
   ===================================================================== */

USE [db-simula];
GO

-- =====================================================================
-- 1) PERIODO
-- =====================================================================
CREATE TABLE periodo (
    idperiodo    VARCHAR(45) NOT NULL,
    periodo      VARCHAR(45) NULL,
    anno         VARCHAR(45) NULL,
    estado       VARCHAR(45) NULL,
    FechaInicio  DATE        NULL,
    fechaFin     DATE        NULL,
    createdAt    DATETIME2   NULL,
    updatedAt    DATETIME2   NULL,
    CONSTRAINT PK_periodo PRIMARY KEY (idperiodo)
);
GO

ALTER TABLE periodo
    ADD CONSTRAINT UQ_periodo_anno_periodo UNIQUE (anno, periodo);
GO

-- =====================================================================
-- 2) AUDITORIA (genérica; ver nota de diseño en DDL.sql)
-- =====================================================================
CREATE TABLE Auditoria (
    idAuditoria     VARCHAR(45)  NOT NULL,
    entidad         VARCHAR(45)  NOT NULL,
    idEntidad       VARCHAR(45)  NOT NULL,
    campo           VARCHAR(45)  NULL,
    valorAnterior   VARCHAR(255) NULL,
    valorNuevo      VARCHAR(255) NULL,
    idUser          VARCHAR(45)  NOT NULL,
    createdAt       DATETIME2    NULL,
    CONSTRAINT PK_Auditoria PRIMARY KEY (idAuditoria)
);
GO

ALTER TABLE Auditoria
    ADD CONSTRAINT fk_Auditoria_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

-- =====================================================================
-- 3) HISTORIALACADEMICO — agregar idperiodo, retirar periodo (string)
--    PASO A PASO (no ejecutar como un solo ALTER si ya hay filas reales).
-- =====================================================================

-- 3a) Agregar la columna NULL primero.
ALTER TABLE HistorialAcademico
    ADD idperiodo VARCHAR(45) NULL;
GO

-- 3b) BACKFILL — ejemplo de forma, ajustar a como esté almacenado
--     realmente "periodo" (string "AAAA-P") en producción antes de correr:
--
-- UPDATE ha
--     SET ha.idperiodo = p.idperiodo
-- FROM HistorialAcademico ha
-- JOIN periodo p
--     ON p.anno = ha.anno
--    AND p.periodo = <derivar de ha.periodo, ej. RIGHT(ha.periodo, 1)>;
--
-- Cualquier combinación (anno, periodo) de HistorialAcademico que no
-- exista todavía en "periodo" debe insertarse primero en el catálogo
-- (con el estado que corresponda) para que el backfill no deje NULLs.

-- 3c) Verificación manual antes de continuar:
-- SELECT COUNT(*) FROM HistorialAcademico WHERE idperiodo IS NULL;
-- (debe devolver 0 antes de aplicar 3d)

-- 3d) Recién con el backfill confirmado, forzar NOT NULL y la FK:
-- ALTER TABLE HistorialAcademico
--     ALTER COLUMN idperiodo VARCHAR(45) NOT NULL;
-- GO
--
-- ALTER TABLE HistorialAcademico
--     ADD CONSTRAINT fk_HistorialAcademico_periodo1
--     FOREIGN KEY (idperiodo) REFERENCES periodo (idperiodo);
-- GO

-- 3e) Solo al final, retirar las columnas libres viejas:
-- ALTER TABLE HistorialAcademico
--     DROP COLUMN periodo;
-- GO
--
-- ALTER TABLE HistorialAcademico
--     DROP COLUMN anno;
-- GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
