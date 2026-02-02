import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BIOME_SCALE,
  type BiomeType,
} from "./constants";
import type { TerrainModification } from "./types";

// ============================================================================
// Noise utilities for procedural generation
// ============================================================================

/**
 * Robust sine-less hash for perfect CPU/GPU alignment
 */
function hash(x: number, seed: number): number {
  let p = x * 0.1031 + seed * 0.3117;
  p = p - Math.floor(p);
  p *= p + 33.33;
  p *= p + p;
  return p - Math.floor(p);
}

/**
 * 1D noise function with linear interpolation
 */
function noise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  // Smooth interpolation (smoothstep)
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

/**
 * Multi-octave noise (Fractal Brownian Motion)
 */
function fbm(x: number, seed: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise1D(x * frequency, seed + i * 100);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

// ============================================================================
// Biome System (for visual coloring only, NOT terrain height)
// ============================================================================

/**
 * Biome index: 0=plains, 1=mountains, 2=valley, 3=desert, 4=tundra
 * Used for visual coloring only - terrain height uses simple sine waves
 */
export function getBiomeIndex(x: number, seed: number): number {
  // Use low-frequency noise for biome zones
  const biomeNoise = fbm(x * BIOME_SCALE, seed, 2);

  // Map noise value (0-1) to biome index (0-6)
  // Re-weighted to make Tundra (Snow) more common (40% -> 30%, but thresholds adjusted)
  if (biomeNoise < 0.1) return 2; // Valley (10%)
  if (biomeNoise < 0.2) return 0; // Plains (10%)
  if (biomeNoise < 0.3) return 1; // Mountains (10%)
  if (biomeNoise < 0.4) return 3; // Desert (10%)
  if (biomeNoise < 0.5) return 5; // Swamp (10%)
  if (biomeNoise < 0.6) return 6; // Volcanic (10%)
  return 4; // Tundra (40% - now more frequent since others are smaller)
}

/**
 * Get biome type string for a position
 */
export function getBiome(x: number, seed: number): BiomeType {
  const biomes: BiomeType[] = [
    "plains",
    "mountains",
    "valley",
    "desert",
    "tundra",
    "swamp",
    "volcanic",
  ];
  return biomes[getBiomeIndex(x, seed)];
}

// ============================================================================
// Terrain Height Calculation (SIMPLE SINE WAVE - matches GPU exactly)
// ============================================================================

/**
 * Calculate base terrain height at a given X position using sine waves.
 * This MUST match the GPU shader computeBaseHeight exactly!
 */
export function calculateBaseHeight(x: number, seed: number): number {
  const width = WORLD_WIDTH;
  const height = WORLD_HEIGHT;

  // Frequencies
  const f1 = 0.001;
  const f2 = 0.005;
  const f3 = 0.02;

  // Amplitudes
  const a1 = 300; // Was 200
  const a2 = 80; // Was 50
  const a3 = 20; // Was 10

  // Noise from sine waves
  const noise =
    Math.sin((x + seed) * f1) * a1 +
    Math.sin((x + seed * 2) * f2) * a2 +
    Math.sin((x + seed * 3) * f3) * a3;

  // Mountain features
  const mountain = Math.sin((x / width) * Math.PI * 5 + seed) * -200; // Was -120

  let y = height / 1.6 + noise + mountain;

  // Clamp to ensure playable area
  y = Math.max(200, Math.min(height - 100, y));

  return y;
}

// ============================================================================
// QuadTree for spatial partitioning of terrain modifications
// ============================================================================

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ModificationEntry {
  modification: TerrainModification;
  bounds: Bounds;
  timestamp: number; // For ordering modifications
}

/**
 * QuadTree node for efficient spatial queries of terrain modifications
 */
class QuadTreeNode {
  private bounds: Bounds;
  private entries: ModificationEntry[] = [];
  private children: QuadTreeNode[] | null = null;
  private depth: number;

  private static readonly MAX_ENTRIES = 8;
  private static readonly MAX_DEPTH = 12;

  constructor(bounds: Bounds, depth: number = 0) {
    this.bounds = bounds;
    this.depth = depth;
  }

  /**
   * Insert a modification into the quadtree
   */
  insert(entry: ModificationEntry): void {
    // Check if entry intersects this node's bounds
    if (!this.intersectsBounds(entry.bounds)) {
      return;
    }

    // If we have children, insert only into intersecting children (FIX: was inserting into ALL)
    if (this.children) {
      for (const child of this.children) {
        if (child.intersectsBounds(entry.bounds)) {
          child.insert(entry);
        }
      }
      return;
    }

    // Add to this node
    this.entries.push(entry);

    // Split if we have too many entries and haven't reached max depth
    if (
      this.entries.length > QuadTreeNode.MAX_ENTRIES &&
      this.depth < QuadTreeNode.MAX_DEPTH
    ) {
      this.split();
    }
  }

  /**
   * Query all modifications that could affect a point
   */
  queryPoint(x: number, y: number): ModificationEntry[] {
    if (!this.containsPoint(x, y)) {
      return [];
    }

    const results: ModificationEntry[] = [];

    // Add entries from this node that contain the point
    for (const entry of this.entries) {
      if (this.pointInModification(x, y, entry)) {
        results.push(entry);
      }
    }

    // Query children
    if (this.children) {
      for (const child of this.children) {
        results.push(...child.queryPoint(x, y));
      }
    }

    return results;
  }

  /**
   * Query all modifications in a circular region
   */
  queryCircle(cx: number, cy: number, radius: number): ModificationEntry[] {
    const queryBounds: Bounds = {
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
    };

    if (!this.intersectsBounds(queryBounds)) {
      return [];
    }

    const results: ModificationEntry[] = [];

    for (const entry of this.entries) {
      results.push(entry);
    }

    if (this.children) {
      for (const child of this.children) {
        results.push(...child.queryCircle(cx, cy, radius));
      }
    }

    return results;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.children = null;
  }

  private split(): void {
    const { x, y, width, height } = this.bounds;
    const halfW = width / 2;
    const halfH = height / 2;

    this.children = [
      new QuadTreeNode({ x, y, width: halfW, height: halfH }, this.depth + 1),
      new QuadTreeNode(
        { x: x + halfW, y, width: halfW, height: halfH },
        this.depth + 1,
      ),
      new QuadTreeNode(
        { x, y: y + halfH, width: halfW, height: halfH },
        this.depth + 1,
      ),
      new QuadTreeNode(
        { x: x + halfW, y: y + halfH, width: halfW, height: halfH },
        this.depth + 1,
      ),
    ];

    // Re-insert entries into intersecting children only (FIX: was inserting into ALL)
    for (const entry of this.entries) {
      for (const child of this.children) {
        if (child.intersectsBounds(entry.bounds)) {
          child.insert(entry);
        }
      }
    }

    // Keep entries at this level too for large modifications that span multiple children
    // This is a design choice - we keep them here for simpler querying
  }

  private containsPoint(x: number, y: number): boolean {
    return (
      x >= this.bounds.x &&
      x < this.bounds.x + this.bounds.width &&
      y >= this.bounds.y &&
      y < this.bounds.y + this.bounds.height
    );
  }

  // Made public for child intersection checks
  intersectsBounds(other: Bounds): boolean {
    return !(
      other.x > this.bounds.x + this.bounds.width ||
      other.x + other.width < this.bounds.x ||
      other.y > this.bounds.y + this.bounds.height ||
      other.y + other.height < this.bounds.y
    );
  }

  private pointInModification(
    x: number,
    y: number,
    entry: ModificationEntry,
  ): boolean {
    const mod = entry.modification;

    if (mod.type === "carve" && mod.vx !== undefined && mod.vy !== undefined) {
      // Check if point is in tunnel (capsule shape)
      return this.pointInCapsule(
        x,
        y,
        mod.x,
        mod.y,
        mod.vx,
        mod.vy,
        mod.radius,
        mod.length || 100,
      );
    }

    // Circle check for destroy/add
    const dx = x - mod.x;
    const dy = y - mod.y;
    return dx * dx + dy * dy <= mod.radius * mod.radius;
  }

  private pointInCapsule(
    px: number,
    py: number,
    startX: number,
    startY: number,
    vx: number,
    vy: number,
    radius: number,
    length: number,
  ): boolean {
    // Normalize direction
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag === 0) return false;

    const nx = vx / mag;
    const ny = vy / mag;

    const endX = startX + nx * length;
    const endY = startY + ny * length;

    // Project point onto line segment
    const dx = endX - startX;
    const dy = endY - startY;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      // Degenerate case: start == end
      const dist2 = (px - startX) ** 2 + (py - startY) ** 2;
      return dist2 <= radius * radius;
    }

    let t = ((px - startX) * dx + (py - startY) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const closestX = startX + t * dx;
    const closestY = startY + t * dy;

    const dist2 = (px - closestX) ** 2 + (py - closestY) ** 2;
    return dist2 <= radius * radius;
  }
}

// ============================================================================
// TerrainMap - Main terrain system
// ============================================================================

/**
 * Efficient terrain map using mathematical base + quadtree modifications
 */
export class TerrainMap {
  private seed: number;
  private quadtree: QuadTreeNode;
  private modificationCounter = 0;
  private modifications: TerrainModification[] = [];

  // Bounds can be extended for infinite terrain
  private bounds: Bounds;

  // === OPTIMIZATION 5: Ring buffer cache for base height (TypedArray - ~3-6x faster than Map) ===
  private static readonly CACHE_SIZE = 4096;
  private static readonly CACHE_MASK = 4095; // CACHE_SIZE - 1
  private baseHeightCache = new Float32Array(TerrainMap.CACHE_SIZE);
  private baseHeightKeys = new Int32Array(TerrainMap.CACHE_SIZE).fill(-999999); // Invalid keys

  constructor(
    seed: number,
    width: number = WORLD_WIDTH * 2,
    height: number = WORLD_HEIGHT * 2,
  ) {
    this.seed = seed;
    this.bounds = {
      x: -width / 2,
      y: -height / 2,
      width: width * 2,
      height: height * 2,
    };
    this.quadtree = new QuadTreeNode(this.bounds);
  }

  /**
   * Get the base terrain height at X position (from mathematical function)
   * OPTIMIZED: Uses ring buffer cache (TypedArray) for O(1) lookup
   */
  getBaseHeight(x: number): number {
    const key = Math.round(x);
    const slot = key & TerrainMap.CACHE_MASK; // Fast modulo for power of 2

    // Cache hit
    if (this.baseHeightKeys[slot] === key) {
      return this.baseHeightCache[slot];
    }

    // Cache miss - compute and store
    const h = calculateBaseHeight(x, this.seed);
    this.baseHeightKeys[slot] = key;
    this.baseHeightCache[slot] = h;
    return h;
  }

  /**
   * Get the effective terrain height at X, accounting for modifications
   * Returns the Y coordinate of the topmost solid pixel
   * OPTIMIZED: Starts search from baseHeight area instead of y=0, uses binary-like search
   */
  getTerrainHeight(x: number): number {
    const baseHeight = this.getBaseHeight(x);

    // Query modifications that could affect this column
    // Check if there are any "add" modifications above baseHeight
    const columnEntries = this.quadtree.queryCircle(
      x,
      baseHeight / 2,
      baseHeight / 2 + 100,
    );

    // If no modifications, just return base height
    if (columnEntries.length === 0) {
      return baseHeight;
    }

    // Find the highest possible "add" modification
    let searchStart = baseHeight;
    for (const entry of columnEntries) {
      if (entry.modification.type === "add") {
        const topY = entry.modification.y - entry.modification.radius;
        if (topY < searchStart) {
          searchStart = topY;
        }
      }
    }

    // Search from searchStart downward with step of 4, then refine
    const searchStartClamped = Math.max(0, Math.floor(searchStart));
    for (let y = searchStartClamped; y < WORLD_HEIGHT; y += 4) {
      if (this.isSolidFast(x, y, baseHeight)) {
        // Found solid, now refine
        for (let finY = Math.max(0, y - 4); finY <= y; finY++) {
          if (this.isSolidFast(x, finY, baseHeight)) {
            return finY;
          }
        }
        return y;
      }
    }

    return baseHeight;
  }

  /**
   * Check if a point is solid terrain
   * This is the main collision detection method
   * OPTIMIZED: Pre-computes radius squared, avoids sorting when single entry
   */
  isSolid(x: number, y: number): boolean {
    // Out of valid Y range - fast path
    if (y >= WORLD_HEIGHT || y < 0) return false;

    const baseHeight = this.getBaseHeight(x);
    return this.isSolidFast(x, y, baseHeight);
  }

  /**
   * Internal optimized isSolid that accepts pre-computed baseHeight
   * Use this when you already have baseHeight calculated
   */
  private isSolidFast(x: number, y: number, baseHeight: number): boolean {
    // Out of valid Y range - fast path
    if (y >= WORLD_HEIGHT || y < 0) return false;

    // Base check: is point below terrain surface?
    let solid = y >= baseHeight;

    // Query modifications affecting this point
    const entries = this.quadtree.queryPoint(x, y);

    // Fast path: no modifications
    if (entries.length === 0) {
      return solid;
    }

    // Only sort if more than 1 entry (sorting is expensive)
    if (entries.length > 1) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Apply each modification - uses precomputed _radiusSq
    for (let i = 0; i < entries.length; i++) {
      const mod = entries[i].modification;
      const dx = x - mod.x;
      const dy = y - mod.y;
      const distSq = dx * dx + dy * dy;
      // Use precomputed radiusSq (optimization 2)
      const radiusSq = mod._radiusSq!;

      if (mod.type === "destroy") {
        if (distSq <= radiusSq) {
          solid = false;
        }
      } else if (mod.type === "add") {
        if (distSq <= radiusSq) {
          solid = true;
        }
      } else if (mod.type === "carve") {
        // Check if point is in carved tunnel (uses cached _nx, _ny)
        if (this.isInTunnel(x, y, mod)) {
          solid = false;
        }
      }
    }

    return solid;
  }

  /**
   * Add a destruction (crater) modification
   */
  destroyCircle(x: number, y: number, radius: number): void {
    const mod: TerrainModification = {
      type: "destroy",
      x,
      y,
      radius,
    };
    this.addModification(mod);
  }

  /**
   * Add terrain (builder weapon)
   */
  addCircle(x: number, y: number, radius: number): void {
    const mod: TerrainModification = {
      type: "add",
      x,
      y,
      radius,
    };
    this.addModification(mod);
  }

  /**
   * Carve a tunnel through terrain
   */
  carveTunnel(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    length: number = 100,
  ): void {
    const mod: TerrainModification = {
      type: "carve",
      x,
      y,
      radius,
      vx,
      vy,
      length,
    };
    this.addModification(mod);
  }

  /**
   * Get all modifications (for syncing)
   */
  getModifications(): TerrainModification[] {
    return [...this.modifications];
  }

  /**
   * Apply a list of modifications (for receiving synced state)
   */
  applyModifications(
    mods: TerrainModification[],
    clearFirst: boolean = true,
  ): void {
    if (clearFirst) {
      // Clear and re-apply all
      this.quadtree.clear();
      this.modifications = [];
      this.modificationCounter = 0;
      // Clear ring buffer cache by invalidating all keys
      this.baseHeightKeys.fill(-999999);
    }

    for (const mod of mods) {
      this.addModification(mod);
    }
  }

  /**
   * Reset terrain (new seed)
   */
  reset(seed: number): void {
    this.seed = seed;
    this.quadtree.clear();
    this.modifications = [];
    this.modificationCounter = 0;
    // Clear ring buffer cache by invalidating all keys
    this.baseHeightKeys.fill(-999999);
  }

  private addModification(mod: TerrainModification): void {
    // OPTIMIZATION 2: Precompute derived values once on add
    mod._radiusSq = mod.radius * mod.radius;

    if (mod.vx !== undefined && mod.vy !== undefined) {
      const mag = Math.hypot(mod.vx, mod.vy);
      if (mag > 0) {
        mod._nx = mod.vx / mag;
        mod._ny = mod.vy / mag;
      }
    }

    const bounds = this.getModificationBounds(mod);
    const entry: ModificationEntry = {
      modification: mod,
      bounds,
      timestamp: this.modificationCounter++,
    };

    this.quadtree.insert(entry);
    this.modifications.push(mod);
  }

  private getModificationBounds(mod: TerrainModification): Bounds {
    if (mod.type === "carve" && mod.vx !== undefined && mod.vy !== undefined) {
      const mag = Math.sqrt(mod.vx * mod.vx + mod.vy * mod.vy);
      if (mag > 0) {
        const nx = mod.vx / mag;
        const ny = mod.vy / mag;
        const length = mod.length || 100;
        const endX = mod.x + nx * length;
        const endY = mod.y + ny * length;

        const minX = Math.min(mod.x, endX) - mod.radius;
        const maxX = Math.max(mod.x, endX) + mod.radius;
        const minY = Math.min(mod.y, endY) - mod.radius;
        const maxY = Math.max(mod.y, endY) + mod.radius;

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
    }

    // Circle bounds
    return {
      x: mod.x - mod.radius,
      y: mod.y - mod.radius,
      width: mod.radius * 2,
      height: mod.radius * 2,
    };
  }

  // OPTIMIZED: Uses precomputed _nx, _ny, _radiusSq from addModification
  private isInTunnel(x: number, y: number, mod: TerrainModification): boolean {
    // Use precomputed normalized direction
    const nx = mod._nx;
    const ny = mod._ny;
    if (nx === undefined || ny === undefined) return false;

    const length = mod.length || 100;
    const dx = nx * length;
    const dy = ny * length;
    const len2 = length * length; // dx*dx + dy*dy = length^2 since nx,ny are normalized

    if (len2 === 0) {
      const dist2 = (x - mod.x) ** 2 + (y - mod.y) ** 2;
      return dist2 <= mod._radiusSq!;
    }

    // Project point onto line segment
    let t = ((x - mod.x) * dx + (y - mod.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const closestX = mod.x + t * dx;
    const closestY = mod.y + t * dy;

    const dist2 = (x - closestX) ** 2 + (y - closestY) ** 2;
    return dist2 <= mod._radiusSq!;
  }

  getSeed(): number {
    return this.seed;
  }
}

// ============================================================================
// TerrainRenderer - Chunk-based rendering for infinite maps
// ============================================================================

const CHUNK_SIZE = 256;
const MAX_CACHED_CHUNKS = 64; // Limit memory usage
const MAX_CHUNKS_PER_FRAME = 4;

/**
 * Chunk-based terrain renderer that only renders visible chunks on demand.
 * Supports infinite map sizes by generating/caching chunks as needed.
 */
export class TerrainRenderer {
  private chunks = new Map<string, HTMLCanvasElement>();
  private dirtyChunks = new Set<string>();
  private chunkAccessOrder: string[] = []; // LRU tracking
  // === OPTIMIZATION: Track chunks that are entirely sky (no solid) ===
  private skyChunks = new Set<string>();

  /**
   * Clear all cached chunks and metadata.
   */
  clearCache(): void {
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.chunkAccessOrder = [];
    this.skyChunks.clear();
  }

  /**
   * Check if a chunk is entirely sky (no terrain).
   * A chunk is sky-only if its bottom edge is above all terrain in that X range.
   */
  private isChunkSkyOnly(
    chunkX: number,
    chunkY: number,
    terrainMap: TerrainMap,
  ): boolean {
    const worldStartX = chunkX * CHUNK_SIZE;
    const chunkBottomY = (chunkY + 1) * CHUNK_SIZE;

    // Sample terrain heights at a few X positions in this chunk
    // If ALL sampled heights are below the chunk's bottom Y, this is a sky chunk
    const sampleStep = 32; // Check every 32 pixels for speed
    for (let localX = 0; localX <= CHUNK_SIZE; localX += sampleStep) {
      const worldX = worldStartX + localX;
      const terrainHeight = terrainMap.getBaseHeight(worldX);

      // If terrain surface is within or above this chunk, it's not sky-only
      if (terrainHeight < chunkBottomY) {
        return false;
      }
    }

    // Also check if there are any "add" modifications that could add terrain in this chunk
    const modifications = terrainMap.getModifications();
    for (const mod of modifications) {
      if (mod.type === "add") {
        // Check if the add circle could intersect this chunk
        const modTop = mod.y - mod.radius;
        const modBottom = mod.y + mod.radius;
        const modLeft = mod.x - mod.radius;
        const modRight = mod.x + mod.radius;

        const chunkLeft = worldStartX;
        const chunkRight = worldStartX + CHUNK_SIZE;
        const chunkTop = chunkY * CHUNK_SIZE;

        // If add modification overlaps this chunk area, it's not sky-only
        if (
          modRight >= chunkLeft &&
          modLeft <= chunkRight &&
          modBottom >= chunkTop &&
          modTop <= chunkBottomY
        ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Render all visible terrain chunks to the main canvas context.
   * Call this from your render loop instead of ctx.drawImage(terrainCanvas).
   * OPTIMIZED: Skips chunks that are entirely sky (no terrain to render).
   * OPTIMIZED: Limits chunk generation per frame to avoid lag during fast camera movement.
   */
  renderVisibleChunks(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    zoom: number,
    terrainMap: TerrainMap,
  ): void {
    // Disable image smoothing to prevent subpixel gaps between chunks
    // ctx.imageSmoothingEnabled = false;

    // Calculate which chunks are visible (in world coordinates)
    const worldViewW = viewW / zoom;
    const worldViewH = viewH / zoom;

    const startChunkX = Math.floor(camX / CHUNK_SIZE);
    const endChunkX = Math.ceil((camX + worldViewW) / CHUNK_SIZE);
    const startChunkY = Math.floor(camY / CHUNK_SIZE);
    const endChunkY = Math.ceil((camY + worldViewH) / CHUNK_SIZE);

    // Track chunks generated this frame
    let chunksGeneratedThisFrame = 0;

    // Calculate camera center for prioritizing nearby chunks
    const camCenterX = camX + worldViewW / 2;
    const camCenterY = camY + worldViewH / 2;

    // Collect chunks that need generation, sorted by distance to camera center
    const chunksToGenerate: {
      cx: number;
      cy: number;
      key: string;
      dist: number;
    }[] = [];

    // First pass: draw cached chunks and collect chunks needing generation
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      for (let cy = startChunkY; cy <= endChunkY; cy++) {
        const key = `${cx},${cy}`;

        // Fast path: skip known sky chunks
        if (this.skyChunks.has(key) && !this.dirtyChunks.has(key)) {
          continue;
        }

        // Check if this chunk is sky-only (and cache the result) - this is cheap
        if (!this.chunks.has(key) && !this.dirtyChunks.has(key)) {
          if (this.isChunkSkyOnly(cx, cy, terrainMap)) {
            this.skyChunks.add(key);
            continue;
          }
        }

        // If chunk needs generation, add to queue
        if (!this.chunks.has(key) || this.dirtyChunks.has(key)) {
          // Calculate distance to camera center for priority
          const chunkCenterX = (cx + 0.5) * CHUNK_SIZE;
          const chunkCenterY = (cy + 0.5) * CHUNK_SIZE;
          const dist =
            Math.abs(chunkCenterX - camCenterX) +
            Math.abs(chunkCenterY - camCenterY);
          chunksToGenerate.push({ cx, cy, key, dist });
        } else {
          // Draw existing chunk
          const chunk = this.chunks.get(key);
          if (chunk) {
            const drawX = cx * CHUNK_SIZE - 0.5;
            const drawY = cy * CHUNK_SIZE - 0.5;
            ctx.drawImage(chunk, drawX, drawY, CHUNK_SIZE + 1, CHUNK_SIZE + 1);
            this.updateLRU(key);
          }
        }
      }
    }

    // Sort chunks to generate by distance (closest first)
    chunksToGenerate.sort((a, b) => a.dist - b.dist);

    // Second pass: generate and draw chunks with rate limiting
    for (const { cx, cy, key } of chunksToGenerate) {
      // Stop generating if we've hit the limit
      if (chunksGeneratedThisFrame >= MAX_CHUNKS_PER_FRAME) {
        // Still draw placeholder or skip - chunk will be generated next frame
        break;
      }

      // Re-check sky status on dirty chunks
      if (this.dirtyChunks.has(key)) {
        this.skyChunks.delete(key);
        if (this.isChunkSkyOnly(cx, cy, terrainMap)) {
          this.skyChunks.add(key);
          this.dirtyChunks.delete(key);
          this.chunks.delete(key);
          continue;
        }
      }

      this.generateChunk(cx, cy, terrainMap);
      this.dirtyChunks.delete(key);
      chunksGeneratedThisFrame++;

      // Draw the newly generated chunk
      const chunk = this.chunks.get(key);
      if (chunk) {
        const drawX = cx * CHUNK_SIZE - 0.5;
        const drawY = cy * CHUNK_SIZE - 0.5;
        ctx.drawImage(chunk, drawX, drawY, CHUNK_SIZE + 1, CHUNK_SIZE + 1);
        this.updateLRU(key);
      }
    }
    // Re-enable image smoothing for other rendering
    // ctx.imageSmoothingEnabled = true;

    // Cleanup old chunks if over limit
    this.pruneChunks();
  }

  /**
   * Mark chunks affected by a modification as dirty.
   * Call this after terrain destruction/addition.
   */
  invalidateArea(worldX: number, worldY: number, radius: number): void {
    const minChunkX = Math.floor((worldX - radius) / CHUNK_SIZE);
    const maxChunkX = Math.ceil((worldX + radius) / CHUNK_SIZE);
    const minChunkY = Math.floor((worldY - radius) / CHUNK_SIZE);
    const maxChunkY = Math.ceil((worldY + radius) / CHUNK_SIZE);

    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cy = minChunkY; cy <= maxChunkY; cy++) {
        this.dirtyChunks.add(`${cx},${cy}`);
      }
    }
  }

  /**
   * Invalidate a tunnel area
   */
  invalidateTunnel(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    length: number,
  ): void {
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag === 0) {
      this.invalidateArea(x, y, radius);
      return;
    }

    const nx = vx / mag;
    const ny = vy / mag;
    const endX = x + nx * length;
    const endY = y + ny * length;

    const minX = Math.min(x, endX) - radius;
    const maxX = Math.max(x, endX) + radius;
    const minY = Math.min(y, endY) - radius;
    const maxY = Math.max(y, endY) + radius;

    const minChunkX = Math.floor(minX / CHUNK_SIZE);
    const maxChunkX = Math.ceil(maxX / CHUNK_SIZE);
    const minChunkY = Math.floor(minY / CHUNK_SIZE);
    const maxChunkY = Math.ceil(maxY / CHUNK_SIZE);

    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cy = minChunkY; cy <= maxChunkY; cy++) {
        this.dirtyChunks.add(`${cx},${cy}`);
      }
    }
  }

  /**
   * Clear all cached chunks (call on game reset)
   */
  clear(): void {
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.chunkAccessOrder = [];
    this.skyChunks.clear(); // Clear sky chunk cache
  }

  private generateChunk(
    chunkX: number,
    chunkY: number,
    terrainMap: TerrainMap,
  ): void {
    const key = `${chunkX},${chunkY}`;

    // Create or reuse canvas
    let canvas = this.chunks.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = CHUNK_SIZE;
      canvas.height = CHUNK_SIZE;
      this.chunks.set(key, canvas);
    }

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);

    const worldStartX = chunkX * CHUNK_SIZE;
    const worldStartY = chunkY * CHUNK_SIZE;

    // Precompute all heights into TypedArray for better cache locality
    const heights = new Float32Array(CHUNK_SIZE + 1);
    for (let i = 0; i <= CHUNK_SIZE; i++) {
      heights[i] = terrainMap.getBaseHeight(worldStartX + i);
    }

    // Sample biome at chunk center for coloring
    const centerX = worldStartX + CHUNK_SIZE / 2;
    const biomeIdx = getBiomeIndex(centerX, terrainMap.getSeed());

    // Biome color palettes
    const biomeColors = {
      // [topColor, bottomColor, grassColor, grassHighlight]
      0: ["#475569", "#0f172a", "#22c55e", "#86efac"], // Plains - green
      1: ["#737373", "#262626", "#a3a3a3", "#e5e5e5"], // Mountains - gray/snow
      2: ["#2e4f36", "#1a2e22", "#166534", "#4ade80"], // Valley - dark green
      3: ["#d4a574", "#8b4513", "#d4a574", "#f4d08a"], // Desert - sand
      4: ["#d1d5db", "#5b6e80", "#e5e7eb", "#f9fafb"], // Tundra - ice white
    };

    const colors =
      biomeColors[biomeIdx as keyof typeof biomeColors] || biomeColors[0];

    // Draw terrain for this chunk
    ctx.beginPath();

    // Build terrain path for this chunk using precomputed heights
    let pathStarted = false;
    for (let localX = 0; localX <= CHUNK_SIZE; localX++) {
      const baseHeight = heights[localX];

      // Clip baseHeight to chunk bounds
      const localBaseY = baseHeight - worldStartY;

      if (localBaseY <= CHUNK_SIZE) {
        if (!pathStarted) {
          ctx.moveTo(localX, Math.max(0, localBaseY));
          pathStarted = true;
        } else {
          ctx.lineTo(localX, Math.max(0, localBaseY));
        }
      }
    }

    // Complete the path to fill the ground
    ctx.lineTo(CHUNK_SIZE, CHUNK_SIZE);
    ctx.lineTo(0, CHUNK_SIZE);
    ctx.closePath();

    // Fill with gradient based on WORLD Y coordinates (biome-aware colors)
    const gradStartY = -worldStartY;
    const gradEndY = WORLD_HEIGHT - worldStartY;
    const grad = ctx.createLinearGradient(0, gradStartY, 0, gradEndY);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctx.fill();

    // Add texture
    ctx.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 15; i++) {
      const size = Math.random() * 4 + 1;
      const tx = Math.random() * CHUNK_SIZE;
      const ty = Math.random() * CHUNK_SIZE;
      ctx.fillStyle =
        Math.random() > 0.5 ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.arc(tx, ty, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw surface layer using precomputed heights (biome-aware colors)
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    for (let localX = 0; localX <= CHUNK_SIZE; localX++) {
      const localSurfaceY = heights[localX] - worldStartY;

      if (localX === 0) ctx.moveTo(localX, localSurfaceY);
      else ctx.lineTo(localX, localSurfaceY);
    }
    ctx.strokeStyle = colors[2];
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.strokeStyle = colors[3];
    ctx.lineWidth = 4;
    ctx.stroke();

    // Apply terrain modifications (destroy/add/carve)
    this.applyModifications(ctx, worldStartX, worldStartY, terrainMap);
  }

  private applyModifications(
    ctx: CanvasRenderingContext2D,
    worldStartX: number,
    worldStartY: number,
    terrainMap: TerrainMap,
  ): void {
    const modifications = terrainMap.getModifications();

    for (const mod of modifications) {
      const localX = mod.x - worldStartX;
      const localY = mod.y - worldStartY;

      // Check if modification affects this chunk (with margin for radius)
      const margin = mod.radius + 20;
      if (
        localX < -margin ||
        localX > CHUNK_SIZE + margin ||
        localY < -margin ||
        localY > CHUNK_SIZE + margin
      ) {
        // For carve, check the tunnel bounds
        if (
          mod.type === "carve" &&
          mod.vx !== undefined &&
          mod.vy !== undefined
        ) {
          const mag = Math.sqrt(mod.vx * mod.vx + mod.vy * mod.vy);
          if (mag > 0) {
            const nx = mod.vx / mag;
            const ny = mod.vy / mag;
            const length = mod.length || 100;
            const endLocalX = localX + nx * length;
            const endLocalY = localY + ny * length;

            const minLX = Math.min(localX, endLocalX) - mod.radius;
            const maxLX = Math.max(localX, endLocalX) + mod.radius;
            const minLY = Math.min(localY, endLocalY) - mod.radius;
            const maxLY = Math.max(localY, endLocalY) + mod.radius;

            if (
              maxLX < 0 ||
              minLX > CHUNK_SIZE ||
              maxLY < 0 ||
              minLY > CHUNK_SIZE
            ) {
              continue; // Tunnel doesn't affect this chunk
            }
          }
        } else {
          continue; // Circle doesn't affect this chunk
        }
      }

      if (mod.type === "destroy") {
        // Crater with irregular edge
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        for (let i = 0; i < Math.PI * 2; i += 0.2) {
          const r = mod.radius * (0.9 + Math.random() * 0.2);
          const cx = localX + Math.cos(i) * r;
          const cy = localY + Math.sin(i) * r;
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.restore();

        // Scorch marks
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.beginPath();
        ctx.arc(localX, localY, mod.radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fill();
        ctx.restore();
      } else if (mod.type === "add") {
        // Builder terrain
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.beginPath();
        ctx.arc(localX, localY, mod.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#64748b";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#94a3b8";
        ctx.stroke();
        ctx.restore();
      } else if (
        mod.type === "carve" &&
        mod.vx !== undefined &&
        mod.vy !== undefined
      ) {
        // Tunnel
        const mag = Math.sqrt(mod.vx * mod.vx + mod.vy * mod.vy);
        if (mag === 0) continue;

        const nx = mod.vx / mag;
        const ny = mod.vy / mag;
        const length = mod.length || 100;

        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = mod.radius * 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(localX, localY);
        ctx.lineTo(localX + nx * length, localY + ny * length);
        ctx.stroke();
        ctx.restore();

        // Scorch on tunnel edges
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.lineWidth = mod.radius * 2 + 10;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.moveTo(localX, localY);
        ctx.lineTo(localX + nx * length, localY + ny * length);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private updateLRU(key: string): void {
    const idx = this.chunkAccessOrder.indexOf(key);
    if (idx >= 0) {
      this.chunkAccessOrder.splice(idx, 1);
    }
    this.chunkAccessOrder.push(key);
  }

  private pruneChunks(): void {
    while (
      this.chunks.size > MAX_CACHED_CHUNKS &&
      this.chunkAccessOrder.length > 0
    ) {
      const oldestKey = this.chunkAccessOrder.shift()!;
      this.chunks.delete(oldestKey);
      console.log("Pruned chunk", oldestKey);
    }
  }
}
