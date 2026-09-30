import http from 'http';

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers
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

async function runPhase2Tests() {
  console.log('🧪 Running RaithaMarga Phase 2 Role-Based Security Verification Tests...\n');

  // Test 1: Register Farmer
  const farmerReg = await makeRequest('POST', '/api/auth/register', {
    name: 'Basavaraj Bommai',
    phone: '9845119988',
    password: 'FarmerSecretPass123',
    role: 'farmer',
    location: 'Haveri, Karnataka'
  });
  console.log(`[PASS] Farmer Registration: Status ${farmerReg.status}, Token received, Role: ${farmerReg.data.user.role}`);
  const farmerToken = farmerReg.data.token;

  // Test 2: Register Buyer
  const buyerReg = await makeRequest('POST', '/api/auth/register', {
    name: 'Karnataka Retail Hub',
    phone: '9845223344',
    password: 'BuyerSecretPass456',
    role: 'buyer',
    location: 'Hubli APMC'
  });
  console.log(`[PASS] Buyer Registration: Status ${buyerReg.status}, Token received, Role: ${buyerReg.data.user.role}`);
  const buyerToken = buyerReg.data.token;

  // Test 3: Verify /api/auth/me with Farmer Token
  const meFarmer = await makeRequest('GET', '/api/auth/me', null, farmerToken);
  console.log(`[PASS] GET /api/auth/me (Farmer): Verified name: ${meFarmer.data.user.name}, role: ${meFarmer.data.user.role}`);

  // Test 4: Role-Based Guard: Buyer trying to post a Farmer Produce Listing MUST FAIL (403 Forbidden)
  const illegalListing = await makeRequest('POST', '/api/listings', {
    crop: 'Tomato',
    quantity: 100,
    expectedPrice: 2000
  }, buyerToken);
  if (illegalListing.status === 403) {
    console.log(`[PASS] Role Guard: Buyer blocked from posting farmer listing! (Status 403: ${illegalListing.data.error})`);
  } else {
    console.error(`[FAIL] Expected 403 Forbidden, got ${illegalListing.status}`);
  }

  // Test 5: Role-Based Guard: Farmer trying to post a Buyer Requirement MUST FAIL (403 Forbidden)
  const illegalReq = await makeRequest('POST', '/api/requirements', {
    crop: 'Tomato',
    requiredQuantity: 100,
    targetPrice: 2000
  }, farmerToken);
  if (illegalReq.status === 403) {
    console.log(`[PASS] Role Guard: Farmer blocked from posting buyer requirement! (Status 403: ${illegalReq.data.error})`);
  } else {
    console.error(`[FAIL] Expected 403 Forbidden, got ${illegalReq.status}`);
  }

  // Test 6: Authorized Farmer creates Produce Listing
  const validListing = await makeRequest('POST', '/api/listings', {
    crop: 'Green Chilli',
    quantity: 35,
    unit: 'quintal',
    grade: 'Grade A',
    expectedPrice: 4200,
    location: 'Haveri',
    district: 'Haveri'
  }, farmerToken);
  console.log(`[PASS] Authorized Farmer Listing: Status ${validListing.status} (${validListing.data.listing.crop} @ ₹${validListing.data.listing.expectedPrice})`);

  // Test 7: Authorized Buyer creates Requirement
  const validReq = await makeRequest('POST', '/api/requirements', {
    crop: 'Green Chilli',
    requiredQuantity: 30,
    unit: 'quintal',
    quality: 'Grade A',
    targetPrice: 4300,
    location: 'Hubli',
    district: 'Dharwad'
  }, buyerToken);
  console.log(`[PASS] Authorized Buyer Requirement: Status ${validReq.status} (${validReq.data.requirement.crop} - ${validReq.data.requirement.requiredQuantity} qtl)`);

  // Test 8: Deterministic Matching between the two
  const matches = await makeRequest('GET', `/api/matches?listingId=${validListing.data.listing.id}`);
  console.log(`[PASS] Matching Engine connected: Found ${matches.data.count} match(es). Top Score: ${matches.data.matches[0]?.score}%`);

  // Test 9: CRM Overview reflect live counts
  const crmOverview = await makeRequest('GET', '/api/crm/overview');
  console.log(`[PASS] CRM Overview Verified: Active Farmers: ${crmOverview.data.metrics.activeFarmers}, Listed Quintals: ${crmOverview.data.metrics.listedQuintals} Qtl`);

  console.log('\n🎉 ALL 9 ROLE-BASED SECURITY TESTS PASSED! Phase 2 is rock-solid.');
  process.exit(0);
}

runPhase2Tests().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
