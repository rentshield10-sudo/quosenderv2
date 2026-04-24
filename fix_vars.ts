import { db } from './packages/server/src/db/database';

db.prepare(`UPDATE templates SET body = REPLACE(body, '{{schedule}}', '{{default_schedule}}')`).run();
db.prepare(`UPDATE templates SET body = REPLACE(body, '{{contactPhone}}', '{{contact_phone}}')`).run();

console.log('Templates updated to map exact property variable keys.');
