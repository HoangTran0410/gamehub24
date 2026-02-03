/**
 * Monte Carlo Tree Search for Reversi using Bitboards
 */

import {
  getValidMovesBB,
  getFlipsBB,
  countBitsBB,
  FULL_MASK,
} from "./bitboard";

// Game state for MCTS (lightweight copy)
interface MCTSState {
  bb: bigint; // black bitboard
  wb: bigint; // white bitboard
  turn: 0 | 1; // 0 = black, 1 = white
}

// Tree node
interface MCTSNode {
  state: MCTSState;
  parent: MCTSNode | null;
  move: number | null; // bit index (0-63)
  children: MCTSNode[];
  untriedMoves: number[];
  visits: number;
  wins: number;
}

const C = 1.414;

function applyMoveBB(state: MCTSState, pos: number): MCTSState {
  const moveBit = 1n << BigInt(pos);
  const p = state.turn === 0 ? state.bb : state.wb;
  const o = state.turn === 0 ? state.wb : state.bb;

  const flips = getFlipsBB(moveBit, p, o);
  const newP = p | moveBit | flips;
  const newO = o & ~flips & FULL_MASK;

  return {
    bb: state.turn === 0 ? newP : newO,
    wb: state.turn === 0 ? newO : newP,
    turn: (1 - state.turn) as 0 | 1,
  };
}

function getWinnerBB(bb: bigint, wb: bigint): 0 | 1 | -1 {
  const bc = countBitsBB(bb);
  const wc = countBitsBB(wb);
  return bc > wc ? 0 : wc > bc ? 1 : -1;
}

function createNode(
  state: MCTSState,
  parent: MCTSNode | null,
  move: number | null,
): MCTSNode {
  const p = state.turn === 0 ? state.bb : state.wb;
  const o = state.turn === 0 ? state.wb : state.bb;
  const movesBB = getValidMovesBB(p, o);
  const untriedMoves: number[] = [];
  for (let i = 0; i < 64; i++) {
    if ((movesBB >> BigInt(i)) & 1n) untriedMoves.push(i);
  }

  return {
    state,
    parent,
    move,
    children: [],
    untriedMoves,
    visits: 0,
    wins: 0,
  };
}

function ucb1(node: MCTSNode, isRootPlayer: boolean): number {
  if (node.visits === 0) return Infinity;
  const wins = isRootPlayer ? node.wins : node.visits - node.wins;
  return (
    wins / node.visits +
    C * Math.sqrt(Math.log(node.parent!.visits) / node.visits)
  );
}

function selectChild(node: MCTSNode, rootPlayer: 0 | 1): MCTSNode {
  const isRootPlayer = node.state.turn === rootPlayer;
  let bestChild = node.children[0];
  let bestUcb = -Infinity;

  for (const child of node.children) {
    const childUcb = ucb1(child, isRootPlayer);
    if (childUcb > bestUcb) {
      bestChild = child;
      bestUcb = childUcb;
    }
  }
  return bestChild;
}

function expandChild(node: MCTSNode): MCTSNode {
  const idx = Math.floor(Math.random() * node.untriedMoves.length);
  const move = node.untriedMoves[idx];
  node.untriedMoves.splice(idx, 1);

  const newState = applyMoveBB(node.state, move);
  const child = createNode(newState, node, move);
  node.children.push(child);
  return child;
}

function simulateBB(state: MCTSState, rootPlayer: 0 | 1): number {
  let bb = state.bb;
  let wb = state.wb;
  let turn = state.turn;

  for (let i = 0; i < 60; i++) {
    const p = turn === 0 ? bb : wb;
    const o = turn === 0 ? wb : bb;
    const movesBB = getValidMovesBB(p, o);

    if (movesBB === 0n) {
      if (getValidMovesBB(o, p) === 0n) break;
      turn = (1 - turn) as 0 | 1;
      continue;
    }

    // Pick random move from bitboard
    const moves: number[] = [];
    for (let j = 0; j < 64; j++) {
      if ((movesBB >> BigInt(j)) & 1n) moves.push(j);
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    if (move === undefined) break; // Should not happen with movesBB !== 0n
    const moveBit = 1n << BigInt(move);
    const flips = getFlipsBB(moveBit, p, o);
    const newP = p | moveBit | flips;
    const newO = o & ~flips & FULL_MASK;

    bb = turn === 0 ? newP : newO;
    wb = turn === 0 ? newO : newP;
    turn = (1 - turn) as 0 | 1;
  }

  const winner = getWinnerBB(bb, wb);
  if (winner === -1) return 0.5;
  return winner === rootPlayer ? 1 : 0;
}

function backpropagate(node: MCTSNode | null, reward: number): void {
  while (node !== null) {
    node.visits++;
    node.wins += reward;
    node = node.parent;
  }
}

export function runMCTS(
  bbn: bigint,
  wbn: bigint,
  currentPlayer: 0 | 1,
  timeoutMs: number = 500,
): [number, number] | null {
  const rootState: MCTSState = { bb: bbn, wb: wbn, turn: currentPlayer };
  const p = currentPlayer === 0 ? bbn : wbn;
  const o = currentPlayer === 0 ? wbn : bbn;
  const movesBB = getValidMovesBB(p, o);

  if (movesBB === 0n) return null;

  const moves: number[] = [];
  for (let i = 0; i < 64; i++) {
    if ((movesBB >> BigInt(i)) & 1n) moves.push(i);
  }
  if (moves.length === 1) return [Math.floor(moves[0] / 8), moves[0] % 8];

  const root = createNode(rootState, null, null);
  const startTime = performance.now();

  while (performance.now() - startTime < timeoutMs) {
    let node = root;
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = selectChild(node, currentPlayer);
    }

    if (node.untriedMoves.length > 0) {
      node = expandChild(node);
    }

    const reward = simulateBB(node.state, currentPlayer);
    backpropagate(node, reward);
  }

  let bestMove: number | null = null;
  let maxVisits = -1;

  for (const child of root.children) {
    if (child.visits > maxVisits) {
      maxVisits = child.visits;
      bestMove = child.move;
    }
  }

  return bestMove !== null ? [Math.floor(bestMove / 8), bestMove % 8] : null;
}
