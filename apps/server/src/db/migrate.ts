import { DatabaseService } from '@ks-agent/database';
import { getDatabasePath } from '../config';

const db = new DatabaseService({ path: getDatabasePath() });

console.log('Database migration complete. Schema initialized at', getDatabasePath());
db.close();