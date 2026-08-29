/**
 * resetAdminPassword.js — Cambia/resetea la contraseña del admin.
 *
 * Uso:
 *   node --env-file=.env.local scripts/resetAdminPassword.js admin "nuevaPassword"
 *
 * Funciona en ambos modos:
 *   - Local JSON:  STORAGE_BACKEND=json (o sin configurar)
 *   - Supabase:    STORAGE_BACKEND=supabase + SUPABASE_URL + SUPABASE_SERVICE_KEY
 *
 * Si no sabes el username del admin, usa:
 *   node --env-file=.env.local scripts/resetAdminPassword.js
 * para listar todos los usuarios.
 */

import bcrypt from 'bcryptjs';
import { users } from '../server/db/collections.js';

const SALT_ROUNDS = 12;

async function listUsers() {
  const all = await users.getAll();
  console.log('');
  console.log('Usuarios existentes:');
  all.forEach((u) => {
    console.log(`  - id: ${u.id}`);
    console.log(`    username: ${u.username}`);
    console.log(`    role: ${u.role}`);
    console.log(`    active: ${u.isActive}`);
  });
  console.log('');
}

async function main() {
  const [targetUsername, newPassword] = process.argv.slice(2);

  if (!targetUsername || !newPassword) {
    console.log('❌ Uso: node --env-file=.env.local scripts/resetAdminPassword.js <username> "nuevaPassword"');
    console.log('   Si no sabes el username, ejecuta solo el script sin argumentos para listar usuarios.');
    await listUsers();
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.log('❌ La contraseña debe tener al menos 6 caracteres');
    process.exit(1);
  }

  const all = await users.getAll();
  const user = all.find((u) => u.username === targetUsername.trim().toLowerCase());

  if (!user) {
    console.log(`❌ No existe un usuario con username "${targetUsername}"`);
    console.log('   Usuarios disponibles:');
    all.forEach((u) => console.log(`     - ${u.username} (${u.role})`));
    process.exit(1);
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordHash = newHash;
  user.updatedAt = new Date().toISOString();

  await users.upsert(user);

  console.log('');
  console.log(`✅ Contraseña actualizada para "${user.username}"`);
  console.log(`   id: ${user.id}`);
  console.log(`   role: ${user.role}`);
  console.log('');
  console.log('Ahora puedes iniciar sesión con:');
  console.log(`   username: ${user.username}`);
  console.log(`   password: ${newPassword}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
