/* =====================================================================
   PROPUESTA DE MIGRACIÓN — PENDIENTE DE APROBACIÓN PARA AZURE. NO APLICADA
   AHÍ. (Sí se aplicó, con consentimiento explícito, contra el entorno
   local de desarrollo db_simula_local el 2026-10-13 — ver backend/.env y
   DDL.sql, que ya refleja esta columna. Se ejecutó sin la línea USE y sin
   los GO, con prisma db execute.)

   NO ejecutar contra la base de datos real (Azure) sin autorización
   explícita del ingeniero a cargo (política de este proyecto: ver
   prompt_agente_simula.md).

   Motivo: trazabilidad del origen de la respuesta del modelo predictivo.
   El mock (mock-modelo-predictivo/servidor.mjs) marca cada respuesta con
   "source": "mock" y la cabecera X-Source: mock; el backend la normaliza y
   la guarda junto a la simulación, para distinguir después qué resultados
   salieron del mock y cuáles del modelo real.

   Valores de origenModelo:
     'mock'   -- la respuesta venía marcada por el mock.
     'modelo' -- respuesta sin marca: se asume del modelo real.
     NULL     -- no hubo respuesta que leer (modelo sin configurar,
                 solicitud que no cumplió el contrato y no se envió,
                 timeout o falla de red) y simulaciones previas a esta
                 migración.

   Incremental (ALTER): la tabla Simulacion ya existe (ver
   2026-10-01_simulacion.sql). Columna NULL, así que no afecta filas
   existentes.

   Contenido:
     1) ALTER TABLE Simulacion ADD origenModelo VARCHAR(45) NULL
   ===================================================================== */

USE [db-simula];
GO

ALTER TABLE Simulacion
    ADD origenModelo VARCHAR(45) NULL;
GO

/* =====================================================================
   FIN DEL SCRIPT
   ===================================================================== */
