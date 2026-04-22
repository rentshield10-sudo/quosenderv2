import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const defaultDbPath = path.resolve(__dirname, '../../../data/quosender.db');
let envDbPath = process.env.DATABASE_PATH;
if (envDbPath && !path.isAbsolute(envDbPath)) {
  envDbPath = path.resolve(__dirname, '../../../', envDbPath);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databasePath: envDbPath || defaultDbPath,
  senderAdapterUrl: process.env.SENDER_ADAPTER_URL || 'http://localhost:4001',
  pageSize: 30,
  quoApiKey: process.env.QUO_API_KEY || '',
  quoBaseUrl: process.env.QUO_BASE_URL || 'https://api.openphone.com',
};
