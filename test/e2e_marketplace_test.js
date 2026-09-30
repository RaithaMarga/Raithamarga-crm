/**
 * Master End-to-End Marketplace Verification Suite (Phase 5)
 * Simulates complete life cycle from registration to delivery and settlement:
 * 1. Farmer Registration & Verification Submission
 * 2. Admin Verification Approval
 * 3. Farmer Produce Listing
 * 4. Buyer Registration & Procurement Requirement
 * 5. Deterministic Matching Engine Evaluation
 * 6. Deal Initiation (buyer_interested)
 * 7. Farmer Acceptance (deal_confirmed)
 * 8. APMC Digital Weighbridge Slip Attachment (weighed_proof_added)
 * 9. Logistics Transit (pickup_delivery)
 * 10. Final Delivery & Financial Settlement (completed)
 * 11. Produce Inventory Auto-Transition (sold)
 * 12. CRM Metrics Verification
 */

const API_BASE = 'http://localhost:5000/api';

async function runMasterE2ETest() {
  console.log('====================================================');
  console.log('  RAITHAMARGA FULL MARKETPLACE END-TO-END TEST (E2E)');
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
    const timestamp = Date.now().toString(36);
    const farmerPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const buyerPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;

    // STEP 1: Farmer Registration
    console.log('--- Step 1: Farmer Account & Verification ---');
    const farmerRegRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Gowda Patil',
        phone: farmerPhone,
        role: 'farmer',
        location: 'Kolar, Karnataka',
        farmDetails: {
          village: 'Vokkaleri',
          taluk: 'Kolar',
          district: 'Kolar',
          landSizeAcres: '5.5',
          preferredCrops: 'Capsicum, Tomato'
        }
      })
    });
    const farmerData = await farmerRegRes.json();
    const farmerId = farmerData.user?.id;
    assert(farmerRegRes.status === 201 && farmerId, `Farmer registered with ID: ${farmerId}`);

    // STEP 2: Farmer Submits Verification Documents
    const verifRes = await fetch(`${API_BASE}/verifications/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: farmerId,
        userName: 'Gowda Patil',
        userPhone: farmerPhone,
        role: 'farmer',
        district: 'Kolar',
        documents: [
          { id: 'rtc_land', label: 'RTC Extract', fileName: 'vokkaleri_survey_102.pdf' },
          { id: 'aadhaar', label: 'Government ID', fileName: 'aadhaar_card.jpg' }
        ]
      })
    });
    assert(verifRes.status === 201, 'Farmer verification documents submitted');

    // STEP 3: Admin Approves Farmer Verification
    const approveRes = await fetch(`${API_BASE}/verifications/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: farmerId,
        role: 'farmer',
        note: 'RTC survey 102 verified by Kolar APMC Administrator'
      })
    });
    assert(approveRes.status === 200, 'Admin approved farmer verification in CRM');

    // STEP 4: Farmer Creates Produce Listing
    console.log('\n--- Step 2: Farmer Produce Listing ---');
    const listRes = await fetch(`${API_BASE}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmerId,
        farmerName: 'Gowda Patil',
        farmerPhone,
        crop: 'Green Capsicum',
        quantity: 30,
        unit: 'quintal',
        grade: 'Grade A',
        expectedPrice: 2400,
        district: 'Kolar',
        location: 'Vokkaleri Farm Gate'
      })
    });
    const listData = await listRes.json();
    const listingId = listData.listing?.id;
    assert(listRes.status === 201 && listingId, `Produce lot listed: ${listingId} (30 Qtl @ ₹2400)`);

    // STEP 5: Buyer Registration
    console.log('\n--- Step 3: Buyer Registration & Demand ---');
    const buyerRegRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mahesh Reddy',
        phone: buyerPhone,
        role: 'buyer',
        location: 'Kolar Mandi',
        businessDetails: {
          businessName: 'Reddy Vegetable Traders',
          businessType: 'trader'
        }
      })
    });
    const buyerData = await buyerRegRes.json();
    const buyerId = buyerData.user?.id;
    assert(buyerRegRes.status === 201 && buyerId, `Buyer registered with ID: ${buyerId}`);

    // STEP 6: Buyer Posts Procurement Requirement
    const reqRes = await fetch(`${API_BASE}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerId,
        buyerName: 'Reddy Vegetable Traders',
        buyerPhone,
        crop: 'Green Capsicum',
        requiredQuantity: 25,
        unit: 'quintal',
        targetPrice: 2500,
        quality: 'Grade A',
        location: 'Kolar APMC Market',
        district: 'Kolar'
      })
    });
    const reqData = await reqRes.json();
    assert(reqRes.status === 201, 'Buyer procurement requirement published');

    // STEP 7: Matching Engine Evaluation
    console.log('\n--- Step 4: Deterministic Matching Engine ---');
    const matchRes = await fetch(`${API_BASE}/matches?listingId=${listingId}`);
    const matchData = await matchRes.json();
    assert(matchData.count >= 1, `Matching engine paired listing with requirement (Found: ${matchData.count})`);
    const match = matchData.matches[0];
    assert(match.score === 100, `Benchmark Capsicum match score is 100/100 (Got: ${match.score}%)`);
    assert(match.reasons.length >= 3, 'Transparent rationale provided with at least 3 explanation factors');

    // STEP 8: Buyer Initiates Deal
    console.log('\n--- Step 5: Deal State Machine Lifecycle ---');
    const dealRes = await fetch(`${API_BASE}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        farmerId,
        farmerName: 'Gowda Patil',
        farmerPhone,
        buyerId,
        buyerName: 'Reddy Vegetable Traders',
        buyerPhone,
        crop: 'Green Capsicum',
        quantity: 25,
        unit: 'quintal',
        agreedPrice: 2400
      })
    });
    const dealData = await dealRes.json();
    const dealId = dealData.deal?.id;
    assert(dealRes.status === 201 && dealId, `Deal initiated: ${dealId} with status 'buyer_interested'`);
    assert(dealData.deal.totalAmount === 60000, `Total GMV correctly calculated as ₹60,000 (25 Qtl * ₹2400)`);

    // STEP 9: Farmer Confirms Deal
    const confirmRes = await fetch(`${API_BASE}/deals/${dealId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'deal_confirmed', note: 'Farmer accepted price and pickup date' })
    });
    assert(confirmRes.status === 200, 'Deal state transitioned to deal_confirmed');

    // STEP 10: APMC Weighbridge Proof Slip Attached
    const proofRes = await fetch(`${API_BASE}/deals/${dealId}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slipNumber: `WB-KLR-${timestamp.toUpperCase()}`,
        actualWeight: 25.2,
        notes: 'APMC electronic scale certified tare 1400kg, gross 3920kg',
        verifiedBy: 'Kolar APMC Gate #1 Weighmaster'
      })
    });
    const proofData = await proofRes.json();
    assert(proofRes.status === 201, 'Weighing proof slip recorded and synced to proofs collection');
    assert(proofData.deal?.status === 'weighed_proof_added', 'Deal auto-transitioned to weighed_proof_added');

    // STEP 11: Mark in Transit / Pickup
    const transitRes = await fetch(`${API_BASE}/deals/${dealId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'pickup_delivery', note: 'Produce loaded onto buyer truck' })
    });
    assert(transitRes.status === 200, 'Deal transitioned to pickup_delivery');

    // STEP 12: Complete Deal Settlement
    const completeRes = await fetch(`${API_BASE}/deals/${dealId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'completed', note: 'Delivery acknowledged & bank transfer settled' })
    });
    assert(completeRes.status === 200, 'Deal marked completed & settled in full');

    // STEP 13: Verify Inventory Status Auto-Update
    console.log('\n--- Step 6: Post-Settlement Integrity Checks ---');
    const checkListingsRes = await fetch(`${API_BASE}/listings?farmerId=${farmerId}`);
    const checkListingsData = await checkListingsRes.json();
    const finalListing = checkListingsData.listings?.find(l => l.id === listingId);
    assert(finalListing?.status === 'sold', `Produce listing status successfully transitioned to 'sold' (Got: ${finalListing?.status})`);

    // STEP 14: Verify CRM Overview
    const crmRes = await fetch(`${API_BASE}/crm/overview`);
    const crmData = await crmRes.json();
    assert(crmData.metrics?.completedDealsCount >= 1, `CRM reports at least 1 completed deal (Count: ${crmData.metrics?.completedDealsCount})`);
    assert(crmData.metrics?.activeDealsValue >= 60000, `CRM reports deal GMV included in volume metrics`);

  } catch (err) {
    console.error('Master E2E Execution Error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`MASTER E2E RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterE2ETest();
