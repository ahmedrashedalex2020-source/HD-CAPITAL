import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AddressInfo } from 'node:net';
import {
  hashPasswordSecure,
  verifyPasswordSecure,
  legacySha256Hash,
  signSessionToken,
  verifySessionToken,
  checkScopeAccess,
} from '../server/security';
import { normalizePhone } from '../server/db/phoneUtils';
import { createCrmApp } from '../server';

test('1. Security: Scrypt password hashing, legacy SHA-256 upgrade, and constant-time verification', () => {
  const hash = hashPasswordSecure('MySecretPass!2026');
  assert.ok(hash.startsWith('scrypt$'), 'Hash should use scrypt$ format');

  const validCheck = verifyPasswordSecure('MySecretPass!2026', hash);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.needsUpgrade, false);

  const wrongCheck = verifyPasswordSecure('WrongPassword', hash);
  assert.equal(wrongCheck.valid, false);

  // Legacy SHA-256 hash should verify and flag needsUpgrade = true
  const oldHash = legacySha256Hash('admin123');
  const legacyCheck = verifyPasswordSecure('admin123', oldHash);
  assert.equal(legacyCheck.valid, true);
  assert.equal(legacyCheck.needsUpgrade, true);
});

test('2. Security: HMAC-SHA256 Session Tokens reject tampering and expiration', () => {
  const token = signSessionToken({
    id: 'usr_admin',
    roleId: 'role_admin',
    username: 'admin',
  });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified.userId, 'usr_admin');
  assert.equal(verified.roleId, 'role_admin');

  // Tamper with payload
  const [payloadB64, sigB64] = token.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({
      userId: 'usr_admin',
      roleId: 'role_admin',
      username: 'hacker',
      iat: Date.now(),
      exp: Date.now() + 60000,
    })
  ).toString('base64url');
  assert.equal(verifySessionToken(`${forgedPayload}.${sigB64}`), null);
  assert.equal(verifySessionToken(`${payloadB64}.invalidSignature`), null);

  // Expired token
  const expiredToken = signSessionToken(
    { id: 'usr_sales1', roleId: 'role_employee', username: 'sara' },
    -1000
  );
  assert.equal(verifySessionToken(expiredToken), null);
});

test('3. Phone Normalization: Canonical Egyptian and International phone deduplication keys', () => {
  const p1 = normalizePhone('+20 100 555 7788');
  const p2 = normalizePhone('01005557788');
  const p3 = normalizePhone('00201005557788');
  const p4 = normalizePhone('1005557788');
  assert.equal(p1, '201005557788');
  assert.equal(p2, '201005557788');
  assert.equal(p3, '201005557788');
  assert.equal(p4, '201005557788');
});

test('4. Full API Integration: Zero Mock Data, Auth Enforcement, RBAC Scopes, CRM1 Sync, Deduplication & Reports', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'propsphere-audit-test-'));
  const testDbPath = path.join(tmpDir, 'test_crm_db.json');

  const { app, stopBackgroundSync } = createCrmApp({
    dbPath: testDbPath,
    disableBackgroundSync: true,
    strictAuth: true,
  });

  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    stopBackgroundSync();
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function api(
    endpoint: string,
    options: { method?: string; token?: string; body?: any } = {}
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers['x-session-token'] = options.token;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // A. Unauthenticated request must return 401 by default
  const unauthRes = await api('/api/bootstrap');
  assert.equal(unauthRes.status, 401, 'Unauthenticated bootstrap must return 401');

  // A2. Accounts preview must not expose any usernames or passwords
  const previewRes = await api('/api/auth/accounts-preview');
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.data.accounts.length, 0, 'accounts-preview must not expose accounts');

  // B. Login with demo_bypass must be rejected with 401
  const bypassRes = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'demo_bypass' },
  });
  assert.equal(bypassRes.status, 401, 'demo_bypass password must be rejected');

  // C. Login as Admin, Partner Admin (Hassan shehata), and Sales Employee (omarahmed1) with flexible username matching
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(adminLogin.status, 200);
  assert.ok(adminLogin.data.token);
  const adminToken = adminLogin.data.token;

  const hassanLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'Hassan shehata', password: 'HD_CAPITAL' },
  });
  assert.equal(hassanLogin.status, 200, 'Hassan shehata login must succeed');
  assert.equal(hassanLogin.data.user.roleId, 'role_admin');

  const hassanCompactLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'hassanshehata', password: 'HD_CAPITAL' },
  });
  assert.equal(hassanCompactLogin.status, 200, 'Compact hassanshehata login must succeed');

  const employeeLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'omarahmed1', password: '123456' },
  });
  assert.equal(employeeLogin.status, 200);
  const employeeToken = employeeLogin.data.token;

  const employeeArabicNameLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'عمر احمد', password: '123456' },
  });
  assert.equal(employeeArabicNameLogin.status, 200, 'Employee login by Arabic fullName must succeed');

  // C2. Quick account switching must be blocked with 403
  const switchAttempt = await api('/api/auth/switch-account', {
    method: 'POST',
    token: employeeToken,
    body: { targetUserId: 'usr_admin' },
  });
  assert.equal(switchAttempt.status, 403, 'Quick account switch must be disabled (403)');

  // C3. Employee bootstrap must only return employee's own profile and 0 sheetConnections
  const empBoot = await api('/api/bootstrap', { token: employeeToken });
  assert.equal(empBoot.status, 200);
  assert.equal(empBoot.data.users.length, 1, 'Employee must only see their own user profile');
  assert.equal(empBoot.data.users[0].username, 'omarahmed1');
  assert.equal(empBoot.data.sheetConnections.length, 0, 'Employee must not receive sheetConnections');

  // D. Verify zero mock data and zero fake employees on fresh database initialization
  const bootRes = await api('/api/bootstrap', { token: adminToken });
  assert.equal(bootRes.status, 200);
  assert.equal(bootRes.data.users.length, 3, 'Only the 3 real accounts should exist');
  assert.equal(bootRes.data.leads.length, 0, 'Initial leads must be 0 (Zero mock data)');
  assert.equal(bootRes.data.deals.length, 0, 'Initial deals must be 0');
  assert.equal(bootRes.data.properties.length, 0, 'Initial properties must be 0');
  assert.equal(bootRes.data.events.length, 0, 'Initial events must be 0');
  assert.equal(bootRes.data.sheetConnections[0].driveFileName, 'CRM1');

  // E. CRM1 Sheet Sync: Import real CSV rows with ID columns + Form Q&A, verify ID stripping & deduplication
  const sampleCrm1Csv = [
    'id,lead_id,ad_id,الاسم,رقم التليفون,campaign_name,ما_المساحة_المناسبة_؟,السعر_المناسب',
    '9911,l:123456,a:9988,أحمد سمير عبد القادر,p:+201012345678,ليدز مغتربين,185م,4.5_مليون',
    '9912,l:123457,a:9989,منى الشاذلي,01123456789,ليدز مغتربين,215م,6_مليون',
    // Duplicate row with different phone formatting for Ahmed Samir
    '9913,l:123458,a:9990,أحمد سمير عبد القادر,01012345678,ليدز مغتربين,185م,4.5_مليون',
  ].join('\n');

  const syncRes1 = await api('/api/sheets/sync', {
    method: 'POST',
    token: adminToken,
    body: { csvText: sampleCrm1Csv },
  });
  assert.equal(syncRes1.status, 200);
  assert.equal(syncRes1.data.newLeadsImported, 2, 'Should import 2 unique leads');
  assert.equal(syncRes1.data.duplicatesSkipped, 1, 'Should skip 1 duplicate row in same sheet');
  assert.equal(syncRes1.data.idColumnsStripped, 3, 'Should strip id, lead_id, and ad_id columns');

  // Re-running the exact same sync must import 0 and skip all 3 rows (Idempotency)
  const syncRes2 = await api('/api/sheets/sync', {
    method: 'POST',
    token: adminToken,
    body: { csvText: sampleCrm1Csv },
  });
  assert.equal(syncRes2.status, 200);
  assert.equal(syncRes2.data.newLeadsImported, 0, 'Repeated sync must not import duplicates');
  assert.equal(syncRes2.data.duplicatesSkipped, 3);

  // Verify imported lead structure has formResponses without ID fields
  const allLeadsRes = await api('/api/leads', { token: adminToken });
  assert.equal(allLeadsRes.status, 200);
  assert.equal(allLeadsRes.data.length, 2);
  const ahmedLead = allLeadsRes.data.find((l: any) => l.fullName.includes('أحمد سمير'));
  assert.ok(ahmedLead);
  assert.ok(Array.isArray(ahmedLead.formResponses));
  assert.equal(
    ahmedLead.formResponses.some((fr: any) => /id/i.test(fr.question)),
    false,
    'No ID column should ever appear in formResponses'
  );

  // F. RBAC Enforcement: Sales Employee (omarahmed1) cannot sync sheets, delete leads, or modify roles matrix
  const empSyncAttempt = await api('/api/sheets/sync', {
    method: 'POST',
    token: employeeToken,
    body: { csvText: sampleCrm1Csv },
  });
  assert.equal(empSyncAttempt.status, 403, 'Employee role must not be allowed to sync sheets');

  const empRoleModify = await api('/api/roles/matrix', {
    method: 'PUT',
    token: employeeToken,
    body: { roles: [] },
  });
  assert.equal(empRoleModify.status, 403, 'Employee role must not modify RBAC matrix');

  const empDeleteLead = await api(`/api/leads/${ahmedLead.id}`, {
    method: 'DELETE',
    token: employeeToken,
  });
  assert.equal(empDeleteLead.status, 403, 'Employee role must not delete leads');

  // G. Lead Transfer & Deal Auto-Creation on Won Status + Daily Reports Accuracy
  const transferRes = await api('/api/leads/transfer', {
    method: 'POST',
    token: adminToken,
    body: {
      leadIds: [ahmedLead.id],
      toUserId: 'usr_1793010490703_1p0c',
      reason: 'اختبار نقل العميل إلى عمر احمد',
    },
  });
  assert.equal(transferRes.status, 200);
  assert.equal(transferRes.data.transferredCount, 1);

  // Employee can now log an activity and mark his assigned lead as Won
  const actRes = await api(`/api/leads/${ahmedLead.id}/activities`, {
    method: 'POST',
    token: employeeToken,
    body: {
      type: 'call',
      summary: 'تم التواصل مع العميل والاتفاق على التعاقد النهائي',
      newStatus: 'Won',
    },
  });
  assert.equal(actRes.status, 200);
  assert.equal(actRes.data.lead.status, 'Won');

  // Verify deal was automatically created and Daily Report reflects employee call & Won revenue
  const reportRes = await api('/api/reports/daily', { token: adminToken });
  assert.equal(reportRes.status, 200);
  const empStats = reportRes.data.agentStats.find((s: any) => s.userId === 'usr_1793010490703_1p0c');
  assert.ok(empStats);
  assert.equal(empStats.callsToday, 1);
  assert.equal(empStats.wonDealsCount, 1);
  assert.equal(empStats.wonRevenue, 4500000);
});
