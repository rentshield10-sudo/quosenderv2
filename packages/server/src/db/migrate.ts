import { db } from './database';
import fs from 'fs';
import path from 'path';

function migrate() {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    db.exec(sql);
    console.log(`  ✓ ${file}`);
  }

  console.log('All migrations complete.');
  db.close();
}

try {
  migrate();
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
