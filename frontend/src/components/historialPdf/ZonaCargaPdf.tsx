import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

interface ZonaCargaPdfProps {
  deshabilitada: boolean;
  onArchivo: (archivo: File) => void;
}

// Zona para arrastrar o elegir el PDF. La validación (tipo y tamaño) la hace
// la página, para mostrar el error en el mismo lugar que los del backend.
export function ZonaCargaPdf({ deshabilitada, onArchivo }: ZonaCargaPdfProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function elegir(archivo: File | undefined) {
    if (archivo && !deshabilitada) onArchivo(archivo);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    elegir(event.target.files?.[0]);
    // Permite volver a elegir el mismo archivo tras un error.
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastrando(false);
    elegir(event.dataTransfer.files?.[0]);
  }

  return (
    <div
      className={`zona-carga-pdf ${arrastrando ? 'zona-carga-pdf-activa' : ''} ${deshabilitada ? 'zona-carga-pdf-deshabilitada' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!deshabilitada) setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={handleDrop}
    >
      <p className="zona-carga-pdf-titulo">Arrastra aquí el PDF de tu historial académico</p>
      <p className="zona-carga-pdf-ayuda">PDF digital (no escaneado), máximo 4 MB.</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={deshabilitada}
        onClick={() => inputRef.current?.click()}
      >
        Elegir archivo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleChange}
        disabled={deshabilitada}
        hidden
      />
    </div>
  );
}
