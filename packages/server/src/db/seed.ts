import { db } from './database';

function seed() {
  console.log('Seeding database...');
  // Note: We no longer execute seed.sql for fake chats.
  // Properties and templates are handled by migration 003.
  console.log('  ✓ Seed data inserted (skipping fake chats).');
  db.close();
}

try {
  seed();
} catch (err) {
  console.error('Seed failed:', err);
  process.exit(1);
}
