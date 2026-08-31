import type { TipoClase } from '../../curriculum/types';

export interface ClaseFormValues {
  codigo: string;
  nombre: string;
  unidadesValorativas: string;
  nivel: string;
  tipo: TipoClase;
}

interface ClaseFormFieldsProps {
  values: ClaseFormValues;
  onChange: (values: ClaseFormValues) => void;
}

export function ClaseFormFields({ values, onChange }: ClaseFormFieldsProps) {
  function set<K extends keyof ClaseFormValues>(key: K, value: ClaseFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="inline-form inline-form-end">
      <label className="field">
        Código
        <input placeholder="p. ej. MAT101" value={values.codigo} onChange={(e) => set('codigo', e.target.value)} />
      </label>
      <label className="field">
        Nombre
        <input
          placeholder="p. ej. Cálculo I"
          value={values.nombre}
          onChange={(e) => set('nombre', e.target.value)}
        />
      </label>
      <label className="field">
        Unidades valorativas
        <input
          type="number"
          min={1}
          style={{ width: 90 }}
          value={values.unidadesValorativas}
          onChange={(e) => set('unidadesValorativas', e.target.value)}
        />
      </label>
      <label className="field">
        Nivel
        <input
          type="number"
          min={1}
          style={{ width: 80 }}
          value={values.nivel}
          onChange={(e) => set('nivel', e.target.value)}
        />
      </label>
      <label className="field">
        Tipo
        <select value={values.tipo} onChange={(e) => set('tipo', e.target.value as TipoClase)}>
          <option value="OBLIGATORIA">Obligatoria</option>
          <option value="ELECTIVA">Electiva</option>
        </select>
      </label>
    </div>
  );
}
