import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Role } from '../src/common/enums';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// idRole de la tabla [Role] (ver DML.sql) para cada valor del enum Role de
// la aplicación. Estas filas deben existir ya (las crea DML.sql) antes de
// correr este seed.
const ROLE_ID: Record<Role, string> = {
  [Role.ESTUDIANTE]: 'ROL-EST',
  [Role.ADMINISTRADOR]: 'ROL-ADM',
};

async function upsertUser(email: string, password: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({ where: { correoInstitucional: email } });

  if (existing) {
    await prisma.user.update({
      where: { idUser: existing.idUser },
      data: { passwordHash },
    });
    return;
  }

  await prisma.user.create({
    data: {
      idUser: randomUUID(),
      idRole: ROLE_ID[role],
      correoInstitucional: email,
      passwordHash,
    },
  });
}

async function main() {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAIN ?? '@simula.edu.hn';
  await upsertUser(`estudiante${domain}`, 'Estudiante123', Role.ESTUDIANTE);
  await upsertUser(`admin${domain}`, 'Administrador123', Role.ADMINISTRADOR);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
