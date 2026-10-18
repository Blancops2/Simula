import { useMemo, useState, type ReactNode } from 'react';
import type { ExtractionResult, MotivoDescarte, TextLine, TipoDato } from '../../estudiante/extraccionPdf.types';

interface ResultadosExtraccionProps {
  resultado: ExtractionResult;
  onIrAPagina: (pagina: number) => void;
}

type Pestana = 'campos' | 'tablas' | 'limpio' | 'descartado' | 'crudo' | 'json';

const ETIQUETA_MOTIVO: Record<MotivoDescarte, string> = {
  numero_pagina: 'Número de página',
  encabezado_pie_repetido: 'Encabezado/pie repetido',
  linea_vacia: 'Línea vacía',
  unida_con_guion: 'Unida a la línea anterior (guion)',
};

const CLASE_TIPO: Record<TipoDato, string> = {
  email: 'badge-accent',
  fecha: 'badge-success',
  porcentaje: 'badge-warning',
  moneda: 'badge-warning',
  numero: 'badge-accent',
  texto: 'badge-neutral',
};

function BotonPagina({ pagina, onIrAPagina }: { pagina: number; onIrAPagina: (pagina: number) => void }) {
  return (
    <button
      type="button"
      className="link-btn"
      onClick={(event) => {
        event.stopPropagation();
        onIrAPagina(pagina);
      }}
    >
      Pág. {pagina}
    </button>
  );
}

function Segmentos({ linea }: { linea: TextLine }) {
  return (
    <>
      {linea.segments.map((segmento, i) => (
        <span key={i} className="segmento-pdf">
          {segmento}
        </span>
      ))}
    </>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="resultados-vacio">{children}</p>;
}

export function ResultadosExtraccion({ resultado, onIrAPagina }: ResultadosExtraccionProps) {
  const [pestana, setPestana] = useState<Pestana>('campos');
  const [filtro, setFiltro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const { stats } = resultado;

  const json = useMemo(() => JSON.stringify(resultado, null, 2), [resultado]);

  const camposFiltrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return resultado.fields;
    return resultado.fields.filter((c) =>
      [c.key, c.keyNormalized, c.value, c.type].some((v) => v.toLowerCase().includes(f)),
    );
  }, [resultado.fields, filtro]);

  async function copiarJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function descargarJson() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${resultado.fileName.replace(/\.pdf$/i, '')}.extraccion.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const pestanas: { id: Pestana; etiqueta: string; total?: number }[] = [
    { id: 'campos', etiqueta: 'Campos', total: resultado.fields.length },
    { id: 'tablas', etiqueta: 'Tablas', total: resultado.tables.length },
    { id: 'limpio', etiqueta: 'Texto limpio' },
    { id: 'descartado', etiqueta: 'Descartado', total: resultado.removed.length },
    { id: 'crudo', etiqueta: 'Texto crudo' },
    { id: 'json', etiqueta: 'JSON' },
  ];

  return (
    <div className="resultados-extraccion">
      <div className="indicadores-extraccion">
        <div>
          <span className="field-label">Páginas</span>
          <strong>{resultado.pageCount}</strong>
        </div>
        <div>
          <span className="field-label">Líneas</span>
          <strong>
            {stats.rawLines} → {stats.cleanLines}
          </strong>
        </div>
        <div>
          <span className="field-label">Campos</span>
          <strong>{stats.fields}</strong>
        </div>
        <div>
          <span className="field-label">Tablas</span>
          <strong>{stats.tables}</strong>
        </div>
        <div>
          <span className="field-label">Tiempo</span>
          <strong>{stats.elapsedMs} ms</strong>
        </div>
      </div>

      <div className="pestanas" role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={`pestana ${pestana === p.id ? 'pestana-activa' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
            {p.total !== undefined && <span className="badge badge-neutral">{p.total}</span>}
          </button>
        ))}
      </div>

      <div className="pestana-contenido" role="tabpanel">
        {pestana === 'campos' && (
          <>
            <label className="field">
              Buscar
              <input
                type="search"
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
                placeholder="Clave, valor o tipo"
              />
            </label>
            {camposFiltrados.length === 0 ? (
              <Vacio>{resultado.fields.length === 0 ? 'No se detectaron campos "Clave: valor".' : 'Sin coincidencias.'}</Vacio>
            ) : (
              <div className="table-scroll">
                <table className="data-table tabla-compacta">
                  <thead>
                    <tr>
                      <th>Clave</th>
                      <th>Valor</th>
                      <th>Tipo</th>
                      <th>Normalizado</th>
                      <th>Página</th>
                    </tr>
                  </thead>
                  <tbody>
                    {camposFiltrados.map((c, i) => (
                      <tr key={i} className="fila-navegable" onClick={() => onIrAPagina(c.page)}>
                        <td>
                          {c.key}
                          <div className="texto-secundario">{c.keyNormalized}</div>
                        </td>
                        <td>{c.value}</td>
                        <td>
                          <span className={`badge ${CLASE_TIPO[c.type]}`}>{c.type}</span>
                        </td>
                        <td>
                          <code>{JSON.stringify(c.normalized)}</code>
                        </td>
                        <td>
                          <BotonPagina pagina={c.page} onIrAPagina={onIrAPagina} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {pestana === 'tablas' &&
          (resultado.tables.length === 0 ? (
            <Vacio>No se detectaron tablas.</Vacio>
          ) : (
            resultado.tables.map((t, i) => (
              <div key={i} className="tabla-detectada">
                <div className="tabla-detectada-titulo">
                  <strong>Tabla {i + 1}</strong>
                  <span className="texto-secundario">
                    {t.columns} columnas · {t.rows.length - 1} fila(s)
                  </span>
                  <BotonPagina pagina={t.page} onIrAPagina={onIrAPagina} />
                </div>
                <div className="table-scroll">
                  <table className="data-table tabla-compacta">
                    <thead>
                      <tr className="fila-navegable" onClick={() => onIrAPagina(t.page)}>
                        {t.rows[0].map((celda, j) => (
                          <th key={j}>{celda}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.slice(1).map((fila, j) => (
                        <tr key={j} className="fila-navegable" onClick={() => onIrAPagina(t.page)}>
                          {fila.map((celda, k) => (
                            <td key={k}>{celda}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ))}

        {pestana === 'limpio' &&
          resultado.cleanPages.map((p) => (
            <div key={p.page} className="pagina-texto">
              <div className="pagina-texto-titulo">
                <BotonPagina pagina={p.page} onIrAPagina={onIrAPagina} />
                <span className="texto-secundario">{p.lines.length} línea(s)</span>
              </div>
              {p.lines.length === 0 ? (
                <Vacio>Sin líneas tras la limpieza.</Vacio>
              ) : (
                p.lines.map((linea, i) => (
                  <div key={i} className="linea-pdf">
                    <Segmentos linea={linea} />
                  </div>
                ))
              )}
            </div>
          ))}

        {pestana === 'descartado' &&
          (resultado.removed.length === 0 ? (
            <Vacio>La limpieza no descartó ninguna línea.</Vacio>
          ) : (
            <div className="table-scroll">
              <table className="data-table tabla-compacta">
                <thead>
                  <tr>
                    <th>Página</th>
                    <th>Texto</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.removed.map((r, i) => (
                    <tr key={i} className="fila-navegable" onClick={() => onIrAPagina(r.page)}>
                      <td>
                        <BotonPagina pagina={r.page} onIrAPagina={onIrAPagina} />
                      </td>
                      <td>{r.text}</td>
                      <td>
                        <span className="badge badge-neutral">{ETIQUETA_MOTIVO[r.reason] ?? r.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {pestana === 'crudo' &&
          resultado.rawPages.map((p) => (
            <div key={p.page} className="pagina-texto">
              <div className="pagina-texto-titulo">
                <BotonPagina pagina={p.page} onIrAPagina={onIrAPagina} />
                <span className="texto-secundario">
                  {p.width} × {p.height} pt · {p.lines.length} línea(s)
                </span>
              </div>
              {p.lines.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table tabla-compacta">
                    <thead>
                      <tr>
                        <th>y</th>
                        <th>x</th>
                        <th>Segmentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lines.map((linea, i) => (
                        <tr key={i}>
                          <td>{linea.y}</td>
                          <td>{linea.x}</td>
                          <td>
                            <Segmentos linea={linea} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

        {pestana === 'json' && (
          <>
            <div className="table-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copiarJson}>
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={descargarJson}>
                Descargar
              </button>
            </div>
            <pre className="json-extraccion">{json}</pre>
          </>
        )}
      </div>
    </div>
  );
}
