import { Link } from 'react-router-dom';
import type { MallaDetectada, ResultadoGuardadoHistorial } from '../../estudiante/types';

interface ResultadoGuardadoProps {
  resultado: ResultadoGuardadoHistorial;
  onIrAPagina: (pagina: number) => void;
}

function nombreMalla(malla: MallaDetectada): string {
  const version = malla.version !== null ? ` (versión ${malla.version})` : '';
  return `${malla.nombre ?? malla.id}${version}`;
}

// Resumen de lo que se guardó: carrera y malla detectadas, clases guardadas
// y las que no se cargaron, con su motivo.
export function ResultadoGuardado({ resultado, onIrAPagina }: ResultadoGuardadoProps) {
  const { malla, mallaAlternativa, equivalencias, noCargadas } = resultado;
  const guardadas = resultado.creadas + resultado.actualizadas;

  return (
    <section className="panel resultado-guardado">
      <div className="panel-header">
        <h2>Historial guardado</h2>
        <Link to="/estudiante/historial" className="btn btn-secondary btn-sm">
          Ver mi historial
        </Link>
      </div>

      <p className="page-success">
        Se guardaron {guardadas} de {resultado.totalClases} clase(s)
        {resultado.actualizadas > 0 && ` (${resultado.actualizadas} actualizada(s) de una carga anterior)`}.
      </p>

      <div className="datos-estudiante">
        <div className="dato-estudiante">
          <span className="field-label">Carrera</span>
          <strong>{resultado.carrera.nombre ?? resultado.carrera.id}</strong>
        </div>
        <div className="dato-estudiante">
          <span className="field-label">Malla asignada</span>
          <strong>{nombreMalla(malla)}</strong>
          <span className="texto-secundario">{malla.coincidencias} clase(s) del historial coinciden</span>
          {mallaAlternativa && (
            <span className="texto-secundario">
              {nombreMalla(mallaAlternativa)}: {mallaAlternativa.coincidencias} coincidencia(s)
              {mallaAlternativa.coincidencias === malla.coincidencias && ' (empate: se elige la más reciente)'}
            </span>
          )}
        </div>
      </div>

      {resultado.omitidasAdmin > 0 && (
        <p className="page-warning">
          {resultado.omitidasAdmin} clase(s) ya estaban registradas oficialmente por el administrador y no se modificaron.
        </p>
      )}

      {equivalencias.encontradas > 0 &&
        (equivalencias.periodoReservadoDisponible ? (
          <p className="page-success">
            Equivalencias: se guardaron {equivalencias.creadas + equivalencias.actualizadas} de{' '}
            {equivalencias.encontradas}
            {equivalencias.omitidasAdmin > 0 && ` (${equivalencias.omitidasAdmin} ya registrada(s) por el administrador)`}.
            Quedan como aprobadas, sin período ni calificación, porque el documento no los trae.
          </p>
        ) : (
          <p className="page-warning">
            Se encontraron {equivalencias.encontradas} equivalencia(s). Se usaron para identificar tu malla, pero no se
            pudieron guardar: falta configurar el período para clases sin período. Contacta al administrador.
          </p>
        ))}

      {noCargadas.length > 0 && (
        <>
          <h3>
            Clases no cargadas <span className="badge badge-warning">{noCargadas.length}</span>
          </h3>
          <div className="table-scroll">
            <table className="data-table tabla-compacta">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Asignatura</th>
                  <th>Período</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {noCargadas.map((c, i) => (
                  <tr key={i} className="fila-navegable" onClick={() => onIrAPagina(c.page)} title={`Página ${c.page}`}>
                    <td>{c.codigo}</td>
                    <td>{c.asignatura}</td>
                    <td>{c.periodo}</td>
                    <td>{c.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
