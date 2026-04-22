export {}
const db = require('better-sqlite3')('./packages/server/data/quosender.db');
db.prepare('DELETE FROM messages').run();
console.log('cleared messages');
