// prisma/seed.ts
//
// Seeds the single AppSettings row (id=1) on first run, so the app has a
// password to log in with. Safe to re-run (no-ops if a row already exists).
// Invoke with: npm run seed

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

// def main(): Input is none (reads DEFAULT_ADMIN_PASSWORD from
// process.env). Output is a Promise resolving to none (side effect:
// ensures exactly one AppSettings row exists in the database).
// Pseudocode:
//   1. Check whether an AppSettings row with id=1 already exists
//      (prisma.appSettings.findUnique({ where: { id: 1 } })).
//   2. If it exists, log "Already seeded, skipping." and return.
//   3. If not, read process.env.DEFAULT_ADMIN_PASSWORD (throw a clear error
//      if it's unset).
//   4. Hash it via hashPassword() from src/lib/auth.ts.
//   5. Create the AppSettings row (id=1) with that passwordHash and blank
//      organizationName/registerLabel/signatoryName/signatoryCredentials/
//      signatoryTitle (to be filled in later via the /admin/settings page).
//   6. Log a confirmation message.
async function main(): Promise<void> {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) {
    console.log('Already seeded, skipping.');
    return;
  }

  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!defaultPassword) {
    throw new Error('DEFAULT_ADMIN_PASSWORD is not set in the environment.');
  }

  const passwordHash = await hashPassword(defaultPassword);

  await prisma.appSettings.create({
    data: {
      id: 1,
      passwordHash,
      organizationName: null,
      registerLabel: null,
      signatoryName: null,
      signatoryCredentials: null,
      signatoryTitle: null,
    },
  });

  console.log('Seeded AppSettings row with admin password.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
