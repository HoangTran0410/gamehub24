import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants';

export const generateTerrain = (ctx: CanvasRenderingContext2D) => {
  const width = WORLD_WIDTH;
  const height = WORLD_HEIGHT;

  ctx.clearRect(0, 0, width, height);
  
  // 1. Transparent Background (The game component handles the sky gradient)
  // We only draw the dirt/ground here.

  // Randomize the terrain generation
  const seed = Math.random() * 10000;
  
  ctx.beginPath();
  ctx.moveTo(0, height);
  
  // Complex terrain generation
  let y = height / 2;
  for (let x = 0; x <= width; x++) {
    // Frequencies
    const f1 = 0.001; // Lower frequency for wider map
    const f2 = 0.005;
    const f3 = 0.02; // Detail noise
    
    // Amplitudes
    const a1 = 200;
    const a2 = 50;
    const a3 = 10;

    // Use the seed to shift the sine waves
    const noise = Math.sin((x + seed) * f1) * a1 +
                  Math.sin((x + seed * 2) * f2) * a2 +
                  Math.sin((x + seed * 3) * f3) * a3;
    
    // Add varying mountainous features based on seed
    const mountain = Math.sin((x / width * Math.PI * 5) + seed) * -120; 

    y = (height / 1.6) + noise + mountain;
    
    // Clamp to ensure playable area
    y = Math.max(200, Math.min(height - 100, y));
    
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();

  // --- Terrain Visuals ---
  ctx.save();
  ctx.clip(); // Clip to the shape we just drew

  // 1. Deep Underground (Darker)
  const groundGrad = ctx.createLinearGradient(0, 0, 0, height);
  groundGrad.addColorStop(0, '#475569'); // Slate 600 (Top)
  groundGrad.addColorStop(1, '#0f172a'); // Slate 900 (Bottom)
  ctx.fillStyle = groundGrad;
  ctx.fill();

  // 2. Texture/Rocks
  ctx.globalCompositeOperation = 'source-atop';
  for(let i=0; i<800; i++) { // More rocks for larger map
     const size = Math.random() * 4 + 1;
     const tx = Math.random() * width;
     const ty = Math.random() * height;
     ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)';
     ctx.beginPath();
     ctx.arc(tx, ty, size, 0, Math.PI*2);
     ctx.fill();
  }

  // 3. Top Surface Layer (Grass/Alien Moss)
  // We redraw the top line with a thick stroke
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  let surfaceY = height / 2;
  for (let x = 0; x <= width; x++) {
    // Re-calculate Y (Copy paste logic from above to match exactly)
    const f1 = 0.001; const f2 = 0.005; const f3 = 0.02;
    const a1 = 200; const a2 = 50; const a3 = 10;
    const noise = Math.sin((x + seed) * f1) * a1 +
                  Math.sin((x + seed * 2) * f2) * a2 +
                  Math.sin((x + seed * 3) * f3) * a3;
    const mountain = Math.sin((x / width * Math.PI * 5) + seed) * -120; 
    surfaceY = (height / 1.6) + noise + mountain;
    surfaceY = Math.max(200, Math.min(height - 100, surfaceY));
    
    if (x===0) ctx.moveTo(x, surfaceY);
    else ctx.lineTo(x, surfaceY);
  }
  ctx.strokeStyle = '#22c55e'; // Green Grass
  ctx.lineWidth = 15; // Thick stroke for surface
  ctx.lineCap = 'round';
  ctx.stroke();

  // 4. Highlight on top of grass
  ctx.strokeStyle = '#86efac'; // Light Green
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
};

export const destroyTerrain = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) => {
  // Main Crater
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  // Irregular crater shape
  for (let i = 0; i < Math.PI * 2; i += 0.2) {
      const r = radius * (0.9 + Math.random() * 0.2);
      const cx = x + Math.cos(i) * r;
      const cy = y + Math.sin(i) * r;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  
  // Burn Scorch Marks (only on existing pixels)
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.beginPath();
  ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Dark shadow
  ctx.fill();
  ctx.restore();
};

export const addTerrain = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number
  ) => {
    ctx.save();
    // Use source-over to draw ON TOP of everything
    ctx.globalCompositeOperation = 'source-over';
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    // A concrete/rock color
    ctx.fillStyle = '#64748b'; 
    ctx.fill();
    
    // Add a border highlight to make it pop
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#94a3b8';
    ctx.stroke();
    
    ctx.restore();
};

export const carveTunnel = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    vx: number,
    vy: number,
    radius: number,
    length: number = 100
) => {
    // Normalize vector
    const mag = Math.sqrt(vx*vx + vy*vy);
    const nx = vx / mag;
    const ny = vy / mag;
    
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + nx * length, startY + ny * length);
    ctx.stroke();
    ctx.restore();
    
    // Add edge scorch
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.lineWidth = radius * 2 + 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + nx * length, startY + ny * length);
    ctx.stroke();
    ctx.restore();
};

export const getTerrainHeightAt = (
  ctx: CanvasRenderingContext2D,
  x: number
): number => {
  if (x < 0 || x >= WORLD_WIDTH) return WORLD_HEIGHT + 100;

  // We scan from top to bottom
  const pixelData = ctx.getImageData(Math.floor(x), 0, 1, WORLD_HEIGHT).data;
  
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    // Alpha channel > 0 means we hit terrain
    if (pixelData[y * 4 + 3] > 0) {
      return y;
    }
  }
  
  return WORLD_HEIGHT + 100;
};