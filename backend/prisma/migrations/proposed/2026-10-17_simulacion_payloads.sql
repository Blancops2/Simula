/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-17 — ver backend/.env y
   DDL.sql, que ya refleja estas columnas. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU de trazabilidad de simulaciones, criterio 1): la solicitud y
   la respuesta del modelo predictivo se guardaban solo desglosadas en
   columnas (estudianteModelo, historialModelo, Simulacion_has_Clase,
   probabilidadAprobarTodo, factores, ...). Eso pierde los campos que el
   modelo devuelva fuera del contrato y, sobre todo, todo el cuerpo cuando
   la respuesta no cumple el contrato (RESPUESTA_INVALIDA) o es un error
   HTTP: justo los casos más útiles al integrar y evaluar el modelo real.

   solicitudJson: el cuerpo exacto enviado (o armado) para POST
   /evaluacion-carga, con los campos de control (versionContrato,
   idSolicitud, fechaSolicitud). El estudiante va seudonimizado
   (contrato v1.3), así que no agrega datos personales nuevos.
     NULL -- NO_CONFIGURADO (no se armó solicitud) y simulaciones previas.
     Con SOLICITUD_INVALIDA se guarda aunque no se haya enviado.

   respuestaJson: el cuerpo tal cual lo devolvió el motor, como texto; si
   el motor respondió algo que no es JSON se guarda igual.
     NULL -- no hubo respuesta que leer (NO_CONFIGURADO,
             SOLICITUD_INVALIDA, timeout o falla de red) y simulaciones
             previas a esta migración.

   Incremental (ALTER): la tabla Simulacion ya existe (ver
   2026-10-01_simulacion.sql). Columnas NULL, así que no afecta filas
   existentes.

   Contenido:
     1) ALTER TABLE Simulacion ADD solicitudJson NVARCHAR(MAX) NULL,
                                   respuestaJson NVARCHAR(MAX) NULL
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE Simulacion
    ADD solicitudJson NVARCHAR(MAX) NULL,
        respuestaJson NVARCHAR(MAX) NULL;
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
