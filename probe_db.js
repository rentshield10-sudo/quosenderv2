const db = require('better-sqlite3')('packages/server/data/quosender.db');

const convs = db.prepare('SELECT * FROM conversations LIMIT 2').all();
console.log('CONVS:', convs);

if (convs.length > 0) {
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(convs[0].id);
  console.log('MSGS FOR', convs[0].id, ':', msgs);
  
  const allMsgs = db.prepare('SELECT * FROM messages LIMIT 2').all();
  console.log('ALL MSGS:', allMsgs);
}
