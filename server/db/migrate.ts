import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  verifyFirestoreConnectivity,
  isCloudFirestoreActive,
  firestoreDatabaseId,
} from './firestoreClient';
import { getInitialDatabase } from './seedData';
import { seedOrMigrateDataset } from './repositories';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_JSON_PATH = path.resolve(__dirname, '../../data/crm_database.json');

/**
 * Idempotent migration script (`npm run migrate`):
 * - Reads `data/crm_database.json` if it exists; otherwise uses the default initial dataset.
 * - Normalizes phone numbers (`phoneNormalized`) and populates `leadPhones/{phoneNormalized}`.
 * - Splits embedded `lead.activities` into `leads/{leadId}/activities/{activityId}` subcollection documents.
 * - Uses `{ merge: true }` batched writes so running `npm run migrate` multiple times is 100% safe and idempotent.
 */
async function runMigration() {
  console.log('==============================================================');
  console.log('PropSphere Real Estate CRM — Firestore Migration (Idempotent)');
  console.log('==============================================================');

  const cloudReady = await verifyFirestoreConnectivity();
  console.log(
    `Target Database: ${firestoreDatabaseId} (${
      cloudReady && isCloudFirestoreActive()
        ? 'Cloud Firestore via firebase-admin'
        : 'Local Firestore Repository Store (awaiting Service Account credentials)'
    })`
  );

  let dataset = getInitialDatabase();
  if (fs.existsSync(LEGACY_JSON_PATH)) {
    try {
      const raw = await fs.promises.readFile(LEGACY_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      dataset = {
        ...dataset,
        ...parsed,
      };
      console.log(`Loaded legacy JSON database from: ${LEGACY_JSON_PATH}`);
    } catch (err: any) {
      console.warn(
        `Warning: Could not parse ${LEGACY_JSON_PATH} (${err?.message}). Falling back to default seed data.`
      );
    }
  } else {
    console.log(
      `No legacy file found at ${LEGACY_JSON_PATH}; migrating default seed dataset.`
    );
  }

  const stats = await seedOrMigrateDataset(dataset);

  console.log('--------------------------------------------------------------');
  console.log('Migration Completed Successfully (Idempotent Upsert Summary):');
  console.log(`  • Roles:             ${stats.roles}`);
  console.log(`  • Users:             ${stats.users}`);
  console.log(`  • Leads:             ${stats.leads} (+ leadPhones unique index keys)`);
  console.log(`  • Lead Activities:   ${stats.activities} (in leads/{id}/activities subcollection)`);
  console.log(`  • Properties:        ${stats.properties}`);
  console.log(`  • Deals:             ${stats.deals}`);
  console.log(`  • Calendar Events:   ${stats.events}`);
  console.log(`  • Sheet Connections: ${stats.sheetConnections}`);
  console.log(`  • Sync Logs:         ${stats.syncLogs}`);
  console.log(`  • Notifications:     ${stats.notifications}`);
  console.log('==============================================================');
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
