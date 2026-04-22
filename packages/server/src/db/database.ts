import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../config';

const dbPath = config.databasePath;

// Ensure the directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export { db };
