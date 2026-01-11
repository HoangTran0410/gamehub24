/**
 * Monte Carlo Tree Search for Reversi
 * Based on the 4 phases: Selection, Expansion, Simulation, Backpropagation
 */

import type { Cell } from "./types";
import { DIRECTIONS } from "./types";

// Game state for MCTS (lightweight copy)
interface MCTSState {
  board: Cell[][];
  currentPlayer: 0 | 1; // 0 = black, 1 = white
}

// Tree node
interface MCTSNode {
  state: MCTSState;
  parent: MCTSNode | null;
  move: [number, number] | null; // The move that led to this state
  children: MCTSNode[];
  untriedMoves: [number, number][];
  visits: number;
  wins: number;
}

// UCB1 exploration constant
const C = 1.414; // sqrt(2)

// Clone board state
function cloneState(state: MCTSState): MCTSState {
  return {
    board: state.board.map((row) => [...row]),
    currentPlayer: state.currentPlayer,
  };
}

// Get valid moves for a player
function getValidMoves(board: Cell[][], player: 0 | 1): [number, number][] {
  const color = player === 0 ? "black" : "white";
  const moves: [number, number][] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlips(board, r, c, color).length > 0) {
        moves.push([r, c]);
      }
    }
  }
  return moves;
}

// Get pieces that would be flipped
function getFlips(
  board: Cell[][],
  row: number,
  col: number,
  color: Cell
): [number, number][] {
  if (!color || board[row][col] !== null) return [];

  const opponent = color === "black" ? "white" : "black";
  const allFlips: [number, number][] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const flips: [number, number][] = [];
    let r = row + dr;
    let c = col + dc;

    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opponent) {
      flips.push([r, c]);
      r += dr;
      c += dc;
    }

    if (
      r >= 0 &&
      r < 8 &&
      c >= 0 &&
      c < 8 &&
      board[r][c] === color &&
      flips.length > 0
    ) {
      allFlips.push(...flips);
    }
  }

  return allFlips;
}

// Apply a move to the board
function applyMove(state: MCTSState, move: [number, number]): MCTSState {
  const newState = cloneState(state);
  const color = state.currentPlayer === 0 ? "black" : "white";
  const [row, col] = move;

  const flips = getFlips(newState.board, row, col, color);
  newState.board[row][col] = color;
  for (const [r, c] of flips) {
    newState.board[r][c] = color;
  }

  newState.currentPlayer = (1 - state.currentPlayer) as 0 | 1;
  return newState;
}

// Check if game is over
function isTerminal(board: Cell[][]): boolean {
  const blackMoves = getValidMoves(board, 0);
  const whiteMoves = getValidMoves(board, 1);
  return blackMoves.length === 0 && whiteMoves.length === 0;
}

// Get winner: 0 = black, 1 = white, -1 = draw
function getWinner(board: Cell[][]): 0 | 1 | -1 {
  let black = 0;
  let white = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "black") black++;
      if (board[r][c] === "white") white++;
    }
  }
  if (black > white) return 0;
  if (white > black) return 1;
  return -1;
}

// Create a new node
function createNode(
  state: MCTSState,
  parent: MCTSNode | null,
  move: [number, number] | null
): MCTSNode {
  return {
    state,
    parent,
    move,
    children: [],
    untriedMoves: getValidMoves(state.board, state.currentPlayer),
    visits: 0,
    wins: 0,
  };
}

// UCB1 formula for child selection
function ucb1(node: MCTSNode, isRootPlayer: boolean): number {
  if (node.visits === 0) return Infinity;
  const wins = isRootPlayer ? node.wins : node.visits - node.wins;
  return (
    wins / node.visits +
    C * Math.sqrt(Math.log(node.parent!.visits) / node.visits)
  );
}

// Phase 1: Selection - select best child using UCB1
function selectChild(node: MCTSNode, rootPlayer: 0 | 1): MCTSNode {
  const isRootPlayer = node.state.currentPlayer === rootPlayer;
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

// Phase 2: Expansion - expand a random untried move
function expandChild(node: MCTSNode): MCTSNode {
  const idx = Math.floor(Math.random() * node.untriedMoves.length);
  const move = node.untriedMoves[idx];
  node.untriedMoves.splice(idx, 1);

  const newState = applyMove(node.state, move);
  const child = createNode(newState, node, move);
  node.children.push(child);

  return child;
}

// Phase 3: Simulation - random playout until terminal
function simulate(node: MCTSNode, rootPlayer: 0 | 1): number {
  let state = cloneState(node.state);

  while (!isTerminal(state.board)) {
    const moves = getValidMoves(state.board, state.currentPlayer);
    if (moves.length === 0) {
      // Pass
      state.currentPlayer = (1 - state.currentPlayer) as 0 | 1;
      continue;
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    state = applyMove(state, move);
  }

  const winner = getWinner(state.board);
  if (winner === -1) return 0.5; // Draw
  return winner === rootPlayer ? 1 : 0;
}

// Phase 4: Backpropagation - update wins/visits up the tree
function backpropagate(node: MCTSNode | null, reward: number): void {
  while (node !== null) {
    node.visits++;
    node.wins += reward;
    node = node.parent;
  }
}

// Main MCTS search
export function runMCTS(
  board: Cell[][],
  currentPlayer: 0 | 1,
  timeoutMs: number = 500
): [number, number] | null {
  const rootState: MCTSState = {
    board: board.map((row) => [...row]),
    currentPlayer,
  };

  const validMoves = getValidMoves(rootState.board, currentPlayer);
  if (validMoves.length === 0) return null;
  if (validMoves.length === 1) return validMoves[0];

  const root = createNode(rootState, null, null);
  const startTime = performance.now();

  // Run iterations until timeout
  while (performance.now() - startTime < timeoutMs) {
    let node = root;

    // Phase 1: Selection
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = selectChild(node, currentPlayer);
    }

    // Phase 2: Expansion
    if (node.untriedMoves.length > 0) {
      node = expandChild(node);
    }

    // Phase 3: Simulation
    const reward = simulate(node, currentPlayer);

    // Phase 4: Backpropagation
    backpropagate(node, reward);
  }

  // Select best move (most visited child)
  let bestMove: [number, number] | null = null;
  let maxVisits = -1;

  for (const child of root.children) {
    if (child.visits > maxVisits) {
      maxVisits = child.visits;
      bestMove = child.move;
    }
  }

  return bestMove;
}
