import { db } from './packages/server/src/db/database';
import fs from 'fs';

try {
  const sql = fs.readFileSync('./packages/server/src/db/migrations/003_templates_properties.sql', 'utf8');
  db.exec(sql);
  console.log('Migration 003 completed manually.');
} catch (e) {
  console.error('Migration failed:', e);
  process.exit(1);
}
