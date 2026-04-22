import { db } from './packages/server/src/db/database';
db.prepare('DELETE FROM messages').run();
console.log('cleared messages');
