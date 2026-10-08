# Mock del modelo predictivo (solo pruebas)

El modelo predictivo real se construye **fuera de SIMULA**; el aplicativo solo lo consume por HTTP. Este mock simula ese servicio mientras el modelo real no está listo, para probar el backend y la pantalla de inscripción de punta a punta.

- Implementa el contrato **v1.1** ([docs/modelo-predictivo/03-decisiones-contrato.md](../docs/modelo-predictivo/03-decisiones-contrato.md) + [05-recomendacion-carga.md](../docs/modelo-predictivo/05-recomendacion-carga.md)): `POST /v1/recomendaciones` y `POST /v1/evaluacion-carga`. Solo acepta `versionContrato: "1.1"`.
- Las probabilidades salen de una heurística simple y determinista (misma petición → misma respuesta). **No son predicciones reales.**
- Sin dependencias: un solo archivo, Node ≥ 18. No forma parte del build del backend ni del frontend.

## Uso

```bash
node mock-modelo-predictivo/servidor.mjs
```

En `backend/.env`:

```dotenv
PREDICTIVE_MODEL_URL=http://localhost:4010/v1
```

Reiniciar el backend. Para volver al fallback local, dejar `PREDICTIVE_MODEL_URL` vacía.

### Variables de entorno del mock (opcionales)

| Variable | Defecto | Descripción |
|---|---|---|
| `MOCK_PUERTO` | `4010` | Puerto HTTP. |
| `MOCK_API_KEY` | *(vacía)* | Si tiene valor, exige `Authorization: Bearer <clave>`. Debe coincidir con `PREDICTIVE_MODEL_API_KEY` del backend. |
| `MOCK_ESCENARIO` | `normal` | Escenario inicial (ver abajo). |
| `MOCK_MAX_RECOMENDACIONES` | `5` | Máximo de clases recomendadas. |
| `MOCK_DEMORA_TIMEOUT_MS` | `5000` | Demora del escenario `timeout` (debe superar `PREDICTIVE_MODEL_TIMEOUT_MS`). |

## Escenarios de prueba

Para ver cómo reacciona SIMULA ante fallas del modelo:

| Escenario | Respuesta del mock | Qué debería mostrar SIMULA |
|---|---|---|
| `normal` | 200 con datos | Recomendaciones y evaluación con % y riesgo. |
| `datos_invalidos` | 400 `DATOS_INVALIDOS` | "No disponible" (y `logger.error` en el backend). |
| `no_autorizado` | 401 `NO_AUTORIZADO` | "No disponible" (y `logger.error`). |
| `carrera_no_soportada` | 422 `CARRERA_NO_SOPORTADA` | Evaluación: "El modelo predictivo todavía no cubre tu carrera." |
| `limite_excedido` | 429 con `Retry-After` | "No disponible". |
| `error_interno` | 500 `ERROR_INTERNO` | "No disponible". |
| `timeout` | 200 tras `MOCK_DEMORA_TIMEOUT_MS` | "No disponible" (el backend aborta por timeout). |
| `respuesta_malformada` | 200 sin la forma del contrato | "No disponible". |
| `codigos_fuera_de_lista` | 200 con un código `XX-999` extra | Recomendación "no disponible" (v1.1: el backend invalida la respuesta completa). |

Cambiar el escenario sin reiniciar (afecta a todas las peticiones siguientes, incluidas las que hace el backend):

```bash
curl -X PUT http://localhost:4010/__mock/escenario -H "Content-Type: application/json" -d '{"escenario":"carrera_no_soportada"}'
```

Para una sola petición con curl, usar la cabecera `X-Mock-Escenario: <escenario>`.

Estado del mock: `GET http://localhost:4010/salud`.

## Heurística (referencia)

Por clase de la carga, partiendo de 0.80:

- −0.15 por cada vez que el estudiante reprobó esa clase.
- −0.08 por cada prerrequisito que reprobó alguna vez.
- −0.05 por cada nivel por encima del nivel sugerido.
- ± (promedio de notas − 75) / 100.
- −0.05 si la carga supera 20 U.V.

Se acota a [0.05, 0.98]. La probabilidad de aprobar toda la carga es el **producto** de las probabilidades por clase; eso es aceptable solo en el mock (el modelo real la calcula de forma conjunta, decisión D7). La recomendación (v1.1) arma una carga completa desde `clasesCandidatas`: primero lo ya inscrito en el período, después las obligatorias de menor nivel y después un orden determinista por estudiante, hasta el tope de U.V. y `MOCK_MAX_RECOMENDACIONES` clases. Esa carga se evalúa con esta misma heurística.
