interface VisorPdfProps {
  url: string;
  nombre: string;
  pagina: number;
  // Cambia en cada clic, aunque se pida la misma página: obliga al visor a
  // volver a ella si el usuario se desplazó a otra.
  navegacion: number;
}

// Visor nativo del navegador (desplazamiento y zoom incluidos).
export function VisorPdf({ url, nombre, pagina, navegacion }: VisorPdfProps) {
  return (
    <div className="visor-pdf">
      <div className="visor-pdf-barra">
        <span className="visor-pdf-nombre" title={nombre}>
          {nombre}
        </span>
        <span className="badge badge-neutral">Página {pagina}</span>
      </div>
      {/* El fragmento #page=N solo se aplica al cargar: se remonta el iframe
          (desde la URL local, sin red) para cambiar de página. */}
      <iframe key={navegacion} src={`${url}#page=${pagina}`} title={`Vista previa de ${nombre}`} className="visor-pdf-marco" />
    </div>
  );
}
