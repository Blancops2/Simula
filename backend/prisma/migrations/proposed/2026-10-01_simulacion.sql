/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-01 — ver backend/.env y
   DDL.sql, que ya refleja estas tablas. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo: la estructura de entrada del modelo predictivo (estudiante +
   período seleccionado + asignaturas de la carga propuesta) se armaba
   solo en memoria al pulsar "Evaluar carga" y no quedaba guardada. Estas
   tablas la persisten para que la etapa de simulación (llamada al modelo,
   POST /evaluacion-carga del contrato v1.0, ver
   docs/modelo-predictivo/03-decisiones-contrato.md) la consuma desde la
   base de datos, y guardan también el resultado devuelto por el modelo.

   Cada "Evaluar carga" genera una simulación nueva (no se sobrescribe la
   anterior): cada fila es una foto inmutable de la carga en ese momento,
   así queda la traza idSolicitud -> respuesta del modelo.

   Contenido:
     1) CREATE TABLE Simulacion
          -- cabecera: estudiante, período (con su estado al generarla),
             malla, campos de control del contrato, snapshot JSON de los
             bloques "estudiante" e "historial", y el resultado global.
     2) CREATE TABLE Simulacion_has_Clase
          -- una fila por asignatura de la carga (PROPUESTA o INSCRITA), con
             los campos de "cargaAcademica.clases[]" del contrato y el
             resultado del modelo para esa clase.

   Tipos: las listas (prerrequisitos, factores, observaciones) y los
   bloques del contrato se guardan como JSON en NVARCHAR(MAX), según la
   convención del proyecto para payloads de predicciones. Las
   probabilidades (0..1, máx. 2 decimales según el contrato) van en
   DECIMAL(5,4).

   Debe aplicarse DESPUÉS de 2026-09-08_periodo.sql (FK a periodo).
   ===================================================================== */

USE [db-simula];
GO

CREATE TABLE Simulacion (
    idSimulacion               VARCHAR(45)   NOT NULL,
    idUser                     VARCHAR(45)   NOT NULL,
    idperiodo                  VARCHAR(45)   NOT NULL,
    idPlantillaMalla           VARCHAR(45)   NOT NULL,
    -- periodo.estado al momento de generar (siempre 'habilitado': no se
    -- genera una simulación sobre un período que no lo esté).
    estadoPeriodo              VARCHAR(45)   NULL,
    -- GENERADA (estructura lista, aún sin consultar al modelo) ->
    -- EVALUADA (el modelo respondió) | NO_EVALUADA (ver "falla").
    estado                     VARCHAR(45)   NOT NULL,
    nivelSugerido              INT           NULL,
    limiteUnidadesValorativas  INT           NOT NULL,
    totalUnidadesValorativas   INT           NOT NULL,
    -- Campos de control del contrato.
    versionContrato            VARCHAR(45)   NOT NULL,
    idSolicitud                VARCHAR(45)   NOT NULL,
    fechaSolicitud             DATETIME2     NULL,
    -- Snapshot JSON de los bloques "estudiante" e "historial" del contrato.
    estudianteModelo           NVARCHAR(MAX) NOT NULL,
    historialModelo            NVARCHAR(MAX) NOT NULL,
    -- Resultado del modelo (NULL mientras estado = GENERADA).
    versionModelo              VARCHAR(45)   NULL,
    probabilidadAprobarTodo    DECIMAL(5,4)  NULL,
    riesgo                     VARCHAR(45)   NULL,
    observaciones              NVARCHAR(MAX) NULL,
    falla                      VARCHAR(45)   NULL,
    fechaEvaluacion            DATETIME2     NULL,
    createdAt                  DATETIME2     NULL,
    updatedAt                  DATETIME2     NULL,
    CONSTRAINT PK_Simulacion PRIMARY KEY (idSimulacion)
);
GO

CREATE TABLE Simulacion_has_Clase (
    idSimulacion                VARCHAR(45)   NOT NULL,
    idPlantillaMalla_has_Clase  VARCHAR(45)   NOT NULL,
    codigoClase                 VARCHAR(45)   NOT NULL,
    nombreClase                 VARCHAR(100)  NULL,
    unidadesValorativas         INT           NOT NULL,
    nivel                       INT           NOT NULL,
    obligatoria                 BIT           NOT NULL,
    -- PROPUESTA (marcada sin inscribir) | INSCRITA (ya en Inscripcion para
    -- ese período).
    origen                      VARCHAR(45)   NOT NULL,
    prerrequisitos              NVARCHAR(MAX) NOT NULL,
    correquisitos               NVARCHAR(MAX) NOT NULL,
    -- Resultado del modelo para esta clase (NULL si no se evaluó).
    probabilidadAprobacion      DECIMAL(5,4)  NULL,
    riesgo                      VARCHAR(45)   NULL,
    factores                    NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Simulacion_has_Clase PRIMARY KEY (idSimulacion, idPlantillaMalla_has_Clase)
);
GO

-- El modelo cruza su respuesta por codigoClase: una misma simulación no
-- puede llevar la misma asignatura dos veces.
ALTER TABLE Simulacion_has_Clase
    ADD CONSTRAINT UQ_Simulacion_has_Clase_codigo UNIQUE (idSimulacion, codigoClase);
GO

ALTER TABLE Simulacion
    ADD CONSTRAINT UQ_Simulacion_idSolicitud UNIQUE (idSolicitud);
GO

ALTER TABLE Simulacion
    ADD CONSTRAINT fk_Simulacion_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

ALTER TABLE Simulacion
    ADD CONSTRAINT fk_Simulacion_periodo1
    FOREIGN KEY (idperiodo) REFERENCES periodo (idperiodo);
GO

ALTER TABLE Simulacion
    ADD CONSTRAINT fk_Simulacion_PlantillaMalla1
    FOREIGN KEY (idPlantillaMalla) REFERENCES PlantillaMalla (idPlantillaMalla);
GO

ALTER TABLE Simulacion_has_Clase
    ADD CONSTRAINT fk_Simulacion_has_Clase_Simulacion1
    FOREIGN KEY (idSimulacion) REFERENCES Simulacion (idSimulacion);
GO

ALTER TABLE Simulacion_has_Clase
    ADD CONSTRAINT fk_Simulacion_has_Clase_PlantillaMalla_has_Clase1
    FOREIGN KEY (idPlantillaMalla_has_Clase) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
