/* =====================================================================
   SCRIPT DML - SQL Server 2022
   Base de datos: db-simula
   Generado a partir de:
     - DDL.sql (estructura de tablas)
     - Plan de estudios / Perfil de la carrera de Ingenieria en Sistemas
       Computacionales (UNAH), ultima revision Marzo 2026.

   ORDEN DE INSERCION (respeta las FKs definidas en el DDL):
     1) Facultad                (sin FK)
     2) Role                    (sin FK)
     3) Posicion                (sin FK) -> placeholder + 1 fila propia por clase, ver nota
     4) Carrera                 (FK -> Facultad)
     5) Clase                   (FK -> Facultad)
     6) [User]                  (FK -> Role)
     7) PlantillaMalla          (FK -> Carrera, FK -> si misma)
     8) PlantillaMalla_has_Clase(FK -> PlantillaMalla, Clase, Posicion)
     9) Requisito                (FK -> PlantillaMalla_has_Clase x2)
    10) PlantillaMalla_has_User (FK -> PlantillaMalla, [User])
    11) [Session]                (FK -> [User])

   NOTA TECNICA IMPORTANTE (Posicion):
     Originalmente Posicion solo tenia 1 fila "placeholder" (POS-DEFAULT,
     con posX/posY/nivel en NULL) y las 50 filas de PlantillaMalla_has_Clase
     apuntaban TODAS a esa misma fila, solo para satisfacer la FK NOT NULL.
     Esto causaba un bug real: al guardar la posicion de UNA clase desde el
     editor visual (canvas), se sobreescribia esa unica fila compartida y
     por lo tanto la posicion de las otras 49 clases tambien cambiaba.

     Se corrigio con un backfill (ver backend/prisma/backfill-posiciones.ts,
     corrido contra la BD real) que crea una fila de Posicion INDIVIDUAL por
     cada clase y actualiza su Posicion_idPosicion para que ya no comparta
     con ninguna otra. La fila POS-DEFAULT se dejo intacta (huerfana, sin
     que ninguna clase la referencie) por si algun proceso viejo aun la
     espera. Las 50 filas nuevas insertadas abajo (seccion 3) y los valores
     de Posicion_idPosicion en PlantillaMalla_has_Clase (seccion 8) ya
     reflejan el resultado real de ese backfill, no datos inventados aqui.
     Todas quedaron con nivel=1 como valor temporal: el nivel real de cada
     clase se debe ajustar desde el editor (drag, "Auto-ordenar por nivel"
     o el campo nivel del modal de edicion).

   NOTA: La tabla HistorialAcademico se omite por completo (nadie la
   referencia via FK, por lo que no afecta la integridad del script).

   NOTA SOBRE OPTATIVAS SIN CODIGO PROPIO:
     El plan de estudios incluye espacios de "Optativa II: Campo de las
     Humanidades", "Optativa III: Campo de las Artes y del Deporte",
     "Optativa IV: Campo de las Ciencias Naturales" y la "Practica
     Profesional Supervisada". Estos NO son asignaturas fijas con un
     codigo unico en el pensum: representan una categoria/apartado
     dentro del cual el estudiante elige la asignatura especifica que
     cursara (p. ej. dentro de "Artes y del Deporte" podria elegir
     Musica, Pintura, Futbol, etc., cada una con su propio codigo real
     que no aparece en este documento fuente).
     Por esa razon NO se insertaron como filas de Clase ni de
     PlantillaMalla_has_Clase en este script: asignarles un codigo
     generico e inventado seria incorrecto, ya que ocultaria que en
     realidad son un catalogo de opciones y no una asignatura concreta.
     Si mas adelante se define el catalogo real de asignaturas
     electivas por categoria (con sus codigos oficiales), se pueden
     insertar como Clase normales y enlazarlas a PlantillaMalla_has_Clase
     igual que el resto de asignaturas del pensum. La "Optativa I:
     Campo de las Lenguas Extranjeras (Ingles I)" SI se incluyo, porque
     en este caso el documento fuente le asigna codigo IN-101 y equivale
     en la practica a una asignatura concreta.
   ===================================================================== */

USE [db-simula];
GO

-- =====================================================================
-- 1) FACULTAD
-- =====================================================================
INSERT INTO Facultad (idFacultad, nombre, descripcion, codigo, estado, createdAt, updatedAt)
VALUES ('FAC-ING', 'Facultad de Ingenieria', 'Facultad de Ingenieria - UNAH', 'FI', 'activo', SYSDATETIME(), SYSDATETIME());
GO

-- =====================================================================
-- 2) ROLE
-- =====================================================================
INSERT INTO Role (idRole, nombre, descripcion, estado, createdAt, updatedAt) VALUES
('ROL-EST', 'Estudiante',    'Usuario estudiante del sistema',    'activo', SYSDATETIME(), SYSDATETIME()),
('ROL-ADM', 'Administrador', 'Usuario administrador del sistema', 'activo', SYSDATETIME(), SYSDATETIME());
GO

-- =====================================================================
-- 3) POSICION
--    POS-DEFAULT: placeholder original, ver nota tecnica arriba. Ya no la
--    referencia ninguna clase (queda huerfana a proposito).
--    Las 50 filas siguientes son el resultado real del backfill corrido
--    contra la BD (backend/prisma/backfill-posiciones.ts): una fila propia
--    por cada PlantillaMalla_has_Clase, nivel=1 temporal en todas.
-- =====================================================================
INSERT INTO Posicion (idPosicion, posX, posY, nivel)
VALUES ('POS-DEFAULT', NULL, NULL, NULL);
GO

INSERT INTO Posicion (idPosicion, posX, posY, nivel) VALUES
('0072b064-a951-4f56-8b86-c786f580ff7a', '1820', '750', 1),
('071ecd36-ea86-443b-b6ee-4ff7d57b909a', '0', '900', 1),
('0ef962b0-bccd-4157-b800-3c5b66037c5e', '1820', '450', 1),
('10b21630-6f96-465e-9e67-e120d1926e48', '1040', '600', 1),
('1468c0a8-a69b-4867-9507-0c88fa6cf677', '260', '600', 1),
('1e543653-d530-4806-99fb-3b4bf83b2659', '1560', '0', 1),
('28d3eb22-2670-4211-9409-bfdd4c2a608d', '0', '150', 1),
('34c00d1a-be03-4090-bb38-05e5506875ba', '260', '0', 1),
('39e6e976-81c0-4df5-9c41-505b484bcd80', '260', '300', 1),
('4b428fbe-8cc5-4a38-8320-78632ebbb459', '1300', '150', 1),
('4d0c23e5-1f66-4207-9910-858716786f65', '1040', '750', 1),
('4f24194f-648d-4293-81b9-cfc822003407', '1300', '600', 1),
('56ec6c8d-44dc-41bb-955b-3c95c4b8654d', '1560', '600', 1),
('58071ef9-63cd-4d1e-be4c-7580d9da293e', '1820', '300', 1),
('5f05acbe-a87d-4e4c-9513-cadfbdca5191', '1300', '0', 1),
('64818295-158c-4d75-8581-df71cb7f1d50', '1040', '0', 1),
('6f641342-7bf4-4624-98ca-007ed3b01afe', '1560', '450', 1),
('733df49a-98e6-43c3-bc93-9f6273436c6a', '780', '300', 1),
('7407ef0c-f052-4671-a3bd-f1edfb4af979', '0', '750', 1),
('78ed08cb-215a-40e8-9f63-976471c5cea0', '520', '750', 1),
('7b4221c9-a236-457b-8dc7-62dee8c89645', '780', '150', 1),
('7d15453a-2e7e-4ac2-a4a3-a16647ff6683', '520', '150', 1),
('84cf5bc3-f5d5-47d3-98ea-b78017b43e1f', '0', '600', 1),
('87c3f2a8-c731-46ce-8636-469e48f441eb', '1040', '300', 1),
('8ae92c69-c9b2-4fa8-934c-a31bab82ac74', '520', '0', 1),
('925d2a8d-e433-4e81-85a1-994faea7b91a', '1040', '150', 1),
('9b79e230-2a69-4db2-ad3d-da2a30d84951', '260', '900', 1),
('a03a7cd4-d706-4d12-9261-bfb989c20648', '1300', '750', 1),
('a324786a-b3de-488e-be53-40036822228a', '1560', '750', 1),
('a761ca64-c9d1-43a6-9bd0-f798e7a49fc0', '1820', '0', 1),
('a9ee4632-1dc2-4298-a936-53d334d1a995', '0', '300', 1),
('aeda551e-c2dd-47bf-b983-63fc39cc3e1b', '1040', '450', 1),
('ba4bd47a-e205-4456-9dbe-2ad4463e91b9', '520', '300', 1),
('bc35bde9-c802-46ad-adcc-e3de1a7aef4a', '260', '450', 1),
('bfdd937d-b75a-476a-855e-a8d3e46fd6ee', '260', '750', 1),
('c7e26d3f-df2e-4b1d-a2a0-3447de634303', '1300', '450', 1),
('c9232a80-10c3-456a-b851-d32a1b817fdc', '260', '150', 1),
('d16381dc-8955-4115-b41c-4a3ea444400d', '0', '0', 1),
('d4d644e9-99c7-4417-977a-b00bdfc52a2d', '1560', '300', 1),
('dbb89886-c800-41ef-b5e2-a5751cdcc522', '1560', '150', 1),
('defe598f-5b4c-4f31-9425-895bed752e76', '780', '750', 1),
('e1ab3ac2-8922-4cf0-8291-4ff1d75dc48f', '780', '0', 1),
('e1bc6a3f-077f-4833-9a54-aaf49e53ded9', '520', '600', 1),
('e36bb8ca-4136-40ef-ac96-579fb91fc0a7', '780', '600', 1),
('f80efe14-3e83-44ba-9c9d-62357242fa49', '520', '450', 1),
('f9d80cf6-3722-4366-ac0c-282aebdd7d4b', '1820', '150', 1),
('fb21b0d2-748e-4796-b1a4-b118bd064847', '780', '450', 1),
('fcf6cb84-b2be-434c-b43b-6a782805c88f', '1300', '300', 1),
('fd8f52b9-6395-44d6-b2c4-30fc82bb2cd5', '0', '450', 1),
('fe46b6c7-9c13-49b5-8f9e-4fa2f9d51569', '1820', '600', 1);
GO

-- =====================================================================
-- 4) CARRERA
-- =====================================================================
INSERT INTO Carrera (idCarrera, nombre, codigo, createdAt, updatedAt, idFacultad)
VALUES ('CAR-ISC', 'Ingenieria en Sistemas Computacionales', 'ISC', SYSDATETIME(), SYSDATETIME(), 'FAC-ING');
GO

-- =====================================================================
-- 5) CLASE  (asignaturas del plan de estudios)
-- =====================================================================
INSERT INTO Clase (idClase, codigo, nombre, unidadesValorativas, createdAt, updatedAt, idFacultad) VALUES
('CL-ISC101', 'ISC-101', 'Introduccion a la Ingenieria en Sistemas Computacionales', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-EG011', 'EG-011', 'Espanol General', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM110', 'MM-110', 'Matematica I', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-SC101', 'SC-101', 'Sociologia', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-IN101', 'IN-101', 'Optativa I: Campo de las Lenguas Extranjeras (Ingles I)', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC102', 'ISC-102', 'Programacion Estructurada', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-FF101', 'FF-101', 'Filosofia', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM111', 'MM-111', 'Geometria y Trigonometria', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-IN102', 'IN-102', 'Ingles II', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC103', 'ISC-103', 'Programacion Orientada a Objetos', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM201', 'MM-201', 'Calculo I', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM211', 'MM-211', 'Vectores y Matrices', 3, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-IN103', 'IN-103', 'Ingles III', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM420', 'MM-420', 'Matematica Discreta', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM202', 'MM-202', 'Calculo II', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-FS100', 'FS-100', 'Fisica I', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-HH101', 'HH-101', 'Historia de Honduras', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC204', 'ISC-204', 'Paradigmas de Programacion', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-MM401', 'MM-401', 'Estadistica I', 3, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-FS200', 'FS-200', 'Fisica II', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC211', 'ISC-211', 'Estructuras de Datos', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-AGE102', 'AGE-102', 'Administracion', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-IE326', 'IE-326', 'Instalaciones Electricas para Centros de Datos', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC321', 'ISC-321', 'Fundamentos de Base de Datos', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC351', 'ISC-351', 'Contabilidad Financiera', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC331', 'ISC-331', 'Redes de Datos I', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC333', 'ISC-333', 'Sistemas Operativos I', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC312', 'ISC-312', 'Teoria de la Computacion', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC341', 'ISC-341', 'Sistemas de Informacion', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC332', 'ISC-332', 'Redes de Datos II', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC334', 'ISC-334', 'Sistemas Operativos II', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC305', 'ISC-305', 'Programacion Web', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC313', 'ISC-313', 'Compiladores', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC306', 'ISC-306', 'Analisis de Requerimientos', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC336', 'ISC-336', 'Diseno Digital', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC407', 'ISC-407', 'Programacion Movil', 5, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC414', 'ISC-414', 'Inteligencia Artificial', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC435', 'ISC-435', 'Administracion de Servidores', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC437', 'ISC-437', 'Arquitectura de Computadoras', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC408', 'ISC-408', 'Ingenieria del Software', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC422', 'ISC-422', 'Administracion de Base de Datos', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC442', 'ISC-442', 'Seguridad Informatica', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC443', 'ISC-443', 'Industria de TI', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC409', 'ISC-409', 'Calidad de Software', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC423', 'ISC-423', 'Ciencia de Datos', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC415', 'ISC-415', 'Tecnologias Emergentes', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC445', 'ISC-445', 'Proyectos de TI', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC552', 'ISC-552', 'Seminario de Investigacion', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC544', 'ISC-544', 'Auditoria Informatica', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING'),
('CL-ISC546', 'ISC-546', 'Ejecucion de Proyectos de TI', 4, SYSDATETIME(), SYSDATETIME(), 'FAC-ING');
GO

-- =====================================================================
-- 6) [USER]  (2 estudiantes + 2 administradores)
--    Estudiantes:   nombre.apellido@unah.hn
--    Administradores: nombre.apellido@unah.edu.hn
-- =====================================================================
INSERT INTO [User] (idUser, idRole, correoInstitucional, passwordHash, failedLoginAttempts, lockedUntil, NombreCompleto, codigoInstitucional, createdAt, updatedAt) VALUES
('USR-EST-001', 'ROL-EST', 'juan.perez@unah.hn',       '$2b$12$khkEWIBeY4zoUZQc71LZYOSihJJ5YEjfSefV.iszZ2W6eFMax94eK', 0, NULL, 'Juan Perez',       '20211000123', SYSDATETIME(), SYSDATETIME()),
('USR-EST-002', 'ROL-EST', 'maria.lopez@unah.hn',      '$2b$12$khkEWIBeY4zoUZQc71LZYOSihJJ5YEjfSefV.iszZ2W6eFMax94eK', 0, NULL, 'Maria Lopez',      '20211000456', SYSDATETIME(), SYSDATETIME()),
('USR-ADM-001', 'ROL-ADM', 'carlos.rodriguez@unah.edu.hn', '$2b$12$CyeJkJQ0QQGs3iu7Wk.Gpe/NQ/cE3z1w6o1cp1hz7N.BhSNf1cOdW', 0, NULL, 'Carlos Rodriguez', 'ADM-001', SYSDATETIME(), SYSDATETIME()),
('USR-ADM-002', 'ROL-ADM', 'ana.martinez@unah.edu.hn',     '$2b$12$CyeJkJQ0QQGs3iu7Wk.Gpe/NQ/cE3z1w6o1cp1hz7N.BhSNf1cOdW', 0, NULL, 'Ana Martinez',     'ADM-002', SYSDATETIME(), SYSDATETIME());
GO

-- =====================================================================
-- 7) PLANTILLAMALLA
--    plantillaOrigenId es NOT NULL y se autorreferencia: al ser la
--    plantilla original, apunta a si misma (valido porque la FK se
--    valida al terminar el INSERT, cuando la fila ya existe).
-- =====================================================================
INSERT INTO PlantillaMalla (idPlantillaMalla, idCarrera, nombre, version, activa, plantillaOrigenId, createdAt, updatedAt)
VALUES ('PM-ISC-2026', 'CAR-ISC', 'Malla Curricular ISC 2026', 1.00, 1, 'PM-ISC-2026', SYSDATETIME(), SYSDATETIME());
GO

-- =====================================================================
-- 8) PLANTILLAMALLA_HAS_CLASE
--    Une cada asignatura del plan a la malla. obligatoria = 1 para todas
--    (el plan no distingue optativas en las clases que si tienen codigo).
-- =====================================================================
INSERT INTO PlantillaMalla_has_Clase (idPlantillaMalla_has_Clase, idPlantillaMalla, idClase, Posicion_idPosicion, obligatoria, estado, createdAt, updatedAt) VALUES
('PMHC-ISC101', 'PM-ISC-2026', 'CL-ISC101', '7d15453a-2e7e-4ac2-a4a3-a16647ff6683', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-EG011', 'PM-ISC-2026', 'CL-EG011', '34c00d1a-be03-4090-bb38-05e5506875ba', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM110', 'PM-ISC-2026', 'CL-MM110', '78ed08cb-215a-40e8-9f63-976471c5cea0', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-SC101', 'PM-ISC-2026', 'CL-SC101', '9b79e230-2a69-4db2-ad3d-da2a30d84951', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-IN101', 'PM-ISC-2026', 'CL-IN101', 'a761ca64-c9d1-43a6-9bd0-f798e7a49fc0', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC102', 'PM-ISC-2026', 'CL-ISC102', '7b4221c9-a236-457b-8dc7-62dee8c89645', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-FF101', 'PM-ISC-2026', 'CL-FF101', '8ae92c69-c9b2-4fa8-934c-a31bab82ac74', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM111', 'PM-ISC-2026', 'CL-MM111', 'defe598f-5b4c-4f31-9425-895bed752e76', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-IN102', 'PM-ISC-2026', 'CL-IN102', '28d3eb22-2670-4211-9409-bfdd4c2a608d', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC103', 'PM-ISC-2026', 'CL-ISC103', '925d2a8d-e433-4e81-85a1-994faea7b91a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM201', 'PM-ISC-2026', 'CL-MM201', '4d0c23e5-1f66-4207-9910-858716786f65', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM211', 'PM-ISC-2026', 'CL-MM211', 'a324786a-b3de-488e-be53-40036822228a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-IN103', 'PM-ISC-2026', 'CL-IN103', 'c9232a80-10c3-456a-b851-d32a1b817fdc', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM420', 'PM-ISC-2026', 'CL-MM420', '071ecd36-ea86-443b-b6ee-4ff7d57b909a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM202', 'PM-ISC-2026', 'CL-MM202', 'a03a7cd4-d706-4d12-9261-bfb989c20648', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-FS100', 'PM-ISC-2026', 'CL-FS100', 'e1ab3ac2-8922-4cf0-8291-4ff1d75dc48f', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-HH101', 'PM-ISC-2026', 'CL-HH101', '5f05acbe-a87d-4e4c-9513-cadfbdca5191', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC204', 'PM-ISC-2026', 'CL-ISC204', '4b428fbe-8cc5-4a38-8320-78632ebbb459', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-MM401', 'PM-ISC-2026', 'CL-MM401', '0072b064-a951-4f56-8b86-c786f580ff7a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-FS200', 'PM-ISC-2026', 'CL-FS200', '64818295-158c-4d75-8581-df71cb7f1d50', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC211', 'PM-ISC-2026', 'CL-ISC211', 'dbb89886-c800-41ef-b5e2-a5751cdcc522', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-AGE102', 'PM-ISC-2026', 'CL-AGE102', 'd16381dc-8955-4115-b41c-4a3ea444400d', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-IE326', 'PM-ISC-2026', 'CL-IE326', '1e543653-d530-4806-99fb-3b4bf83b2659', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC321', 'PM-ISC-2026', 'CL-ISC321', '733df49a-98e6-43c3-bc93-9f6273436c6a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC351', 'PM-ISC-2026', 'CL-ISC351', 'f80efe14-3e83-44ba-9c9d-62357242fa49', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC331', 'PM-ISC-2026', 'CL-ISC331', '87c3f2a8-c731-46ce-8636-469e48f441eb', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC333', 'PM-ISC-2026', 'CL-ISC333', 'd4d644e9-99c7-4417-977a-b00bdfc52a2d', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC312', 'PM-ISC-2026', 'CL-ISC312', '39e6e976-81c0-4df5-9c41-505b484bcd80', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC341', 'PM-ISC-2026', 'CL-ISC341', 'bc35bde9-c802-46ad-adcc-e3de1a7aef4a', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC332', 'PM-ISC-2026', 'CL-ISC332', 'fcf6cb84-b2be-434c-b43b-6a782805c88f', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC334', 'PM-ISC-2026', 'CL-ISC334', '58071ef9-63cd-4d1e-be4c-7580d9da293e', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC305', 'PM-ISC-2026', 'CL-ISC305', 'f9d80cf6-3722-4366-ac0c-282aebdd7d4b', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC313', 'PM-ISC-2026', 'CL-ISC313', 'ba4bd47a-e205-4456-9dbe-2ad4463e91b9', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC306', 'PM-ISC-2026', 'CL-ISC306', 'a9ee4632-1dc2-4298-a936-53d334d1a995', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC336', 'PM-ISC-2026', 'CL-ISC336', 'fd8f52b9-6395-44d6-b2c4-30fc82bb2cd5', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC407', 'PM-ISC-2026', 'CL-ISC407', 'fb21b0d2-748e-4796-b1a4-b118bd064847', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC414', 'PM-ISC-2026', 'CL-ISC414', '6f641342-7bf4-4624-98ca-007ed3b01afe', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC435', 'PM-ISC-2026', 'CL-ISC435', 'e1bc6a3f-077f-4833-9a54-aaf49e53ded9', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC437', 'PM-ISC-2026', 'CL-ISC437', 'e36bb8ca-4136-40ef-ac96-579fb91fc0a7', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC408', 'PM-ISC-2026', 'CL-ISC408', 'aeda551e-c2dd-47bf-b983-63fc39cc3e1b', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC422', 'PM-ISC-2026', 'CL-ISC422', '84cf5bc3-f5d5-47d3-98ea-b78017b43e1f', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC442', 'PM-ISC-2026', 'CL-ISC442', '10b21630-6f96-465e-9e67-e120d1926e48', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC443', 'PM-ISC-2026', 'CL-ISC443', '4f24194f-648d-4293-81b9-cfc822003407', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC409', 'PM-ISC-2026', 'CL-ISC409', 'c7e26d3f-df2e-4b1d-a2a0-3447de634303', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC423', 'PM-ISC-2026', 'CL-ISC423', '1468c0a8-a69b-4867-9507-0c88fa6cf677', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC415', 'PM-ISC-2026', 'CL-ISC415', '0ef962b0-bccd-4157-b800-3c5b66037c5e', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC445', 'PM-ISC-2026', 'CL-ISC445', '56ec6c8d-44dc-41bb-955b-3c95c4b8654d', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC552', 'PM-ISC-2026', 'CL-ISC552', 'bfdd937d-b75a-476a-855e-a8d3e46fd6ee', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC544', 'PM-ISC-2026', 'CL-ISC544', 'fe46b6c7-9c13-49b5-8f9e-4fa2f9d51569', 1, 'activo', SYSDATETIME(), SYSDATETIME()),
('PMHC-ISC546', 'PM-ISC-2026', 'CL-ISC546', '7407ef0c-f052-4671-a3bd-f1edfb4af979', 1, 'activo', SYSDATETIME(), SYSDATETIME());
GO

-- =====================================================================
-- 9) REQUISITO
--    tipoRequisito: 'P' = Prerrequisito (todas las relaciones sembradas son prerrequisitos)
-- =====================================================================
INSERT INTO Requisito (idRequisito, tipoRequisito, createdAt, updatedAt, idPlantillaMalla_has_Clase, idClaseRequisito) VALUES
('REQ-001', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC102', 'PMHC-ISC101'),
('REQ-002', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-IN102', 'PMHC-IN101'),
('REQ-003', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC103', 'PMHC-ISC102'),
('REQ-004', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM201', 'PMHC-MM110'),
('REQ-005', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM201', 'PMHC-MM111'),
('REQ-006', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM211', 'PMHC-MM110'),
('REQ-007', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM211', 'PMHC-MM111'),
('REQ-008', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-IN103', 'PMHC-IN102'),
('REQ-009', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM420', 'PMHC-MM110'),
('REQ-010', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM202', 'PMHC-MM201'),
('REQ-011', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM202', 'PMHC-MM211'),
('REQ-012', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-FS100', 'PMHC-MM211'),
('REQ-013', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC204', 'PMHC-ISC103'),
('REQ-014', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-MM401', 'PMHC-MM202'),
('REQ-015', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-FS200', 'PMHC-FS100'),
('REQ-016', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-FS200', 'PMHC-MM202'),
('REQ-017', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC211', 'PMHC-MM420'),
('REQ-018', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC211', 'PMHC-MM211'),
('REQ-019', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC211', 'PMHC-ISC103'),
('REQ-020', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-AGE102', 'PMHC-MM401'),
('REQ-021', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-IE326', 'PMHC-FS200'),
('REQ-022', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC321', 'PMHC-MM420'),
('REQ-023', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC351', 'PMHC-AGE102'),
('REQ-024', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC331', 'PMHC-IE326'),
('REQ-025', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC333', 'PMHC-ISC211'),
('REQ-026', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC312', 'PMHC-ISC211'),
('REQ-027', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC312', 'PMHC-ISC204'),
('REQ-028', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC341', 'PMHC-ISC351'),
('REQ-029', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC332', 'PMHC-ISC331'),
('REQ-030', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC334', 'PMHC-ISC333'),
('REQ-031', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC305', 'PMHC-ISC321'),
('REQ-032', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC313', 'PMHC-ISC312'),
('REQ-033', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC306', 'PMHC-ISC341'),
('REQ-034', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC306', 'PMHC-ISC321'),
('REQ-035', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC336', 'PMHC-ISC334'),
('REQ-036', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC407', 'PMHC-ISC305'),
('REQ-037', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC414', 'PMHC-ISC313'),
('REQ-038', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC414', 'PMHC-MM401'),
('REQ-039', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC435', 'PMHC-ISC334'),
('REQ-040', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC435', 'PMHC-ISC332'),
('REQ-041', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC437', 'PMHC-ISC336'),
('REQ-042', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC408', 'PMHC-ISC306'),
('REQ-043', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC408', 'PMHC-ISC407'),
('REQ-044', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC422', 'PMHC-ISC321'),
('REQ-045', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC442', 'PMHC-ISC435'),
('REQ-046', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC443', 'PMHC-ISC306'),
('REQ-047', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC409', 'PMHC-ISC408'),
('REQ-048', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC423', 'PMHC-ISC422'),
('REQ-049', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC415', 'PMHC-ISC305'),
('REQ-050', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC415', 'PMHC-ISC437'),
('REQ-051', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC415', 'PMHC-ISC332'),
('REQ-052', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC445', 'PMHC-ISC443'),
('REQ-053', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC445', 'PMHC-ISC442'),
('REQ-054', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC552', 'PMHC-ISC415'),
('REQ-055', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC552', 'PMHC-ISC445'),
('REQ-056', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC552', 'PMHC-ISC423'),
('REQ-057', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC544', 'PMHC-ISC442'),
('REQ-058', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC544', 'PMHC-ISC306'),
('REQ-059', 'P', SYSDATETIME(), SYSDATETIME(), 'PMHC-ISC546', 'PMHC-ISC445');
GO

-- =====================================================================
-- 10) PLANTILLAMALLA_HAS_USER
--     Inscripcion de los 2 usuarios estudiantes a la malla curricular.
-- =====================================================================
INSERT INTO PlantillaMalla_has_User (idPlantillaMalla, idUser, estado, createAt) VALUES
('PM-ISC-2026', 'USR-EST-001', 'activo', CONVERT(VARCHAR(30), SYSDATETIME(), 126)),
('PM-ISC-2026', 'USR-EST-002', 'activo', CONVERT(VARCHAR(30), SYSDATETIME(), 126));
GO

-- =====================================================================
-- 11) [SESSION]
--     Sesiones de ejemplo para los 2 usuarios estudiantes.
-- =====================================================================
INSERT INTO [Session] (idSession, idUser, refresTokenHash, userAgent, expiresAt, revokedAt, createdAt) VALUES
('SES-001', 'USR-EST-001', '$2a$12$examplerefreshtoken01', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', DATEADD(DAY, 7, SYSDATETIME()), NULL, SYSDATETIME()),
('SES-002', 'USR-EST-002', '$2a$12$examplerefreshtoken02', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', DATEADD(DAY, 7, SYSDATETIME()), NULL, SYSDATETIME());
GO

/* =====================================================================
   FIN DEL SCRIPT DML
   No se llenaron (segun instruccion): Posicion (solo 1 fila placeholder
   obligatoria por FK) y HistorialAcademico (omitida por completo).
   ===================================================================== */