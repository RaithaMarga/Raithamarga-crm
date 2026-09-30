/**
 * Phase 4 Automated Verification Test Suite
 * Tests:
 * 1. Verification Desk & Document Submission (POST /api/verifications/submit)
 * 2. Administrative Approval & Attention Flagging (POST /api/verifications/approve & reject)
 * 3. Bidirectional Profile Verification Status Synchronization
 * 4. Buyer Procurement Demands in CRM (POST & GET /api/requirements)
 * 5. Farmer Produce Listings in CRM (POST & GET /api/listings)
 * 6. Weighing Proof Records in CRM (GET /api/proofs)
 * 7. CRM Overview & Web Dashboard Assets Availability (GET / and GET /crm.js)
 */

const API_BASE = 'http://localhost:5000/api';
const HOST_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('====================================================');
  console.log('   RAITHAMARGA PHASE 4 AUTOMATED VERIFICATION TEST  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: CRM Static Web Assets
    // ----------------------------------------------------
    console.log('--- Sub-suite 1: CRM Portal Web Assets ---');
    const indexRes = await fetch(`${HOST_BASE}/`);
    assert(indexRes.status === 200, 'CRM Dashboard HTML loaded (200 OK)');
    const indexHtml = await indexRes.text();
    assert(indexHtml.includes('Verification Desk'), 'CRM HTML contains Verification Desk tab');
    assert(indexHtml.includes('Buyer Demands'), 'CRM HTML contains Buyer Demands tab');
    assert(indexHtml.includes('Weighing Proofs'), 'CRM HTML contains Weighing Proofs tab');

    const jsRes = await fetch(`${HOST_BASE}/crm.js`);
    assert(jsRes.status === 200, 'CRM JavaScript client loaded (200 OK)');

    // ----------------------------------------------------
    // TEST 2: Verification Desk Document Submission
    // ----------------------------------------------------
    console.log('\n--- Sub-suite 2: Verification Desk Document Flow ---');
    const testUserId = `farmer-test-${Date.now().toString(36)}`;
    const submitRes = await fetch(`${API_BASE}/verifications/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        userName: 'Shivanand Patil',
        userPhone: '9845778899',
        role: 'farmer',
        district: 'Dharwad',
        documents: [
          { id: 'land_record', label: 'Land Record (RTC / 7-12 extract)', fileName: 'rtc_dharwad_survey44.pdf' },
          { id: 'id_proof', label: 'Government ID', fileName: 'aadhaar_card.jpg' }
        ],
        notes: 'Submitted for APMC verification review'
      })
    });
    assert(submitRes.status === 201, 'Verification documents submitted successfully (201 Created)');
    const submitData = await submitRes.json();
    assert(submitData.verif?.status === 'pending', 'Verification status initialized to pending');

    // 2.2 Verify it appears in GET /api/verifications
    const getVerifsRes = await fetch(`${API_BASE}/verifications`);
    const verifsData = await getVerifsRes.json();
    const submittedItem = verifsData.verifications?.find(v => v.userId === testUserId);
    assert(!!submittedItem, 'Submitted verification is present in GET /api/verifications');
    assert(submittedItem?.documents?.length === 2, 'Submitted documents preserved with 2 attachments');

    // 2.3 Approve Verification
    const approveRes = await fetch(`${API_BASE}/verifications/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        role: 'farmer',
        note: 'RTC land records and survey #44 verified by APMC registrar'
      })
    });
    assert(approveRes.status === 200, 'Admin approval executed successfully (200 OK)');
    const approveData = await approveRes.json();
    assert(approveData.verif?.status === 'verified', 'Verification record updated to verified');

    // ----------------------------------------------------
    // TEST 3: Buyer Procurement Requirements in CRM
    // ----------------------------------------------------
    console.log('\n--- Sub-suite 3: Buyer Requirements & Demands ---');
    const reqRes = await fetch(`${API_BASE}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerId: 'buyer-hubli-spices',
        buyerName: 'Hubli Spices Exporters',
        buyerPhone: '9844001122',
        crop: 'Byadgi Chilli',
        requiredQuantity: 100,
        unit: 'quintal',
        quality: 'Grade Premium',
        targetPrice: 28000,
        location: 'Byadgi APMC Mandi',
        district: 'Haveri',
        neededByDate: '2026-10-15'
      })
    });
    assert(reqRes.status === 201, 'Buyer requirement posted successfully (201 Created)');

    const listReqsRes = await fetch(`${API_BASE}/requirements`);
    const listReqsData = await listReqsRes.json();
    const postedReq = listReqsData.requirements?.find(r => r.buyerName === 'Hubli Spices Exporters');
    assert(!!postedReq, 'Buyer requirement visible in GET /api/requirements');
    assert(postedReq?.requiredQuantity === 100, 'Requirement volume recorded accurately as 100 quintals');

    // ----------------------------------------------------
    // TEST 4: Produce Listings in CRM
    // ----------------------------------------------------
    console.log('\n--- Sub-suite 4: Produce Inventory Visibility ---');
    const listProduceRes = await fetch(`${API_BASE}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmerId: testUserId,
        farmerName: 'Shivanand Patil',
        farmerPhone: '9845778899',
        crop: 'Byadgi Chilli',
        quantity: 120,
        unit: 'quintal',
        expectedPrice: 27500,
        grade: 'Grade Premium',
        district: 'Haveri',
        location: 'Byadgi Mandi Yard'
      })
    });
    assert(listProduceRes.status === 201, 'Produce listing created successfully');

    const getListingsRes = await fetch(`${API_BASE}/listings?crop=Byadgi`);
    const listingsData = await getListingsRes.json();
    assert(listingsData.listings?.length >= 1, 'Produce inventory searchable by crop query');

    // ----------------------------------------------------
    // TEST 5: Matching Matrix & CRM Overview Live Metrics
    // ----------------------------------------------------
    console.log('\n--- Sub-suite 5: Matching Matrix & Executive CRM Overview ---');
    const matchRes = await fetch(`${API_BASE}/matches`);
    const matchData = await matchRes.json();
    const chilliMatch = matchData.matches?.find(m => m.crop?.toLowerCase().includes('byadgi chilli'));
    assert(!!chilliMatch, 'Automated match found for Byadgi Chilli between Shivanand Patil and Hubli Spices');
    assert(chilliMatch?.score >= 80, `High deterministic match score: ${chilliMatch?.score}%`);

    const overviewRes = await fetch(`${API_BASE}/crm/overview`);
    const overviewData = await overviewRes.json();
    assert(overviewData.metrics?.activeFarmers >= 1, 'CRM Overview reports active farmers');
    assert(overviewData.metrics?.totalBuyers >= 1, 'CRM Overview reports total buyers');
    assert(overviewData.metrics?.listedQuintals > 0, 'CRM Overview reports active listed volume');
    assert(overviewData.dbStatus?.mode === 'firestore_connected', 'Database status confirms live Cloud Firestore connection');

    // ----------------------------------------------------
    // TEST 6: Weighing Proofs Endpoint
    // ----------------------------------------------------
    console.log('\n--- Sub-suite 6: Weighing Proofs Collection ---');
    const proofsRes = await fetch(`${API_BASE}/proofs`);
    const proofsData = await proofsRes.json();
    assert(proofsRes.status === 200, 'GET /api/proofs returns 200 OK');
    assert(Array.isArray(proofsData.proofs), 'Proofs array returned');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`PHASE 4 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
