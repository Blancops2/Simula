export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

// D5 (docs/modelo-predictivo/03-decisiones-contrato.md): el modelo predictivo
// devuelve solo probabilidades y el riesgo lo calcula SIMULA, para que las
// etiquetas/colores sean coherentes en la UI y se puedan ajustar sin depender
// del equipo del modelo. Son regla de negocio (no conexión), por eso viven
// aquí y no en .env. Valores tomados de docs/modelo-predictivo/02-arquitectura-mock.md §5.1.
const UMBRAL_CLASE = { BAJO: 0.75, MEDIO: 0.5 };

// El umbral global es más bajo que el de clase a propósito: aprobar TODAS las
// clases de una carga es, por naturaleza, menos probable que aprobar una sola.
const UMBRAL_GLOBAL = { BAJO: 0.7, MEDIO: 0.4 };

/** Riesgo de reprobar una clase a partir de su probabilidad de aprobación (0..1). */
export function riesgoClase(probabilidad: number): NivelRiesgo {
  return clasificar(probabilidad, UMBRAL_CLASE);
}

/** Riesgo de la carga completa a partir de la probabilidad de aprobarla toda (0..1). */
export function riesgoGlobal(probabilidad: number): NivelRiesgo {
  return clasificar(probabilidad, UMBRAL_GLOBAL);
}

function clasificar(probabilidad: number, umbral: { BAJO: number; MEDIO: number }): NivelRiesgo {
  if (probabilidad >= umbral.BAJO) {
    return 'BAJO';
  }
  return probabilidad >= umbral.MEDIO ? 'MEDIO' : 'ALTO';
}
