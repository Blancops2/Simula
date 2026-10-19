import type { DatoEstudiante, HistorialExtraido, TablaClases } from '../../estudiante/extraccionPdf.types';

interface ResultadoHistorialProps {
  historial: HistorialExtraido;
  onIrAPagina: (pagina: number) => void;
}

function Dato({ titulo, dato, onIrAPagina }: { titulo: string; dato: DatoEstudiante; onIrAPagina: (pagina: number) => void }) {
  const { page } = dato;
  return (
    <div
      className={`dato-estudiante ${page ? 'fila-navegable' : ''}`}
      onClick={page ? () => onIrAPagina(page) : undefined}
    >
      <span className="field-label">{titulo}</span>
      {dato.valor ? <strong>{dato.valor}</strong> : <span className="badge badge-warning">No encontrado</span>}
    </div>
  );
}

interface SeccionClasesProps {
  titulo: string;
  tabla: TablaClases | null;
  sinTabla: string;
  onIrAPagina: (pagina: number) => void;
}

function SeccionClases({ titulo, tabla, sinTabla, onIrAPagina }: SeccionClasesProps) {
  return (
    <section className="seccion-clases">
      <h3>
        {titulo}
        {tabla && <span className="badge badge-neutral">{tabla.rows.length} clase(s)</span>}
      </h3>
      {!tabla ? (
        <p className="texto-secundario">{sinTabla}</p>
      ) : tabla.rows.length === 0 ? (
        <p className="texto-secundario">La tabla no tiene filas.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table tabla-compacta">
            <thead>
              <tr>
                {tabla.columns.map((columna, i) => (
                  <th key={i}>{columna}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.rows.map((fila, i) => (
                <tr key={i} className="fila-navegable" onClick={() => onIrAPagina(fila.page)} title={`Página ${fila.page}`}>
                  {fila.cells.map((celda, j) => (
                    <td key={j}>{celda}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ResultadoHistorial({ historial, onIrAPagina }: ResultadoHistorialProps) {
  const { estudiante, clases, equivalencias, faltantes } = historial;

  return (
    <div className="resultado-historial">
      {faltantes.length > 0 && (
        <p className="page-warning">No se encontró en el PDF: {faltantes.join(', ')}.</p>
      )}

      <h3>Datos del estudiante</h3>
      <div className="datos-estudiante">
        <Dato titulo="Número de cuenta" dato={estudiante.numeroCuenta} onIrAPagina={onIrAPagina} />
        <Dato titulo="Nombre" dato={estudiante.nombre} onIrAPagina={onIrAPagina} />
        <Dato titulo="Carrera" dato={estudiante.carrera} onIrAPagina={onIrAPagina} />
      </div>

      <SeccionClases
        titulo="Historial académico"
        tabla={clases}
        sinTabla="No se encontró la tabla del historial en el PDF."
        onIrAPagina={onIrAPagina}
      />
      <SeccionClases
        titulo="Equivalencias"
        tabla={equivalencias}
        sinTabla="El PDF no tiene equivalencias."
        onIrAPagina={onIrAPagina}
      />
    </div>
  );
}
