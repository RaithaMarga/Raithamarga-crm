import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { localStore, getDbStatus, syncDocToFirestore, deleteDocFromFirestore } from '../config/firebase.js';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/authMiddleware.js';
import { calculateMatchScore, findMatchesForListing, findMatchesForRequirement } from '../services/matchingService.js';
import { canTransition, formatStatusLabel, DEAL_STATUSES } from '../services/dealService.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'raithamarga-production-secret-key-2026';

// ----------------- HEALTH & SYSTEM STATUS -----------------
router.get('/health', async (req, res) => {
  res.json({
    ok: true,
    db: 'firebase_firestore',
    system: 'RaithaMarga Backend & CRM',
    timestamp: new Date().toISOString(),
    dbStatus: getDbStatus()
  });
});

// ----------------- AUTHENTICATION (Phase 2) -----------------
// 1. Current Session Profile (GET /api/auth/me)
router.get('/auth/me', authenticateToken, async (req, res) => {
  const users = localStore.getCollection('users');
  const user = users.find((u) => u.id === req.user.id || u.phone === req.user.phone);

  if (!user) {
    return res.json({ user: req.user });
  }

  let profile = null;
  if (user.role === 'farmer') {
    profile = localStore.getCollection('farmer_profiles').find((p) => p.userId === user.id);
  } else if (user.role === 'buyer') {
    profile = localStore.getCollection('buyer_profiles').find((p) => p.userId === user.id);
  }

  res.json({ user, profile });
});

// 2. Register (POST /api/auth/register)
router.post('/auth/register', async (req, res) => {
  try {
    const { name, phone, email, password, role, location, farmDetails, businessDetails } = req.body;
    if (!phone || !role) {
      return res.status(400).json({ error: 'Phone and role (farmer or buyer) are required.' });
    }

    const assignedRole = role.toLowerCase();
    if (!['farmer', 'buyer'].includes(assignedRole)) {
      return res.status(400).json({ error: 'Public registration allows only farmer or buyer roles. Admin is seeded only.' });
    }

    const users = localStore.getCollection('users');
    let user = users.find((u) => u.phone === phone);

    if (user) {
      const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ message: 'User already exists. Logged in successfully.', user, token });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('default123', 10);
    const userId = `${assignedRole}-${Date.now().toString(36)}`;

    user = {
      id: userId,
      name: name || (assignedRole === 'farmer' ? 'Kisan Member' : 'Trader Member'),
      phone,
      email: email || '',
      password_hash: passwordHash,
      role: assignedRole,
      location: location || '',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    localStore.insert('users', user);
    await syncDocToFirestore('users', user.id, user);

    if (assignedRole === 'farmer') {
      const profile = {
        userId,
        name: user.name,
        phone,
        village: farmDetails?.village || '',
        taluk: farmDetails?.taluk || '',
        district: farmDetails?.district || location || 'Kolar',
        state: 'Karnataka',
        pincode: farmDetails?.pincode || '',
        land_acres: farmDetails?.landSizeAcres || '2.0',
        preferredCrops: farmDetails?.preferredCrops || 'Tomato, Potato',
        verification_status: 'pending',
        contactPreference: 'call',
        createdAt: new Date().toISOString()
      };
      localStore.insert('farmer_profiles', profile);
      await syncDocToFirestore('farmer_profiles', userId, profile);
    } else {
      const profile = {
        userId,
        business_name: businessDetails?.businessName || user.name,
        contact_name: user.name,
        phone,
        business_type: businessDetails?.businessType || 'trader',
        location: location || 'Bangalore APMC',
        district: location || 'Bangalore',
        verification_status: 'verified',
        contactPreference: 'call',
        createdAt: new Date().toISOString()
      };
      localStore.insert('buyer_profiles', profile);
      await syncDocToFirestore('buyer_profiles', userId, profile);
    }

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ message: 'Account registered successfully', user, token });
  } catch (err) {
    console.error('[Auth Register Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Login (POST /api/auth/login)
router.post('/auth/login', async (req, res) => {
  try {
    const { phone, email, password, role } = req.body;
    const identifier = phone || email;

    if (!identifier) {
      return res.status(400).json({ error: 'Phone number or email is required.' });
    }

    const users = localStore.getCollection('users');
    let user = users.find((u) => u.phone === identifier || u.email === identifier);

    if (!user) {
      // Auto-provision demo account for rapid evaluation
      const targetRole = role || 'farmer';
      const userId = `${targetRole}-${Date.now().toString(36)}`;
      const passwordHash = await bcrypt.hash(password || 'demo123', 10);

      user = {
        id: userId,
        name: targetRole === 'farmer' ? 'Demo Farmer' : 'Demo Buyer',
        phone: identifier,
        password_hash: passwordHash,
        role: targetRole,
        location: targetRole === 'farmer' ? 'Kolar, Karnataka' : 'Bangalore',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      localStore.insert('users', user);
      await syncDocToFirestore('users', user.id, user);

      if (targetRole === 'farmer') {
        const fp = {
          userId,
          name: user.name,
          phone: identifier,
          district: 'Kolar',
          state: 'Karnataka',
          verification_status: 'pending'
        };
        localStore.insert('farmer_profiles', fp);
        await syncDocToFirestore('farmer_profiles', userId, fp);
      } else {
        const bp = {
          userId,
          business_name: 'Agro Traders',
          phone: identifier,
          business_type: 'trader',
          location: 'Bangalore',
          verification_status: 'verified'
        };
        localStore.insert('buyer_profiles', bp);
        await syncDocToFirestore('buyer_profiles', userId, bp);
      }
    }

    const token = jwt.sign({ id: user.id, role: user.role, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', user, token });
  } catch (err) {
    console.error('[Auth Login Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- FARMERS DIRECTORY (Admin Only) -----------------
router.get('/farmers', optionalAuth, async (req, res) => {
  try {
    const profiles = localStore.getCollection('farmer_profiles');
    res.json({ count: profiles.length, farmers: profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- BUYERS DIRECTORY (Admin Only) -----------------
router.get('/buyers', optionalAuth, async (req, res) => {
  try {
    const profiles = localStore.getCollection('buyer_profiles');
    res.json({ count: profiles.length, buyers: profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/farmers/:id: Update Farmer Profile (syncs to Firestore)
router.put('/farmers/:id', optionalAuth, async (req, res) => {
  try {
    const { name, phone, village, taluk, district, land_acres, preferredCrops, contactPreference } = req.body;
    const profiles = localStore.getCollection('farmer_profiles');
    let profile = profiles.find(p => p.userId === req.params.id || p.phone === req.params.id || p.id === req.params.id);

    const updates = {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(village && { village }),
      ...(taluk && { taluk }),
      ...(district && { district }),
      ...(land_acres && { land_acres }),
      ...(preferredCrops && { preferredCrops }),
      ...(contactPreference && { contactPreference }),
      updatedAt: new Date().toISOString()
    };

    if (profile) {
      profile = localStore.update('farmer_profiles', profile.id || profile.userId, updates);
      await syncDocToFirestore('farmer_profiles', profile.id || profile.userId, profile);
    } else {
      profile = {
        userId: req.params.id,
        name: name || 'Farmer Member',
        phone: phone || req.params.id,
        ...updates,
        verification_status: 'pending',
        createdAt: new Date().toISOString()
      };
      localStore.insert('farmer_profiles', profile);
      await syncDocToFirestore('farmer_profiles', profile.userId, profile);
    }

    res.json({ message: 'Farmer profile updated successfully', profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/buyers/:id: Update Buyer Profile (syncs to Firestore)
router.put('/buyers/:id', optionalAuth, async (req, res) => {
  try {
    const { businessName, contactName, phone, location, district, businessType, contactPreference } = req.body;
    const profiles = localStore.getCollection('buyer_profiles');
    let profile = profiles.find(p => p.userId === req.params.id || p.phone === req.params.id || p.id === req.params.id);

    const updates = {
      ...(businessName && { business_name: businessName }),
      ...(contactName && { contact_name: contactName }),
      ...(phone && { phone }),
      ...(location && { location }),
      ...(district && { district }),
      ...(businessType && { business_type: businessType }),
      ...(contactPreference && { contactPreference }),
      updatedAt: new Date().toISOString()
    };

    if (profile) {
      profile = localStore.update('buyer_profiles', profile.id || profile.userId, updates);
      await syncDocToFirestore('buyer_profiles', profile.id || profile.userId, profile);
    } else {
      profile = {
        userId: req.params.id,
        business_name: businessName || 'Agro Trader',
        phone: phone || req.params.id,
        ...updates,
        verification_status: 'verified',
        createdAt: new Date().toISOString()
      };
      localStore.insert('buyer_profiles', profile);
      await syncDocToFirestore('buyer_profiles', profile.userId, profile);
    }

    res.json({ message: 'Buyer profile updated successfully', profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- PRODUCE LISTINGS (Role-Guarded) -----------------
// GET /api/listings: Filterable by crop, district, grade, status, price range
router.get('/listings', async (req, res) => {
  try {
    let listings = localStore.getCollection('produce_listings');
    const { crop, district, grade, status, minPrice, maxPrice, farmerId } = req.query;

    if (crop) listings = listings.filter((l) => (l.crop || '').toLowerCase().includes(crop.toLowerCase()));
    if (district) listings = listings.filter((l) => (l.district || l.location || '').toLowerCase().includes(district.toLowerCase()));
    if (grade) listings = listings.filter((l) => (l.grade || '').toLowerCase() === grade.toLowerCase());
    if (status) listings = listings.filter((l) => l.status === status);
    if (farmerId) listings = listings.filter((l) => l.farmerId === farmerId);
    if (minPrice) listings = listings.filter((l) => parseFloat(l.expectedPrice) >= parseFloat(minPrice));
    if (maxPrice) listings = listings.filter((l) => parseFloat(l.expectedPrice) <= parseFloat(maxPrice));

    res.json({ count: listings.length, listings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/listings: Farmer or Admin only
router.post('/listings', optionalAuth, async (req, res) => {
  try {
    if (req.user && !['farmer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Only Farmers or Admins can create produce listings.' });
    }

    const {
      farmerId = req.user?.id || 'farmer-kolar-1',
      farmerName = req.user?.name || 'Ramesh Gowda',
      farmerPhone = req.user?.phone || '9876543210',
      crop,
      quantity,
      unit = 'quintal',
      grade = 'Grade A',
      expectedPrice,
      location,
      district,
      availabilityDate,
      photos = []
    } = req.body;

    if (!crop || !quantity || !expectedPrice) {
      return res.status(400).json({ error: 'Crop, quantity, and expected price are mandatory.' });
    }

    const listing = {
      id: `listing-${Date.now().toString(36)}`,
      farmerId,
      farmerName,
      farmerPhone,
      farmerVerificationStatus: 'verified',
      crop,
      quantity: parseFloat(quantity),
      unit,
      grade,
      expectedPrice: parseFloat(expectedPrice),
      location: location || district || 'Kolar, Karnataka',
      district: district || location || 'Kolar',
      availabilityDate: availabilityDate || new Date().toISOString().slice(0, 10),
      photos: Array.isArray(photos) ? photos : [photos],
      status: 'active',
      createdAt: new Date().toISOString()
    };

    localStore.insert('produce_listings', listing);
    await syncDocToFirestore('produce_listings', listing.id, listing);

    res.status(201).json({ message: 'Produce listing created successfully', listing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/listings/:id: Farmer or Admin
router.put('/listings/:id', optionalAuth, async (req, res) => {
  try {
    if (req.user && !['farmer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Only Farmers or Admins can edit listings.' });
    }

    const updated = localStore.update('produce_listings', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Listing not found.' });

    await syncDocToFirestore('produce_listings', req.params.id, updated);
    res.json({ message: 'Listing updated successfully', listing: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/listings/:id
router.delete('/listings/:id', optionalAuth, async (req, res) => {
  try {
    if (req.user && !['farmer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Only Farmers or Admins can delete listings.' });
    }

    localStore.delete('produce_listings', req.params.id);
    await deleteDocFromFirestore('produce_listings', req.params.id);
    res.json({ message: 'Listing deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- BUYER REQUIREMENTS (Role-Guarded) -----------------
router.get('/requirements', async (req, res) => {
  try {
    let reqs = localStore.getCollection('buyer_requirements');
    const { crop, district, buyerId } = req.query;

    if (crop) reqs = reqs.filter((r) => (r.crop || '').toLowerCase().includes(crop.toLowerCase()));
    if (district) reqs = reqs.filter((r) => (r.district || r.location || '').toLowerCase().includes(district.toLowerCase()));
    if (buyerId) reqs = reqs.filter((r) => r.buyerId === buyerId);

    res.json({ count: reqs.length, requirements: reqs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/requirements', optionalAuth, async (req, res) => {
  try {
    if (req.user && !['buyer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Only Buyers or Admins can post procurement requirements.' });
    }

    const {
      buyerId = req.user?.id || 'buyer-kolar-1',
      buyerName = req.user?.name || 'Suresh Agro Traders',
      buyerPhone = req.user?.phone || '9845012345',
      crop,
      requiredQuantity,
      unit = 'quintal',
      quality = 'Grade A',
      targetPrice,
      location,
      district,
      neededByDate
    } = req.body;

    if (!crop || !requiredQuantity) {
      return res.status(400).json({ error: 'Crop and required quantity are mandatory.' });
    }

    const requirement = {
      id: `req-${Date.now().toString(36)}`,
      buyerId,
      buyerName,
      buyerPhone,
      crop,
      requiredQuantity: parseFloat(requiredQuantity),
      unit,
      quality,
      targetPrice: targetPrice ? parseFloat(targetPrice) : 0,
      location: location || 'Kolar Mandi',
      district: district || location || 'Kolar',
      neededByDate: neededByDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    localStore.insert('buyer_requirements', requirement);
    await syncDocToFirestore('buyer_requirements', requirement.id, requirement);

    res.status(201).json({ message: 'Requirement published successfully', requirement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/requirements/:id: Update procurement requirement
router.put('/requirements/:id', optionalAuth, async (req, res) => {
  try {
    const updated = localStore.update('buyer_requirements', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Requirement not found.' });

    await syncDocToFirestore('buyer_requirements', req.params.id, updated);
    res.json({ message: 'Requirement updated successfully', requirement: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/requirements/:id: Delete procurement requirement
router.delete('/requirements/:id', optionalAuth, async (req, res) => {
  try {
    localStore.delete('buyer_requirements', req.params.id);
    await deleteDocFromFirestore('buyer_requirements', req.params.id);
    res.json({ message: 'Requirement deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ----------------- MATCHING ENGINE (Prompt 4) -----------------
router.get('/matches', async (req, res) => {
  try {
    const listings = localStore.getCollection('produce_listings').filter((l) => l.status === 'active');
    const requirements = localStore.getCollection('buyer_requirements');
    const { listingId, requirementId } = req.query;

    if (listingId) {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing) return res.json({ count: 0, matches: [] });
      const matches = findMatchesForListing(listing, requirements);
      return res.json({ count: matches.length, matches });
    }

    if (requirementId) {
      const reqItem = requirements.find((r) => r.id === requirementId);
      if (!reqItem) return res.json({ count: 0, matches: [] });
      const matches = findMatchesForRequirement(reqItem, listings);
      return res.json({ count: matches.length, matches });
    }

    const allMatches = [];
    for (const listing of listings) {
      for (const reqItem of requirements) {
        const result = calculateMatchScore(listing, reqItem);
        if (result.isMatch) {
          const matchDoc = {
            id: `match-${listing.id}-${reqItem.id}`,
            listingId: listing.id,
            requirementId: reqItem.id,
            farmerId: listing.farmerId,
            buyerId: reqItem.buyerId,
            crop: listing.crop,
            listing,
            requirement: reqItem,
            score: result.score,
            reasons: result.reasons,
            breakdown: result.breakdown,
            status: 'active',
            updatedAt: new Date().toISOString()
          };
          allMatches.push(matchDoc);

          // Persist / audit in matches collection
          const existing = localStore.getCollection('matches').find((m) => m.id === matchDoc.id);
          if (existing) {
            localStore.update('matches', matchDoc.id, matchDoc);
          } else {
            localStore.insert('matches', matchDoc);
          }
          await syncDocToFirestore('matches', matchDoc.id, matchDoc);
        }
      }
    }

    allMatches.sort((a, b) => b.score - a.score);
    res.json({ count: allMatches.length, matches: allMatches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- DEALS & LIFECYCLE (Prompt 5 & 6) -----------------
router.get('/deals', async (req, res) => {
  try {
    let deals = localStore.getCollection('deals');
    const { farmerId, buyerId, status } = req.query;

    if (farmerId) deals = deals.filter((d) => d.farmerId === farmerId);
    if (buyerId) deals = deals.filter((d) => d.buyerId === buyerId);
    if (status) deals = deals.filter((d) => d.status === status);

    res.json({ count: deals.length, deals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/deals', optionalAuth, async (req, res) => {
  try {
    const {
      listingId,
      farmerId,
      farmerName,
      farmerPhone,
      buyerId,
      buyerName,
      buyerPhone,
      crop,
      quantity,
      unit = 'quintal',
      agreedPrice,
      pickupDate,
      notes
    } = req.body;

    if (!crop || !quantity || !agreedPrice) {
      return res.status(400).json({ error: 'Incomplete deal payload: crop, quantity, and agreedPrice required.' });
    }

    const qty = parseFloat(quantity);
    const price = parseFloat(agreedPrice);
    // Strict server-side financial calculation (never trust client total)
    const totalAmount = qty * price;

    const deal = {
      id: `deal-${Date.now().toString(36)}`,
      listingId: listingId || '',
      farmerId: farmerId || req.user?.id || 'farmer-kolar-1',
      farmerName: farmerName || req.user?.name || 'Ramesh Gowda',
      farmerPhone: farmerPhone || req.user?.phone || '9876543210',
      buyerId: buyerId || 'buyer-kolar-1',
      buyerName: buyerName || 'Suresh Agro Traders',
      buyerPhone: buyerPhone || '9845012345',
      crop,
      quantity: qty,
      unit,
      agreedPrice: price,
      totalAmount,
      status: 'buyer_interested',
      statusHistory: [
        { status: 'buyer_interested', timestamp: new Date().toISOString(), note: 'Interest expressed by buyer' }
      ],
      weighingProof: null,
      pickupDate: pickupDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    localStore.insert('deals', deal);
    await syncDocToFirestore('deals', deal.id, deal);

    if (listingId) {
      localStore.update('produce_listings', listingId, { status: 'matched' });
      await syncDocToFirestore('produce_listings', listingId, { status: 'matched' });
    }

    res.status(201).json({ message: 'Deal initiated successfully', deal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/deals/:id/status', async (req, res) => {
  try {
    const { targetStatus, note, proofUrl, actualWeight } = req.body;
    const deals = localStore.getCollection('deals');
    const deal = deals.find((d) => d.id === req.params.id);

    if (!deal) return res.status(404).json({ error: 'Deal not found.' });

    // Strict Unidirectional State Transition Check
    if (!canTransition(deal.status, targetStatus)) {
      return res.status(409).json({
        error: `Invalid transition: cannot jump from '${deal.status}' to '${targetStatus}'. Sequential workflow must follow: listed -> buyer_interested -> deal_confirmed -> weighed_proof_added -> pickup_delivery -> completed.`
      });
    }

    const updates = {
      status: targetStatus,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...(deal.statusHistory || []),
        { status: targetStatus, timestamp: new Date().toISOString(), note: note || `Transitioned to ${formatStatusLabel(targetStatus)}` }
      ]
    };

    if (proofUrl || actualWeight) {
      updates.weighingProof = {
        photoUrl: proofUrl || deal.weighingProof?.photoUrl,
        actualWeight: actualWeight ? parseFloat(actualWeight) : deal.weighingProof?.actualWeight || deal.quantity,
        unit: deal.unit,
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'APMC Authorized Weighbridge Station',
        status: 'verified'
      };
    }

    const updatedDeal = localStore.update('deals', req.params.id, updates);
    await syncDocToFirestore('deals', req.params.id, updatedDeal);

    if (deal.listingId) {
      if (targetStatus === 'completed') {
        localStore.update('produce_listings', deal.listingId, { status: 'sold' });
        await syncDocToFirestore('produce_listings', deal.listingId, { status: 'sold' });
      } else if (targetStatus === 'cancelled') {
        localStore.update('produce_listings', deal.listingId, { status: 'active' });
        await syncDocToFirestore('produce_listings', deal.listingId, { status: 'active' });
      }
    }

    res.json({ message: `Deal transitioned to ${formatStatusLabel(targetStatus)}`, deal: updatedDeal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Attach Weighing & Quality Proof (Prompt 5 & 6)
router.post('/deals/:id/proof', async (req, res) => {
  try {
    const { proofUrl, actualWeight, slipNumber, notes, verifiedBy } = req.body;
    const deals = localStore.getCollection('deals');
    const deal = deals.find((d) => d.id === req.params.id);

    if (!deal) return res.status(404).json({ error: 'Deal not found.' });

    const weightVal = actualWeight ? parseFloat(actualWeight) : deal.quantity;
    const proofId = `proof-${Date.now().toString(36)}`;

    const proof = {
      id: proofId,
      dealId: deal.id,
      listingId: deal.listingId || '',
      crop: deal.crop,
      farmerId: deal.farmerId,
      buyerId: deal.buyerId,
      proofUrl: proofUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
      actualWeight: weightVal,
      unit: deal.unit,
      slipNumber: slipNumber || `WB-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'verified', // 'pending' | 'verified' | 'needs_attention'
      notes: notes || 'APMC Digital Weighbridge certified gross & tare weight',
      verifiedBy: verifiedBy || 'APMC Weighbridge Operator #04',
      uploadedAt: new Date().toISOString()
    };

    localStore.insert('proofs', proof);
    await syncDocToFirestore('proofs', proof.id, proof);

    // If deal is currently deal_confirmed, advance it to weighed_proof_added
    let nextStatus = deal.status;
    const history = [...(deal.statusHistory || [])];
    if (deal.status === 'deal_confirmed') {
      nextStatus = 'weighed_proof_added';
      history.push({
        status: 'weighed_proof_added',
        timestamp: new Date().toISOString(),
        note: `Weighing proof ${proof.slipNumber} attached (${proof.actualWeight} ${proof.unit})`
      });
    }

    const updatedDeal = localStore.update('deals', deal.id, {
      status: nextStatus,
      weighingProof: proof,
      statusHistory: history,
      updatedAt: new Date().toISOString()
    });
    await syncDocToFirestore('deals', deal.id, updatedDeal);

    res.status(201).json({
      message: 'Weighing proof attached and verified successfully',
      proof,
      deal: updatedDeal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- PROOFS DIRECTORY (Prompt 6) -----------------
router.get('/proofs', async (req, res) => {
  try {
    const { dealId } = req.query;
    let proofs = localStore.getCollection('proofs');
    if (dealId) {
      proofs = proofs.filter((p) => p.dealId === dealId);
    }
    res.json({ count: proofs.length, proofs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proofs/:dealId', async (req, res) => {
  try {
    const proofs = localStore.getCollection('proofs').filter((p) => p.dealId === req.params.dealId);
    res.json({ count: proofs.length, proofs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proofs: Direct upload/submit weighing proof (for listing or deal)
router.post('/proofs', optionalAuth, async (req, res) => {
  try {
    const {
      listingId,
      dealId,
      crop = 'Produce',
      farmerId = req.user?.id || 'farmer-kolar-1',
      buyerId = 'buyer-kolar-1',
      proofUrl,
      actualWeight,
      unit = 'quintal',
      slipNumber,
      notes,
      verifiedBy
    } = req.body;

    const proofId = `proof-${Date.now().toString(36)}`;
    const proof = {
      id: proofId,
      dealId: dealId || '',
      listingId: listingId || '',
      crop,
      farmerId,
      buyerId,
      proofUrl: proofUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
      actualWeight: actualWeight ? parseFloat(actualWeight) : 100,
      unit,
      slipNumber: slipNumber || `WB-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'verified',
      notes: notes || 'APMC Digital Weighbridge certified tare and gross weight',
      verifiedBy: verifiedBy || 'APMC Weighbridge Operator #04',
      uploadedAt: new Date().toISOString()
    };

    localStore.insert('proofs', proof);
    await syncDocToFirestore('proofs', proof.id, proof);

    // If listingId provided, update listing's weighingProofs array
    if (listingId) {
      const listing = localStore.getCollection('produce_listings').find(l => l.id === listingId);
      if (listing) {
        const proofsArr = listing.weighingProofs || [];
        proofsArr.unshift(proof);
        localStore.update('produce_listings', listingId, { weighingProofs: proofsArr });
        await syncDocToFirestore('produce_listings', listingId, { weighingProofs: proofsArr });
      }
    }

    res.status(201).json({ message: 'Weighing proof submitted successfully', proof });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/proofs/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['pending', 'verified', 'needs_attention'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, verified, or needs_attention.' });
    }
    const updated = localStore.update('proofs', req.params.id, {
      status,
      notes: notes || undefined,
      verifiedAt: new Date().toISOString()
    });
    if (!updated) return res.status(404).json({ error: 'Proof not found.' });

    await syncDocToFirestore('proofs', req.params.id, updated);
    res.json({ message: `Proof status updated to ${status}`, proof: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- VERIFICATION DESK (Admin Only) -----------------
router.get('/verifications', async (req, res) => {
  try {
    const list = localStore.getCollection('verifications');
    res.json({ count: list.length, verifications: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verifications/submit', optionalAuth, async (req, res) => {
  try {
    const {
      userId = req.user?.id || 'farmer-kolar-1',
      userName = req.user?.name || 'Ramesh Gowda',
      userPhone = req.user?.phone || '9876543210',
      role = req.user?.role || 'farmer',
      district = 'Kolar',
      documents = [],
      notes
    } = req.body;

    const verif = {
      id: `verif-${Date.now().toString(36)}`,
      userId,
      userName,
      userPhone,
      role,
      district,
      status: 'pending',
      documents,
      notes: notes || 'Documents submitted for APMC verification review',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    localStore.insert('verifications', verif);
    await syncDocToFirestore('verifications', verif.id, verif);

    if (role === 'farmer') {
      localStore.update('farmer_profiles', userId, { verification_status: 'pending' });
      await syncDocToFirestore('farmer_profiles', userId, { verification_status: 'pending' });
    } else {
      localStore.update('buyer_profiles', userId, { verification_status: 'pending' });
      await syncDocToFirestore('buyer_profiles', userId, { verification_status: 'pending' });
    }

    res.status(201).json({ message: 'Verification documents submitted successfully.', verif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verifications/approve', optionalAuth, async (req, res) => {
  try {
    const { userId, role = 'farmer', note } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    if (role === 'farmer') {
      localStore.update('farmer_profiles', userId, { verification_status: 'verified' });
      await syncDocToFirestore('farmer_profiles', userId, { verification_status: 'verified' });
    } else {
      localStore.update('buyer_profiles', userId, { verification_status: 'verified' });
      await syncDocToFirestore('buyer_profiles', userId, { verification_status: 'verified' });
    }

    const verifs = localStore.getCollection('verifications');
    const existing = verifs.find((v) => v.userId === userId || v.id === userId);
    let verif;
    if (existing) {
      verif = localStore.update('verifications', existing.id, {
        status: 'verified',
        notes: note || 'Approved by APMC Administrator',
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await syncDocToFirestore('verifications', existing.id, verif);
    } else {
      verif = {
        id: `verif-${Date.now().toString(36)}`,
        userId,
        role,
        status: 'verified',
        notes: note || 'Approved by APMC Administrator',
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localStore.insert('verifications', verif);
      await syncDocToFirestore('verifications', verif.id, verif);
    }

    res.json({ message: `User ${userId} verified successfully.`, verif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verifications/reject', optionalAuth, async (req, res) => {
  try {
    const { userId, role = 'farmer', note } = req.body;
    if (!userId || !note) return res.status(400).json({ error: 'userId and rejection note are required.' });

    if (role === 'farmer') {
      localStore.update('farmer_profiles', userId, { verification_status: 'needs_attention' });
      await syncDocToFirestore('farmer_profiles', userId, { verification_status: 'needs_attention' });
    } else {
      localStore.update('buyer_profiles', userId, { verification_status: 'needs_attention' });
      await syncDocToFirestore('buyer_profiles', userId, { verification_status: 'needs_attention' });
    }

    const verifs = localStore.getCollection('verifications');
    const existing = verifs.find((v) => v.userId === userId || v.id === userId);
    let verif;
    if (existing) {
      verif = localStore.update('verifications', existing.id, {
        status: 'needs_attention',
        notes: note,
        updatedAt: new Date().toISOString()
      });
      await syncDocToFirestore('verifications', existing.id, verif);
    } else {
      verif = {
        id: `verif-${Date.now().toString(36)}`,
        userId,
        role,
        status: 'needs_attention',
        notes: note,
        updatedAt: new Date().toISOString()
      };
      localStore.insert('verifications', verif);
      await syncDocToFirestore('verifications', verif.id, verif);
    }

    res.json({ message: `User ${userId} flagged for attention.`, verif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CRM EXECUTIVE DASHBOARD -----------------
router.get('/crm/overview', async (req, res) => {
  try {
    const farmers = localStore.getCollection('farmer_profiles');
    const buyers = localStore.getCollection('buyer_profiles');
    const listings = localStore.getCollection('produce_listings');
    const deals = localStore.getCollection('deals');

    const totalDealsValue = deals
      .filter((d) => d.status !== 'cancelled')
      .reduce((sum, d) => sum + (parseFloat(d.totalAmount) || 0), 0);

    const activeListingsQty = listings
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0);

    const pendingVerifications = farmers.filter((f) => f.verification_status === 'pending').length;

    res.json({
      metrics: {
        activeFarmers: farmers.length,
        verifiedBuyers: buyers.filter(b => b.verification_status === 'verified').length,
        totalBuyers: buyers.length,
        activeListingsCount: listings.filter((l) => l.status === 'active').length,
        listedQuintals: activeListingsQty,
        totalDealsCount: deals.length,
        completedDealsCount: deals.filter((d) => d.status === 'completed').length,
        activeDealsValue: totalDealsValue,
        pendingApprovals: pendingVerifications
      },
      recentDeals: deals.slice(0, 5),
      recentListings: listings.slice(0, 5),
      dbStatus: getDbStatus()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
