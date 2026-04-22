import { db } from './database';
import fs from 'fs';
import path from 'path';

function seed() {
  const sql = fs.readFileSync(path.resolve(__dirname, 'seed.sql'), 'utf-8');
  console.log('Seeding database...');
  db.exec(sql);
  console.log('  ✓ Seed data inserted.');
  db.close();
}

try {
  seed();
} catch (err) {
  console.error('Seed failed:', err);
  process.exit(1);
}
