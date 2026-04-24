import { db } from './packages/server/src/db/database';
import fs from 'fs';

const properties = db.prepare('SELECT * FROM properties').all();
const templates = db.prepare('SELECT * FROM templates').all();

const out = {
  properties,
  templates
};

fs.writeFileSync('temps.json', JSON.stringify(out, null, 2), 'utf-8');
