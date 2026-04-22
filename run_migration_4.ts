import { db } from './packages/server/src/db/database';
import fs from 'fs';

try {
  const sql = fs.readFileSync('./packages/server/src/db/migrations/004_add_time_to_properties.sql', 'utf8');
  db.exec(sql);
  console.log('Migration 004 completed manually.');
} catch (e: any) {
    if (e.message.includes('duplicate column name')) {
        console.log('Migration 004 already applied.');
    } else {
      console.error('Migration failed:', e);
      process.exit(1);
    }
}
