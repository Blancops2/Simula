/* =====================================================================
   PROPUESTA DE CAMBIO DE DATOS — PENDIENTE DE APROBACIÓN PARA AZURE. NO
   APLICADA AHÍ. (Sí se aplicó, con consentimiento explícito, contra el
   entorno local de desarrollo db_simula_local el 2026-10-19 — ver
   backend/.env y DB/DML.sql, que ya incluye esta fila. Se ejecutó sin la
   línea USE y sin los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU "Cargar historial desde PDF", guardado de equivalencias, ver
   docs/subir-historial-pdf.md sección 14): las equivalencias (clases
   cursadas en otra institución y acreditadas) no traen año ni período, y
   HistorialAcademico.idperiodo es NOT NULL. Decisión del equipo: en lugar
   de cambiar el esquema, se crea un período reservado, con año "0000",
   que es el período por defecto de las clases que no traen el suyo.

   Fila nueva en periodo:
     idperiodo     'PER-0000-0'    (mismo formato que los demás: PER-AAAA-P)
     anno          '0000'          (así lo identifica la aplicación:
                                    common/periodo-sin-periodo.ts)
     periodo       '0'
     estado        'deshabilitado' (nunca seleccionable para simular)
     FechaInicio   NULL, fechaFin NULL (no es un período del calendario)
     periodoActual 0

   La aplicación no lo lista al administrador y rechaza editarlo,
   habilitarlo o marcarlo como actual (PeriodoService). Tampoco se puede
   crear otro igual desde la API: los DTO exigen año entre 2000 y 2100.

   Sin cambio de esquema. No afecta filas existentes. Idempotente: no
   inserta si ya existe un período con año '0000'.

   Contenido:
     1) INSERT INTO periodo ... ('PER-0000-0', '0', '0000', 'deshabilitado', ...)
   ===================================================================== */

USE [db-simula];
GO

IF NOT EXISTS (SELECT 1 FROM periodo WHERE anno = '0000')
    INSERT INTO periodo (idperiodo, periodo, anno, estado, FechaInicio, fechaFin, createdAt, updatedAt, periodoActual)
    VALUES ('PER-0000-0', '0', '0000', 'deshabilitado', NULL, NULL, SYSDATETIME(), SYSDATETIME(), 0);
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
