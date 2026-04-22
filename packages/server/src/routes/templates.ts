import { Router } from 'express';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export const templatesRouter = Router();
export const propertiesRouter = Router();

type TableInfoRow = { name: string };

const ensurePropertyColumns = () => {
  const existingColumns = new Set<TableInfoRow['name']>(
    (db.prepare('PRAGMA table_info(properties)').all() as TableInfoRow[]).map(col => col.name)
  );

  const required: Array<{ name: string; type: string }> = [
    { name: 'time', type: 'TEXT' },
    { name: 'city', type: 'TEXT' },
    { name: 'state', type: 'TEXT' }
  ];

  for (const column of required) {
    if (!existingColumns.has(column.name)) {
      db.prepare(`ALTER TABLE properties ADD COLUMN ${column.name} ${column.type}`).run();
      existingColumns.add(column.name);
    }
  }
};

ensurePropertyColumns();

// ==== TEMPLATES ====
templatesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY created_at ASC').all();
  res.json(rows);
});

const SAFE_TEMPLATE_REGEX = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g;

const sanitizeBody = (input: string) => {
  const ENTITY_MAP: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#34': '"',
    '#39': "'",
    '#38': '&'
  };

  const decoded = input.replace(/&(#?\w+);/g, (match, entity) => {
    if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
    return match;
  });

  return decoded;
};

const buildTemplatePayload = (reqBody: any) => {
  const { name, body } = reqBody ?? {};
  if (!name || typeof name !== 'string') {
    return { error: 'Template name is required.' };
  }
  if (!body || typeof body !== 'string') {
    return { error: 'Template body is required.' };
  }
  const normalized = sanitizeBody(body).trim();
  return { name: name.trim(), body: normalized };
};

templatesRouter.post('/', (req, res) => {
  const payload = buildTemplatePayload(req.body);
  if ('error' in payload) {
    return res.status(400).json({ error: payload.error });
  }

  const id = `tmpl-${uuidv4().slice(0, 8)}`;
  db.prepare('INSERT INTO templates (id, name, body) VALUES (?, ?, ?)').run(id, payload.name, payload.body);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(id));
});

templatesRouter.put('/:id', (req, res) => {
  const payload = buildTemplatePayload(req.body);
  if ('error' in payload) {
    return res.status(400).json({ error: payload.error });
  }

  db.prepare("UPDATE templates SET name = ?, body = ?, updated_at = datetime('now') WHERE id = ?").run(payload.name, payload.body, req.params.id);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id));
});

templatesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==== PROPERTIES ====
propertiesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM properties ORDER BY created_at ASC').all();
  res.json(rows);
});

propertiesRouter.post('/', (req, res) => {
  const { name, address, price, bedrooms, contact_phone, default_schedule, time, city, state } = req.body;
  const id = `prop-${uuidv4().slice(0,8)}`;
  db.prepare(`
    INSERT INTO properties (id, name, address, price, bedrooms, contact_phone, default_schedule, time, city, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, address, price, bedrooms, contact_phone, default_schedule, time ?? null, city ?? null, state ?? null);
  res.json(db.prepare('SELECT * FROM properties WHERE id = ?').get(id));
});

propertiesRouter.put('/:id', (req, res) => {
  const { name, address, price, bedrooms, contact_phone, default_schedule, time, city, state } = req.body;
  db.prepare(`
    UPDATE properties SET 
      name = ?, address = ?, price = ?, bedrooms = ?, contact_phone = ?, default_schedule = ?, time = ?, city = ?, state = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name, address, price, bedrooms, contact_phone, default_schedule, time ?? null, city ?? null, state ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id));
});

propertiesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
