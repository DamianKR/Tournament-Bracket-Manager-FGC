/**
 * Seed users from existing participants.
 *
 * Creates a default admin and one user account per participant
 * with password "12345". Safe to re-run: skips existing users.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const participantsPath = path.join(dataDir, 'participants.json');
const usersPath = path.join(dataDir, 'users.json');

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = '12345';

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function baseUsername(p) {
  const base = (p.alias?.trim() || p.name?.trim() || 'user').toLowerCase();
  return base.replace(/[^a-z0-9]/g, '') || 'user';
}

const participants = JSON.parse(fs.readFileSync(participantsPath, 'utf8'));
let users = [];
try {
  users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]');
} catch {
  users = [];
}

const usedUsernames = new Set(users.map(u => u.username));
const usedParticipantIds = new Set(users.map(u => u.participantId).filter(Boolean));
const newUsers = [];
let skipped = 0;

// Default admin (only if not present)
if (!users.some(u => u.username === 'admin')) {
  newUsers.push({
    id: generateId('user'),
    participantId: null,
    username: 'admin',
    passwordHash: bcrypt.hashSync(DEFAULT_PASSWORD, SALT_ROUNDS),
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  });
  usedUsernames.add('admin');
  console.log('Created admin account: admin / 12345');
} else {
  console.log('Admin account already exists, skipping.');
}

for (const p of participants) {
  if (usedParticipantIds.has(p.id)) {
    skipped++;
    continue;
  }

  let username = baseUsername(p);
  let counter = 1;
  while (usedUsernames.has(username)) {
    username = `${baseUsername(p)}${counter}`;
    counter++;
  }
  usedUsernames.add(username);

  newUsers.push({
    id: generateId('user'),
    participantId: p.id,
    username,
    passwordHash: bcrypt.hashSync(DEFAULT_PASSWORD, SALT_ROUNDS),
    role: 'user',
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  });
}

users = [...users, ...newUsers];
fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

console.log(`Created ${newUsers.length} new accounts (including admin if new).`);
console.log(`Skipped ${skipped} participants that already have accounts.`);
console.log(`Total users in data/users.json: ${users.length}`);
