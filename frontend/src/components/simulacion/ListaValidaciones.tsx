import type { ValidacionSimulacionItem } from '../../estudiante/types';

interface ListaValidacionesProps {
  validaciones: ValidacionSimulacionItem[];
}

// Qué falta antes de simular, debajo del botón "Simular carga". Las
// bloqueantes (rojo) son las que lo mantienen deshabilitado; las
// advertencias (amarillo) solo orientan. Sin enlaces: el estudiante ya está
// en la página donde se corrige casi todo, así que basta con decir dónde.
export function ListaValidaciones({ validaciones }: ListaValidacionesProps) {
  const bloqueantes = validaciones.filter((v) => v.tipo === 'BLOQUEANTE');
  const advertencias = validaciones.filter((v) => v.tipo === 'ADVERTENCIA');
  if (bloqueantes.length === 0 && advertencias.length === 0) {
    return null;
  }
  return (
    <div className="validaciones-simulacion" aria-live="polite">
      {bloqueantes.length > 0 && (
        <div className="validaciones-grupo validaciones-bloqueantes" role="alert">
          <p className="validaciones-titulo">Debes resolver esto para simular:</p>
          <ul>
            {bloqueantes.map((v, i) => (
              <li key={`${v.codigo}-${i}`}>
                <span>{v.mensaje}</span>
                <span className="validaciones-donde">{v.dondeCorregir}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {advertencias.length > 0 && (
        <div className="validaciones-grupo validaciones-advertencias">
          <p className="validaciones-titulo">Puedes simular, pero ten en cuenta:</p>
          <ul>
            {advertencias.map((v, i) => (
              <li key={`${v.codigo}-${i}`}>
                <span>{v.mensaje}</span>
                <span className="validaciones-donde">{v.dondeCorregir}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
