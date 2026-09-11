// Escala de intensidad visual por nivel (1-10), estilo "temperatura estelar":
// rojo/naranja pastel en los niveles bajos, azul/violeta pastel en los altos.
// Evita el rango de hue 90-150 (verdes puros) para no confundir a usuarios
// con deuteranopia/protanopia. Texto siempre #2D3748 (>= 4.5:1 sobre estos
// fondos, WCAG AA).
const NIVEL_BACKGROUNDS: Record<number, string> = {
  1: '#F1D4D0',
  2: '#F0DBD1',
  3: '#EEDFCD',
  4: '#EEE6CE',
  5: '#EEECD3',
  6: '#D6EBEB',
  7: '#D1E2EB',
  8: '#CCD9EA',
  9: '#CCCFEA',
  10: '#D4C9E8',
};

export const NIVEL_TEXT_COLOR = '#2D3748';

// Niveles fuera de 1-10 (p. ej. una malla mas larga) se anclan al extremo
// mas cercano en vez de fallar: siguen siendo distinguibles del resto.
export function getNivelBackground(nivel: number): string {
  const nivelAcotado = Math.min(10, Math.max(1, Math.round(nivel)));
  return NIVEL_BACKGROUNDS[nivelAcotado];
}
