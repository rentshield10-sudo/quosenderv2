import { db } from './database';
import fs from 'fs';
import { config } from '../config';

function reset() {
  console.log('Dropping all tables...');
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS contacts;
  `);
  console.log('  ✓ Tables dropped.');
  db.close();

  // Optionally remove the db file entirely
  if (fs.existsSync(config.databasePath)) {
    // File remains but is now empty of tables
    console.log(`  Database file: ${config.databasePath}`);
  }
}

try {
  reset();
} catch (err) {
  console.error('Reset failed:', err);
  process.exit(1);
}
