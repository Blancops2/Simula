/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-13 — ver backend/.env y
   DDL.sql, que ya refleja esta columna. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo (HU-05-06, criterio 4): la duración de cada simulación y su
   resultado deben quedar registrados para diagnóstico. El resultado ya
   está en la tabla (estado EVALUADA / NO_EVALUADA y falla, que ahora
   incluye TIEMPO_EXCEDIDO); la duración quedaba solo en el log del
   backend ("Simulación resultado=... duracionMs=..."). Esta columna la
   guarda junto a la simulación, con el mismo valor que el log, para
   poder consultarla con SQL.

   duracionMs: milisegundos desde que el backend recibe POST
   /estudiante/simulaciones hasta que tiene el resultado (validaciones,
   armado de la estructura, llamada al motor y guardado).
     NULL -- simulaciones previas a esta migración, o la evaluación se
             interrumpió por un error inesperado (estado GENERADA).

   Incremental (ALTER): la tabla Simulacion ya existe (ver
   2026-10-01_simulacion.sql). Columna NULL, así que no afecta filas
   existentes.

   Contenido:
     1) ALTER TABLE Simulacion ADD duracionMs INT NULL
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE Simulacion
    ADD duracionMs INT NULL;
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
