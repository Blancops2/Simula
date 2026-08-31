/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN. NO APLICADA.

   NO ejecutar contra la base de datos real sin autorización explícita del
   ingeniero a cargo (política de este proyecto: ver pompt_agente_simula.md).

   Motivo: estudiante.service.ts necesita una tabla para las clases en las
   que un estudiante está inscrito en el período actual. El esquema real
   (DDL.sql / Azure db-simula) no tiene ninguna tabla para esto.

   (HistorialAcademico.estado ya se aplicó — ver DDL.sql.)
   ===================================================================== */

USE [db-simula];
GO

CREATE TABLE Inscripcion (
    idInscripcion               VARCHAR(45) NOT NULL,
    idUser                      VARCHAR(45) NOT NULL,
    idPlantillaMalla_has_Clase  VARCHAR(45) NOT NULL,
    periodo                     VARCHAR(45) NULL,
    createdAt                   DATETIME2   NULL,
    CONSTRAINT PK_Inscripcion PRIMARY KEY (idInscripcion)
);
GO

ALTER TABLE Inscripcion
    ADD CONSTRAINT fk_Inscripcion_User1
    FOREIGN KEY (idUser) REFERENCES [User] (idUser);
GO

ALTER TABLE Inscripcion
    ADD CONSTRAINT fk_Inscripcion_PlantillaMalla_has_Clase1
    FOREIGN KEY (idPlantillaMalla_has_Clase) REFERENCES PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase);
GO

ALTER TABLE Inscripcion
    ADD CONSTRAINT UQ_Inscripcion_User_Clase_Periodo UNIQUE (idUser, idPlantillaMalla_has_Clase, periodo);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
