import type { ClaseView, PlantillaArbol } from './types';

export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 150;

export function defaultPosition(nivel: number, indexEnNivel: number): { x: number; y: number } {
  return { x: (nivel - 1) * COLUMN_WIDTH, y: indexEnNivel * ROW_HEIGHT };
}

export function posicionDeClase(clase: ClaseView, indexEnNivel: number): { x: number; y: number } {
  if (clase.posX !== null && clase.posY !== null) {
    return { x: clase.posX, y: clase.posY };
  }
  return defaultPosition(clase.nivel, indexEnNivel);
}

/** Recalcula una posición en grilla (columna = nivel, fila = orden dentro del nivel) para todas las clases. */
export function calcularAutoLayout(arbol: PlantillaArbol): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>();
  for (const { nivel, clases } of arbol.niveles) {
    clases.forEach((clase, index) => {
      posiciones.set(clase.id, defaultPosition(nivel, index));
    });
  }
  return posiciones;
}
