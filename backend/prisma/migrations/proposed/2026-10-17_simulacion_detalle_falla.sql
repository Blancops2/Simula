/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-17 — ver backend/.env y
   DDL.sql, que ya refleja esta columna. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU de trazabilidad de simulaciones, criterio 2): las
   simulaciones fallidas se registran con su tipo de error en "falla",
   pero NO_DISPONIBLE agrupa casos muy distintos (HTTP 400/401/403, 429,
   5xx, caída de red), y en una caída de red o un timeout no queda nada
   más en la fila. Esta columna guarda la misma precisión corta que ya va
   al log del backend, sin datos del estudiante.

   detalleFalla, según "falla":
     NO_DISPONIBLE / CARRERA_NO_SOPORTADA
                         -- "HTTP <estado>[ <error.codigo del motor>]" o
                            "red: <motivo>".
     TIEMPO_EXCEDIDO     -- "sin respuesta en <ms> ms".
     SOLICITUD_INVALIDA / RESPUESTA_INVALIDA
                         -- "contrato: <reglas que no se cumplen>"
                            (ruta y regla, nunca valores).
     ERROR_INTERNO       -- tipo del error de SIMULA (y código de Prisma si
                            lo hay), sin el mensaje.
     NULL                -- NO_CONFIGURADO, EVALUADA y simulaciones previas.
   Se recorta a 255 caracteres.

   Además, "falla" admite un valor nuevo, ERROR_INTERNO: un error de SIMULA
   después de crear la simulación (antes la fila quedaba en GENERADA sin
   falla). Es VARCHAR(45), así que no requiere cambio de esquema.

   Incremental (ALTER): la tabla Simulacion ya existe (ver
   2026-10-01_simulacion.sql). Columna NULL, así que no afecta filas
   existentes.

   Contenido:
     1) ALTER TABLE Simulacion ADD detalleFalla VARCHAR(255) NULL
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE Simulacion
    ADD detalleFalla VARCHAR(255) NULL;
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
