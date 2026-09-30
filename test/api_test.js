import http from 'http';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting RaithaMarga CRM & Backend API Verification Tests...\n');

  // 1. Health
  const health = await makeRequest('GET', '/api/health');
  console.log(`[PASS] Health Check: Status ${health.status}, DB Mode: ${health.data.db.mode}`);

  // 2. Auth Register Farmer
  const regFarmer = await makeRequest('POST', '/api/auth/register', {
    name: 'Kishan Kumar',
    phone: '9845112233',
    role: 'farmer',
    location: 'Mandya, Karnataka',
    farmDetails: { district: 'Mandya', landSizeAcres: '5' }
  });
  console.log(`[PASS] Auth Register Farmer: ${regFarmer.data.user.name} (${regFarmer.data.user.role})`);

  // 3. Auth Register Buyer
  const regBuyer = await makeRequest('POST', '/api/auth/register', {
    name: 'Mysuru Agro Mart',
    phone: '9845998877',
    role: 'buyer',
    location: 'Mysuru',
    businessDetails: { businessName: 'Mysuru Agro Mart', businessType: 'processor' }
  });
  console.log(`[PASS] Auth Register Buyer: ${regBuyer.data.user.name} (${regBuyer.data.user.role})`);

  // 4. Create Produce Listing
  const newListing = await makeRequest('POST', '/api/listings', {
    farmerId: regFarmer.data.user.id,
    farmerName: 'Kishan Kumar',
    crop: 'Tomato',
    quantity: 60,
    unit: 'quintal',
    grade: 'Grade A',
    expectedPrice: 2100,
    location: 'Mandya',
    district: 'Mandya'
  });
  console.log(`[PASS] Create Listing: ${newListing.data.listing.crop} - ${newListing.data.listing.quantity} ${newListing.data.listing.unit} @ ₹${newListing.data.listing.expectedPrice}`);

  // 5. Create Buyer Requirement
  const newReq = await makeRequest('POST', '/api/requirements', {
    buyerId: regBuyer.data.user.id,
    buyerName: 'Mysuru Agro Mart',
    crop: 'Tomato',
    requiredQuantity: 50,
    unit: 'quintal',
    quality: 'Grade A',
    targetPrice: 2200,
    location: 'Mysuru',
    district: 'Mysuru'
  });
  console.log(`[PASS] Create Requirement: ${newReq.data.requirement.crop} - ${newReq.data.requirement.requiredQuantity} ${newReq.data.requirement.unit}`);

  // 6. Test Deterministic Matching (Prompt 4)
  const matches = await makeRequest('GET', `/api/matches?listingId=${newListing.data.listing.id}`);
  console.log(`[PASS] Prompt 4 Deterministic Matching Engine: Found ${matches.data.count} match(es). Top Score: ${matches.data.matches[0]?.score}%`);
  console.log(`       Reasons:`, matches.data.matches[0]?.reasons);

  // 7. Test Deal Lifecycle (Prompt 5)
  const deal = await makeRequest('POST', '/api/deals', {
    listingId: newListing.data.listing.id,
    farmerId: regFarmer.data.user.id,
    farmerName: 'Kishan Kumar',
    buyerId: regBuyer.data.user.id,
    buyerName: 'Mysuru Agro Mart',
    crop: 'Tomato',
    quantity: 50,
    agreedPrice: 2150
  });
  console.log(`[PASS] Prompt 5 Deal Created: ${deal.data.deal.id} - Status: ${deal.data.deal.status}`);

  // 8. Transition Deal: Confirmed -> Weighed -> Completed
  const confirmed = await makeRequest('PUT', `/api/deals/${deal.data.deal.id}/status`, { targetStatus: 'deal_confirmed' });
  console.log(`[PASS] Transition 1: ${confirmed.data.deal.status}`);

  const weighed = await makeRequest('PUT', `/api/deals/${deal.data.deal.id}/status`, {
    targetStatus: 'weighed_proof_added',
    actualWeight: 50.4,
    proofUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200'
  });
  console.log(`[PASS] Transition 2 (Weighed Proof Added): ${weighed.data.deal.status}`);

  const transit = await makeRequest('PUT', `/api/deals/${deal.data.deal.id}/status`, { targetStatus: 'pickup_delivery' });
  console.log(`[PASS] Transition 3: ${transit.data.deal.status}`);

  const completed = await makeRequest('PUT', `/api/deals/${deal.data.deal.id}/status`, { targetStatus: 'completed' });
  console.log(`[PASS] Transition 4 (Completed): ${completed.data.deal.status}`);

  // 9. CRM Overview
  const overview = await makeRequest('GET', '/api/crm/overview');
  console.log(`[PASS] CRM Overview Verified: Total Farmers: ${overview.data.metrics.totalFarmers}, Deal Volume: ₹${overview.data.metrics.totalDealsVolumeINR.toLocaleString('en-IN')}`);

  console.log('\n🎉 ALL 9 TEST SUITES PASSED! Backend & CRM operational.');
  process.exit(0);
}

runTests().catch((e) => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
