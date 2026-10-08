// Mock del modelo predictivo de SIMULA — SOLO PARA PRUEBAS.
//
// El modelo real se construye fuera de este aplicativo; SIMULA solo lo
// consume. Este servidor implementa el contrato v1.0 de
// docs/modelo-predictivo/03-decisiones-contrato.md con respuestas deterministas
// (misma petición → misma respuesta) para poder probar el backend y la UI
// mientras el modelo real no está listo. Las probabilidades salen de una
// heurística simple: NO son predicciones reales.
//
// Sin dependencias: se ejecuta con `node servidor.mjs` (Node >= 18).

import { createServer } from 'node:http';

const PUERTO = Number(process.env.MOCK_PUERTO ?? 4010);
// Si tiene valor, se exige "Authorization: Bearer <clave>" (debe coincidir
// con PREDICTIVE_MODEL_API_KEY del backend). Vacía = sin autenticación.
const API_KEY = process.env.MOCK_API_KEY ?? '';
const MAX_RECOMENDACIONES = Number(process.env.MOCK_MAX_RECOMENDACIONES ?? 5);
// Duración del escenario "timeout": debe superar PREDICTIVE_MODEL_TIMEOUT_MS del backend.
const DEMORA_TIMEOUT_MS = Number(process.env.MOCK_DEMORA_TIMEOUT_MS ?? 5000);
const VERSION_MODELO = 'mock-1.2';
const VERSION_CONTRATO = '1.2';

const ESCENARIOS = [
  'normal',
  'datos_invalidos',
  'no_autorizado',
  'carrera_no_soportada',
  'limite_excedido',
  'error_interno',
  'timeout',
  'respuesta_malformada',
  'codigos_fuera_de_lista',
];

// Escenario activo para todas las peticiones; se cambia en caliente con
// PUT /__mock/escenario (el backend de SIMULA no envía cabeceras de prueba,
// así que desde la UI esta es la forma de forzar un error). Una petición
// puede sobreescribirlo con la cabecera X-Mock-Escenario (útil con curl).
let escenarioActivo = ESCENARIOS.includes(process.env.MOCK_ESCENARIO) ? process.env.MOCK_ESCENARIO : 'normal';

// ---------- Utilidades ----------

const redondear2 = (n) => Math.round(n * 100) / 100;
const acotar = (n, min, max) => Math.min(max, Math.max(min, n));

// Hash determinista (FNV-1a) para variar puntajes sin aleatoriedad.
function hash(texto) {
  let h = 2166136261;
  for (const c of texto) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function enviar(res, estado, cuerpo, cabeceras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras });
  res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
}

function enviarError(res, estado, idSolicitud, codigo, mensaje, campo = null, cabeceras = {}) {
  enviar(res, estado, { idSolicitud: idSolicitud ?? null, error: { codigo, mensaje, campo } }, cabeceras);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => resolve(datos));
    req.on('error', reject);
  });
}

// ---------- Validación mínima del contrato ----------

function validarComun(p) {
  if (p.versionContrato !== VERSION_CONTRATO) return 'versionContrato';
  if (typeof p.idSolicitud !== 'string' || !p.idSolicitud) return 'idSolicitud';
  if (typeof p.estudiante !== 'object' || p.estudiante === null) return 'estudiante';
  if (typeof p.estudiante.idEstudiante !== 'string') return 'estudiante.idEstudiante';
  if (typeof p.estudiante.nivelSugerido !== 'number') return 'estudiante.nivelSugerido';
  if (!Array.isArray(p.historial)) return 'historial';
  return null;
}

function validarRecomendaciones(p) {
  if (typeof p.limiteUnidadesValorativas !== 'number') return 'limiteUnidadesValorativas';
  if (!Array.isArray(p.clasesCandidatas)) return 'clasesCandidatas';
  const valida = (c) => typeof c?.codigoClase === 'string' && typeof c?.unidadesValorativas === 'number';
  if (!p.clasesCandidatas.every(valida)) return 'clasesCandidatas[]';
  return null;
}

function validarEvaluacion(p) {
  const carga = p.cargaAcademica;
  if (typeof carga !== 'object' || carga === null) return 'cargaAcademica';
  if (!Array.isArray(carga.clases) || carga.clases.length === 0) return 'cargaAcademica.clases';
  if (!carga.clases.every((c) => typeof c?.codigoClase === 'string')) return 'cargaAcademica.clases[].codigoClase';
  return null;
}

// ---------- Heurística (solo para producir valores plausibles) ----------

// v1.2: si SIMULA envía el índice académico se usa ese; si no, el promedio
// simple de las notas del historial.
function promedioEstudiante(peticion) {
  const indice = peticion.estudiante.avance?.indiceAcademico;
  return typeof indice === 'number' ? indice : promedioNotas(peticion.historial);
}

function promedioNotas(historial) {
  const notas = historial.filter((h) => typeof h.nota === 'number').map((h) => h.nota);
  return notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}

function evaluarClase(clase, peticion, totalUv, promedio) {
  const { historial, estudiante, cargaAcademica } = peticion;
  const factores = [];
  let p = 0.8;

  const reprobadas = historial.filter((h) => h.codigoClase === clase.codigoClase && h.estado === 'REPROBADA').length;
  if (reprobadas > 0) {
    p -= 0.15 * reprobadas;
    factores.push(`Reprobó ${clase.codigoClase} ${reprobadas === 1 ? 'una vez' : `${reprobadas} veces`} antes.`);
  }

  // v1.2: NSP = se inscribió y no se presentó.
  const nsp = historial.filter((h) => h.codigoClase === clase.codigoClase && h.estado === 'NSP').length;
  if (nsp > 0) {
    p -= 0.1 * nsp;
    factores.push(`No se presentó a ${clase.codigoClase} ${nsp === 1 ? 'una vez' : `${nsp} veces`}.`);
  }

  const prerreqReprobados = (clase.prerrequisitos ?? []).filter((req) =>
    historial.some((h) => h.codigoClase === req && h.estado === 'REPROBADA'),
  );
  if (prerreqReprobados.length > 0) {
    p -= 0.08 * prerreqReprobados.length;
    factores.push(`Tuvo dificultad con el prerrequisito ${prerreqReprobados.join(', ')}.`);
  }

  const nivelesArriba = (clase.nivel ?? 0) - estudiante.nivelSugerido;
  if (nivelesArriba > 0) {
    p -= 0.05 * nivelesArriba;
    factores.push(`Está ${nivelesArriba} nivel(es) por encima del nivel sugerido.`);
  }

  if (promedio !== null) {
    p += (promedio - 75) / 100;
    if (promedio < 70) factores.push(`Índice académico bajo (${Math.round(promedio)}).`);
  }

  if (totalUv > 20) {
    p -= 0.05;
    factores.push(`Carga alta para el período (${totalUv} U.V. de ${cargaAcademica.limiteUnidadesValorativas}).`);
  }

  return { codigoClase: clase.codigoClase, probabilidadAprobacion: redondear2(acotar(p, 0.05, 0.98)), factores };
}

// Evalúa una carga (lista de clases con U.V., nivel y requisitos): la usan
// tanto /evaluacion-carga como /recomendaciones (v1.1), que devuelven la
// misma estructura.
function evaluarCarga(clasesCarga, limiteUv, peticion) {
  const totalUv = clasesCarga.reduce((t, c) => t + (c.unidadesValorativas ?? 0), 0);
  const promedio = promedioEstudiante(peticion);
  const contexto = { ...peticion, cargaAcademica: { limiteUnidadesValorativas: limiteUv } };
  const clases = clasesCarga.map((c) => evaluarClase(c, contexto, totalUv, promedio));

  // Producto de probabilidades: aceptable SOLO en el mock. El modelo real
  // debe calcularla de forma conjunta (decisión D7).
  const probabilidadAprobarTodo =
    clases.length > 0 ? redondear2(clases.reduce((t, c) => t * c.probabilidadAprobacion, 1)) : null;

  const observaciones = [];
  if (totalUv > limiteUv) {
    observaciones.push(`La carga (${totalUv} U.V.) supera el límite de ${limiteUv} U.V.`);
  }
  const bajas = clases.filter((c) => c.probabilidadAprobacion < 0.5).length;
  if (bajas >= 2) observaciones.push(`La carga incluye ${bajas} clases con probabilidad de aprobación menor al 50%.`);
  if (peticion.historial.length === 0) {
    observaciones.push('Estudiante sin historial: la estimación usa solo valores base.');
  }

  return { probabilidadAprobarTodo, clases, observaciones };
}

function responderEvaluacion(peticion) {
  const carga = peticion.cargaAcademica;
  return evaluarCarga(carga.clases, carga.limiteUnidadesValorativas, peticion);
}

// v1.1: arma una carga COMPLETA alternativa (puede conservar clases ya
// inscritas en el período) y la evalúa igual que /evaluacion-carga. Prioridad
// determinista: lo ya inscrito, luego obligatorias de menor nivel, luego un
// hash por estudiante; se llena hasta el tope de U.V. y MAX_RECOMENDACIONES.
function responderRecomendaciones(peticion, escenario) {
  const limiteUv = peticion.limiteUnidadesValorativas;
  const idEstudiante = peticion.estudiante.idEstudiante;
  const ordenadas = [...peticion.clasesCandidatas].sort(
    (a, b) =>
      Number(b.inscritaEnPeriodo) - Number(a.inscritaEnPeriodo) ||
      Number(b.obligatoria) - Number(a.obligatoria) ||
      (a.nivel ?? 0) - (b.nivel ?? 0) ||
      (hash(`${idEstudiante}|${a.codigoClase}`) % 100) - (hash(`${idEstudiante}|${b.codigoClase}`) % 100) ||
      a.codigoClase.localeCompare(b.codigoClase),
  );

  const carga = [];
  let totalUv = 0;
  for (const c of ordenadas) {
    if (carga.length >= MAX_RECOMENDACIONES) break;
    if (totalUv + c.unidadesValorativas > limiteUv) continue;
    carga.push(c);
    totalUv += c.unidadesValorativas;
  }

  const evaluacion = evaluarCarga(carga, limiteUv, peticion);
  const clases = evaluacion.clases.map((e, i) => ({
    ...e,
    motivo: carga[i].inscritaEnPeriodo
      ? 'Ya la tienes inscrita en este período; conviene mantenerla.'
      : `Clase ${carga[i].obligatoria ? 'obligatoria' : 'electiva'} de nivel ${carga[i].nivel} disponible para ti.`,
  }));

  if (escenario === 'codigos_fuera_de_lista') {
    clases.unshift({ codigoClase: 'XX-999', probabilidadAprobacion: 0.99, factores: [], motivo: 'Código fuera de clasesCandidatas (prueba).' });
  }
  return { ...evaluacion, clases };
}

// ---------- Servidor ----------

const RUTAS = {
  '/v1/recomendaciones': { validar: validarRecomendaciones, responder: responderRecomendaciones },
  '/v1/evaluacion-carga': { validar: validarEvaluacion, responder: responderEvaluacion },
};

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/salud') {
    return enviar(res, 200, { estado: 'ok', versionModelo: VERSION_MODELO, escenario: escenarioActivo });
  }

  if (req.method === 'PUT' && url.pathname === '/__mock/escenario') {
    const { escenario } = JSON.parse((await leerCuerpo(req)) || '{}');
    if (!ESCENARIOS.includes(escenario)) {
      return enviar(res, 400, { mensaje: `Escenario inválido. Opciones: ${ESCENARIOS.join(', ')}` });
    }
    escenarioActivo = escenario;
    console.log(`[mock] escenario activo: ${escenarioActivo}`);
    return enviar(res, 200, { escenario: escenarioActivo });
  }

  const ruta = RUTAS[url.pathname];
  if (req.method !== 'POST' || !ruta) {
    return enviarError(res, 404, null, 'NO_ENCONTRADO', `Ruta no encontrada: ${req.method} ${url.pathname}`);
  }

  const cabeceraEscenario = req.headers['x-mock-escenario'];
  const escenario = ESCENARIOS.includes(cabeceraEscenario) ? cabeceraEscenario : escenarioActivo;

  let peticion;
  try {
    peticion = JSON.parse(await leerCuerpo(req));
  } catch {
    return enviarError(res, 400, null, 'DATOS_INVALIDOS', 'El cuerpo no es JSON válido.');
  }
  const idSolicitud = typeof peticion?.idSolicitud === 'string' ? peticion.idSolicitud : null;
  console.log(`[mock] POST ${url.pathname} idSolicitud=${idSolicitud} escenario=${escenario}`);

  if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) {
    return enviarError(res, 401, idSolicitud, 'NO_AUTORIZADO', 'API key inválida o ausente.');
  }

  const campoInvalido = validarComun(peticion) ?? ruta.validar(peticion);
  if (campoInvalido) {
    return enviarError(res, 400, idSolicitud, 'DATOS_INVALIDOS', `Campo inválido o ausente: ${campoInvalido}`, campoInvalido);
  }

  switch (escenario) {
    case 'datos_invalidos':
      return enviarError(res, 400, idSolicitud, 'DATOS_INVALIDOS', 'Error forzado por el escenario de prueba.', 'historial');
    case 'no_autorizado':
      return enviarError(res, 401, idSolicitud, 'NO_AUTORIZADO', 'Error forzado por el escenario de prueba.');
    case 'carrera_no_soportada':
      return enviarError(res, 422, idSolicitud, 'CARRERA_NO_SOPORTADA', 'El modelo no está entrenado para esta carrera.');
    case 'limite_excedido':
      return enviarError(res, 429, idSolicitud, 'LIMITE_EXCEDIDO', 'Demasiadas peticiones.', null, { 'Retry-After': '30' });
    case 'error_interno':
      return enviarError(res, 500, idSolicitud, 'ERROR_INTERNO', 'Falla simulada del modelo.');
    case 'respuesta_malformada':
      return enviar(res, 200, { idSolicitud, resultado: 'esto no cumple el contrato' });
    case 'timeout':
      await new Promise((r) => setTimeout(r, DEMORA_TIMEOUT_MS));
      break;
  }

  return enviar(res, 200, {
    versionContrato: VERSION_CONTRATO,
    idSolicitud,
    versionModelo: VERSION_MODELO,
    ...ruta.responder(peticion, escenario),
  });
});

servidor.listen(PUERTO, () => {
  console.log(`[mock] Modelo predictivo simulado en http://localhost:${PUERTO}/v1 (escenario: ${escenarioActivo})`);
  console.log(`[mock] Autenticación: ${API_KEY ? 'requerida (MOCK_API_KEY)' : 'desactivada'}`);
});
