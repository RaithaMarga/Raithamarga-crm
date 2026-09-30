const API_BASE = '/api';

let currentTab = 'overview';

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('section[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('border-amber-400', 'text-amber-300');
    btn.classList.add('border-transparent', 'text-emerald-100/70');
  });

  const activeView = document.getElementById(`view-${tabId}`);
  const activeTabBtn = document.getElementById(`tab-${tabId}`);
  if (activeView) activeView.classList.remove('hidden');
  if (activeTabBtn) {
    activeTabBtn.classList.remove('border-transparent', 'text-emerald-100/70');
    activeTabBtn.classList.add('border-amber-400', 'text-amber-300');
  }

  if (tabId === 'overview') loadOverview();
  if (tabId === 'farmers') loadFarmers();
  if (tabId === 'buyers') loadBuyers();
  if (tabId === 'listings') loadListings();
  if (tabId === 'requirements') loadRequirements();
  if (tabId === 'matches') loadMatches();
  if (tabId === 'deals') loadDeals();
  if (tabId === 'verifications') loadVerifications();
  if (tabId === 'proofs') loadProofs();
}

async function refreshData() {
  await loadOverview();
  if (currentTab !== 'overview') {
    switchTab(currentTab);
  }
}

// ----------------- 1. OVERVIEW TAB -----------------
async function loadOverview() {
  try {
    const res = await fetch(`${API_BASE}/crm/overview`);
    const data = await res.json();
    const metrics = data.metrics || {};

    document.getElementById('stat-farmers').innerText = metrics.activeFarmers ?? 0;
    document.getElementById('stat-buyers').innerText = metrics.totalBuyers ?? 0;
    document.getElementById('stat-listings-qty').innerText = `${metrics.listedQuintals ?? 0} Qtl`;
    document.getElementById('stat-listings-count').innerText = metrics.activeListingsCount ?? 0;
    document.getElementById('stat-deals-gmv').innerText = `₹${(metrics.activeDealsValue ?? 0).toLocaleString('en-IN')}`;
    document.getElementById('stat-deals-count').innerText = metrics.totalDealsCount ?? 0;
    const completedEl = document.getElementById('stat-completed-deals');
    if (completedEl) completedEl.innerText = metrics.completedDealsCount ?? 0;

    document.getElementById('badge-farmer-count').innerText = metrics.activeFarmers ?? 0;
    document.getElementById('badge-buyer-count').innerText = metrics.totalBuyers ?? 0;
    document.getElementById('badge-listing-count').innerText = metrics.activeListingsCount ?? 0;
    document.getElementById('badge-deal-count').innerText = metrics.totalDealsCount ?? 0;

    // Load badge counts for additional tabs
    fetch(`${API_BASE}/requirements`).then(r => r.json()).then(d => {
      const el = document.getElementById('badge-requirement-count');
      if (el) el.innerText = d.count ?? 0;
    }).catch(() => {});

    fetch(`${API_BASE}/matches`).then(r => r.json()).then(d => {
      const el = document.getElementById('badge-match-count');
      if (el) el.innerText = d.count ?? 0;
    }).catch(() => {});

    fetch(`${API_BASE}/verifications`).then(r => r.json()).then(d => {
      const el = document.getElementById('badge-verification-count');
      if (el) el.innerText = d.count ?? 0;
    }).catch(() => {});

    fetch(`${API_BASE}/proofs`).then(r => r.json()).then(d => {
      const el = document.getElementById('badge-proof-count');
      if (el) el.innerText = d.count ?? 0;
    }).catch(() => {});

    // Recent Deals
    const dealsList = document.getElementById('overview-deals-list');
    if (data.recentDeals && data.recentDeals.length > 0) {
      dealsList.innerHTML = data.recentDeals.map(d => `
        <div class="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition">
          <div>
            <div class="font-bold text-sm text-slate-800">${d.crop} (${d.quantity} ${d.unit})</div>
            <div class="text-xs text-slate-500">${d.farmerName} &rarr; ${d.buyerName}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-sm text-emerald-800">₹${(d.totalAmount || 0).toLocaleString('en-IN')}</div>
            <span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${getStatusBadgeClass(d.status)}">
              ${formatStatus(d.status)}
            </span>
          </div>
        </div>
      `).join('');
    } else {
      dealsList.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">No deals in pipeline</p>';
    }

    // Recent Listings
    const listingsList = document.getElementById('overview-listings-list');
    if (data.recentListings && data.recentListings.length > 0) {
      listingsList.innerHTML = data.recentListings.map(l => `
        <div class="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition">
          <div>
            <div class="font-bold text-sm text-slate-800">${l.crop} <span class="text-xs font-normal text-slate-500">(${l.grade || 'Grade A'})</span></div>
            <div class="text-xs text-slate-500">${l.farmerName || 'Farmer'} &bull; ${l.district || l.location || 'Kolar'}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-sm text-slate-900">${l.quantity} ${l.unit}</div>
            <div class="text-xs text-emerald-700 font-bold">₹${l.expectedPrice}/${l.unit}</div>
          </div>
        </div>
      `).join('');
    } else {
      listingsList.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">No active listings</p>';
    }
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

// ----------------- 2. FARMERS TAB -----------------
async function loadFarmers() {
  try {
    const res = await fetch(`${API_BASE}/farmers`);
    const data = await res.json();
    const farmers = data.farmers || [];
    const tbody = document.getElementById('farmers-table-body');

    if (farmers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">No farmers registered</td></tr>';
      return;
    }

    tbody.innerHTML = farmers.map(f => {
      const isVerified = f.verification_status === 'verified';
      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition">
          <td class="py-3 px-4">
            <div class="font-bold text-slate-900">${f.name || 'Farmer Member'}</div>
            <div class="text-[11px] font-mono text-slate-400">${f.userId || f.id}</div>
          </td>
          <td class="py-3 px-4 font-mono text-slate-600 text-xs">${f.phone || '--'}</td>
          <td class="py-3 px-4 text-slate-700">${f.village ? `${f.village}, ` : ''}${f.taluk ? `${f.taluk}, ` : ''}<strong>${f.district || 'Kolar'}</strong></td>
          <td class="py-3 px-4 text-xs text-slate-600">
            <div>${f.land_acres ? `${f.land_acres} Acres` : 'Smallholder'}</div>
            <div class="text-slate-400">${f.preferredCrops || 'Tomato, Potato'}</div>
          </td>
          <td class="py-3 px-4">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full ${isVerified ? 'bg-emerald-100 text-emerald-800' : f.verification_status === 'needs_attention' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
              ${(f.verification_status || 'pending').toUpperCase()}
            </span>
          </td>
          <td class="py-3 px-4 text-right">
            ${isVerified ? `
              <button onclick="updateUserVerification('${f.userId || f.id}', 'farmer', 'reject', 'Revoked for document re-inspection')" class="text-xs font-semibold px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 transition">
                Flag Review
              </button>
            ` : `
              <button onclick="updateUserVerification('${f.userId || f.id}', 'farmer', 'approve', 'RTC Land Record confirmed by APMC Admin')" class="text-xs font-bold px-3 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm transition">
                Approve &check;
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load farmers:', err);
  }
}

// ----------------- 3. BUYERS TAB -----------------
async function loadBuyers() {
  try {
    const res = await fetch(`${API_BASE}/buyers`);
    const data = await res.json();
    const buyers = data.buyers || [];
    const tbody = document.getElementById('buyers-table-body');

    if (buyers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">No buyers registered</td></tr>';
      return;
    }

    tbody.innerHTML = buyers.map(b => `
      <tr class="hover:bg-slate-50 border-b border-slate-100 transition">
        <td class="py-3 px-4 font-bold text-slate-900">${b.business_name || b.name || 'Agro Trader'}</td>
        <td class="py-3 px-4 text-slate-700">
          <div>${b.contact_name || b.name || '--'}</div>
          <div class="text-xs font-mono text-slate-400">${b.phone || '--'}</div>
        </td>
        <td class="py-3 px-4 text-xs font-semibold uppercase text-slate-600">${b.business_type || 'Trader'}</td>
        <td class="py-3 px-4 text-slate-700">${b.location || b.district || 'Bengaluru APMC'}</td>
        <td class="py-3 px-4">
          <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
            ${(b.verification_status || 'verified').toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load buyers:', err);
  }
}

// ----------------- 4. INVENTORY TAB -----------------
async function loadListings() {
  try {
    const res = await fetch(`${API_BASE}/listings`);
    const data = await res.json();
    const listings = data.listings || [];
    const tbody = document.getElementById('listings-table-body');

    if (listings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">No produce listings found</td></tr>';
      return;
    }

    tbody.innerHTML = listings.map(l => `
      <tr class="hover:bg-slate-50 border-b border-slate-100 transition">
        <td class="py-3 px-4 font-bold text-slate-900">${l.crop}</td>
        <td class="py-3 px-4 font-extrabold text-slate-800">${l.quantity} ${l.unit}</td>
        <td class="py-3 px-4 text-emerald-800 font-extrabold">₹${l.expectedPrice}/${l.unit}</td>
        <td class="py-3 px-4 text-xs text-slate-600">${l.grade || 'Grade A'}</td>
        <td class="py-3 px-4 text-xs text-slate-600">${l.district || l.location || 'Kolar'}</td>
        <td class="py-3 px-4 text-slate-700 font-medium">${l.farmerName || 'Farmer'}</td>
        <td class="py-3 px-4">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${l.status === 'sold' ? 'bg-slate-200 text-slate-700' : l.status === 'matched' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}">
            ${(l.status || 'active').toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load listings:', err);
  }
}

// ----------------- 5. BUYER REQUIREMENTS TAB -----------------
async function loadRequirements() {
  try {
    const res = await fetch(`${API_BASE}/requirements`);
    const data = await res.json();
    const reqs = data.requirements || [];
    const tbody = document.getElementById('requirements-table-body');

    if (reqs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">No buyer requirements found</td></tr>';
      return;
    }

    tbody.innerHTML = reqs.map(r => `
      <tr class="hover:bg-slate-50 border-b border-slate-100 transition">
        <td class="py-3 px-4 font-bold text-slate-900">${r.crop}</td>
        <td class="py-3 px-4 font-extrabold text-purple-900">${r.requiredQuantity} ${r.unit}</td>
        <td class="py-3 px-4 font-bold text-emerald-800">₹${r.targetPrice || '--'}/${r.unit}</td>
        <td class="py-3 px-4 text-xs text-slate-600">${r.quality || 'Grade A'}</td>
        <td class="py-3 px-4 text-slate-700">${r.location || r.district || 'Mandi'}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-800">${r.buyerName || 'Buyer'}</div>
          <div class="text-xs font-mono text-slate-400">${r.buyerPhone || ''}</div>
        </td>
        <td class="py-3 px-4 text-xs text-slate-500 font-mono">${r.neededByDate || 'Immediate'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load requirements:', err);
  }
}

// ----------------- 6. MATCHING MATRIX TAB -----------------
async function loadMatches() {
  try {
    const res = await fetch(`${API_BASE}/matches`);
    const data = await res.json();
    const container = document.getElementById('matches-container');

    if (!data.matches || data.matches.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">No active matches calculated between listings and requirements.</div>';
      return;
    }

    container.innerHTML = data.matches.map(m => {
      const b = m.breakdown || {};
      return `
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 hover:border-emerald-500 transition">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center space-x-3">
              <span class="text-2xl font-black bg-emerald-100 text-emerald-900 px-3.5 py-1.5 rounded-2xl border border-emerald-300">
                ${m.score}%
              </span>
              <div>
                <h4 class="font-extrabold text-lg text-slate-900">${m.crop} Match</h4>
                <p class="text-xs text-slate-500">
                  Farmer: <strong>${m.listing?.farmerName}</strong> (${m.listing?.district || 'Kolar'}) &bull; Buyer: <strong>${m.requirement?.buyerName}</strong> (${m.requirement?.district || 'Kolar'})
                </p>
              </div>
            </div>
            <button onclick="initiateDealFromMatch('${m.listing?.id}', '${m.listing?.farmerId}', '${m.listing?.farmerName}', '${m.requirement?.buyerId}', '${m.requirement?.buyerName}', '${m.crop}', ${m.requirement?.requiredQuantity || m.listing?.quantity}, '${m.listing?.unit}', ${m.listing?.expectedPrice})" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition">
              Initiate Deal &rarr;
            </button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span class="text-slate-500 block">Crop Type (35 max)</span>
              <strong class="text-emerald-700 text-sm">${b.crop ?? 35} pts</strong>
            </div>
            <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span class="text-slate-500 block">Quantity Fit (25 max)</span>
              <strong class="text-emerald-700 text-sm">${b.quantity ?? 25} pts</strong>
            </div>
            <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span class="text-slate-500 block">Proximity (20 max)</span>
              <strong class="text-emerald-700 text-sm">${b.location ?? 20} pts</strong>
            </div>
            <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span class="text-slate-500 block">Price Margin (20 max)</span>
              <strong class="text-emerald-700 text-sm">${b.price ?? 20} pts</strong>
            </div>
          </div>

          <div class="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
            <strong class="text-slate-700">Transparent Match Explanation:</strong>
            <ul class="list-disc pl-4 space-y-0.5">
              ${(m.reasons || []).map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load matches:', err);
  }
}

// ----------------- 7. DEALS TAB -----------------
async function loadDeals() {
  try {
    const res = await fetch(`${API_BASE}/deals`);
    const data = await res.json();
    const deals = data.deals || [];
    const container = document.getElementById('deals-pipeline-list');

    if (deals.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">No active deals. Initiate one from the Matching Matrix tab.</div>';
      return;
    }

    container.innerHTML = deals.map(d => `
      <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="flex items-start justify-between flex-wrap gap-3">
          <div>
            <span class="text-xs font-mono text-slate-400">${d.id}</span>
            <h3 class="font-extrabold text-xl text-slate-900">${d.crop} &bull; ${d.quantity} ${d.unit}</h3>
            <p class="text-xs text-slate-500 mt-0.5">
              Farmer: <strong>${d.farmerName}</strong> &bull; Buyer: <strong>${d.buyerName}</strong> &bull; Agreed Price: ₹${d.agreedPrice}/${d.unit}
            </p>
          </div>
          <div class="text-right">
            <div class="text-2xl font-black text-emerald-800">₹${(d.totalAmount || 0).toLocaleString('en-IN')}</div>
            <span class="inline-block mt-1 text-xs font-bold px-3 py-1 rounded-full ${getStatusBadgeClass(d.status)}">
              ${formatStatus(d.status)}
            </span>
          </div>
        </div>

        <!-- State Stepper -->
        <div class="grid grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs font-bold border border-slate-100">
          <div class="${d.status ? 'text-emerald-700' : 'text-slate-300'}">1. Interest</div>
          <div class="${['deal_confirmed', 'weighed_proof_added', 'pickup_delivery', 'completed'].includes(d.status) ? 'text-emerald-700' : 'text-slate-300'}">2. Confirmed</div>
          <div class="${['weighed_proof_added', 'pickup_delivery', 'completed'].includes(d.status) ? 'text-emerald-700' : 'text-slate-300'}">3. Proof Added</div>
          <div class="${['pickup_delivery', 'completed'].includes(d.status) ? 'text-emerald-700' : 'text-slate-300'}">4. Pickup</div>
          <div class="${d.status === 'completed' ? 'text-emerald-700' : 'text-slate-300'}">5. Completed</div>
        </div>

        <!-- Weighing Proof Info -->
        ${d.weighingProof ? `
          <div class="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs">
            <div class="text-emerald-900">
              &check; <strong>Weighbridge Certified:</strong> ${d.weighingProof.slipNumber || 'WB-VERIFIED'} &bull; Weight: <strong>${d.weighingProof.actualWeight} ${d.unit}</strong> (${d.weighingProof.verifiedBy || 'APMC Station'})
            </div>
            <span class="bg-emerald-200 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full text-[10px]">VERIFIED</span>
          </div>
        ` : ''}

        <!-- Advance Actions -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
          <span class="text-xs text-slate-500">Scheduled: <strong>${d.pickupDate || 'Immediate'}</strong></span>
          <div class="flex items-center space-x-2">
            ${d.status === 'buyer_interested' ? `
              <button onclick="advanceDealStatus('${d.id}', 'deal_confirmed')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm">
                Confirm Terms &rarr;
              </button>
            ` : ''}
            ${d.status === 'deal_confirmed' ? `
              <button onclick="promptAttachProof('${d.id}', ${d.quantity})" class="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm">
                Attach Weighing Slip &rarr;
              </button>
            ` : ''}
            ${d.status === 'weighed_proof_added' ? `
              <button onclick="advanceDealStatus('${d.id}', 'pickup_delivery')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm">
                Dispatch for Pickup &rarr;
              </button>
            ` : ''}
            ${d.status === 'pickup_delivery' ? `
              <button onclick="advanceDealStatus('${d.id}', 'completed')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm">
                Complete & Settle &check;
              </button>
            ` : ''}
            ${d.status === 'completed' ? `
              <span class="text-xs font-bold text-emerald-700">&check; Settled in Full</span>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load deals:', err);
  }
}

// ----------------- 8. VERIFICATION DESK TAB -----------------
async function loadVerifications() {
  try {
    const res = await fetch(`${API_BASE}/verifications`);
    const data = await res.json();
    const verifs = data.verifications || [];
    const container = document.getElementById('verifications-list');

    if (verifs.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">No pending verification cases.</div>';
      return;
    }

    container.innerHTML = verifs.map(v => `
      <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 hover:border-slate-300 transition">
        <div class="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-extrabold text-lg text-slate-900">${v.userName || v.userId}</h3>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${v.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : v.status === 'needs_attention' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
                ${(v.status || 'pending').toUpperCase()}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Mobile: <strong class="font-mono">${v.userPhone || '--'}</strong> &bull; District: <strong>${v.district || 'Kolar'}</strong> &bull; Role: <strong>${(v.role || 'farmer').toUpperCase()}</strong>
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="updateUserVerification('${v.userId}', '${v.role || 'farmer'}', 'approve', 'Approved by APMC Administrator')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition">
              Approve Verification &check;
            </button>
            <button onclick="updateUserVerification('${v.userId}', '${v.role || 'farmer'}', 'reject', 'RTC Extract document illegible or survey number mismatch')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition">
              Flag Attention
            </button>
          </div>
        </div>

        <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <strong class="text-xs font-bold text-slate-700 block mb-2">Submitted Supporting Documents:</strong>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            ${(v.documents || []).length > 0 ? v.documents.map(d => `
              <div class="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <span class="font-semibold text-slate-800 block">${d.label || d.id}</span>
                <span class="text-slate-400 font-mono text-[11px]">${d.fileName || 'Attached'}</span>
              </div>
            `).join('') : '<p class="text-xs text-slate-400">RTC / Aadhaar / Passbook digital reference</p>'}
          </div>
        </div>

        <div class="text-xs text-slate-500">
          Notes: ${v.notes || 'Submitted for APMC review'} &bull; Timestamp: ${v.submittedAt || v.updatedAt || 'Recent'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load verifications:', err);
  }
}

// ----------------- 9. WEIGHING PROOFS TAB -----------------
async function loadProofs() {
  try {
    const res = await fetch(`${API_BASE}/proofs`);
    const data = await res.json();
    const proofs = data.proofs || [];
    const container = document.getElementById('proofs-list');

    if (proofs.length === 0) {
      container.innerHTML = '<div class="col-span-2 p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">No weighing proof receipts uploaded yet.</div>';
      return;
    }

    container.innerHTML = proofs.map(p => `
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
            ${p.slipNumber || 'WB-TICKET'}
          </span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            ${(p.status || 'verified').toUpperCase()}
          </span>
        </div>
        <div>
          <h4 class="font-extrabold text-base text-slate-900">${p.crop || 'Produce'} Certified Lot</h4>
          <p class="text-xs text-slate-500">Deal Reference: <code class="font-mono text-slate-600">${p.dealId}</code></p>
        </div>
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1">
          <div>Certified Net Weight: <strong class="text-emerald-800 text-sm">${p.actualWeight} ${p.unit || 'qtl'}</strong></div>
          <div class="text-slate-500">Weighbridge: ${p.verifiedBy || 'APMC Digital Station'}</div>
          <div class="text-slate-400 text-[11px]">Recorded: ${p.uploadedAt || 'Recent'}</div>
        </div>
        ${p.proofUrl ? `
          <a href="${p.proofUrl}" target="_blank" class="block text-center text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-xl border border-emerald-200 transition">
            View Weighbridge Ticket Image &rarr;
          </a>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load proofs:', err);
  }
}

// ----------------- ACTIONS & HELPERS -----------------
async function updateUserVerification(userId, role, action, note) {
  try {
    const endpoint = action === 'approve' ? '/api/verifications/approve' : '/api/verifications/reject';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, note })
    });
    if (res.ok) {
      refreshData();
    }
  } catch (err) {
    console.error('Failed to update verification:', err);
  }
}

async function advanceDealStatus(dealId, targetStatus) {
  try {
    const res = await fetch(`${API_BASE}/deals/${dealId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus })
    });
    if (res.ok) {
      loadDeals();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to update deal status');
    }
  } catch (err) {
    console.error('Failed to advance deal status:', err);
  }
}

async function promptAttachProof(dealId, defaultWeight) {
  const actualWeight = prompt('Enter certified weight from weighbridge (in quintals):', defaultWeight);
  if (!actualWeight) return;
  const slipNumber = prompt('Enter APMC Weighbridge Slip Number:', `WB-${Math.floor(100000 + Math.random() * 900000)}`);
  if (!slipNumber) return;

  try {
    const res = await fetch(`${API_BASE}/deals/${dealId}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actualWeight: parseFloat(actualWeight),
        slipNumber,
        notes: 'Attached via CRM Admin desk'
      })
    });
    if (res.ok) {
      loadDeals();
    }
  } catch (err) {
    console.error(err);
  }
}

async function initiateDealFromMatch(listingId, farmerId, farmerName, buyerId, buyerName, crop, quantity, unit, agreedPrice) {
  try {
    const res = await fetch(`${API_BASE}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        farmerId,
        farmerName,
        buyerId,
        buyerName,
        crop,
        quantity: parseFloat(quantity),
        unit,
        agreedPrice: parseFloat(agreedPrice)
      })
    });
    if (res.ok) {
      switchTab('deals');
    }
  } catch (err) {
    console.error(err);
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-800';
    case 'deal_confirmed': return 'bg-blue-100 text-blue-800';
    case 'weighed_proof_added': return 'bg-amber-100 text-amber-800';
    case 'pickup_delivery': return 'bg-purple-100 text-purple-800';
    case 'cancelled': return 'bg-rose-100 text-rose-800';
    default: return 'bg-slate-100 text-slate-800';
  }
}

function formatStatus(status) {
  switch (status) {
    case 'buyer_interested': return 'Inquiry / Interest';
    case 'deal_confirmed': return 'Confirmed';
    case 'weighed_proof_added': return 'Proof Verified';
    case 'pickup_delivery': return 'In Transit';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return status || 'Active';
  }
}

// Initial boot
loadOverview();

// Auto-refresh data every 8 seconds for live marketplace tracking
setInterval(() => {
  refreshData();
}, 8000);
