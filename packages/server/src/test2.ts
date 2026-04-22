import { db } from './db/database';

async function test() {
  const conv = db.prepare('SELECT id FROM conversations LIMIT 1').get() as any;
  if (!conv) return console.log('NO CONVS');
  
  const res = await fetch(`http://localhost:4000/conversations/${conv.id}/messages`);
  const json = await res.json();
  console.log('GET /conversations/:id/messages returned', json.data.length, 'records.');
  console.log('First Record Body:', json.data[0]?.body);
  console.log('First Record Direction:', json.data[0]?.direction);
}
test();
