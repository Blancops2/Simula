import { EstadoHistorial } from '../common/enums';
import {
  MallaCandidata,
  buscarCarrera,
  columnaCodigoEquivalencia,
  columnasDeHistorial,
  elegirMalla,
  interpretarFilaHistorial,
  normalizarCodigo,
} from './guardado-historial.reglas';

const COLUMNAS = ['Código', 'Asignatura', 'UV/CA', 'Sección', 'Año', 'Periodo', 'Calif.', 'OBS.'];

describe('normalizarCodigo', () => {
  it.each([
    ['FF101', 'FF101'],
    ['FF-101', 'FF101'],
    [' mat 101 ', 'MAT101'],
    ['IS–210', 'IS210'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });
});

describe('buscarCarrera', () => {
  const carreras = [
    { idCarrera: 'ISC', nombre: 'Ingenieria en Sistemas Computacionales' },
    { idCarrera: 'IC', nombre: 'Ingeniería Civil' },
    { idCarrera: 'II', nombre: 'Ingeniería Industrial' },
  ];

  it('coincide sin tildes ni mayúsculas', () => {
    expect(buscarCarrera(carreras, 'INGENIERÍA EN SISTEMAS COMPUTACIONALES')).toEqual({
      tipo: 'encontrada',
      carrera: carreras[0],
    });
  });

  it('acepta que un nombre contenga al otro', () => {
    expect(buscarCarrera(carreras, 'Licenciatura en Ingeniería Civil')).toMatchObject({ carrera: { idCarrera: 'IC' } });
    expect(buscarCarrera(carreras, 'Sistemas Computacionales')).toMatchObject({ carrera: { idCarrera: 'ISC' } });
  });

  it('no adivina si hay varias candidatas', () => {
    expect(buscarCarrera(carreras, 'Ingeniería')).toMatchObject({ tipo: 'ambigua' });
  });

  it('informa si no la encuentra', () => {
    expect(buscarCarrera(carreras, 'Medicina')).toEqual({ tipo: 'no_encontrada' });
    expect(buscarCarrera(carreras, '   ')).toEqual({ tipo: 'no_encontrada' });
  });
});

describe('elegirMalla', () => {
  const malla = (id: string, version: number, activa: boolean, codigos: string[]): MallaCandidata => ({
    idPlantillaMalla: id,
    nombre: id,
    version,
    activa,
    codigos: new Set(codigos),
  });
  const activa = malla('v2', 2, true, ['A1', 'B1', 'C1']);
  const anterior = malla('v1', 1, false, ['A1', 'X1', 'Y1', 'Z1']);

  it('elige la que tiene más coincidencias, aunque sea la anterior', () => {
    const eleccion = elegirMalla([activa, anterior], new Set(['A1', 'X1', 'Y1']));
    expect(eleccion?.malla.idPlantillaMalla).toBe('v1');
    expect(eleccion?.coincidencias).toBe(3);
    expect(eleccion?.alternativa).toMatchObject({ malla: { idPlantillaMalla: 'v2' }, coincidencias: 1 });
  });

  it('si empatan, gana la más reciente', () => {
    const eleccion = elegirMalla([anterior, activa], new Set(['A1', 'B1', 'X1']));
    expect(eleccion?.malla.idPlantillaMalla).toBe('v2');
  });

  it('con una sola candidata (sin versión anterior) la devuelve sin alternativa', () => {
    expect(elegirMalla([activa], new Set(['A1']))).toMatchObject({ coincidencias: 1, alternativa: null });
    expect(elegirMalla([], new Set(['A1']))).toBeNull();
  });
});

describe('columnas', () => {
  it('ubica las columnas del historial por su encabezado', () => {
    expect(columnasDeHistorial(COLUMNAS)).toEqual({
      codigo: 0,
      asignatura: 1,
      anno: 4,
      periodo: 5,
      calificacion: 6,
      seccion: 3,
    });
  });

  it('en equivalencias usa el código equivalente, o el código si no se distingue', () => {
    expect(
      columnaCodigoEquivalencia(['CÓD. ASIGNATURA', 'ASIGNATURA CURSADA', 'CÓD. EQUIVALENTE', 'ASIGNATURA EQUIVALENTE']),
    ).toBe(2);
    expect(columnaCodigoEquivalencia(COLUMNAS)).toBe(0);
    expect(columnaCodigoEquivalencia([])).toBe(-1);
  });
});

describe('interpretarFilaHistorial', () => {
  const col = columnasDeHistorial(COLUMNAS);
  const fila = (calif: string, anno = '2024', periodo = '1') => ['MAT-101', 'Matemática', '5', '0700', anno, periodo, calif, 'APR'];

  it('aprobada con 65 o más, reprobada por debajo (desde la calificación, no desde OBS)', () => {
    expect(interpretarFilaHistorial(fila('65'), col)).toEqual({
      valida: true,
      codigo: 'MAT101',
      anno: '2024',
      periodo: '1',
      estado: EstadoHistorial.APROBADA,
      nota: '65',
      seccion: '0700',
    });
    expect(interpretarFilaHistorial(fila('64'), col)).toMatchObject({ estado: EstadoHistorial.REPROBADA, nota: '64' });
  });

  it('NSP: no se presentó, sin nota', () => {
    expect(interpretarFilaHistorial(fila('NSP'), col)).toMatchObject({ estado: EstadoHistorial.NSP, nota: null });
  });

  it('acepta el período en una sola columna ("2024-2")', () => {
    const col2 = columnasDeHistorial(['Código', 'Asignatura', 'Periodo', 'Nota']);
    expect(interpretarFilaHistorial(['IS-101', 'Prog.', '2024-2', '90'], col2)).toMatchObject({
      anno: '2024',
      periodo: '2',
      seccion: null,
    });
  });

  it.each([
    ['calificación fuera de rango', fila('101'), /Calificación inválida/],
    ['calificación ilegible', fila('A+'), /Calificación inválida/],
    ['calificación vacía', fila(''), /Calificación inválida/],
    ['año ilegible', fila('80', '24'), /Año o período/],
  ])('rechaza %s', (_caso, cells, motivo) => {
    const r = interpretarFilaHistorial(cells, col);
    expect(r.valida).toBe(false);
    if (!r.valida) expect(r.motivo).toMatch(motivo);
  });
});
