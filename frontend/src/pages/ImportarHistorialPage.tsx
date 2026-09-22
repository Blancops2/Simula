import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { importarHistorial } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { ResultadoImportacionHistorial } from '../estudiante/types';

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  if (!data?.message) return fallback;
  return Array.isArray(data.message) ? data.message.join(' ') : data.message;
}

const PLANTILLA_CSV = 'codigo,periodo,nota\nMM-111,2024-1,85\nIS-101,2023-2,50\n';

export function ImportarHistorialPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionHistorial | null>(null);

  function handleArchivo(event: ChangeEvent<HTMLInputElement>) {
    setArchivo(event.target.files?.[0] ?? null);
    setError(null);
    setResultado(null);
  }

  function descargarPlantilla() {
    const blob = new Blob([PLANTILLA_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-historial.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!archivo) return;
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const data = await importarHistorial(archivo);
      setResultado(data);
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(errorMessage(err, 'No se pudo importar el archivo.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppShell title="Subir historial académico" backTo="/estudiante" backLabel="Mi perfil">
      <section className="panel">
        <h2>Importar desde CSV</h2>
        <p>
          Sube un archivo CSV con tu historial de clases cursadas para completarlo de una sola vez, en lugar de
          registrarlas una por una. Cada fila debe tener las columnas <strong>codigo</strong>,{' '}
          <strong>periodo</strong> (formato AAAA-1 o AAAA-2) y <strong>nota</strong> (0-100). El estado
          (aprobada o reprobada) se calcula automáticamente: una nota de 65 o más se considera aprobada.
        </p>
        <p>
          Esto es un autorreporte: si el administrador ya registró oficialmente una clase, esa fila del CSV se
          omite y no se sobrescribe. Las clases que todavía estás cursando (sin nota final) se marcan aparte,
          desde el <Link to="/estudiante/pensum">Pensum</Link>.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={descargarPlantilla}>
          Descargar plantilla de ejemplo
        </button>

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          {error && <p className="page-error">{error}</p>}
          <label className="field">
            Archivo CSV
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleArchivo} required />
          </label>
          <div className="inline-form" style={{ marginTop: 14 }}>
            <button
              type="submit"
              className={`btn btn-primary ${enviando ? 'btn-loading' : ''}`}
              disabled={enviando || !archivo}
            >
              Importar historial
            </button>
          </div>
        </form>
      </section>

      {resultado && (
        <section className="panel">
          <h2>Resultado de la importación</h2>
          <p className="page-success">
            {resultado.registrados} de {resultado.totalFilas} fila(s) registradas correctamente.
            {resultado.omitidos > 0 &&
              ` ${resultado.omitidos} omitida(s) por ya estar registrada(s) oficialmente por el administrador.`}
          </p>
          {resultado.errores.length > 0 && (
            <>
              <p className="page-error">Se encontraron {resultado.errores.length} error(es):</p>
              <ul>
                {resultado.errores.map((mensaje, i) => (
                  <li key={i}>{mensaje}</li>
                ))}
              </ul>
            </>
          )}
          <Link to="/estudiante/historial" className="btn btn-secondary">
            Ver historial actualizado
          </Link>
        </section>
      )}
    </AppShell>
  );
}
