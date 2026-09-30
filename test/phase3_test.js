/**
 * Phase 3 Automated Verification Test Suite
 * Tests:
 * 1. Deterministic Matching Engine (100-pt scale: crop 35, qty 25, loc 20, price 20)
 * 2. Unidirectional Deal Lifecycle State Machine
 * 3. HTTP 409 Conflict Rejection on Illegal State Jumps
 * 4. Server-side Financial Calculations
 * 5. Weighing Proof & Slip Attachment
 * 6. Listing Status Propagation (active -> matched -> sold)
 */

import { calculateMatchScore } from '../src/services/matchingService.js';
import { canTransition } from '../src/services/dealService.js';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('   RAITHAMARGA PHASE 3 AUTOMATED VERIFICATION TEST  ');
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

  // ----------------------------------------------------
  // TEST 1: Unit Test - Deterministic 100-point Matching Engine
  // ----------------------------------------------------
  console.log('--- Sub-suite 1: Deterministic Matching Math ---');

  // Benchmark Pair: Ramesh Gowda (50 Qtl Tomato @ ₹1,500, Kolar) vs Suresh Agro (40 Qtl Tomato @ ₹1,600, Kolar)
  const perfectListing = {
    crop: 'Tomato',
    quantity: 50,
    unit: 'quintal',
    district: 'Kolar',
    expectedPrice: 1500
  };
  const perfectRequirement = {
    crop: 'Tomato',
    requiredQuantity: 40,
    unit: 'quintal',
    district: 'Kolar',
    targetPrice: 1600
  };

  const perfectMatch = calculateMatchScore(perfectListing, perfectRequirement);
  assert(perfectMatch.isMatch === true, 'Kolar Tomato benchmark is recognized as a valid match');
  assert(perfectMatch.score === 100, `Benchmark score is exactly 100/100 (Got: ${perfectMatch.score})`);
  assert(perfectMatch.breakdown.crop === 35, 'Crop score = 35/35');
  assert(perfectMatch.breakdown.quantity === 25, 'Quantity coverage = 25/25');
  assert(perfectMatch.breakdown.location === 20, 'Local APMC proximity = 20/20');
  assert(perfectMatch.breakdown.price === 20, 'Price within buyer budget = 20/20');

  // Test 2: Different Crop (Hard filter)
  const diffCrop = calculateMatchScore({ crop: 'Potato', quantity: 20 }, { crop: 'Onion', requiredQuantity: 20 });
  assert(diffCrop.isMatch === false && diffCrop.score === 0, 'Different crop types return score 0 and isMatch = false');

  // Test 3: Price decay bracket
  const highPriceListing = { crop: 'Tomato', quantity: 40, district: 'Kolar', expectedPrice: 2200 };
  const lowTargetReq = { crop: 'Tomato', requiredQuantity: 40, district: 'Kolar', targetPrice: 2000 };
  const decayedMatch = calculateMatchScore(highPriceListing, lowTargetReq);
  assert(decayedMatch.breakdown.price === 10, `Price 10% above target receives 10/20 pts (Got: ${decayedMatch.breakdown.price})`);

  // ----------------------------------------------------
  // TEST 2: Deal Lifecycle State Machine Transitions
  // ----------------------------------------------------
  console.log('\n--- Sub-suite 2: State Machine Transition Rules ---');
  assert(canTransition('buyer_interested', 'deal_confirmed') === true, 'Valid transition: buyer_interested -> deal_confirmed');
  assert(canTransition('deal_confirmed', 'weighed_proof_added') === true, 'Valid transition: deal_confirmed -> weighed_proof_added');
  assert(canTransition('weighed_proof_added', 'pickup_delivery') === true, 'Valid transition: weighed_proof_added -> pickup_delivery');
  assert(canTransition('pickup_delivery', 'completed') === true, 'Valid transition: pickup_delivery -> completed');
  assert(canTransition('buyer_interested', 'completed') === false, 'Illegal jump rejected: buyer_interested cannot jump directly to completed');
  assert(canTransition('deal_confirmed', 'completed') === false, 'Illegal jump rejected: deal_confirmed cannot jump directly to completed');
  assert(canTransition('completed', 'buyer_interested') === false, 'Terminal completed state cannot transition backwards');

  // ----------------------------------------------------
  // TEST 3: Live API End-to-End Deal Flow & 409 Conflict Rejection
  // ----------------------------------------------------
  console.log('\n--- Sub-suite 3: Live API Deal Lifecycle & Verification ---');

  try {
    // 3.1 Create a new produce listing for the test
    const listRes = await fetch(`${API_BASE}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmerId: 'farmer-test-p3',
        farmerName: 'Basavaraj Patil',
        farmerPhone: '9845112233',
        crop: 'Green Chilli',
        quantity: 25,
        unit: 'quintal',
        expectedPrice: 3200,
        district: 'Haveri',
        location: 'Byadgi APMC'
      })
    });
    const listData = await listRes.json();
    const listingId = listData.listing?.id;
    assert(listRes.status === 201 && listingId, `Produce listing created: ${listingId}`);

    // 3.2 Create Deal: Verify server-side totalAmount computation
    const dealRes = await fetch(`${API_BASE}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        farmerId: 'farmer-test-p3',
        farmerName: 'Basavaraj Patil',
        buyerId: 'buyer-test-p3',
        buyerName: 'Spices Trading Co',
        crop: 'Green Chilli',
        quantity: 25,
        unit: 'quintal',
        agreedPrice: 3200,
        // Send a spoofed totalAmount to ensure server computes strictly
        totalAmount: 1
      })
    });
    const dealData = await dealRes.json();
    const deal = dealData.deal;
    assert(dealRes.status === 201 && deal?.id, `Deal initiated with status: ${deal?.status}`);
    assert(deal.totalAmount === 80000, `Server correctly calculated 25 * 3200 = 80,000 (Ignored client spoof 1, got ${deal.totalAmount})`);

    // 3.3 Valid Step 1: buyer_interested -> deal_confirmed
    const confirmRes = await fetch(`${API_BASE}/deals/${deal.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'deal_confirmed', note: 'Farmer accepted trade terms' })
    });
    assert(confirmRes.status === 200, 'Transition to deal_confirmed succeeded (200 OK)');

    // 3.4 ILLEGAL JUMP: Attempt deal_confirmed -> completed directly!
    const illegalJumpRes = await fetch(`${API_BASE}/deals/${deal.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'completed', note: 'Attempting invalid shortcut' })
    });
    assert(illegalJumpRes.status === 409, `Illegal status jump rejected with HTTP 409 Conflict (Got: ${illegalJumpRes.status})`);
    const errPayload = await illegalJumpRes.json();
    assert(errPayload.error?.includes('Invalid transition'), 'Returns descriptive error explaining valid sequence');

    // 3.5 Proof Attachment: POST /api/deals/:id/proof
    const proofRes = await fetch(`${API_BASE}/deals/${deal.id}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slipNumber: 'WB-HAVERI-9921',
        actualWeight: 24.8,
        proofUrl: 'https://storage.googleapis.com/raithamarga-proofs/slip-9921.jpg',
        notes: 'Calibrated APMC Byadgi weighbridge ticket',
        verifiedBy: 'APMC Weighbridge Inspector'
      })
    });
    const proofData = await proofRes.json();
    assert(proofRes.status === 201, 'Weighing proof attached successfully (201 Created)');
    assert(proofData.deal?.status === 'weighed_proof_added', 'Deal auto-transitioned to weighed_proof_added upon proof attachment');
    assert(proofData.proof?.actualWeight === 24.8, 'Calibrated weight recorded accurately as 24.8 qtl');

    // 3.6 Advance to pickup_delivery
    const transitRes = await fetch(`${API_BASE}/deals/${deal.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'pickup_delivery', note: 'Produce loaded onto buyer truck' })
    });
    assert(transitRes.status === 200, 'Transition to pickup_delivery succeeded');

    // 3.7 Complete Deal: pickup_delivery -> completed
    const completeRes = await fetch(`${API_BASE}/deals/${deal.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'completed', note: 'Delivered and payment settled' })
    });
    assert(completeRes.status === 200, 'Deal marked completed & settled (200 OK)');

    // 3.8 Confirm produce listing status transitioned to 'sold'
    const listingsRes = await fetch(`${API_BASE}/listings?farmerId=farmer-test-p3`);
    const listingsData = await listingsRes.json();
    const updatedListing = listingsData.listings?.find((l) => l.id === listingId);
    assert(updatedListing?.status === 'sold', `Listing status automatically updated to 'sold' (Got: ${updatedListing?.status})`);

    // 3.9 Confirm Proof is queryable via GET /api/proofs
    const getProofsRes = await fetch(`${API_BASE}/proofs/${deal.id}`);
    const getProofsData = await getProofsRes.json();
    assert(getProofsData.count >= 1, `Proof record retrievable by dealId (Found ${getProofsData.count} proofs)`);
    assert(getProofsData.proofs[0]?.slipNumber === 'WB-HAVERI-9921', 'Proof record contains valid slipNumber WB-HAVERI-9921');

  } catch (err) {
    console.error('API Test execution error:', err);
    failed++;
  }

  // Summary
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
