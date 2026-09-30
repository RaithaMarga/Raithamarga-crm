/**
 * Deterministic Matching Engine for RaithaMarga (Prompt 4)
 * Evaluates Farmer Listings against Buyer Requirements with transparent scoring and human-readable reasons.
 */

export function calculateMatchScore(listing, requirement) {
  // 1. Crop Match (Hard filter: 35 points max)
  const lCrop = (listing.crop || '').trim().toLowerCase();
  const rCrop = (requirement.crop || '').trim().toLowerCase();

  if (!lCrop || !rCrop) {
    return { score: 0, reasons: ['Missing crop specification'], isMatch: false };
  }

  let cropScore = 0;
  const reasons = [];

  if (lCrop === rCrop) {
    cropScore = 35; // 35 points for exact match
    reasons.push(`Exact crop match: ${listing.crop} (35/35 pts)`);
  } else if (lCrop.includes(rCrop) || rCrop.includes(lCrop)) {
    cropScore = 30; // 30 points for variety / synonym match
    reasons.push(`Crop variety match: ${listing.crop} ~ ${requirement.crop} (30/35 pts)`);
  } else {
    // If crops do not match at all, hard zero / no match
    return {
      score: 0,
      reasons: [`Different crop types: ${listing.crop} vs ${requirement.crop}`],
      isMatch: false,
      breakdown: { crop: 0, quantity: 0, location: 0, price: 0 }
    };
  }

  // 2. Quantity Fit (25 points max)
  let qtyScore = 0;
  const listQty = parseFloat(listing.quantity) || 0;
  const reqQty = parseFloat(requirement.requiredQuantity) || 0;

  if (listQty > 0 && reqQty > 0) {
    const ratio = Math.min(listQty, reqQty) / Math.max(listQty, reqQty);
    if (listQty >= reqQty) {
      qtyScore = 25; // 100% demand coverage
      reasons.push(`Available lot (${listQty} ${listing.unit || 'qtl'}) fully fulfills required demand of ${reqQty} ${requirement.unit || listing.unit || 'qtl'} (25/25 pts)`);
    } else {
      qtyScore = Math.max(5, Math.round(25 * ratio));
      reasons.push(`Available lot (${listQty} ${listing.unit || 'qtl'}) covers ${Math.round(ratio * 100)}% of required lot (${qtyScore}/25 pts)`);
    }
  } else {
    qtyScore = 10;
    reasons.push('Quantity open for confirmation (10/25 pts)');
  }

  // 3. Location / District Proximity (20 points max)
  let locScore = 0;
  const lDist = (listing.district || listing.location || '').trim().toLowerCase();
  const rDist = (requirement.district || requirement.location || '').trim().toLowerCase();

  if (lDist && rDist && (lDist.includes(rDist) || rDist.includes(lDist))) {
    locScore = 20;
    reasons.push(`Direct local APMC match in ${listing.district || listing.location} (20/20 pts)`);
  } else if (lDist && rDist) {
    locScore = 10;
    reasons.push(`Inter-district trade: ${listing.district || listing.location} to ${requirement.district || requirement.location} (10/20 pts)`);
  } else {
    locScore = 10;
    reasons.push('Location open / logistics negotiable (10/20 pts)');
  }

  // 4. Price Alignment & Margin (20 points max)
  let priceScore = 0;
  const listPrice = parseFloat(listing.expectedPrice) || 0;
  const targetPrice = parseFloat(requirement.targetPrice) || 0;

  if (listPrice > 0 && targetPrice > 0) {
    if (listPrice <= targetPrice) {
      priceScore = 20;
      reasons.push(`Farmer's expected price (₹${listPrice}) is within buyer's budget cap of ₹${targetPrice} (20/20 pts)`);
    } else {
      const diffRatio = (listPrice - targetPrice) / targetPrice;
      if (diffRatio <= 0.05) {
        priceScore = 15;
        reasons.push(`Price is within 5% negotiation window (₹${listPrice} vs ₹${targetPrice}) (15/20 pts)`);
      } else if (diffRatio <= 0.15) {
        priceScore = 10;
        reasons.push(`Price is within 15% negotiation margin (₹${listPrice} vs ₹${targetPrice}) (10/20 pts)`);
      } else if (diffRatio <= 0.25) {
        priceScore = 5;
        reasons.push(`Price spread (+${Math.round(diffRatio * 100)}%) requires formal negotiation (5/20 pts)`);
      } else {
        priceScore = 0;
        reasons.push(`Significant price discrepancy: ₹${listPrice} requested vs ₹${targetPrice} target (0/20 pts)`);
      }
    }
  } else {
    priceScore = 10;
    reasons.push('Pricing terms open for mutual agreement (10/20 pts)');
  }

  const totalScore = Math.min(100, cropScore + qtyScore + locScore + priceScore);

  return {
    score: totalScore,
    reasons,
    isMatch: totalScore >= 50,
    breakdown: {
      crop: cropScore,
      quantity: qtyScore,
      location: locScore,
      price: priceScore
    }
  };
}

export function findMatchesForListing(listing, requirements) {
  return requirements
    .map((req) => {
      const result = calculateMatchScore(listing, req);
      return {
        requirementId: req.id,
        requirement: req,
        listingId: listing.id,
        listing,
        ...result
      };
    })
    .filter((m) => m.isMatch)
    .sort((a, b) => b.score - a.score);
}

export function findMatchesForRequirement(requirement, listings) {
  return listings
    .map((listing) => {
      const result = calculateMatchScore(listing, requirement);
      return {
        listingId: listing.id,
        listing,
        requirementId: requirement.id,
        requirement,
        ...result
      };
    })
    .filter((m) => m.isMatch)
    .sort((a, b) => b.score - a.score);
}
