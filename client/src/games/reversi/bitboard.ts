/**
 * Reversi Bitboard Utilities
 */

export const MASK = 0x7e7e7e7e7e7e7e7en;
export const FULL_MASK = 0xffffffffffffffffn;

/**
 * Get valid moves for player `p` given opponent `o` as a bitboard.
 */
export function getValidMovesBB(p: bigint, o: bigint): bigint {
  const empty = ~(p | o) & FULL_MASK;
  let moves = 0n;

  // Check 8 directions
  for (const shift of [1n, 7n, 8n, 9n]) {
    moves |= checkDirectionBB(p, o, empty, shift);
    moves |= checkDirectionBB(p, o, empty, -shift);
  }
  return moves;
}

function checkDirectionBB(
  p: bigint,
  o: bigint,
  empty: bigint,
  shift: bigint,
): bigint {
  let candidates = 0n;
  if (shift === 1n) candidates = (p >> 1n) & o & MASK;
  else if (shift === -1n) candidates = (p << 1n) & o & MASK;
  else if (shift === 7n) candidates = (p >> 7n) & o & MASK;
  else if (shift === -7n) candidates = (p << 7n) & o & MASK;
  else if (shift === 9n) candidates = (p >> 9n) & o & MASK;
  else if (shift === -9n) candidates = (p << 9n) & o & MASK;
  else if (shift === 8n) candidates = (p >> 8n) & o;
  else if (shift === -8n) candidates = (p << 8n) & o;

  if (candidates === 0n) return 0n;

  for (let i = 0; i < 5; i++) {
    if (shift === 1n) candidates |= (candidates >> 1n) & o & MASK;
    else if (shift === -1n) candidates |= (candidates << 1n) & o & MASK;
    else if (shift === 7n) candidates |= (candidates >> 7n) & o & MASK;
    else if (shift === -7n) candidates |= (candidates << 7n) & o & MASK;
    else if (shift === 9n) candidates |= (candidates >> 9n) & o & MASK;
    else if (shift === -9n) candidates |= (candidates << 9n) & o & MASK;
    else if (shift === 8n) candidates |= (candidates >> 8n) & o;
    else if (shift === -8n) candidates |= (candidates << 8n) & o;
  }

  if (shift === 1n) return (candidates >> 1n) & empty & MASK;
  if (shift === -1n) return (candidates << 1n) & empty & MASK;
  if (shift === 7n) return (candidates >> 7n) & empty & MASK;
  if (shift === -7n) return (candidates << 7n) & empty & MASK;
  if (shift === 9n) return (candidates >> 9n) & empty & MASK;
  if (shift === -9n) return (candidates << 9n) & empty & MASK;
  if (shift === 8n) return (candidates >> 8n) & empty;
  if (shift === -8n) return (candidates << 8n) & empty;
  return 0n;
}

/**
 * Get pieces that would be flipped for a move at bit position `moveBitIndex`
 */
export function getFlipsBB(moveBit: bigint, p: bigint, o: bigint): bigint {
  let flips = 0n;
  for (const shift of [1n, 7n, 8n, 9n, -1n, -7n, -8n, -9n]) {
    let directionFlips = 0n;
    let curr = 0n;

    if (shift === 1n) curr = (moveBit >> 1n) & o & MASK;
    else if (shift === -1n) curr = (moveBit << 1n) & o & MASK;
    else if (shift === 7n) curr = (moveBit >> 7n) & o & MASK;
    else if (shift === -7n) curr = (moveBit << 7n) & o & MASK;
    else if (shift === 9n) curr = (moveBit >> 9n) & o & MASK;
    else if (shift === -9n) curr = (moveBit << 9n) & o & MASK;
    else if (shift === 8n) curr = (moveBit >> 8n) & o;
    else if (shift === -8n) curr = (moveBit << 8n) & o;

    while (curr !== 0n) {
      directionFlips |= curr;
      let next = 0n;
      if (shift === 1n) next = curr >> 1n;
      else if (shift === -1n) next = curr << 1n;
      else if (shift === 7n) next = curr >> 7n;
      else if (shift === -7n) next = curr << 7n;
      else if (shift === 9n) next = curr >> 9n;
      else if (shift === -9n) next = curr << 9n;
      else if (shift === 8n) next = curr >> 8n;
      else if (shift === -8n) next = curr << 8n;

      if ((next & p) !== 0n) {
        flips |= directionFlips;
        break;
      }

      if (shift === 8n || shift === -8n) curr = next & o;
      else curr = next & o & MASK;
    }
  }
  return flips;
}

/**
 * Count bits in a bitboard.
 */
export function countBitsBB(bb: bigint): number {
  let count = 0;
  let temp = bb;
  while (temp > 0n) {
    temp &= temp - 1n;
    count++;
  }
  return count;
}
