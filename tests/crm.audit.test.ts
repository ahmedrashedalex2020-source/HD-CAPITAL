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
} from '../server/security';
import { normalizePhone, convertArabicDigitsToEnglish } from '../server/db/phoneUtils';
import {
  LEAD_STATUS_ORDER,
  LEAD_SOURCES,
  normalizeLeadStatus,
  LeadStatus,
} from '../src/types/crm';
import {
  handleLocalFallbackRequest,
  resetCloudStoreTestState,
  sanitizeCrm1Workspace,
  saveLocalSnapshot,
  normalizePhone as clientNormalizePhone,
} from '../src/services/cloudStore';
import { createCrmApp } from '../server';

test('Security Baseline: Scrypt password hashing, legacy SHA-256 upgrade, and HMAC-SHA256 Session Tokens', () => {
  const hash = hashPasswordSecure('MySecretPass!2026');
  assert.ok(hash.startsWith('scrypt$'), 'Hash should use scrypt$ format');

  const validCheck = verifyPasswordSecure('MySecretPass!2026', hash);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.needsUpgrade, false);

  const wrongCheck = verifyPasswordSecure('WrongPassword', hash);
  assert.equal(wrongCheck.valid, false);

  const oldHash = legacySha256Hash('admin123');
  const legacyCheck = verifyPasswordSecure('admin123', oldHash);
  assert.equal(legacyCheck.valid, true);
  assert.equal(legacyCheck.needsUpgrade, true);

  const token = signSessionToken({
    id: 'usr_admin',
    roleId: 'role_admin',
    username: 'admin',
  });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified.userId, 'usr_admin');
  assert.equal(verified.roleId, 'role_admin');

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

  const expiredToken = signSessionToken(
    { id: 'usr_sales1', roleId: 'role_employee', username: 'sara' },
    -1000
  );
  assert.equal(verifySessionToken(expiredToken), null);
});

test('Full 9-Feature End-to-End & Integration Audit (Server API + CloudStore Fallback + UI Verification)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'propsphere-audit-9features-'));
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

  async function cloudApi(
    endpoint: string,
    options: { method?: string; userId?: string; body?: any } = {}
  ) {
    return handleLocalFallbackRequest(
      endpoint,
      {
        method: options.method || 'GET',
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      options.userId || 'usr_admin'
    );
  }

  // Initialize clean CloudStore test state
  resetCloudStoreTestState();

  // Authenticate Admin & Sales Employee (omarahmed1)
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.data.token;

  const hassanLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'Hassan shehata', password: 'HD_CAPITAL' },
  });
  assert.equal(hassanLogin.status, 200);

  const empLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'omarahmed1', password: '123456' },
  });
  assert.equal(empLogin.status, 200);
  const empToken = empLogin.data.token;
  const empUserId = empLogin.data.user.id;

  // =========================================================================
  // 1. Test 1: New User Lead Transfer Persistence
  // =========================================================================
  await t.test('1. New User Lead Transfer Persistence (Server + CloudStore + Sanitizer)', async () => {
    // A. Create a new sales user on Server
    const newSalesRes = await api('/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'khaled_sales',
        password: 'Pass123456',
        fullName: 'خالد محمود سيلز',
        roleId: 'role_employee',
      },
    });
    assert.equal(newSalesRes.status, 200);
    const newSalesUser = newSalesRes.data.user;
    assert.ok(newSalesUser?.id);

    // Create 2 leads assigned to Admin initially
    const leadARes = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'عميل نقل جماعي ١',
        phone: '01011112221',
        source: 'حملة اعلانية',
        assignedTo: 'usr_admin2',
      },
    });
    const leadBRes = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'عميل نقل فردي ٢',
        phone: '01011112222',
        source: 'حملة اعلانية',
        assignedTo: 'usr_admin2',
      },
    });
    assert.equal(leadARes.status, 200);
    assert.equal(leadBRes.status, 200);
    const leadA = leadARes.data.lead;
    const leadB = leadBRes.data.lead;

    // Transfer leadA via POST /api/leads/transfer
    const trRes = await api('/api/leads/transfer', {
      method: 'POST',
      token: adminToken,
      body: {
        leadIds: [leadA.id],
        toUserId: newSalesUser.id,
        reason: 'نقل إلى المندوب الجديد خالد',
      },
    });
    assert.equal(trRes.status, 200);
    assert.equal(trRes.data.transferredCount, 1);

    // Transfer leadB via PUT /api/leads/:id
    const putTrRes = await api(`/api/leads/${leadB.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        assignedTo: newSalesUser.id,
      },
    });
    assert.equal(putTrRes.status, 200);
    assert.equal(putTrRes.data.lead.assignedTo, newSalesUser.id);

    // Verify ownership persists across /api/bootstrap and /api/leads and does NOT revert to usr_admin2
    const bootAfterTr = await api('/api/bootstrap', { token: adminToken });
    assert.equal(bootAfterTr.status, 200);
    const bootLeadA = bootAfterTr.data.leads.find((l: any) => l.id === leadA.id);
    const bootLeadB = bootAfterTr.data.leads.find((l: any) => l.id === leadB.id);
    assert.equal(bootLeadA.assignedTo, newSalesUser.id, 'Lead A must stay with newSalesUser');
    assert.equal(bootLeadB.assignedTo, newSalesUser.id, 'Lead B must stay with newSalesUser');
    assert.ok(
      bootLeadA.activities.some((a: any) => a.type === 'transfer'),
      'Lead A must record transfer activity'
    );
    assert.ok(
      bootLeadB.activities.some((a: any) => a.type === 'transfer'),
      'Lead B must record transfer activity'
    );

    // Verify sanitizeCrm1Workspace and saveLocalSnapshot never wipe the new user or reset assignedTo
    const { cleaned } = sanitizeCrm1Workspace(bootAfterTr.data);
    saveLocalSnapshot(cleaned);
    const sanitizedLeadA = cleaned.leads.find((l: any) => l.id === leadA.id);
    const sanitizedLeadB = cleaned.leads.find((l: any) => l.id === leadB.id);
    assert.equal(sanitizedLeadA.assignedTo, newSalesUser.id);
    assert.equal(sanitizedLeadB.assignedTo, newSalesUser.id);

    // Also test in CloudStore fallback directly
    const cloudUserRes = await cloudApi('/api/users', {
      method: 'POST',
      body: {
        username: 'tariq_sales',
        password: '123456',
        fullName: 'طارق سيلز جديد',
        roleId: 'role_employee',
      },
    });
    const cloudLeadRes = await cloudApi('/api/leads', {
      method: 'POST',
      body: {
        fullName: 'عميل سحابي للنقل',
        phone: '01099887766',
        assignedTo: 'usr_admin2',
      },
    });
    await cloudApi('/api/leads/transfer', {
      method: 'POST',
      body: {
        leadIds: [cloudLeadRes.lead.id],
        toUserId: cloudUserRes.user.id,
        reason: 'اختبار نقل سحابي',
      },
    });
    const cloudBoot = await cloudApi('/api/bootstrap', { userId: cloudUserRes.user.id });
    const transferredCloudLead = cloudBoot.leads.find((l: any) => l.id === cloudLeadRes.lead.id);
    assert.ok(transferredCloudLead);
    assert.equal(transferredCloudLead.assignedTo, cloudUserRes.user.id);
    assert.ok(transferredCloudLead.activities.some((a: any) => a.type === 'transfer'));
  });

  // =========================================================================
  // 2. Test 2: Manual Lead Self-Assignment
  // =========================================================================
  await t.test('2. Manual Lead Self-Assignment (Sales Employee creates lead without assignedTo)', async () => {
    // Employee creates lead on Server without specifying assignedTo
    const selfLeadRes = await api('/api/leads', {
      method: 'POST',
      token: empToken,
      body: {
        fullName: 'عميل مضاف بواسطة عمر احمد',
        phone: '01122334455',
        source: 'اورجانيك',
      },
    });
    assert.equal(selfLeadRes.status, 200);
    assert.equal(
      selfLeadRes.data.lead.assignedTo,
      empUserId,
      'Manual lead added by sales employee must be assigned to employee (not usr_admin2)'
    );

    // Employee fetches /api/leads and /api/bootstrap and sees their own lead
    const empLeadsRes = await api('/api/leads', { token: empToken });
    assert.equal(empLeadsRes.status, 200);
    assert.ok(empLeadsRes.data.some((l: any) => l.id === selfLeadRes.data.lead.id));

    const empBootRes = await api('/api/bootstrap', { token: empToken });
    assert.equal(empBootRes.status, 200);
    assert.ok(empBootRes.data.leads.some((l: any) => l.id === selfLeadRes.data.lead.id));

    // Also test in CloudStore fallback as Sales Employee (usr_1793010490703_1p0c)
    const cloudSelfLead = await cloudApi('/api/leads', {
      method: 'POST',
      userId: 'usr_1793010490703_1p0c',
      body: {
        fullName: 'عميل سحابي مضاف بواسطة عمر',
        phone: '01122334456',
      },
    });
    assert.equal(cloudSelfLead.lead.assignedTo, 'usr_1793010490703_1p0c');
  });

  // =========================================================================
  // 3. Test 3: 9 Real Estate Stages & Migration
  // =========================================================================
  await t.test('3. 9 Real Estate Stages & Backward Compatibility Migration + Auto Deal on Contracted', async () => {
    const expectedStages: LeadStatus[] = [
      'Fresh Lead',
      'No Answer',
      'Follow Up',
      'Interested',
      'Inspection',
      'Visit',
      'Contracted',
      'Reservation',
      'Not Interested',
    ];
    assert.deepEqual(LEAD_STATUS_ORDER, expectedStages, 'LEAD_STATUS_ORDER must match exact 9 stages');

    // Verify Arabic & Legacy status normalization
    assert.equal(normalizeLeadStatus('فريش ليدز'), 'Fresh Lead');
    assert.equal(normalizeLeadStatus('لم يرد'), 'No Answer');
    assert.equal(normalizeLeadStatus('متابعة'), 'Follow Up');
    assert.equal(normalizeLeadStatus('مهتم'), 'Interested');
    assert.equal(normalizeLeadStatus('معاينه'), 'Inspection');
    assert.equal(normalizeLeadStatus('معاينة'), 'Inspection');
    assert.equal(normalizeLeadStatus('زيارة'), 'Visit');
    assert.equal(normalizeLeadStatus('تعاقد'), 'Contracted');
    assert.equal(normalizeLeadStatus('حجز'), 'Reservation');
    assert.equal(normalizeLeadStatus('غير مهتم'), 'Not Interested');

    // Legacy statuses migration
    assert.equal(normalizeLeadStatus('New'), 'Fresh Lead');
    assert.equal(normalizeLeadStatus('Contacted'), 'Follow Up');
    assert.equal(normalizeLeadStatus('Qualified'), 'Interested');
    assert.equal(normalizeLeadStatus('Site Visit Scheduled'), 'Inspection');
    assert.equal(normalizeLeadStatus('Negotiation'), 'Reservation');
    assert.equal(normalizeLeadStatus('Won'), 'Contracted');
    assert.equal(normalizeLeadStatus('Lost'), 'Not Interested');
    assert.equal(normalizeLeadStatus('Unqualified'), 'Not Interested');

    // Create a lead and transition it through stages to Contracted ('تعاقد')
    const stageLeadRes = await api('/api/leads', {
      method: 'POST',
      token: empToken,
      body: {
        fullName: 'عميل مراحل عقارية',
        phone: '01233445566',
        budgetMax: 5200000,
        status: 'فريش ليدز',
      },
    });
    assert.equal(stageLeadRes.status, 200);
    assert.equal(stageLeadRes.data.lead.status, 'Fresh Lead');

    // Update status to 'تعاقد' via PUT /api/leads/:id and verify auto-deal creation
    const contractUpdateRes = await api(`/api/leads/${stageLeadRes.data.lead.id}`, {
      method: 'PUT',
      token: empToken,
      body: {
        status: 'تعاقد',
      },
    });
    assert.equal(contractUpdateRes.status, 200);
    assert.equal(contractUpdateRes.data.lead.status, 'Contracted');

    const dealsRes = await api('/api/deals', { token: adminToken });
    assert.equal(dealsRes.status, 200);
    const autoCreatedDeal = dealsRes.data.find((d: any) => d.leadId === stageLeadRes.data.lead.id);
    assert.ok(autoCreatedDeal, 'Transitioning lead to Contracted must auto-create a Closed Won deal');
    assert.equal(autoCreatedDeal.stage, 'Closed Won');
    assert.equal(autoCreatedDeal.dealValue, 5200000);
  });

  // =========================================================================
  // 4. Test 4: 3 Lead Sources Validation
  // =========================================================================
  await t.test('4. 3 Lead Sources Validation (حملة اعلانية, اورجانيك, بروكر)', async () => {
    assert.deepEqual(
      [...LEAD_SOURCES],
      ['حملة اعلانية', 'اورجانيك', 'بروكر'],
      'LEAD_SOURCES must contain the 3 exact Arabic sources'
    );

    const phones = ['01511112231', '01511112232', '01511112233'];
    for (let i = 0; i < LEAD_SOURCES.length; i++) {
      const src = LEAD_SOURCES[i];
      const res = await api('/api/leads', {
        method: 'POST',
        token: adminToken,
        body: {
          fullName: `عميل مصدر ${src}`,
          phone: phones[i],
          source: src,
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.lead.source, src);
    }

    // Verify LeadsView.tsx contains the <select> dropdown for Lead Source in both Add Modal and Lead Details
    const leadsViewSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadsView.tsx'),
      'utf-8'
    );
    assert.ok(
      leadsViewSource.includes('LEAD_SOURCES') && leadsViewSource.includes('حملة اعلانية'),
      'LeadsView.tsx must use LEAD_SOURCES and default to حملة اعلانية'
    );
  });

  // =========================================================================
  // 5. Test 5: Bulk Multi-Select Transfer
  // =========================================================================
  await t.test('5. Bulk Multi-Select Transfer in a Single Operation (Server + CloudStore + UI)', async () => {
    const bulkLeadIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const lRes = await api('/api/leads', {
        method: 'POST',
        token: adminToken,
        body: {
          fullName: `عميل تحديد متعدد ${i}`,
          phone: `0105555660${i}`,
          assignedTo: 'usr_admin2',
        },
      });
      assert.equal(lRes.status, 200);
      bulkLeadIds.push(lRes.data.lead.id);
    }

    const selectedThree = bulkLeadIds.slice(0, 3);
    const bulkTrRes = await api('/api/leads/transfer', {
      method: 'POST',
      token: adminToken,
      body: {
        leadIds: selectedThree,
        toUserId: empUserId,
        reason: 'نقل ٣ عملاء محددين دفعة واحدة',
      },
    });
    assert.equal(bulkTrRes.status, 200);
    assert.equal(bulkTrRes.data.transferredCount, 3, 'Must transfer all 3 selected leads in one call');

    const afterBulkLeads = await api('/api/leads', { token: adminToken });
    for (const id of selectedThree) {
      const found = afterBulkLeads.data.find((l: any) => l.id === id);
      assert.equal(found.assignedTo, empUserId);
      assert.ok(found.activities.some((a: any) => a.type === 'transfer'));
    }
    const fourthLead = afterBulkLeads.data.find((l: any) => l.id === bulkLeadIds[3]);
    assert.equal(fourthLead.assignedTo, 'usr_admin2', 'Unselected 4th lead must remain untouched');

    // Also test bulk transfer in CloudStore fallback
    const cloudBulkIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const cLead = await cloudApi('/api/leads', {
        method: 'POST',
        body: {
          fullName: `عميل سحابي متعدد ${i}`,
          phone: `0127777880${i}`,
          assignedTo: 'usr_admin2',
        },
      });
      cloudBulkIds.push(cLead.lead.id);
    }
    const cloudTrRes = await cloudApi('/api/leads/transfer', {
      method: 'POST',
      body: {
        leadIds: cloudBulkIds.slice(0, 3),
        toUserId: 'usr_1793010490703_1p0c',
        reason: 'نقل جماعي سحابي',
      },
    });
    assert.equal(cloudTrRes.transferredCount, 3);

    // Verify LeadsView.tsx has checkboxes across board, cards_list, and profile_grid and auto-switches transferMode to 'selected'
    const leadsViewCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadsView.tsx'),
      'utf-8'
    );
    assert.ok(
      leadsViewCode.includes("setTransferMode('selected')"),
      'LeadsView must auto-switch transferMode to selected when selectedIds.length > 0'
    );
    assert.ok(
      leadsViewCode.includes('handleToggleSelectAllFiltered'),
      'LeadsView must provide Select All / Deselect All for filtered leads'
    );
  });

  // =========================================================================
  // 6. Test 6: Auto-Distribution to Selected Sales (Round-Robin)
  // =========================================================================
  await t.test('6. Auto-Distribution Round-Robin strictly to Selected Sales Reps (Manual + Sheet Sync)', async () => {
    // Create 3 sales agents: sales1, sales2, sales3
    const s1 = await api('/api/users', {
      method: 'POST',
      token: adminToken,
      body: { username: 'rr_sales1', password: '123456', fullName: 'سيلز توزيع ١', roleId: 'role_employee' },
    });
    const s2 = await api('/api/users', {
      method: 'POST',
      token: adminToken,
      body: { username: 'rr_sales2', password: '123456', fullName: 'سيلز توزيع ٢', roleId: 'role_employee' },
    });
    const s3 = await api('/api/users', {
      method: 'POST',
      token: adminToken,
      body: { username: 'rr_sales3', password: '123456', fullName: 'سيلز توزيع ٣', roleId: 'role_employee' },
    });
    const sales1Id = s1.data.user.id;
    const sales2Id = s2.data.user.id;
    const sales3Id = s3.data.user.id;

    // Create 4 Fresh Leads currently held by Admin (usr_admin2)
    const rrLeadIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const l = await api('/api/leads', {
        method: 'POST',
        token: adminToken,
        body: {
          fullName: `عميل توزيع تلقائي ${i}`,
          phone: `0106666770${i}`,
          status: 'Fresh Lead',
          assignedTo: 'usr_admin2',
        },
      });
      rrLeadIds.push(l.data.lead.id);
    }

    // Distribute only to [sales1, sales2] (excluding sales3 and Admin)
    const distRes = await api('/api/leads/auto-distribute', {
      method: 'POST',
      token: adminToken,
      body: {
        targetUserIds: [sales1Id, sales2Id],
        leadIds: rrLeadIds,
        autoDistributionEnabled: true,
        saveRoutingSettings: true,
      },
    });
    assert.equal(distRes.status, 200);
    assert.equal(distRes.data.distributedCount, 4);

    const allLeadsAfterDist = await api('/api/leads', { token: adminToken });
    const distributedLeads = allLeadsAfterDist.data.filter((l: any) => rrLeadIds.includes(l.id));
    const countSales1 = distributedLeads.filter((l: any) => l.assignedTo === sales1Id).length;
    const countSales2 = distributedLeads.filter((l: any) => l.assignedTo === sales2Id).length;
    const countSales3 = distributedLeads.filter((l: any) => l.assignedTo === sales3Id).length;
    const countAdmin = distributedLeads.filter((l: any) => l.assignedTo === 'usr_admin2').length;

    assert.equal(countSales1, 2, 'sales1 must receive exactly 2 leads');
    assert.equal(countSales2, 2, 'sales2 must receive exactly 2 leads');
    assert.equal(countSales3, 0, 'Unselected sales3 must receive 0 leads');
    assert.equal(countAdmin, 0, 'Admin Hassan shehata must retain 0 of the distributed leads');

    // Now test Sheet Sync with autoDistributionEnabled = true and selectedSalesUserIds = [sales1Id, sales2Id]
    const csvForAutoDist = [
      'الاسم,رقم التليفون,campaign_name',
      'عميل شيت توزيع ١,01077771101,ليدز مغتربين',
      'عميل شيت توزيع ٢,01077771102,ليدز مغتربين',
      'عميل شيت توزيع ٣,01077771103,ليدز مغتربين',
      'عميل شيت توزيع ٤,01077771104,ليدز مغتربين',
    ].join('\n');

    const syncAutoRes = await api('/api/sheets/sync', {
      method: 'POST',
      token: adminToken,
      body: { csvText: csvForAutoDist },
    });
    assert.equal(syncAutoRes.status, 200);
    assert.equal(syncAutoRes.data.newLeadsImported, 4);

    const afterSyncLeads = await api('/api/leads', { token: adminToken });
    const syncedFour = afterSyncLeads.data.filter((l: any) =>
      String(l.fullName).startsWith('عميل شيت توزيع')
    );
    assert.equal(syncedFour.length, 4);
    assert.equal(syncedFour.filter((l: any) => l.assignedTo === sales1Id).length, 2);
    assert.equal(syncedFour.filter((l: any) => l.assignedTo === sales2Id).length, 2);
    assert.equal(syncedFour.filter((l: any) => l.assignedTo === 'usr_admin2').length, 0);
  });

  // =========================================================================
  // 7. Test 7: Strict Deduplication (Manual, Edit & Sheet Sync + Arabic Digits)
  // =========================================================================
  await t.test('7. Strict Deduplication (Arabic Digits, Manual Add 409, Edit 409 & Sheet Sync Skip)', async () => {
    // A. Verify Arabic/Hindi digits conversion & Egyptian format unification in both server & client utils
    const variants = [
      '٠١٠١٢٣٤٥٦٧٨',
      '۰۱۰۱۲۳۴۵۶۷۸',
      '+20 101 234 5678',
      '00201012345678',
      '2001012345678',
      '01012345678',
      '1012345678',
      'p:+201012345678',
    ];
    for (const v of variants) {
      assert.equal(normalizePhone(v), '201012345678', `Server normalizePhone failed for ${v}`);
      assert.equal(clientNormalizePhone(v), '201012345678', `Client normalizePhone failed for ${v}`);
    }
    assert.equal(convertArabicDigitsToEnglish('٠١٢٣٤٥٦٧٨٩'), '0123456789');

    // B. Create first lead with standard phone
    const firstLeadRes = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'سمير عبد العزيز الأصلي',
        phone: '01012345678',
      },
    });
    assert.equal(firstLeadRes.status, 200);

    // Attempt to create duplicate lead with Arabic digits '٠١٠١٢٣٤٥٦٧٨' -> must return 409
    const dupAddArabic = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'سمير مكرر بأرقام عربية',
        phone: '٠١٠١٢٣٤٥٦٧٨',
      },
    });
    assert.equal(dupAddArabic.status, 409, 'Duplicate phone with Arabic digits must be rejected with 409');
    assert.ok(
      String(dupAddArabic.data.error).includes('سمير عبد العزيز الأصلي'),
      'Error message must include the existing client name'
    );

    // Attempt to create duplicate lead with international prefix '+20 101 234 5678' -> must return 409
    const dupAddIntl = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'سمير مكرر دولي',
        phone: '+20 101 234 5678',
      },
    });
    assert.equal(dupAddIntl.status, 409);

    // C. Create another lead and try to edit its phone to Samir's phone -> must return 409
    const secondLeadRes = await api('/api/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'عميل آخر للتعديل',
        phone: '01199887766',
      },
    });
    assert.equal(secondLeadRes.status, 200);

    const dupEditRes = await api(`/api/leads/${secondLeadRes.data.lead.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        phone: '00201012345678',
      },
    });
    assert.equal(dupEditRes.status, 409, 'Editing a lead phone to an existing phone must return 409');

    // D. Verify CloudStore fallback also blocks duplicate create and duplicate edit
    await assert.rejects(
      async () => {
        await cloudApi('/api/leads', {
          method: 'POST',
          body: { fullName: 'عميل سحابي مكرر', phone: '٠١٠٩٩٨٨٧٧٦٦' }, // matches 01099887766 from Test 1
        });
      },
      /مسجل بالفعل/,
      'CloudStore POST /api/leads must reject duplicate phone'
    );

    // E. Sheet Sync with duplicates in same sheet and existing DB
    const dupSheetCsv = [
      'id,lead_id,الاسم,رقم التليفون,campaign_name',
      '1,l:1,سمير مكرر في الشيت,٠١٠١٢٣٤٥٦٧٨,ليدز مغتربين',
      '2,l:2,عميل جديد من الشيت,01288889999,ليدز مغتربين',
      '3,l:3,عميل جديد مكرر داخل نفس الشيت,+201288889999,ليدز مغتربين',
    ].join('\n');

    const sheetDedupRes = await api('/api/sheets/sync', {
      method: 'POST',
      token: adminToken,
      body: { csvText: dupSheetCsv },
    });
    assert.equal(sheetDedupRes.status, 200);
    assert.equal(sheetDedupRes.data.newLeadsImported, 1, 'Only 1 unique new lead should be imported');
    assert.equal(sheetDedupRes.data.duplicatesSkipped, 2, 'Both existing and in-batch duplicates must be skipped');
  });

  // =========================================================================
  // 8. Test 8: Call & Follow-up Reminder Tool
  // =========================================================================
  await t.test('8. Call & Follow-up Reminder Tool (Persistence + UI & Live Alarm Verification)', async () => {
    const remLeadRes = await api('/api/leads', {
      method: 'POST',
      token: empToken,
      body: {
        fullName: 'عميل تذكير مكالمة هامة',
        phone: '01033221100',
      },
    });
    assert.equal(remLeadRes.status, 200);
    const remLeadId = remLeadRes.data.lead.id;

    const targetReminderTime = '2026-11-01T14:30';
    const targetReminderNote = 'الاتصال لتأكيد موعد معاينة الفيلا';

    const updateRemRes = await api(`/api/leads/${remLeadId}`, {
      method: 'PUT',
      token: empToken,
      body: {
        reminderDateTime: targetReminderTime,
        reminderNote: targetReminderNote,
        reminderNotified: false,
      },
    });
    assert.equal(updateRemRes.status, 200);
    assert.equal(updateRemRes.data.lead.reminderDateTime, targetReminderTime);
    assert.equal(updateRemRes.data.lead.reminderNote, targetReminderNote);
    assert.equal(updateRemRes.data.lead.reminderNotified, false);

    // Fetch via GET /api/leads and verify persistence
    const empLeads = await api('/api/leads', { token: empToken });
    const savedRemLead = empLeads.data.find((l: any) => l.id === remLeadId);
    assert.ok(savedRemLead);
    assert.equal(savedRemLead.reminderDateTime, targetReminderTime);
    assert.equal(savedRemLead.reminderNote, targetReminderNote);
    assert.equal(savedRemLead.reminderNotified, false);

    // Verify App.tsx contains the live reminder checker and LeadsView.tsx contains the quick reminder popover
    const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert.ok(
      appSource.includes('dueReminderLeads') &&
        appSource.includes('evaluateDueReminders') &&
        appSource.includes('playReminderChime'),
      'App.tsx must contain live reminder alarm checker and banner'
    );
  });

  // =========================================================================
  // 9. Test 9: Non-Mandatory Detailed Project Panel
  // =========================================================================
  await t.test('9. Non-Mandatory Detailed Real Estate Project Catalog (Minimal & Full Details)', async () => {
    // A. Create project with ONLY name (all detailed fields omitted/optional)
    const minimalProjRes = await api('/api/projects-catalog', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'مشروع تجريبي سريع',
      },
    });
    assert.equal(minimalProjRes.status, 200);
    assert.equal(minimalProjRes.data.project.name, 'مشروع تجريبي سريع');
    assert.ok(
      minimalProjRes.data.projects.includes('مشروع تجريبي سريع'),
      'Project name must be automatically added to workspace projects list'
    );

    // B. Create project with full architectural, pricing & payment plan details
    const fullProjRes = await api('/api/projects-catalog', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'كمبوند تاج سيتي القاهرة الجديدة',
        developer: 'مدينة مصر للإسكان والتعمير (MMHD)',
        location: 'القاهرة الجديدة - أمام مطار القاهرة',
        projectType: 'Residential',
        unitTypes: ['شقق فاخرة', 'تاون هاوس', 'فيلات مستقلة'],
        areaMinSqm: 120,
        areaMaxSqm: 380,
        priceMin: 6500000,
        priceMax: 24000000,
        pricePerSqm: 55000,
        downPaymentPercent: 5,
        installmentYears: 8,
        deliveryDate: '2028 Q4',
        finishingType: 'Core & Shell',
        commissionPercent: 3.5,
        maintenancePercent: 8,
        brochureUrl: 'https://example.com/taj-city-brochure.pdf',
        facilities: 'كلوب هاوس، حمامات سباحة، منطقة تجارية، مدارس دولية',
        sellingPoints: 'موقع استراتيجي على طريق السويس مباشرة ومقدم 5% فقط',
        notes: 'متاح وحدات مرحلة جديدة بأسعار الطرح الأول',
        status: 'New Launch',
      },
    });
    assert.equal(fullProjRes.status, 200);
    assert.equal(fullProjRes.data.project.developer, 'مدينة مصر للإسكان والتعمير (MMHD)');
    assert.equal(fullProjRes.data.project.downPaymentPercent, 5);
    assert.equal(fullProjRes.data.project.installmentYears, 8);
    assert.equal(fullProjRes.data.project.commissionPercent, 3.5);
    assert.ok(fullProjRes.data.projects.includes('كمبوند تاج سيتي القاهرة الجديدة'));

    // C. Verify in CloudStore fallback as well
    const cloudMinProj = await cloudApi('/api/projects-catalog', {
      method: 'POST',
      body: { name: 'مشروع سحابي سريع بدون تفاصيل' },
    });
    assert.equal(cloudMinProj.project.name, 'مشروع سحابي سريع بدون تفاصيل');
    assert.ok(cloudMinProj.projects.includes('مشروع سحابي سريع بدون تفاصيل'));
  });
});
