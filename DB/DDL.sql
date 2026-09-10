/* =====================================================================
   SCRIPT DDL - SQL Server 2022
   Generado a partir del diagrama: esquema-simula.mwb
   Estrategia: 
     1) Crear la base de datos.
     2) Crear TODAS las tablas con sus columnas y PRIMARY KEY.
     3) Agregar TODAS las FOREIGN KEY con ALTER TABLE al final.
        (Esto evita cualquier error de "referencia a objeto no existente",
         incluso con relaciones circulares o auto-referenciadas, ya que
         para cuando se agregan las FKs, todas las tablas ya existen).

   NOTA IMPORTANTE:
     La tabla PlantillaMalla_has_Clase tiene PK compuesta
     (idPlantillaMalla_has_Clase, idPlantillaMalla, idClase).
     Las tablas Requisito e HistorialAcademico apuntan solo a la columna
     idPlantillaMalla_has_Clase. SQL Server exige que la columna
     referenciada por una FK tenga una restricción UNIQUE o sea PK.
     Por eso se agrega un UNIQUE adicional sobre esa columna (ver sección 4).
     Esto es un requisito técnico de SQL Server, no una regla de negocio.

   ACTUALIZACIÓN (HU-03-03, 2026-09-08):
     Se agrega el catálogo "periodo" (períodos académicos que el admin
     puede habilitar/deshabilitar) y la tabla genérica "Auditoria" (AC5:
     quién/cuándo/estado anterior-nuevo de cada cambio, no exclusiva de
     periodo aunque hoy es su único productor de filas). HistorialAcademico
     pierde sus columnas libres "periodo" y "anno" (el año ya vive en
     periodo.anno) a cambio de la FK idperiodo -> periodo(idperiodo).
     Ya APLICADO contra el entorno local de desarrollo (db_simula_local,
     ver backend/.env); Azure real sigue pendiente de aprobación. Ver
     backend/prisma/migrations/proposed/2026-09-08_periodo.sql para la
     migración incremental (ALTER) a correr ahí, con la salvedad de que
     esa BD sí puede tener filas reales en HistorialAcademico (a diferencia
     del entorno local, que estaba vacío) y por lo tanto sí necesita el
     backfill antes del NOT NULL.
   ===================================================================== */

-- =====================================================================
-- 1) BASE DE DATOS
-- =====================================================================
IF DB_ID(N'db-simula') IS NULL
BEGIN
    CREATE DATABASE [db-simula];
END
GO

USE [db-simula];
GO

-- =====================================================================
-- 2) TABLAS INDEPENDIENTES (sin FKs)
-- =====================================================================

CREATE TABLE Facultad (
    idFacultad   VARCHAR(45) NOT NULL,
    nombre       VARCHAR(45) NULL,
    descripcion  VARCHAR(45) NULL,
    codigo       VARCHAR(45) NULL,
    estado       VARCHAR(45) NULL,
    createdAt    DATETIME2   NULL,
    updatedAt    DATETIME2   NULL,
    CONSTRAINT PK_Facultad PRIMARY KEY (idFacultad)
);
GO

CREATE TABLE Role (
    idRole       VARCHAR(45) NOT NULL,
    nombre       VARCHAR(45) NULL,
    descripcion  VARCHAR(45) NULL,
    estado       VARCHAR(45) NULL,
    createdAt    DATETIME2   NULL,
    updatedAt    DATETIME2   NULL,
    CONSTRAINT PK_Role PRIMARY KEY (idRole)
);
GO

CREATE TABLE Posicion (
    idPosicion   VARCHAR(45) NOT NULL,
    posX         VARCHAR(45) NULL,
    posY         VARCHAR(45) NULL,
    nivel        INT         NULL,
    CONSTRAINT PK_Posicion PRIMARY KEY (idPosicion)
);
GO

/* -----------------------------------------------------------------------
   HU-03-03 — Habilitar/deshabilitar períodos académicos.
   Catálogo de períodos que el administrador puede crear y habilitar o
   deshabilitar; solo los habilitados quedan disponibles para que el
   estudiante consulte/seleccione (HU1/HU2) y para simulaciones (HU-03-04).

   NOTA (tipos): el diagrama fuente (esquema-simula.mwb) modeló "año" y
   "createdAt" como DATE; se dejan aquí como VARCHAR(45)/DATETIME2 para
   mantener consistencia con el resto del esquema (igual que
   HistorialAcademico.anno, que ya es VARCHAR(45), y que el resto de
   columnas createdAt/updatedAt de este script, todas DATETIME2).
   ----------------------------------------------------------------------- */
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

-- =====================================================================
-- 3) TABLAS DEPENDIENTES (columnas de FK incluidas, restricción FK se
--    agrega despues en la sección 4)
-- =====================================================================

CREATE TABLE Carrera (
    idCarrera    VARCHAR(45) NOT NULL,
    nombre       VARCHAR(45) NULL,
    codigo       VARCHAR(45) NULL,
    createdAt    DATETIME2   NULL,
    updatedAt    DATETIME2   NULL,
    idFacultad   VARCHAR(45) NOT NULL,
    CONSTRAINT PK_Carrera PRIMARY KEY (idCarrera)
);
GO

CREATE TABLE Clase (
    idClase              VARCHAR(45) NOT NULL,
    codigo               VARCHAR(45) NULL,
    nombre               VARCHAR(100) NULL,
    unidadesValorativas  INT         NULL,
    createdAt            DATETIME2   NULL,
    updatedAt            DATETIME2   NULL,
    idFacultad           VARCHAR(45) NOT NULL,
    CONSTRAINT PK_Clase PRIMARY KEY (idClase)
);
GO

CREATE TABLE [User] (
    idUser                VARCHAR(45) NOT NULL,
    idRole                VARCHAR(45) NOT NULL,
    correoInstitucional   VARCHAR(45) NULL,
    passwordHash          VARCHAR(100) NULL,
    failedLoginAttempts   INT         NULL,
    lockedUntil           DATETIME2   NULL,
    NombreCompleto        VARCHAR(100) NULL,
    codigoInstitucional   VARCHAR(45) NULL,
    createdAt             DATETIME2   NULL,
    updatedAt             DATETIME2   NULL,
	estado	              VARCHAR(45) NULL,
    CONSTRAINT PK_User PRIMARY KEY (idUser)
);
GO

CREATE TABLE PlantillaMalla (
    idPlantillaMalla    VARCHAR(45)   NOT NULL,
    idCarrera           VARCHAR(45)   NOT NULL,
    nombre              VARCHAR(45)   NULL,
    version             DECIMAL(10,2) NULL,
    activa              BIT           NULL,
    plantillaOrigenId   VARCHAR(45)   NOT NULL,  -- auto-referencia (misma tabla)
    createdAt           DATETIME2     NULL,
    updatedAt           DATETIME2     NULL,
    CONSTRAINT PK_PlantillaMalla PRIMARY KEY (idPlantillaMalla)
);
GO

CREATE TABLE PlantillaMalla_has_Clase (
    idPlantillaMalla_has_Clase   VARCHAR(45) NOT NULL,
    idPlantillaMalla             VARCHAR(45) NOT NULL,
    idClase                      VARCHAR(45) NOT NULL,
    Posicion_idPosicion          VARCHAR(45) NOT NULL,
    obligatoria                  BIT         NULL,
    estado                       VARCHAR(45) NULL,
    createdAt                    DATETIME2   NULL,
    updatedAt                    DATETIME2   NULL,
    CONSTRAINT PK_PlantillaMalla_has_Clase PRIMARY KEY
        (idPlantillaMalla_has_Clase, idPlantillaMalla, idClase)
);
GO

CREATE TABLE Requisito (
    idRequisito                   VARCHAR(45) NOT NULL,
    tipoRequisito                 VARCHAR(1)  NULL,
    createdAt                     DATETIME2   NULL,
    updatedAt                     DATETIME2   NULL,
    idPlantillaMalla_has_Clase    VARCHAR(45) NOT NULL,
    idClaseRequisito              VARCHAR(45) NOT NULL,
    CONSTRAINT PK_Requisito PRIMARY KEY (idRequisito)
);
GO

-- HU-03-03/HU-03-04: las columnas libres "periodo" (string "AAAA-P") y
-- "anno" se reemplazan por la FK idperiodo -> periodo(idperiodo), NOT
-- NULL: el año ya vive en periodo.anno, así que repetirlo por fila era
-- redundante y podía desincronizarse del período real.
--
-- ADVERTENCIA DE DESPLIEGUE: si la base ya tiene filas en
-- HistorialAcademico (no es el caso del entorno local db_simula_local,
-- que estaba vacía al aplicar este cambio), agregar idperiodo como NOT
-- NULL requiere primero crearla NULL, hacer el backfill (idperiodo
-- correspondiente a cada combinación anno/periodo existente) y solo
-- entonces aplicar el NOT NULL + la FK, antes de eliminar periodo/anno.
-- Ver backend/prisma/migrations/proposed/2026-09-08_periodo.sql.
CREATE TABLE HistorialAcademico (
    idHistorialAcademico         VARCHAR(45) NOT NULL,
    idUser                       VARCHAR(45) NOT NULL,
    nota                         VARCHAR(45) NULL,
    origen                       VARCHAR(45) NULL,
    estado                       VARCHAR(45) NULL,
    createdAt                    DATETIME2   NULL,
    updatedAt                    DATETIME2   NULL,
    idPlantillaMalla_has_Clase   VARCHAR(45) NOT NULL,
    idperiodo                    VARCHAR(45) NOT NULL,
    CONSTRAINT PK_HistorialAcademico PRIMARY KEY (idHistorialAcademico)
);
GO

CREATE TABLE [Session] (
    idSession          VARCHAR(45) NOT NULL,
    idUser             VARCHAR(45) NOT NULL,
    refresTokenHash    VARCHAR(64) NULL,
    userAgent          VARCHAR(45) NULL,
    expiresAt          DATETIME2   NULL,
    revokedAt          DATETIME2   NULL,
    createdAt          DATETIME2   NULL,
    CONSTRAINT PK_Session PRIMARY KEY (idSession)
);
GO

CREATE TABLE PlantillaMalla_has_User (
    idPlantillaMalla   VARCHAR(45) NOT NULL,
    idUser             VARCHAR(45) NOT NULL,
    estado             VARCHAR(45) NULL,
    createAt           VARCHAR(45) NULL,
    CONSTRAINT PK_PlantillaMalla_has_User PRIMARY KEY (idPlantillaMalla, idUser)
);
GO

-- HU-03-03 (AC5): auditoría GENÉRICA, reutilizable para cualquier tabla
-- (no solo periodo). Por ahora el único productor de filas es el cambio
-- de estado de un período (entidad = 'periodo', idEntidad = idperiodo,
-- campo = 'estado'), pero el diseño no está atado a esa tabla: para
-- auditar otra tabla en el futuro basta con insertar con otro valor de
-- "entidad", sin cambiar el esquema.
--
-- NOTA: por ser genérica, idEntidad es polimórfico (puede apuntar a la PK
-- de cualquier tabla según "entidad") y por lo tanto NO lleva FK propia;
-- se sacrifica esa integridad referencial a cambio de poder reutilizar la
-- tabla sin migraciones nuevas cada vez que se audite una tabla distinta.
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

-- =====================================================================
-- 4) RESTRICCIONES UNIQUE ADICIONALES REQUERIDAS PARA LAS FKs
--    (necesarias porque Requisito e HistorialAcademico referencian
--     solo una parte de la PK compuesta de PlantillaMalla_has_Clase)
-- =====================================================================

ALTER TABLE PlantillaMalla_has_Clase
    ADD CONSTRAINT UQ_PlantillaMalla_has_Clase_id UNIQUE (idPlantillaMalla_has_Clase);
GO

-- HU-03-03 (AC4): no se deben duplicar períodos con la misma combinación
-- de año y período académico.
ALTER TABLE periodo
    ADD CONSTRAINT UQ_periodo_anno_periodo UNIQUE (anno, periodo);
GO

-- =====================================================================
-- 5) FOREIGN KEYS (todas al final; el orden ya no importa porque
--    todas las tablas referenciadas ya existen)
-- =====================================================================

ALTER TABLE Carrera
    ADD CONSTRAINT fk_Carrera_Facultad1
    FOREIGN KEY (idFacultad) REFERENCES Facultad (idFacultad);
GO

ALTER TABLE Clase
    ADD CONSTRAINT fk_Clase_Facultad1
    FOREIGN KEY (idFacultad) REFERENCES Facultad (idFacultad);
GO

ALTER TABLE [User]
    ADD CONSTRAINT fk_User_Role1
    FOREIGN KEY (idRole) REFERENCES Role (idRole);
GO

ALTER TABLE PlantillaMalla
    ADD CONSTRAINT fk_PlantillaMalla_Carrera1
    FOREIGN KEY (idCarrera) REFERENCES Carrera (idCarrera);
GO

ALTER TABLE PlantillaMalla
    ADD CONSTRAINT fk_PlantillaMalla_PlantillaMalla1
    FOREIGN KEY (plantillaOrigenId) REFERENCES PlantillaMalla (idPlantillaMalla);
GO

ALTER TABLE PlantillaMalla_has_Clase
    ADD CONSTRAINT fk_PlantillaMalla_has_Clase_PlantillaMalla1
    FOREIGN KEY (idPlantillaMalla) REFERENCES PlantillaMalla (idPlantillaMalla);
GO

ALTER TABLE PlantillaMalla_has_Clase
    ADD CONSTRAINT fk_PlantillaMalla_has_Clase_Clase1
    FOREIGN KEY (idClase) REFERENCES Clase (idClase);
GO

ALTER TABLE PlantillaMalla_has_Clase
    ADD CONSTRAINT fk_PlantillaMalla_has_Clase_Posicion1
    FOREIGN KEY (Posicion_idPosicion) REFERENCES Posicion (idPosicion);
GO

ALTER TABLE Requisito
    ADD CONSTRAINT fk_Requisito_PlantillaMalla_has_Clase1
    FOREIGN KEY (idPlantillaMalla_has_Clase) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

ALTER TABLE Requisito
    ADD CONSTRAINT fk_Requisito_PlantillaMalla_has_Clase2
    FOREIGN KEY (idClaseRequisito) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

ALTER TABLE HistorialAcademico
    ADD CONSTRAINT fk_HistorialAcademico_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

ALTER TABLE HistorialAcademico
    ADD CONSTRAINT fk_HistorialAcademico_PlantillaMalla_has_Clase1
    FOREIGN KEY (idPlantillaMalla_has_Clase) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

ALTER TABLE HistorialAcademico
    ADD CONSTRAINT fk_HistorialAcademico_periodo1
    FOREIGN KEY (idperiodo) REFERENCES periodo (idperiodo);
GO

ALTER TABLE Auditoria
    ADD CONSTRAINT fk_Auditoria_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

ALTER TABLE Session
    ADD CONSTRAINT fk_Session_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

ALTER TABLE PlantillaMalla_has_User
    ADD CONSTRAINT fk_PlantillaMalla_has_User_PlantillaMalla1
    FOREIGN KEY (idPlantillaMalla) REFERENCES PlantillaMalla (idPlantillaMalla);
GO

ALTER TABLE PlantillaMalla_has_User
    ADD CONSTRAINT fk_PlantillaMalla_has_User_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */