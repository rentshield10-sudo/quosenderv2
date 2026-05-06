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

templatesRouter.post('/render', (req, res) => {
  const { templateId, apt_address, lead_name, phone } = req.body;
  if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required' });
  if (!apt_address) return res.status(400).json({ success: false, error: 'apt_address is required' });

  // 1. Find template
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as { id: string, name: string, body: string } | undefined;
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

  // 2. Find property matching address (fuzzy match)
  const property = db.prepare('SELECT * FROM properties WHERE address LIKE ?').get(`%${apt_address}%`) as Record<string, any> | undefined;
  if (!property) return res.status(404).json({ success: false, error: 'Apartment/Property not found for the given address' });

  // 3. Render template using combined property fields and input payload (lead_name, phone)
  const context: Record<string, any> = { ...property, lead_name, phone };
  
  const renderedMessage = template.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const value = context[key.trim()];
    return value !== undefined && value !== null ? value : match;
  });

  res.json({
    success: true,
    templateId: template.id,
    message: renderedMessage
  });
});

// ==== ENDPOINT FOR N8N BY ADDRESS ====
templatesRouter.post('/render-by-address', (req, res) => {
  const { apt_address, templateKey } = req.body;
  if (!apt_address) return res.status(400).json({ success: false, error: 'apt_address is required' });
  if (!templateKey) return res.status(400).json({ success: false, error: 'templateKey is required' });

  // 1. Find template by fuzzy matching the templateKey string
  let templateQuery = '';
  if (templateKey === 'initial_outreach') {
     templateQuery = '%Initial Outreach%';
  } else {
     templateQuery = `%${templateKey}%`;
  }
  
  const template = db.prepare('SELECT * FROM templates WHERE name LIKE ?').get(templateQuery) as { id: string, name: string, body: string } | undefined;
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

  // 2. Find property matching address
  const property = db.prepare('SELECT * FROM properties WHERE address LIKE ? OR name LIKE ?').get(`%${apt_address}%`, `%${apt_address}%`) as Record<string, any> | undefined;
  if (!property) return res.status(404).json({ success: false, error: 'Apartment not found' });

  // 3. Render template
  const context: Record<string, any> = { ...property };
  
  const renderedMessage = template.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const value = context[key.trim()];
    return value !== undefined && value !== null ? value : match;
  });

  res.json({
    success: true,
    apt_address: apt_address,
    templateKey: templateKey,
    templateId: template.id,
    propertyId: property.id,
    message: renderedMessage
  });
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
