import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BIOME_SCALE,
  SNOW_THRESHOLD_HEIGHT,
  BIOME_BLEND_WIDTH,
  DAY_NIGHT_CYCLE_DURATION,
} from "./constants";
import { TerrainMod, TerrainModType, type TerrainModification } from "./types";

// ============================================================================
// GPU Shader-based Terrain Renderer using WebGL2
// ============================================================================

const VERTEX_SHADER = /*glsl*/ `#version 300 es
precision highp float;

// Fullscreen quad vertices (2 triangles)
const vec2 positions[6] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2( 1.0,  1.0),
  vec2(-1.0, -1.0),
  vec2( 1.0,  1.0),
  vec2(-1.0,  1.0)
);

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /*glsl*/ `#version 300 es
precision highp float;

uniform float u_seed;
uniform vec2 u_cameraPos;
uniform vec2 u_viewSize;
uniform float u_zoom;
uniform vec2 u_worldSize;
uniform sampler2D u_modTexture;
uniform int u_modCount;
uniform float u_time;
uniform sampler2D u_biomeTexture;

out vec4 fragColor;

// === Biome constants (must match CPU) ===
const float BIOME_SCALE = ${BIOME_SCALE.toFixed(10)};
const float SNOW_THRESHOLD = ${SNOW_THRESHOLD_HEIGHT.toFixed(1)};

// Biome indices: 0=plains, 1=mountains, 2=valley, 3=desert, 4=tundra

// === Noise functions ===
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash1D(float x, float seed) {
  float p = x * 0.1031 + seed * 0.3117;
  p = fract(p);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float noise1D(float x, float seed) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return hash1D(i, seed) * (1.0 - u) + hash1D(i + 1.0, seed) * u;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

float fbm1D(float x, float seed, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < octaves; i++) {
    value += amplitude * noise1D(x * frequency, seed + float(i) * 100.0);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

// === Biome detection (OPTIMIZED: Uses pre-calculated texture) ===
int getBiomeIndex(float x) {
  int chunkIdx = int(floor(x / 256.0));
  // Limit to available chunks in texture (e.g. 1024)
  chunkIdx = clamp(chunkIdx, 0, 1023);
  float biomeNoise = texelFetch(u_biomeTexture, ivec2(chunkIdx, 0), 0).r;

  if (biomeNoise < 0.1) return 2; // Valley
  if (biomeNoise < 0.2) return 0; // Plains
  if (biomeNoise < 0.3) return 1; // Mountains
  if (biomeNoise < 0.4) return 3; // Desert
  if (biomeNoise < 0.5) return 5; // Swamp
  if (biomeNoise < 0.6) return 6; // Volcanic
  return 4; // Tundra
}

// === Simple terrain height (MUST MATCH CPU exactly!) ===
float computeBaseHeight(float x) {
  // Frequencies
  float f1 = 0.001;
  float f2 = 0.005;
  float f3 = 0.02;

  // Amplitudes
  float a1 = 300.0;
  float a2 = 80.0;
  float a3 = 20.0;

  // Noise from sine waves
  float terrainNoise =
    sin((x + u_seed) * f1) * a1 +
    sin((x + u_seed * 2.0) * f2) * a2 +
    sin((x + u_seed * 3.0) * f3) * a3;

  // Mountain features
  float mountain = sin((x / u_worldSize.x) * 3.14159265 * 5.0 + u_seed) * -200.0;

  float y = u_worldSize.y / 1.6 + terrainNoise + mountain;

  // Clamp to ensure playable area
  return clamp(y, 200.0, u_worldSize.y - 100.0);
}

// === Modification Noise (for organic edges) ===
float getModificationRadius(float modX, float modY, float modRadius, float px, float py) {
  float dx = px - modX;
  float dy = py - modY;
  float angle = atan(dy, dx);
  vec2 noisePos = vec2(modX + modY * 0.37, angle * 3.0 + modRadius * 0.1);
  float edgeNoise = fbm(noisePos * 0.5) * 0.3 + 0.85;
  float detailNoise = noise(vec2(angle * 8.0 + modX, modY * 0.1)) * 0.15;
  return modRadius * (edgeNoise + detailNoise);
}

// === Tunnel check ===
bool isInTunnel(float px, float py, float sx, float sy, float nx, float ny, float radius, float tLen) {
  float dx = nx * tLen;
  float dy = ny * tLen;
  float len2 = tLen * tLen;

  if (len2 == 0.0) {
    float d = length(vec2(px - sx, py - sy));
    return d <= getModificationRadius(sx, sy, radius, px, py);
  }

  float t = clamp(((px - sx) * dx + (py - sy) * dy) / len2, 0.0, 1.0);
  float closestX = sx + t * dx;
  float closestY = sy + t * dy;

  // For the segment ends (caps), use the end points for noise to avoid stretching
  // For the middle of the tunnel, use the start point for consistent noise seed
  float d = length(vec2(px - closestX, py - closestY));
  return d <= getModificationRadius(sx, sy, radius, px, py);
}

// === Crater check ===
bool isInCrater(float worldX, float worldY, float modX, float modY, float modRadius, out float edgeDist) {
  float dx = worldX - modX;
  float dy = worldY - modY;
  float distSq = dx * dx + dy * dy;

  // Fast path for central solid area
  if (distSq < modRadius * modRadius * 0.49) {
    edgeDist = sqrt(distSq) - modRadius;
    return true;
  }

  float dist = sqrt(distSq);
  float irregularRadius = getModificationRadius(modX, modY, modRadius, worldX, worldY);
  edgeDist = dist - irregularRadius;
  return dist <= irregularRadius;
}

// === Star field ===
float star(vec2 uv, float layer) {
  vec2 id = floor(uv);
  vec2 gridUV = fract(uv);
  float starLight = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      vec2 starPos = neighbor + vec2(hash(cellId + layer * 17.0), hash(cellId + layer * 31.0 + 50.0)) * 0.8 + 0.1;
      float starPresent = step(0.92, hash(cellId + layer * 47.0));
      if (starPresent < 0.5) continue;
      float d = length(gridUV - starPos);
      // Increased size to match CPU (0.5 to 2.5px)
      // UV is screenPos/40.0, so 0.02 is 0.8px, 0.06 is 2.4px
      float size = hash(cellId + layer * 63.0) * 0.04 + 0.012;
      float glow = exp(-d * d / (size * size * 2.0));
      float brightness = hash(cellId + layer * 79.0) * 0.7 + 0.3;
      starLight += glow * brightness;
    }
  }
  return clamp(starLight, 0.0, 1.0);
}

// === Procedural Clouds ===
float cloudNoise(vec2 uv) {
  float n = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    n += amplitude * noise(uv * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return n;
}

vec4 getCloud(vec2 uv, float layer) {
  // Cloud shape using layered noise
  float cloudShape = cloudNoise(uv * 0.15 + layer * 50.0);
  cloudShape += cloudNoise(uv * 0.4 + layer * 30.0) * 0.4;
  cloudShape += cloudNoise(uv * 0.8 + layer * 10.0) * 0.2;

  // Higher threshold = fewer, more distinct clouds
  float cloudDensity = smoothstep(0.55, 0.75, cloudShape);

  // Only render where there's actually a cloud (sparse)
  if (cloudDensity < 0.01) {
    return vec4(0.0);
  }

  // Cloud brightness variation
  float brightness = 0.85 + cloudNoise(uv * 2.0 + layer * 5.0) * 0.15;

  // Fluffy edges for defined cloud shapes
  float edge = smoothstep(0.5, 0.7, cloudShape);
  float alpha = cloudDensity * edge * 0.7;

  vec3 cloudColor = vec3(brightness);
  return vec4(cloudColor, alpha);
}

// === Weather Particles (snow, sand) ===
float weatherParticle(vec2 worldPos, float particleSize, float fallSpeed, float drift) {
  vec2 uv = worldPos / particleSize;
  vec2 cellId = floor(uv);
  vec2 cellUV = fract(uv);

  float particles = 0.0;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 neighbor = vec2(float(dx), float(dy));
      vec2 id = cellId + neighbor;

      // Random offset within cell
      float randX = hash1D(id.x * 0.1, id.y * 0.2);
      float randY = hash1D(id.y * 0.3, id.x * 0.4);
      float randPresent = hash1D(id.x, id.y + 200.0);

      // Reduced density from 0.25 to 0.15
      if (randPresent < 0.15) {
        vec2 particlePos = neighbor + vec2(randX * 0.8 + 0.1, randY * 0.8 + 0.1);

        // Time-based motion with CPU-side modulo for precision
        // Corrected for World Y-down system: + u_time moves it down
        float timeScale = u_time * 0.0006;
        float progress = fract(randY * 10.0 + timeScale * fallSpeed * 10.0);
        particlePos.y += progress;
        particlePos.x += sin(u_time * 0.0005 * drift * 5.0 + randX * 6.28) * 0.4;

        // Vertical fade to avoid "jumping" or "jitter" at cell boundaries
        float verticalFade = smoothstep(0.0, 0.2, progress) * smoothstep(1.0, 0.7, progress);

        float d = length(cellUV - particlePos);
        float size = 0.04 + randX * 0.08;
        particles += smoothstep(size, size * 0.5, d) * verticalFade;
      }
    }
  }

  return clamp(particles, 0.0, 1.0);
}

// === Rain Particles (thin streaks) ===
float rainParticle(vec2 worldPos) {
  // Elongated grid for streaks
  vec2 uv = worldPos / vec2(8.0, 80.0);
  vec2 cellId = floor(uv);
  vec2 cellUV = fract(uv);

  float rain = 0.0;
  for (int dy = -1; dy <= 0; dy++) {
    vec2 id = cellId + vec2(0.0, float(dy));
    float randX = hash1D(id.x, id.y + 500.0);
    float randY = hash1D(id.y, id.x + 600.0);

    if (randX < 0.2) {
      float timeScale = u_time * 0.005;
      // Corrected for World Y-down system: + u_time moves it down
      float progress = fract(randY + timeScale * (1.2 + randX));

      float xOffset = randX * 5.0; // Random horizontal placement in cell
      float dX = abs(cellUV.x - xOffset);
      float dY = abs(cellUV.y - (float(dy) + progress));

      // Thin vertical streak
      if (dX < 0.1 && dY < 0.4) {
        rain += (1.0 - dY * 2.5) * (1.0 - dX * 10.0);
      }
    }
  }
  return clamp(rain, 0.0, 1.0);
}

// === Point Light Calculation ===
#define MAX_LIGHTS 10 // Define max number of lights
uniform vec2 u_lightPos[MAX_LIGHTS];
uniform vec3 u_lightColor[MAX_LIGHTS];
uniform float u_lightRadius[MAX_LIGHTS];
uniform int u_lightCount;

vec3 calculateLighting(vec2 worldPos, vec3 baseColor) {
  vec3 totalLight = vec3(0.0);
  for (int i = 0; i < u_lightCount; i++) {
    float dx = worldPos.x - u_lightPos[i].x;
    float dy = worldPos.y - u_lightPos[i].y;
    float distSq = dx*dx + dy*dy;
    float radius = u_lightRadius[i];
    float radiusSq = radius * radius;

    if (distSq < radiusSq) {
      // Linear falloff using sqrt only when inside radius
      float dist = sqrt(distSq);
      float atten = 1.0 - dist / radius;
      // Square the attenuation for a more natural falloff
      totalLight += u_lightColor[i] * (atten * atten);
    }
  }

  // Apply light to the base color (additive for a "glow" feel)
  return baseColor + totalLight * 0.8;
}

// === Biome color palettes ===
vec3 getPlainsColor(float depth, float yRel, float baseH) {
  vec3 dirtColor = vec3(0.278, 0.333, 0.412);
  vec3 deepColor = vec3(0.059, 0.090, 0.165);
  vec3 grassColor = vec3(0.133, 0.773, 0.369);
  vec3 grassLight = vec3(0.525, 0.937, 0.675);

  vec3 color = mix(dirtColor, deepColor, yRel);
  if (depth >= 0.0 && depth < 15.0) {
    color = depth < 4.0 ? grassLight : grassColor;
  }
  return color;
}

vec3 getMountainsColor(float depth, float yRel, float baseH) {
  vec3 rockDark = vec3(0.25, 0.25, 0.28);
  vec3 rockLight = vec3(0.45, 0.45, 0.5);
  vec3 snowColor = vec3(0.95, 0.97, 1.0);
  vec3 snowShadow = vec3(0.75, 0.82, 0.9);

  vec3 color = mix(rockLight, rockDark, yRel);

  // Snow on high peaks
  if (baseH < SNOW_THRESHOLD) {
    float snowBlend = smoothstep(SNOW_THRESHOLD, SNOW_THRESHOLD - 50.0, baseH);
    vec3 snow = depth < 5.0 ? snowColor : snowShadow;
    color = mix(color, snow, snowBlend);
  }
  return color;
}

vec3 getValleyColor(float depth, float yRel, float baseH) {
  vec3 grassDark = vec3(0.08, 0.45, 0.22);
  vec3 grassLight = vec3(0.15, 0.65, 0.35);
  vec3 dirtColor = vec3(0.35, 0.25, 0.18);

  vec3 color = mix(grassLight, dirtColor, yRel);
  if (depth >= 0.0 && depth < 12.0) {
    color = depth < 3.0 ? grassLight : grassDark;
  }
  return color;
}

vec3 getDesertColor(float depth, float yRel, float baseH) {
  vec3 sandLight = vec3(0.93, 0.85, 0.65);
  vec3 sandDark = vec3(0.75, 0.60, 0.40);
  vec3 rockColor = vec3(0.55, 0.45, 0.35);

  vec3 color = mix(sandLight, rockColor, yRel);
  if (depth >= 0.0 && depth < 8.0) {
    color = depth < 3.0 ? sandLight : sandDark;
  }
  return color;
}

vec3 getTundraColor(float depth, float yRel, float baseH) {
  vec3 snowWhite = vec3(0.92, 0.95, 0.98);
  vec3 iceBluePale = vec3(0.80, 0.88, 0.95);
  vec3 iceBlue = vec3(0.55, 0.70, 0.85);
  vec3 frozenGround = vec3(0.45, 0.50, 0.55);

  vec3 color = mix(iceBluePale, frozenGround, yRel);
  if (depth >= 0.0 && depth < 10.0) {
    color = depth < 3.0 ? snowWhite : iceBlue;
  }
  return color;
}

vec3 getSwampColor(float worldX, float depth, float yRel, float baseH) {
  vec3 muckColor = vec3(0.15, 0.18, 0.12);
  vec3 waterColor = vec3(0.1, 0.25, 0.15);
  vec3 mossColor = vec3(0.2, 0.4, 0.1);
  vec3 grassColor = vec3(0.1, 0.3, 0.05);

  vec3 color = mix(muckColor, vec3(0.05, 0.08, 0.05), yRel);
  if (depth >= 0.0 && depth < 15.0) {
    color = depth < 4.0 ? mossColor : grassColor;
    if (noise(vec2(worldX * 0.1, (baseH + depth) * 0.5)) > 0.6) color = waterColor;
  }
  return color;
}

vec3 getVolcanicColor(float worldX, float depth, float yRel, float baseH) {
  vec3 basaltColor = vec3(0.12, 0.12, 0.15);
  vec3 ashColor = vec3(0.25, 0.25, 0.28);
  vec3 lavaGlow = vec3(0.8, 0.2, 0.0);

  vec3 color = mix(basaltColor, vec3(0.05, 0.05, 0.08), yRel);
  if (depth >= 0.0 && depth < 10.0) {
    float lavaNoise = noise(vec2(worldX * 0.05, (baseH + depth) * 0.1 + u_time * 0.001));
    color = depth < 3.0 ? ashColor : basaltColor;
    if (lavaNoise > 0.8) color = mix(color, lavaGlow, (lavaNoise - 0.8) * 5.0);
  }
  return color;
}

// === Terrain Decorations (Trees, Rocks) ===
vec4 getDecorationColor(float worldX, float worldY, float baseH, int biomeIdx) {
  float dy_ground = worldY - baseH;

  // Grid-based Large Decorations
  float decoGrid = 200.0;
  float cellId = floor(worldX / decoGrid);
  float cellRand = hash1D(cellId, u_seed * 1.5);

  if (cellRand > 0.4) {
    float decoX = (cellId + 0.3 + cellRand * 0.4) * decoGrid;
    float decoH = computeBaseHeight(decoX);
    float dx = worldX - decoX;
    float dy = worldY - decoH;

    // Trees (Plains/Valley/Tundra)
    if (biomeIdx == 0 || biomeIdx == 2 || biomeIdx == 4) {
      float trunkW = 4.0;
      float trunkH = 40.0 + cellRand * 30.0;
      if (biomeIdx == 4) trunkH *= 1.5; // Increased from 0.7 to 1.5

      // Trunk
      if (abs(dx) < trunkW && dy < 0.0 && dy > -trunkH) {
        return vec4(0.25, 0.15, 0.08, 1.0);
      }

      // Foliage
      float leafY = dy + trunkH * 0.9;
      if (biomeIdx == 4) { // Pine shape for Tundra
        float pineW = (dy + trunkH) * 0.5; // Increased width factor to 0.5
        if (abs(dx) < pineW && dy < 0.0 && dy > -trunkH * 1.1) {
          float noiseVal = noise(vec2(worldX * 0.2, worldY * 0.2));
          vec3 leafColor = mix(vec3(0.1, 0.2, 0.15), vec3(0.8, 0.85, 0.9), step(0.6, noiseVal));
          return vec4(leafColor, 1.0);
        }
      } else { // Fluffy trees for Plains/Valley
        float dLeaf = length(vec2(dx, leafY));
        float leafRadius = 30.0 + cellRand * 20.0;
        float leafNoise = noise(vec2(worldX * 0.08, worldY * 0.08 + cellId)) * 12.0;
        if (dLeaf < leafRadius + leafNoise) {
          vec3 leafBase = (biomeIdx == 2) ? vec3(0.05, 0.3, 0.1) : vec3(0.15, 0.5, 0.1);
          vec3 leafTop = leafBase + 0.2;
          vec3 leafColor = mix(leafBase, leafTop, clamp(-dy/trunkH, 0.0, 1.0));
          return vec4(leafColor, 1.0);
        }
      }
    }
    // Swamp Trees
    else if (biomeIdx == 5) {
      float trunkW = 6.0;
      float trunkH = 50.0 + cellRand * 40.0;
      if (abs(dx) < trunkW && dy < 0.0 && dy > -trunkH) {
        return vec4(0.18, 0.12, 0.05, 1.0); // Darker trunk
      }
      // Drooping foliage
      float leafY = dy + trunkH * 0.8;
      float dLeaf = length(vec2(dx * 0.7, leafY));
      float leafRadius = 40.0 + cellRand * 25.0;
      if (dLeaf < leafRadius) {
        float noiseVal = noise(vec2(worldX * 0.1, worldY * 0.1));
        vec3 leafColor = mix(vec3(0.05, 0.15, 0.05), vec3(0.1, 0.25, 0.1), noiseVal);
        return vec4(leafColor, 1.0);
      }
    }
    // Volcanic Pillars/Rocks
    else if (biomeIdx == 6) {
      float pillarW = 15.0 + cellRand * 20.0;
      float pillarH = 30.0 + cellRand * 60.0;
      // Sharp, jagged shapes
      float jagged = noise(vec2(worldX * 0.2, worldY * 0.1)) * 10.0;
      if (abs(dx) < (pillarW - dy * 0.2) + jagged && dy < 0.0 && dy > -pillarH) {
        float glow = step(0.8, noise(vec2(worldX * 0.1, worldY * 0.1 + u_time * 0.002)));
        vec3 color = mix(vec3(0.1, 0.1, 0.12), vec3(0.6, 0.2, 0.0), glow * 0.5);
        return vec4(color, 1.0);
      }
    }
    // Smooth Boulders (Mountains/Desert)
    else {
      // Use elliptical shape and low-frequency noise for smoothness
      float rockSize = 25.0 + cellRand * 25.0;
      vec2 stretch = vec2(1.2 + cellRand * 0.4, 0.8 + cellRand * 0.2); // Elliptical distortion

      // Sink rock into the ground by a random amount (0.2 to 0.7 of its size)
      float sinkDepth = rockSize * (0.2 + cellRand * 0.5);
      vec2 rockUV = vec2(dx / stretch.x, (dy + sinkDepth) / stretch.y);
      float dRock = length(rockUV);

      // Smooth, low-frequency noise instead of jagged detail
      float rockNoise = noise(vec2(worldX * 0.05, worldY * 0.05 + cellId)) * (rockSize * 0.3);
      rockNoise += noise(vec2(worldX * 0.1, worldY * 0.1)) * (rockSize * 0.1);

      if (dRock < rockSize + rockNoise) {
        vec3 rockBase = (biomeIdx == 3) ? vec3(0.7, 0.55, 0.35) : vec3(0.4, 0.4, 0.45);
        vec3 rockHighlight = rockBase + 0.15;
        // Smooth shading
        float shading = dot(normalize(rockUV), normalize(vec2(-1.0, -1.0)));
        vec3 rockColor = mix(rockBase, rockHighlight, shading * 0.4 + 0.6);
        return vec4(rockColor, 1.0);
      }
    }
  }

  // Small Surface Details (Grass/Pebbles) - only rendered if solid is true in main
  return vec4(0.0);
}

// Get biome color with smooth blending at boundaries
vec3 getBiomeColorBlended(float worldX, float depth, float yRel, float baseH) {
  // BIOME_SCALE is very small, so we use a reasonable transition width
  float blendWidth = ${BIOME_BLEND_WIDTH.toFixed(1)};

  // Find current and neighbor biomes for blending
  int currentBiome = getBiomeIndex(worldX);

  float chunkX = floor(worldX / 256.0) * 256.0 + 128.0;
  float nextChunkX = chunkX + 256.0;
  float prevChunkX = chunkX - 256.0;

  int nextBiome = getBiomeIndex(nextChunkX);
  int prevBiome = getBiomeIndex(prevChunkX);

  vec3 color;
  if (currentBiome == 0) color = getPlainsColor(depth, yRel, baseH);
  else if (currentBiome == 1) color = getMountainsColor(depth, yRel, baseH);
  else if (currentBiome == 2) color = getValleyColor(depth, yRel, baseH);
  else if (currentBiome == 3) color = getDesertColor(depth, yRel, baseH);
  else if (currentBiome == 4) color = getTundraColor(depth, yRel, baseH);
  else if (currentBiome == 5) color = getSwampColor(worldX, depth, yRel, baseH);
  else color = getVolcanicColor(worldX, depth, yRel, baseH);

  // Smoothly blend with neighbors
  float distToNext = nextChunkX - 128.0 - worldX;
  float distToPrev = worldX - (prevChunkX + 128.0);

  if (distToNext < 128.0 && nextBiome != currentBiome) {
    float t = smoothstep(128.0, 0.0, distToNext);
    vec3 nextColor;
    if (nextBiome == 0) nextColor = getPlainsColor(depth, yRel, baseH);
    else if (nextBiome == 1) nextColor = getMountainsColor(depth, yRel, baseH);
    else if (nextBiome == 2) nextColor = getValleyColor(depth, yRel, baseH);
    else if (nextBiome == 3) nextColor = getDesertColor(depth, yRel, baseH);
    else if (nextBiome == 4) nextColor = getTundraColor(depth, yRel, baseH);
    else if (nextBiome == 5) nextColor = getSwampColor(worldX, depth, yRel, baseH);
    else nextColor = getVolcanicColor(worldX, depth, yRel, baseH);
    color = mix(color, nextColor, t * 0.5);
  }

  if (distToPrev < 128.0 && prevBiome != currentBiome) {
    float t = smoothstep(128.0, 0.0, distToPrev);
    vec3 prevColor;
    if (prevBiome == 0) prevColor = getPlainsColor(depth, yRel, baseH);
    else if (prevBiome == 1) prevColor = getMountainsColor(depth, yRel, baseH);
    else if (prevBiome == 2) prevColor = getValleyColor(depth, yRel, baseH);
    else if (prevBiome == 3) prevColor = getDesertColor(depth, yRel, baseH);
    else if (prevBiome == 4) prevColor = getTundraColor(depth, yRel, baseH);
    else if (prevBiome == 5) prevColor = getSwampColor(worldX, depth, yRel, baseH);
    else prevColor = getVolcanicColor(worldX, depth, yRel, baseH);
    color = mix(color, prevColor, t * 0.5);
  }

  return color;
}

void main() {
  vec2 screenPos = gl_FragCoord.xy;
  float worldX = u_cameraPos.x + screenPos.x / u_zoom;
  float worldY = u_cameraPos.y + (u_viewSize.y - screenPos.y) / u_zoom;

  float baseH = computeBaseHeight(worldX);
  bool solid = worldY >= baseH;
  int biomeIdx = getBiomeIndex(worldX);

  float nearestCraterDistSq = 1000000.0;
  float nearestCraterRadius = 0.0;

  // Track terrain modification masking
  bool masked = false;

  // Apply modifications
  for (int i = 0; i < u_modCount; i++) {
    vec4 data0 = texelFetch(u_modTexture, ivec2(i, 0), 0);
    float modType = data0.r;
    float modX = data0.g;
    float modY = data0.b;
    float modRadius = data0.a;

    float dx = worldX - modX;
    float dy = worldY - modY;
    float distSq = dx * dx + dy * dy;

    // Early exit for distant modifications (including scorch mark margin)
    float activeRadius = modRadius * 1.5;
    if (modType > 1.5) { // CARVE
      vec4 data1 = texelFetch(u_modTexture, ivec2(i, 1), 0);
      activeRadius = (data1.b + modRadius) * 1.5;
    }

    if (distSq > activeRadius * activeRadius) {
      // Still update nearest crater for scorch marks if applicable
      if (modType < 0.5 || modType > 1.5) {
        if (distSq < nearestCraterDistSq) {
          nearestCraterDistSq = distSq;
          nearestCraterRadius = modRadius;
        }
      }
      continue;
    }

    if (modType < 0.5) { // Crater
      float edgeDist;
      if (isInCrater(worldX, worldY, modX, modY, modRadius, edgeDist)) {
        solid = false;
        masked = true;
      }
      if (distSq < nearestCraterDistSq) {
        nearestCraterDistSq = distSq;
        nearestCraterRadius = modRadius;
      }
    } else if (modType < 1.5) { // Add
      if (distSq <= modRadius * modRadius) solid = true;
    } else { // Tunnel
      vec4 data1 = texelFetch(u_modTexture, ivec2(i, 1), 0);
      if (isInTunnel(worldX, worldY, modX, modY, data1.r, data1.g, modRadius, data1.b)) {
        solid = false;
        masked = true;
      }
      if (distSq < nearestCraterDistSq) {
        nearestCraterDistSq = distSq;
        nearestCraterRadius = modRadius;
      }
    }
  }

  // Common calculations for lighting and time
  float skyT = screenPos.y / u_viewSize.y;
  float timeOfDay = fract(u_time / ${DAY_NIGHT_CYCLE_DURATION.toFixed(1)});
  float lightFactor = smoothstep(-0.5, 0.5, cos((timeOfDay - 0.25) * 6.283185));
  float horizonFactor = smoothstep(0.3, 0.0, abs(timeOfDay - 0.0)) +
                        smoothstep(0.3, 0.0, abs(timeOfDay - 0.5)) +
                        smoothstep(0.3, 0.0, abs(timeOfDay - 1.0));
  horizonFactor = clamp(horizonFactor, 0.0, 1.0);

  // === Popup Decorations check ===
  if (!masked) {
    vec4 deco = getDecorationColor(worldX, worldY, baseH, biomeIdx);
    if (deco.a > 0.0) {
      fragColor = vec4(deco.rgb, 1.0);
      return;
    }
  }

  // === Sky rendering ===
  if (!solid) {
    vec3 skyTopNight = vec3(0.008, 0.02, 0.08);
    vec3 skyBotNight = vec3(0.05, 0.08, 0.2);
    vec3 skyTopDay = vec3(0.2, 0.4, 0.8);
    vec3 skyBotDay = vec3(0.5, 0.7, 0.95);
    vec3 horizonColor = vec3(1.0, 0.4, 0.2);

    vec3 skyTop = mix(skyTopNight, skyTopDay, lightFactor);
    vec3 skyBot = mix(skyBotNight, skyBotDay, lightFactor);
    skyBot = mix(skyBot, horizonColor, horizonFactor * (1.0 - skyT));

    vec3 skyColor = mix(skyBot, skyTop, skyT);

    // Stars
    float starIntensity = smoothstep(0.4, 0.1, lightFactor);
    if (starIntensity > 0.0) {
      vec2 starUV = (screenPos + vec2(u_cameraPos.x, -u_cameraPos.y) * 0.05) / 40.0;
      float stars = star(starUV, 1.0) * 0.8 + star(starUV * 1.5 + 100.0, 2.0) * 0.5 + star(starUV * 2.0 + 200.0, 3.0) * 0.3;
      skyColor += vec3(stars) * starIntensity;
    }

    // Weather
    float weatherIntensity = noise1D(worldX * 0.0005, u_seed + 1234.0);
    float weatherThreshold = (biomeIdx == 4) ? 0.15 : 0.3;

    if (weatherIntensity > weatherThreshold) {
      float intensity = smoothstep(weatherThreshold, weatherThreshold + 0.1, weatherIntensity);
      vec2 worldPos = vec2(worldX, worldY);
      if (biomeIdx == 4) {
        float snow = weatherParticle(worldPos, 20.0, 0.6, 0.2);
        skyColor = mix(skyColor, vec3(1.0), snow * 0.5 * intensity);
      } else if (biomeIdx == 3) {
        float sand = weatherParticle(worldPos, 25.0, 0.3, 0.7);
        skyColor = mix(skyColor, vec3(0.9, 0.8, 0.6), sand * 0.2 * intensity);
      } else if (biomeIdx == 0 || biomeIdx == 2 || biomeIdx == 5) {
        float rain = rainParticle(worldPos);
        vec3 rainColor = (biomeIdx == 5) ? vec3(0.4, 0.5, 0.4) : vec3(0.6, 0.7, 0.8);
        skyColor = mix(skyColor, rainColor, rain * 0.5 * intensity);
      } else if (biomeIdx == 6) {
        float ash = weatherParticle(worldPos, 15.0, -0.3, 0.5);
        vec3 emberColor = mix(vec3(0.2, 0.2, 0.2), vec3(1.0, 0.3, 0.0), step(0.7, noise(screenPos * 0.1)));
        skyColor = mix(skyColor, emberColor, ash * 0.4 * intensity);
      }
    }

    fragColor = vec4(calculateLighting(vec2(worldX, worldY), skyColor), 1.0);
    return;
  }

  // === Terrain rendering ===
  float depth = worldY - baseH;
  float yRel = worldY / u_worldSize.y;
  vec3 color = getBiomeColorBlended(worldX, depth, yRel, baseH);

  // Texture noise
  float texNoise = fract(sin(dot(vec2(worldX, worldY), vec2(12.9898, 78.233))) * 43758.5453);
  color += (texNoise - 0.5) * 0.04;

  // Surface Decorations (Grass)
  if (depth >= 0.0 && depth < 25.0) {
    float grassPattern = noise(vec2(worldX * 0.3, worldY * 1.5 + u_seed));
    float grassHeight = noise(vec2(worldX * 0.2 + u_seed, 0.0)) * 15.0 + 8.0;
    float grassBlade = smoothstep(grassHeight, 0.0, depth) * step(0.35, grassPattern);

    if (grassBlade > 0.0) {
      vec3 gColor;
      if (biomeIdx == 0) gColor = mix(vec3(0.2, 0.7, 0.2), vec3(0.4, 0.9, 0.3), grassPattern);
      else if (biomeIdx == 1) gColor = mix(vec3(0.3, 0.4, 0.3), vec3(0.4, 0.5, 0.4), grassPattern);
      else if (biomeIdx == 2) gColor = mix(vec3(0.1, 0.5, 0.2), vec3(0.2, 0.7, 0.3), grassPattern);
      else if (biomeIdx == 3) gColor = mix(vec3(0.6, 0.5, 0.3), vec3(0.4, 0.6, 0.2), grassPattern);
      else gColor = mix(vec3(0.8, 0.9, 1.0), vec3(0.6, 0.7, 0.8), grassPattern);
      color = mix(color, gColor, grassBlade * 0.9);
    }
  }

  // Scorch marks
  if (nearestCraterRadius > 0.0) {
    float nearestCraterDist = sqrt(nearestCraterDistSq);
    float scorchOuter = nearestCraterRadius * 1.4;
    if (nearestCraterDist <= scorchOuter) {
      float scorchT = 1.0 - (nearestCraterDist - nearestCraterRadius * 0.7) / (scorchOuter - nearestCraterRadius * 0.7);
      scorchT = clamp(scorchT, 0.0, 1.0);
      float scorchNoise = noise(vec2(worldX * 0.2, worldY * 0.2)) * 0.3;
      scorchT = clamp(scorchT + scorchNoise - 0.15, 0.0, 1.0);
      vec3 scorchColor = mix(vec3(0.15, 0.1, 0.05), vec3(0.02, 0.01, 0.01), scorchT * 0.5);
      color = mix(color, scorchColor, scorchT * 0.7);
      if (nearestCraterDist <= nearestCraterRadius * 1.1) {
        float innerT = 1.0 - (nearestCraterDist / (nearestCraterRadius * 1.1));
        color = mix(color, vec3(0.0), innerT * 0.6);
      }
    }
  }

  // Day/Night lighting and tint
  float ambLight = mix(0.25, 1.0, lightFactor);
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.8, 0.7), horizonFactor);
  color *= ambLight * tint;

  // Apply Point Lights
  color = calculateLighting(vec2(worldX, worldY), color);

  fragColor = vec4(color, 1.0);
}
`;
const MAX_MODIFICATIONS = 4096;

/**
 * GPU-accelerated terrain renderer using WebGL2 shaders.
 * Renders terrain with modifications entirely on GPU.
 */
export class TerrainShaderRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private modTexture: WebGLTexture | null = null;
  private biomeTexture: WebGLTexture | null = null;

  // Uniform locations
  private uniforms: {
    seed: WebGLUniformLocation | null;
    cameraPos: WebGLUniformLocation | null;
    viewSize: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    worldSize: WebGLUniformLocation | null;
    modTexture: WebGLUniformLocation | null;
    modCount: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    lightPos: WebGLUniformLocation | null;
    lightColor: WebGLUniformLocation | null;
    lightRadius: WebGLUniformLocation | null;
    lightCount: WebGLUniformLocation | null;
    biomeTexture: WebGLUniformLocation | null;
  } = {
    seed: null,
    cameraPos: null,
    viewSize: null,
    zoom: null,
    worldSize: null,
    modTexture: null,
    modCount: null,
    time: null,
    lightPos: null,
    lightColor: null,
    lightRadius: null,
    lightCount: null,
    biomeTexture: null,
  };

  private modTextureData: Float32Array;
  private lastModCount = 0;
  private isInitialized = false;

  // Caching for uploadModifications
  private lastUploadParams = {
    camX: -1e9,
    camY: -1e9,
    zoom: -1,
    modArrayRef: null as TerrainModification[] | null,
    modCount: -1,
  };

  constructor() {
    // 2 rows per modification: [type, x, y, radius] and [nx, ny, length, 0]
    this.modTextureData = new Float32Array(MAX_MODIFICATIONS * 4 * 2);
  }

  /**
   * Initialize WebGL context and compile shaders.
   * Returns true if successful, false if WebGL2 unavailable.
   */
  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    });

    if (!gl) {
      console.warn("WebGL2 not available, falling back to CPU rendering");
      return false;
    }

    this.gl = gl;

    // Compile shaders
    const vertShader = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = this.compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );

    if (!vertShader || !fragShader) {
      console.error("Failed to compile shaders");
      return false;
    }

    // Link program
    const program = gl.createProgram();
    if (!program) return false;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return false;
    }

    this.program = program;

    // Get uniform locations
    this.uniforms = {
      seed: gl.getUniformLocation(program, "u_seed"),
      cameraPos: gl.getUniformLocation(program, "u_cameraPos"),
      viewSize: gl.getUniformLocation(program, "u_viewSize"),
      zoom: gl.getUniformLocation(program, "u_zoom"),
      worldSize: gl.getUniformLocation(program, "u_worldSize"),
      modTexture: gl.getUniformLocation(program, "u_modTexture"),
      modCount: gl.getUniformLocation(program, "u_modCount"),
      time: gl.getUniformLocation(program, "u_time"),
      lightPos: gl.getUniformLocation(program, "u_lightPos"),
      lightColor: gl.getUniformLocation(program, "u_lightColor"),
      lightRadius: gl.getUniformLocation(program, "u_lightRadius"),
      lightCount: gl.getUniformLocation(program, "u_lightCount"),
      biomeTexture: gl.getUniformLocation(program, "u_biomeTexture"),
    };

    // Create VAO (empty - we use gl_VertexID in shader)
    this.vao = gl.createVertexArray();

    // Create modification texture
    this.modTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.modTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create biome texture
    this.biomeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.isInitialized = true;
    return true;
  }

  /**
   * Resize the WebGL viewport to match canvas size.
   */
  resize(width: number, height: number): void {
    if (!this.gl) return;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Upload modifications to GPU texture.
   * OPTIMIZED: Culls modifications outside current viewport to minimize GPU loop work.
   */
  uploadModifications(
    modifications: TerrainModification[],
    camX?: number,
    camY?: number,
    viewW?: number,
    viewH?: number,
    zoom?: number,
  ): void {
    if (!this.gl || !this.modTexture) return;

    // Optimization: Skip re-filtering and re-uploading if camera hasn't moved much
    // and modification list is the same
    const camThreshold = 10; // Pixels
    const isSameMods =
      this.lastUploadParams.modArrayRef === modifications &&
      this.lastUploadParams.modCount === modifications.length;

    const isSameViewport =
      camX !== undefined &&
      camY !== undefined &&
      zoom !== undefined &&
      Math.abs(this.lastUploadParams.camX - camX) < camThreshold &&
      Math.abs(this.lastUploadParams.camY - camY) < camThreshold &&
      Math.abs(this.lastUploadParams.zoom - zoom) < 0.01;

    if (isSameMods && isSameViewport) {
      return;
    }

    // Update cache params
    if (camX !== undefined && camY !== undefined && zoom !== undefined) {
      this.lastUploadParams.camX = camX;
      this.lastUploadParams.camY = camY;
      this.lastUploadParams.zoom = zoom;
    }
    this.lastUploadParams.modArrayRef = modifications;
    this.lastUploadParams.modCount = modifications.length;

    let filteredMods = modifications;
    if (
      camX !== undefined &&
      camY !== undefined &&
      viewW !== undefined &&
      viewH !== undefined &&
      zoom !== undefined
    ) {
      const margin = 300; // Increased margin for safety with irregular edges
      const worldW = viewW / zoom;
      const worldH = viewH / zoom;

      const viewLeft = camX - margin;
      const viewRight = camX + worldW + margin;
      const viewTop = camY - margin;
      const viewBottom = camY + worldH + margin;

      filteredMods = [];
      for (let i = 0; i < modifications.length; i++) {
        const mod = modifications[i];
        const type = TerrainMod.getType(mod);
        const radius = TerrainMod.getRadius(mod);
        const mx = TerrainMod.getX(mod);
        const my = TerrainMod.getY(mod);

        let effectiveRadius = radius;
        if (type === TerrainModType.CARVE) {
          effectiveRadius = (TerrainMod.getLength(mod) || 100) + radius;
        }

        // Simple bounding box check
        if (
          mx + effectiveRadius < viewLeft ||
          mx - effectiveRadius > viewRight ||
          my + effectiveRadius < viewTop ||
          my - effectiveRadius > viewBottom
        ) {
          continue;
        }

        filteredMods.push(mod);
        if (filteredMods.length >= MAX_MODIFICATIONS) break;
      }
    }

    const count = Math.min(filteredMods.length, MAX_MODIFICATIONS);
    this.lastModCount = count;

    // Pack modifications into texture data
    for (let i = 0; i < count; i++) {
      const mod = filteredMods[i];
      const type = TerrainMod.getType(mod);
      const mx = TerrainMod.getX(mod);
      const my = TerrainMod.getY(mod);
      const radius = TerrainMod.getRadius(mod);
      const baseIdx = i * 4;

      // Row 0: type, x, y, radius
      this.modTextureData[baseIdx + 0] = type;
      this.modTextureData[baseIdx + 1] = mx;
      this.modTextureData[baseIdx + 2] = my;
      this.modTextureData[baseIdx + 3] = radius;

      // Row 1: nx, ny, length (for carve)
      const row1Idx = MAX_MODIFICATIONS * 4 + baseIdx;
      let nx = 0;
      let ny = 0;
      const length = TerrainMod.getLength(mod) || 0;

      if (type === TerrainModType.CARVE) {
        const vx = TerrainMod.getVx(mod) || 0;
        const vy = TerrainMod.getVy(mod) || 0;
        const mag = Math.hypot(vx, vy);
        if (mag > 0) {
          nx = vx / mag;
          ny = vy / mag;
        }
      }

      this.modTextureData[row1Idx + 0] = nx;
      this.modTextureData[row1Idx + 1] = ny;
      this.modTextureData[row1Idx + 2] = length;
      this.modTextureData[row1Idx + 3] = 0;
    }

    // Upload to GPU
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.modTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F, // 32-bit float for precision
      MAX_MODIFICATIONS,
      2, // 2 rows
      0,
      gl.RGBA,
      gl.FLOAT,
      this.modTextureData,
    );
  }

  setLights(
    positions: Float32Array,
    colors: Float32Array,
    radii: Float32Array,
    count: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.program) return; // Check for program as well

    gl.useProgram(this.program); // Ensure the program is active before setting uniforms
    gl.uniform2fv(this.uniforms.lightPos, positions);
    gl.uniform3fv(this.uniforms.lightColor, colors);
    gl.uniform1fv(this.uniforms.lightRadius, radii);
    gl.uniform1i(this.uniforms.lightCount, count);
  }

  /**
   * Render terrain to WebGL canvas.
   */
  render(
    seed: number,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    zoom: number,
    time: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao) return;

    // Clear with transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use program
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set uniforms
    gl.uniform1f(this.uniforms.seed, seed);
    gl.uniform2f(this.uniforms.cameraPos, camX, camY);
    gl.uniform2f(this.uniforms.viewSize, viewW, viewH);
    gl.uniform1f(this.uniforms.zoom, zoom);
    gl.uniform2f(this.uniforms.worldSize, WORLD_WIDTH, WORLD_HEIGHT);
    gl.uniform1i(this.uniforms.modCount, this.lastModCount);
    // CRITICAL: Use modulo on CPU to preserve precision for 32-bit float in shader.
    // Use a multiple of cycle duration to avoid jumps in day/night transitions.
    const timeModulo = DAY_NIGHT_CYCLE_DURATION * 10;
    gl.uniform1f(this.uniforms.time, time % timeModulo);

    // Bind modification texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.modTexture);
    gl.uniform1i(this.uniforms.modTexture, 0);

    // Bind biome texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTexture);
    gl.uniform1i(this.uniforms.biomeTexture, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Upload biome noise data to GPU texture.
   * Called when seed changes or on init.
   */
  uploadBiomeData(seed: number): void {
    const gl = this.gl;
    if (!gl || !this.biomeTexture) return;

    // We need noise for WORLD_WIDTH / 256 chunks
    const chunkCount = 1024; // Cover plenty of space
    const data = new Float32Array(chunkCount * 4); // RGBA32F

    // Mock noise functions - must match TerrainMap.ts logic
    const hash = (x: number, s: number) => {
      let p = x * 0.1031 + s * 0.3117;
      p = p - Math.floor(p);
      p *= p + 33.33;
      p *= p + p;
      return p - Math.floor(p);
    };

    const noise1D = (x: number, s: number) => {
      const i = Math.floor(x);
      const f = x - i;
      const u = f * f * (3 - 2 * f);
      return hash(i, s) * (1 - u) + hash(i + 1, s) * u;
    };

    const fbm1D = (x: number, s: number, octaves: number) => {
      let value = 0;
      let amplitude = 0.5;
      let frequency = 1;
      for (let i = 0; i < octaves; i++) {
        value += amplitude * noise1D(x * frequency, s + i * 100);
        amplitude *= 0.5;
        frequency *= 2;
      }
      return value;
    };

    for (let i = 0; i < chunkCount; i++) {
      const chunkX = i * 256 + 128;
      const biomeNoise = fbm1D(chunkX * BIOME_SCALE, seed, 2);
      data[i * 4] = biomeNoise; // Store in R channel
    }

    gl.bindTexture(gl.TEXTURE_2D, this.biomeTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      chunkCount,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      data,
    );
  }

  /**
   * Check if renderer is ready.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Clean up WebGL resources.
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.modTexture) gl.deleteTexture(this.modTexture);
    if (this.biomeTexture) gl.deleteTexture(this.biomeTexture);

    this.isInitialized = false;
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        type === gl.VERTEX_SHADER ? "Vertex" : "Fragment",
        "shader error:",
        gl.getShaderInfoLog(shader),
      );
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}
