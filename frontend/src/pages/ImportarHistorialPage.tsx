import { useEffect, useRef, useState } from 'react';
import { extraerHistorialPdf, guardarHistorialPdf } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import { ResultadoGuardado } from '../components/historialPdf/ResultadoGuardado';
import { ResultadoHistorial } from '../components/historialPdf/ResultadoHistorial';
import { VisorPdf } from '../components/historialPdf/VisorPdf';
import { ZonaCargaPdf } from '../components/historialPdf/ZonaCargaPdf';
import type { ExtractionResult } from '../estudiante/extraccionPdf.types';
import type { ResultadoGuardadoHistorial } from '../estudiante/types';

const TAMANO_MAXIMO = 4 * 1024 * 1024;

// Solo se guarda el nombre y el tamaño del archivo, nunca el File: así el
// PDF no queda retenido en memoria por el estado de la página. El único que
// lo referencia es la URL local del visor, que se revoca al salir.
interface DatosArchivo {
  nombre: string;
  tamano: number;
}

type Estado =
  | { fase: 'inicial' }
  | { fase: 'procesando'; archivo: DatosArchivo }
  | { fase: 'error'; archivo: DatosArchivo; mensaje: string }
  | { fase: 'resultado'; archivo: DatosArchivo; resultado: ExtractionResult };

// Guardado del historial (solo en la vista de verificación).
type Guardado =
  | { fase: 'sin_guardar' }
  | { fase: 'confirmando' }
  | { fase: 'guardando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'guardado'; resultado: ResultadoGuardadoHistorial };

const MENSAJE_POR_ESTADO: Record<number, string> = {
  400: 'El archivo no es un PDF válido, está dañado o protegido con contraseña.',
  413: 'El archivo supera el tamaño máximo de 4 MB.',
  422: 'El PDF no tiene texto seleccionable (parece escaneado). Solo se admiten PDF digitales.',
};

function mensajeDeError(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { message?: string | string[] } } })?.response;
  if (!response) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  const message = response.data?.message;
  if (message) return Array.isArray(message) ? message.join(' ') : message;
  return MENSAJE_POR_ESTADO[response.status ?? 0] ?? 'No se pudo procesar el archivo.';
}

function validarEnCliente(archivo: File): string | null {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
  if (!esPdf) return 'El archivo debe ser un PDF (.pdf).';
  if (archivo.size > TAMANO_MAXIMO) return MENSAJE_POR_ESTADO[413];
  return null;
}

function formatoTamano(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportarHistorialPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'inicial' });
  // URL local del PDF elegido: solo existe en la vista de verificación.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [navegacion, setNavegacion] = useState(0);
  const [guardado, setGuardado] = useState<Guardado>({ fase: 'sin_guardar' });
  const peticionRef = useRef<AbortController | null>(null);

  // Al salir de la página se cancela la petición en curso, para que su
  // respuesta no cree una URL local que ya nadie liberaría.
  useEffect(() => () => peticionRef.current?.abort(), []);

  // Libera la URL anterior al cambiar de archivo y al desmontar la página.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function procesar(archivo: File) {
    setPdfUrl(null);
    setPagina(1);
    setGuardado({ fase: 'sin_guardar' });
    const datos: DatosArchivo = { nombre: archivo.name, tamano: archivo.size };
    const errorCliente = validarEnCliente(archivo);
    if (errorCliente) {
      setEstado({ fase: 'error', archivo: datos, mensaje: errorCliente });
      return;
    }
    const peticion = new AbortController();
    peticionRef.current = peticion;
    setEstado({ fase: 'procesando', archivo: datos });
    try {
      const resultado = await extraerHistorialPdf(archivo, peticion.signal);
      if (peticion.signal.aborted) return;
      // Una respuesta sin `historial` (p. ej. un backend desactualizado) no
      // debe tumbar la página: se muestra como error.
      if (!resultado?.historial?.estudiante) {
        setEstado({
          fase: 'error',
          archivo: datos,
          mensaje: 'El servidor respondió en un formato inesperado. Intenta de nuevo más tarde.',
        });
        return;
      }
      setPdfUrl(URL.createObjectURL(archivo));
      setEstado({ fase: 'resultado', archivo: datos, resultado });
    } catch (err) {
      if (peticion.signal.aborted) return;
      setEstado({ fase: 'error', archivo: datos, mensaje: mensajeDeError(err) });
    } finally {
      if (peticionRef.current === peticion) peticionRef.current = null;
    }
  }

  function irAPagina(n: number) {
    setPagina(n);
    setNavegacion((v) => v + 1);
  }

  // Reenvía el mismo PDF (tomado de la URL local del visor, sin volver a
  // elegirlo): el backend lo extrae de nuevo y guarda lo que el estudiante
  // verificó. No se envían datos extraídos desde el navegador.
  async function guardar() {
    if (estado.fase !== 'resultado' || !pdfUrl) return;
    setGuardado({ fase: 'guardando' });
    try {
      const blob = await fetch(pdfUrl).then((r) => r.blob());
      const archivo = new File([blob], estado.archivo.nombre, { type: 'application/pdf' });
      const resultado = await guardarHistorialPdf(archivo);
      setGuardado({ fase: 'guardado', resultado });
    } catch (err) {
      setGuardado({ fase: 'error', mensaje: mensajeDeError(err) });
    }
  }

  function reiniciar() {
    setGuardado({ fase: 'sin_guardar' });
    setPdfUrl(null);
    setPagina(1);
    setEstado({ fase: 'inicial' });
  }

  if (estado.fase === 'resultado' && pdfUrl) {
    return (
      <AppShell title="Subir historial académico" backTo="/estudiante" backLabel="Mi perfil">
        <div className="panel verificacion-encabezado">
          <div>
            <h2>Verifica los datos extraídos</h2>
            <p className="texto-secundario">
              Compara el PDF con los datos extraídos. Haz clic en un dato o en una clase para ir a su página en el PDF.
              Cuando estén correctos, guarda tu historial.
            </p>
          </div>
          <div className="inline-form">
            {guardado.fase !== 'guardado' && (
              <button
                type="button"
                className={`btn btn-primary ${guardado.fase === 'guardando' ? 'btn-loading' : ''}`}
                disabled={guardado.fase === 'guardando'}
                onClick={() => setGuardado({ fase: 'confirmando' })}
              >
                Guardar historial
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={guardado.fase === 'guardando'}
              onClick={reiniciar}
            >
              Procesar otro documento
            </button>
          </div>
        </div>
        {guardado.fase === 'error' && (
          <p className="page-error" role="alert">
            No se pudo guardar el historial: {guardado.mensaje}
          </p>
        )}
        {guardado.fase === 'guardado' && <ResultadoGuardado resultado={guardado.resultado} onIrAPagina={irAPagina} />}
        {guardado.fase === 'confirmando' && (
          <div className="modal-overlay" onClick={() => setGuardado({ fase: 'sin_guardar' })}>
            <div className="modal-box modal-box-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Guardar historial</h2>
              </div>
              <p>Al guardar:</p>
              <ul>
                <li>Se te asignará la carrera del PDF y la versión de malla que más coincida con tus clases.</li>
                <li>Se guardarán las clases que están en esa malla; las demás se te listarán sin cargarse.</li>
                <li>Lo registrado por el administrador no se modifica.</li>
              </ul>
              <div className="modal-footer">
                <span />
                <div className="inline-form">
                  <button type="button" className="btn btn-secondary" onClick={() => setGuardado({ fase: 'sin_guardar' })}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={guardar}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="verificacion-pdf">
          <section className="panel verificacion-visor">
            <VisorPdf url={pdfUrl} nombre={estado.archivo.nombre} pagina={pagina} navegacion={navegacion} />
          </section>
          <section className="panel verificacion-resultados">
            <ResultadoHistorial historial={estado.resultado.historial} onIrAPagina={irAPagina} />
          </section>
        </div>
      </AppShell>
    );
  }

  const procesando = estado.fase === 'procesando';
  const archivoActual = estado.fase === 'procesando' || estado.fase === 'error' ? estado.archivo : null;

  return (
    <AppShell title="Subir historial académico" backTo="/estudiante" backLabel="Mi perfil">
      <section className="panel">
        <h2>Cargar historial desde PDF</h2>
        <p>
          Sube el PDF de tu historial académico (información básica e historial de clases). El sistema extraerá los
          datos y te los mostrará junto al documento original para que verifiques que salieron bien. Nada se guarda
          hasta que, después de revisarlos, elijas <strong>Guardar historial</strong>.
        </p>

        {estado.fase === 'error' && (
          <p className="page-error" role="alert">
            {estado.mensaje} Puedes intentarlo con otro archivo.
          </p>
        )}

        <ZonaCargaPdf deshabilitada={procesando} onArchivo={procesar} />

        {archivoActual && (
          <div className="archivo-en-proceso">
            <span>
              <strong>{archivoActual.nombre}</strong> · {formatoTamano(archivoActual.tamano)}
            </span>
            {procesando ? (
              <span className="indicador-procesando" aria-live="polite">
                Procesando…
              </span>
            ) : (
              <span className="badge badge-danger">No se pudo procesar</span>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
