/**
 * resetAllPasswords.js — Cambia la contraseña de TODOS los usuarios a una misma.
 *
 * Uso:
 *   node --env-file=.env.local scripts/resetAllPasswords.js "nuevaPassword"
 *
 * Funciona en ambos modos:
 *   - Local JSON:  STORAGE_BACKEND=json
 *   - Supabase:    STORAGE_BACKEND=supabase
 *
 * Requiere que la contraseña tenga al menos 6 caracteres.
 */

import bcrypt from 'bcryptjs';
import { users } from '../server/db/collections.js';

const SALT_ROUNDS = 12;

async function main() {
  const [newPassword] = process.argv.slice(2);

  if (!newPassword) {
    console.log('❌ Uso: node --env-file=.env.local scripts/resetAllPasswords.js "nuevaPassword"');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.log('❌ La contraseña debe tener al menos 6 caracteres');
    process.exit(1);
  }

  const all = await users.getAll();

  if (all.length === 0) {
    console.log('❌ No hay usuarios para actualizar');
    process.exit(1);
  }

  console.log(`Encontrados ${all.length} usuarios.`);

  for (const user of all) {
    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.updatedAt = new Date().toISOString();
    await users.upsert(user);
    console.log(`✅ ${user.username} (${user.role})`);
  }

  console.log('');
  console.log(`✅ Contraseña actualizada para todos los usuarios.`);
  console.log(`   Nueva password: ${newPassword}`);
  console.log(`   Total: ${all.length}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
