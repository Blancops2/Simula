import type { ErrorSimulacion } from '../../estudiante/errorSimulacion';

// HU-05-06: lo que se muestra debajo de la tabla de un período mientras la
// simulación corre, cuando falla o cuando su resultado dejó de aplicar.
// El contenedor con `aria-live` lo pone la página, para que exista antes de
// que cambie su contenido y los lectores de pantalla lo anuncien.

export function SimulacionEnCurso() {
  return (
    <div className="simulacion-resultado simulacion-en-curso" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Simulando tu carga con el modelo predictivo… puede tardar unos segundos.</span>
    </div>
  );
}

interface AvisoErrorSimulacionProps {
  error: ErrorSimulacion;
  onReintentar: () => void;
  reintentoDeshabilitado: boolean;
}

// Reintentar vuelve a simular la carga inscrita del período, que está
// guardada en el backend: el error no la toca.
export function AvisoErrorSimulacion({ error, onReintentar, reintentoDeshabilitado }: AvisoErrorSimulacionProps) {
  return (
    <div className="simulacion-resultado simulacion-error" role="alert">
      <p className="simulacion-error-titulo">{error.titulo}</p>
      <p className="simulacion-aviso">
        {error.mensaje}
        {error.reintentable && ' Tu carga inscrita se conserva; puedes reintentar.'}
      </p>
      {error.reintentable && (
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onReintentar}
            disabled={reintentoDeshabilitado}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

export function SimulacionDescartada() {
  return (
    <div className="simulacion-resultado">
      <p className="simulacion-aviso">
        Tu carga cambió después de iniciar la última simulación, así que su resultado se descartó. Vuelve a simular
        para ver la probabilidad de tu carga actual.
      </p>
    </div>
  );
}
