import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Layout de respaldo: mismo formato que frontend/src/curriculum/layout.ts
// (COLUMN_WIDTH/ROW_HEIGHT), solo para que las clases no queden todas
// apiladas en el mismo punto. El admin puede reacomodarlas visualmente (o
// usar "Auto-ordenar por nivel") una vez que cada una tenga su propio
// registro en Posicion.
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 150;
const COLUMNAS_POR_FILA = 8;
const NIVEL_POR_DEFECTO = 1;

// Corrige el bug de datos donde varias filas de PlantillaMalla_has_Clase
// comparten la MISMA fila de Posicion (el placeholder legado 'POS-DEFAULT'
// insertado por DML.sql, ver nota ahí). Mientras compartan esa fila, guardar
// la posición de una clase desde el editor visual sobrescribe la posición de
// todas las demás que apunten al mismo registro.
//
// Este script:
//   1) Detecta cualquier Posicion referenciada por más de una fila de
//      PlantillaMalla_has_Clase (no se asume que el único caso sea
//      'POS-DEFAULT', por si hay otros).
//   2) Le crea una fila de Posicion propia a CADA una de esas clases.
//   3) Actualiza su FK (Posicion_idPosicion) para que apunte a su nueva fila.
//   4) NO borra ni modifica la fila compartida original: queda intacta en la
//      tabla, simplemente huérfana (sin referencias) al terminar.
//
// Es seguro volver a correrlo: una vez migrada, ninguna clase sigue
// apuntando a una Posicion compartida, así que una segunda corrida no
// encuentra nada que hacer.
async function main() {
  const relaciones = await prisma.plantillaMalla_has_Clase.findMany({
    select: { idPlantillaMalla_has_Clase: true, Posicion_idPosicion: true },
  });

  const porPosicion = new Map<string, string[]>();
  for (const r of relaciones) {
    const lista = porPosicion.get(r.Posicion_idPosicion) ?? [];
    lista.push(r.idPlantillaMalla_has_Clase);
    porPosicion.set(r.Posicion_idPosicion, lista);
  }

  const afectados: string[] = [];
  for (const [idPosicionCompartida, idsClase] of porPosicion) {
    if (idsClase.length > 1) {
      console.log(`Posicion compartida "${idPosicionCompartida}": ${idsClase.length} clases la usan.`);
      afectados.push(...idsClase);
    }
  }

  if (afectados.length === 0) {
    console.log('No hay ninguna Posicion compartida por más de una clase. Nada que migrar.');
    return;
  }

  console.log(`\nMigrando ${afectados.length} clases a posiciones individuales...`);

  // maxWait/timeout ampliados: la BD real está en Azure (latencia de red por
  // cada ida y vuelta), y son ~100 statements secuenciales dentro de la misma
  // transacción interactiva. El timeout por defecto de Prisma (5s) no alcanza.
  await prisma.$transaction(
    async (tx) => {
      for (const [index, idPlantillaMallaHasClase] of afectados.entries()) {
        const posX = (index % COLUMNAS_POR_FILA) * COLUMN_WIDTH;
        const posY = Math.floor(index / COLUMNAS_POR_FILA) * ROW_HEIGHT;

        const nuevaPosicion = await tx.posicion.create({
          data: {
            idPosicion: randomUUID(),
            posX: String(posX),
            posY: String(posY),
            nivel: NIVEL_POR_DEFECTO,
          },
        });

        await tx.plantillaMalla_has_Clase.update({
          where: { idPlantillaMalla_has_Clase: idPlantillaMallaHasClase },
          data: { Posicion_idPosicion: nuevaPosicion.idPosicion },
        });
      }
    },
    { timeout: 60_000, maxWait: 20_000 },
  );

  console.log(`Listo. ${afectados.length} clases ahora tienen su propia fila en Posicion.`);
  console.log('La(s) fila(s) de Posicion compartida(s) original(es) quedaron sin modificar (huérfanas).');
  console.log(
    `Todas las clases migradas quedaron con nivel=${NIVEL_POR_DEFECTO}; reordénalas desde el editor (arrastrar, "Auto-ordenar por nivel" o el campo nivel del modal de edición).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
