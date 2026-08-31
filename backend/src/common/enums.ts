/**
 * SQL Server no soporta el tipo `enum` de Prisma ("the current connector does
 * not support enums"), a diferencia de Postgres. Estos objetos reemplazan a
 * los enums que antes generaba `@prisma/client` y se usan exactamente igual
 * (`Role.ESTUDIANTE`, `@IsEnum(Role)`, `@ApiProperty({ enum: Role })`, etc.).
 * Las columnas correspondientes ahora son `String` acotado en schema.prisma;
 * la validación de los valores permitidos vive aquí y en los DTOs, no en la
 * base de datos.
 */

export const Role = {
  ESTUDIANTE: 'ESTUDIANTE',
  ADMINISTRADOR: 'ADMINISTRADOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// La tabla real [Role] es un catálogo (idRole -> nombre) en vez del string
// plano que manejaba el schema anterior. Este mapa traduce el idRole de la
// BD (ver DML.sql) al enum Role de la aplicación.
export const ROLE_ID_MAP: Record<string, Role> = {
  'ROL-EST': Role.ESTUDIANTE,
  'ROL-ADM': Role.ADMINISTRADOR,
};

export const TipoClase = {
  OBLIGATORIA: 'OBLIGATORIA',
  ELECTIVA: 'ELECTIVA',
} as const;
export type TipoClase = (typeof TipoClase)[keyof typeof TipoClase];

export const TipoRequisito = {
  PRERREQUISITO: 'PRERREQUISITO',
  CORREQUISITO: 'CORREQUISITO',
} as const;
export type TipoRequisito = (typeof TipoRequisito)[keyof typeof TipoRequisito];

// Requisito.tipoRequisito es VARCHAR(1) en la BD real: un solo carácter en
// vez del string completo del enum.
export const TIPO_REQUISITO_DB: Record<TipoRequisito, string> = {
  [TipoRequisito.PRERREQUISITO]: 'P',
  [TipoRequisito.CORREQUISITO]: 'C',
};
export const TIPO_REQUISITO_APP: Record<string, TipoRequisito> = {
  P: TipoRequisito.PRERREQUISITO,
  C: TipoRequisito.CORREQUISITO,
};

export const EstadoHistorial = {
  APROBADA: 'APROBADA',
  REPROBADA: 'REPROBADA',
  EN_CURSO: 'EN_CURSO',
} as const;
export type EstadoHistorial = (typeof EstadoHistorial)[keyof typeof EstadoHistorial];

export const OrigenHistorial = {
  ADMIN: 'ADMIN',
  AUTOREPORTE: 'AUTOREPORTE',
} as const;
export type OrigenHistorial = (typeof OrigenHistorial)[keyof typeof OrigenHistorial];
