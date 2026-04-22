import { quoClient } from './packages/server/src/services/quo.client';

async function run() {
  try {
    const conversationId = process.env.OPENPHONE_TEST_CONVERSATION_ID || 'CNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const page = await quoClient.listMessages(conversationId, []);
    console.log(JSON.stringify(page.data[0], null, 2));
  } catch (err: any) {
    console.log("ERR:", JSON.stringify(err, null, 2));
  }
}
run();
