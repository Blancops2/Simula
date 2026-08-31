# Σimula — Lógica de negocio y reglas del sistema

## 1. Dominio

Σimula administra la **malla curricular (pensum)** de una institución educativa: carreras, versiones de malla, clases, prerrequisitos/correquisitos, la asignación de estudiantes a una malla, su historial académico y su inscripción a clases por período.

Hay dos roles, sin más granularidad:

| Rol | Puede |
|---|---|
| `ADMINISTRADOR` | Gestionar carreras, plantillas de malla, clases, requisitos; asignar estudiantes a mallas; capturar/corregir historial académico oficial de cualquier estudiante. |
| `ESTUDIANTE` | Ver su propio perfil, malla y pensum; autorreportar clases ya cursadas; inscribirse a clases del período actual; ver (no editar) su historial oficial. |

## 2. Modelo de datos (entidades clave)

- **Carrera**: programa académico. `nombre` y `codigo` únicos.
- **PlantillaMalla**: una *versión* de la malla de una carrera (`carreraId + nombre + version` único). Tiene `activa` (boolean) y opcionalmente apunta a una `plantillaOrigenId` (de qué versión se duplicó).
- **Clase**: una materia dentro de una plantilla. Única por `(plantillaId, codigo)`. Tiene `nivel` (semestre sugerido), `unidadesValorativas` (créditos) y `tipo` (`OBLIGATORIA` | `ELECTIVA`).
- **RelacionRequisito**: arista dirigida `clase → requisito` con `tipo` (`PRERREQUISITO` | `CORREQUISITO`).
- **HistorialAcademico**: un registro por `(userId, claseId, periodo)` con `estado` (`APROBADA`|`REPROBADA`|`EN_CURSO`), `nota` opcional y `origen` (`ADMIN`|`AUTOREPORTE`).
- **Inscripcion**: selección de clases de un estudiante para un período, `(userId, claseId, periodo)` único.
- **Session**: sesión de refresh token por dispositivo/login.

## 3. Autenticación y sesiones

- **Dominio institucional obligatorio**: el correo de login debe terminar en el dominio configurado (`INSTITUTIONAL_EMAIL_DOMAIN`, por defecto `@simula.edu.co`). Si no, se rechaza con el mismo mensaje genérico que credenciales inválidas (no se revela si el dominio o el usuario son el problema).
- **Mensaje de error genérico**: "Correo o contraseña incorrectos." se usa tanto si el correo no existe como si la contraseña es incorrecta, para no filtrar qué correos están registrados.
- **Bloqueo por intentos fallidos**: tras `MAX_LOGIN_ATTEMPTS` (5 por defecto) intentos fallidos consecutivos, la cuenta se bloquea `LOGIN_LOCKOUT_MINUTES` (15 por defecto) minutos y responde HTTP 423. El contador se reinicia a 0 en cualquier login exitoso.
- **Tokens duales**:
  - *Access token* (JWT, 15 min por defecto): se envía en el body de la respuesta; el Front-End lo maneja en memoria y lo manda como `Authorization: Bearer`.
  - *Refresh token* (JWT, 7 días por defecto): viaja en una cookie `httpOnly`, `sameSite=lax`, con `path` restringido a `/auth` (no se envía a otras rutas de la API).
- **Rotación de refresh token con detección de reuso**: cada `POST /auth/refresh` revoca la sesión actual y emite una nueva (`sessionId` nuevo). Solo se guarda el **hash** SHA-256 del refresh token en BD (`Session.refreshTokenHash`); si el token presentado no coincide con el hash esperado, la sesión se revoca inmediatamente (posible robo/replay de token).
- **Logout best-effort**: si el refresh token ya es inválido/expirado, el logout no falla; simplemente no hay nada que revocar.
- **`type` claim obligatorio**: los JWT de access y refresh llevan un campo `type` (`'access'` / `'refresh'`); un token del tipo equivocado se rechaza aunque la firma sea válida (evita usar un refresh token como access token o viceversa).
- **Autorización por rol**: `RolesGuard` + decorador `@Roles(...)` a nivel de controlador/handler. Sin `@Roles`, el endpoint solo exige estar autenticado.
- **Cierre de sesión por inactividad (Front-End)**: tras 20 minutos (configurable) sin interacción (mouse, teclado, click, scroll, touch), la sesión se cierra localmente.

## 4. Gestión curricular (solo `ADMINISTRADOR`)

### 4.1 Carreras y plantillas
- Una `Clase` solo puede pertenecer a una plantilla, y su código debe ser único **dentro de esa plantilla**.
- **Las plantillas son "inmutables en la práctica" por convención, no por bloqueo técnico**: se pueden editar clases/requisitos de una plantilla que ya tiene estudiantes asignados (edición en vivo, intencional). Para un cambio de fondo que **no** deba afectar a quienes ya cursan esa malla, la operación correcta es **duplicar** la plantilla en una nueva versión, no mutar la vigente.
- **Duplicar plantilla**: copia todas las clases y relaciones de requisito a una nueva `PlantillaMalla` con `version = original + 1` y `plantillaOrigenId` apuntando a la original. La original no se toca; los estudiantes ya asignados a ella permanecen ahí hasta que un admin los reasigne.
- **Eliminar plantilla**: se rechaza si hay uno o más estudiantes asignados (`plantillaMallaId`); el mensaje sugiere desactivarla (`activa=false`) en su lugar, ya que borrarla implicaría perder el historial de mallas activas por cascada de `Clase`.
- **Acceso al árbol de una plantilla** (`GET /plantillas/:id`): un `ESTUDIANTE` solo puede ver el árbol de la plantilla que tiene **actualmente asignada**; cualquier otra devuelve 403, incluso si conoce el id.

### 4.2 Prerrequisitos y correquisitos
- Una clase no puede ser prerrequisito/correquisito de sí misma.
- El requisito debe pertenecer a la **misma plantilla** que la clase que lo exige (no se permiten dependencias cruzadas entre plantillas).
- **Detección de ciclos**: antes de crear una relación `clase → requisito`, se recorre el grafo de requisitos de toda la plantilla (DFS) para verificar que `requisito` no dependa ya, directa o transitivamente, de `clase`. Si lo hace, se rechaza (evitaría un ciclo de dependencias irresoluble).
- La relación es única por `(claseId, requisitoId, tipo)`: la misma clase puede requerir a otra como prerrequisito y, en teoría, no simultáneamente como correquisito duplicado del mismo tipo.

## 5. Perfil y avance académico del estudiante

- El **período académico activo** siempre lo calcula el Back-End a partir de la fecha del servidor — **nunca** se acepta un valor de período enviado por el cliente para decidir "en qué período estoy": meses `0–5` (enero–junio) → semestre `1`; `6–11` (julio–diciembre) → semestre `2`. Formato resultante: `AAAA-1` / `AAAA-2`.
- **Cruce de historial por código, no por id de clase**: al calcular el estado de una clase para un estudiante (aprobada/en curso/disponible/bloqueada), se compara por `Clase.codigo`, no por `Clase.id`, y se usa **todo** el historial del estudiante sin filtrar por plantilla. Esto permite que, si un admin reasigna al estudiante a una nueva versión de la malla, las materias con el mismo código ya aprobadas en la versión anterior sigan contando como aprobadas.
- **Estados posibles de una clase para un estudiante**:
  - `APROBADA`: existe un registro de historial con ese código en estado `APROBADA`.
  - `EN_CURSO`: existe un registro `EN_CURSO` para ese código y no está ya aprobada (una aprobación posterior siempre gana sobre un "en curso" residual).
  - `DISPONIBLE`: no aprobada ni en curso, y todos sus prerrequisitos (por código) están aprobados.
  - `BLOQUEADA`: falta al menos un prerrequisito por aprobar (se listan los faltantes).
- **Avance académico** se calcula **solo sobre clases `OBLIGATORIA`** (las electivas no cuentan para el porcentaje de malla completada):
  - `porcentajeMallaCompletada = round(UV aprobadas obligatorias / UV totales obligatorias * 100)`.
- **Semestre sugerido**: `nivel máximo entre las clases obligatorias aprobadas + 1`; si no hay ninguna aprobada, es `1`.

## 6. Pensum y autorreporte ("ya la cursé")

Pensado para que un estudiante que ingresa al sistema con avance previo pueda declarar rápidamente qué ya cursó, sin depender de que un administrador capture todo su historial retroactivo.

- `marcarClaseCursada` escribe **directamente en el historial académico oficial**: crea/actualiza (`upsert` por `userId+claseId+período actual`) un registro con `estado=APROBADA`, `origen=AUTOREPORTE`.
- **Un autorreporte cuenta exactamente igual que un registro de administrador** para: avance académico, porcentaje de malla, semestre sugerido y habilitación de prerrequisitos/correquisitos de inscripción. No es un estado "borrador" ni "pendiente de validar".
- **Un registro `ADMIN` nunca es sobrescrito por un autorreporte**: si ya existe historial `ADMIN` para esa clase+período, `marcarClaseCursada` simplemente no hace nada (no lanza error, tampoco modifica).
- **Solo el propio estudiante puede desmarcar (borrar) su autorreporte**, y el borrado (`desmarcarClaseCursada`) está *scoped* exclusivamente a filas con `origen=AUTOREPORTE`: un estudiante **nunca** puede tocar, ocultar ni borrar un registro `ADMIN` desde el pensum, aunque sea de su propia clase.
- Cuando existen registros con el mismo código de clase en distintos orígenes, **`ADMIN` prevalece sobre `AUTOREPORTE`** para el flag `oficial` que ve el estudiante en el pensum — una aprobación oficial nunca se muestra como "editable" aunque exista un autorreporte de por medio.

## 7. Historial académico (captura administrativa)

- Solo `ADMINISTRADOR` puede crear/corregir historial vía `POST /estudiantes/:userId/historial`. Es un **upsert** por `(userId, claseId, periodo)`: reenviar el mismo trío actualiza nota/estado en vez de duplicar.
- `nota` es opcional y, si se envía, debe estar en el rango `0.0–5.0`.
- `periodo` debe cumplir el formato `AAAA-1` o `AAAA-2` (validado por regex en el DTO); a diferencia de la inscripción/autorreporte, aquí el período **sí** lo especifica el administrador (captura de historial retroactivo o de períodos pasados).
- `eliminarHistorial` permite borrar cualquier registro (ADMIN o AUTOREPORTE) para corregir errores de captura, pero solo si pertenece al `userId` indicado en la ruta.
- El estudiante solo tiene acceso de **lectura** a su propio historial (`GET /estudiante/historial`); no existe endpoint de escritura de historial fuera del pensum (autorreporte) para el rol `ESTUDIANTE`.

## 8. Inscripción a clases (período actual)

Reglas validadas en `EstudianteService.inscribir`, todas en el servidor (el cliente solo envía la lista de `claseId`):

1. El estudiante debe tener una plantilla de malla asignada.
2. Todas las clases seleccionadas deben pertenecer **a esa plantilla** (si alguna no, se rechaza el lote completo).
3. No se puede inscribir una clase ya **aprobada**.
4. No se puede inscribir una clase que ya está **en curso** (historial) o que **ya está inscrita** en el período actual (evita duplicados y re-inscripciones).
5. No se puede inscribir una clase **bloqueada** (con prerrequisitos pendientes); el error lista los códigos de prerrequisito faltantes.
6. **Correquisitos**: si la clase exige un correquisito, ese correquisito debe cumplirse de alguna de estas tres formas — estar en la **misma selección** que se está enviando, estar **ya inscrito** en el período actual, o estar **ya aprobado**. Si ninguna se cumple, se rechaza y se listan los correquisitos faltantes.
7. La inscripción se hace en **lote** (`createMany` con `skipDuplicates`): si una clase del lote falla alguna regla, **ninguna** del lote se inscribe (se lanza la excepción antes de escribir).
8. **Cancelar inscripción**: un estudiante solo puede cancelar inscripciones propias (`inscripcion.userId === userId`); no hay validación de "fecha límite" en el código actual — puede cancelar en cualquier momento del período.
9. El **período usado siempre es el calculado por el servidor** (`periodoActual()`), nunca uno enviado por el cliente, tanto al inscribir como al listar inscripciones por defecto.

## 9. Reglas transversales

- **Autorización de plantilla propia**: en todos los endpoints de estudiante que exponen una plantilla (`malla`, `pensum`, `inscribir`), la plantilla usada es siempre `user.plantillaMallaId` — un estudiante nunca puede pedir explícitamente la malla/pensum de otra plantilla ni de otro estudiante.
- **Validación estricta de payloads**: `ValidationPipe` global con `whitelist + forbidNonWhitelisted + transform` — cualquier campo no declarado en el DTO hace fallar la petición completa (400), en vez de ignorarlo silenciosamente.
- **Integridad referencial por cascada**: borrar una `Clase` borra en cascada sus `RelacionRequisito`, `HistorialAcademico` e `Inscripcion` asociadas; borrar un `User` borra en cascada sus `Session`, `HistorialAcademico` e `Inscripcion`.
- **CORS restringido**: solo se acepta el origen configurado en `FRONTEND_ORIGIN`, con credenciales (necesario para que la cookie de refresh viaje entre Front-End y Back-End).

## 10. Matriz de autorización por endpoint

| Endpoint | Rol requerido | Alcance |
|---|---|---|
| `POST /auth/login`, `/auth/refresh`, `/auth/logout` | Público | — |
| `GET/POST /carreras` | `ADMINISTRADOR` | — |
| `POST/GET/PATCH/DELETE /plantillas`, `/plantillas/:id/duplicar`, `/plantillas/:id/estudiantes` | `ADMINISTRADOR` | — |
| `GET /plantillas/:id` (árbol) | `ADMINISTRADOR` \| `ESTUDIANTE` | Estudiante: solo su propia plantilla asignada |
| `POST/PATCH/DELETE /clases`, `/clases/:id/requisitos`, `DELETE /requisitos/:id` | `ADMINISTRADOR` | — |
| `PATCH /estudiantes/:userId/plantilla` | `ADMINISTRADOR` | Asigna/reasigna malla |
| `PATCH /estudiantes/:userId/perfil`, historial admin (`GET/POST/DELETE /estudiantes/:userId/historial`) | `ADMINISTRADOR` | Sobre cualquier estudiante |
| `GET /estudiante/perfil`, `/malla`, `/historial`, `/pensum` | `ESTUDIANTE` | Solo propio (`userId` del JWT) |
| `POST/DELETE /estudiante/pensum/clases/:claseId` | `ESTUDIANTE` | Solo autorreporte propio |
| `POST/GET/DELETE /estudiante/inscripciones` | `ESTUDIANTE` | Solo propio, período actual |
