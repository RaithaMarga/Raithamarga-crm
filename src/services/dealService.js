/**
 * Deal Lifecycle Service for RaithaMarga (Prompt 5 & 6)
 * Strict state transitions:
 * listed -> buyer_interested -> deal_confirmed -> weighed_proof_added -> pickup_delivery -> completed (or cancelled)
 */

export const DEAL_STATUSES = [
  'listed',
  'buyer_interested',
  'deal_confirmed',
  'weighed_proof_added',
  'pickup_delivery',
  'completed',
  'cancelled'
];

export const VALID_TRANSITIONS = {
  listed: ['buyer_interested', 'cancelled'],
  buyer_interested: ['deal_confirmed', 'cancelled'],
  deal_confirmed: ['weighed_proof_added', 'cancelled'],
  weighed_proof_added: ['pickup_delivery', 'cancelled'],
  pickup_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

export function canTransition(currentStatus, targetStatus) {
  if (!VALID_TRANSITIONS[currentStatus]) return false;
  return VALID_TRANSITIONS[currentStatus].includes(targetStatus);
}

export function formatStatusLabel(status) {
  switch (status) {
    case 'listed': return 'Listed';
    case 'buyer_interested': return 'Buyer Interested';
    case 'deal_confirmed': return 'Deal Confirmed';
    case 'weighed_proof_added': return 'Weighing Proof Added';
    case 'pickup_delivery': return 'In Transit / Pickup';
    case 'completed': return 'Deal Completed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}
