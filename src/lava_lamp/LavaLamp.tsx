import React, {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "../styles/lavalamp.css";

// --- Types ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number;
}

// --- Constants ---
const PARTICLE_COUNT = 500;
const GRAVITY = 0.01;
const BUOYANCY = 0.04;
const FRICTION = 0.98;
const HEAT_RATE = 0.005;
const COOL_RATE = 0.0028;
const HEAT_CONDUCTION = 0.002;
const HEAT_SOURCE_DISTANCE = 30;
const COHESION_RADIUS = 25;
const COHESION_STRENGTH = 0.003;
const PARTICLE_RADIUS = 10;
const PIXEL_SIZE = 6;

export default function LavaLamp(): ReactElement {
  // --- Refs and State ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const [running, setRunning] = useState(true);
  const mouseDownRef = useRef(false);
  const mousePositionRef = useRef({ x: 0, y: 0 });

  // --- Particle Initialization ---
  const initializeParticles = useCallback((): Particle[] => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const particles: Particle[] = [];

    // Create random clumps of particles
    const clumpCount = 15;
    const particlesPerClump = Math.floor(PARTICLE_COUNT / clumpCount);
    const clumpRadius = 50;

    for (let i = 0; i < clumpCount; i++) {
      // Random clump center and heat - 30% in top half, 70% in bottom half
      const centerX = Math.random() * width;
      const centerY = Math.random() < 0.3
        ? Math.random() * height * 0.5 // 30% chance: top half
        : height * 0.5 + Math.random() * height * 0.5; // 70% chance: bottom half
      const clumpHeat = Math.random(); // Random heat from 0 to 1

      for (let j = 0; j < particlesPerClump; j++) {
        // Random position within clump radius
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * clumpRadius;

        particles.push({
          x: centerX + Math.cos(angle) * dist,
          y: centerY + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          heat: clumpHeat,
        });
      }
    }

    // Fill remaining particles randomly
    while (particles.length < PARTICLE_COUNT) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0,
        heat: 0,
      });
    }

    return particles;
  }, []);

  // --- Populate particles once on mount/resize ---
  useEffect(() => {
    particlesRef.current = initializeParticles();
  }, [initializeParticles]);

  // --- Physics Update ---
  const updateParticles = useCallback(() => {
    const particles = particlesRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Helper: Get neighbor count for each particle
    const neighborCounts = particles.map((p1) =>
      particles.filter(
        (p2) =>
          p1 !== p2 &&
          Math.hypot(p2.x - p1.x, p2.y - p1.y) < COHESION_RADIUS
      ).length
    );

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Gravity and buoyancy
      const buoyancy = Math.pow(p.heat, 2) * BUOYANCY;
      p.vy += GRAVITY - buoyancy;

      // Friction
      p.vx *= FRICTION;
      p.vy *= FRICTION;

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      // Mouse heating - apply heat when clicking
      if (mouseDownRef.current) {
        const distanceFromMouse = Math.hypot(
          p.x - mousePositionRef.current.x,
          p.y - mousePositionRef.current.y
        );
        const mouseHeatRadius = 100;
        if (distanceFromMouse < mouseHeatRadius) {
          const heatIntensity = 1 - distanceFromMouse / mouseHeatRadius;
          p.heat += HEAT_RATE * 2 * heatIntensity; // 2x heat rate for mouse
        }
      }

      // Heat logic
      const distanceFromBottom = height - p.y;
      if (distanceFromBottom < HEAT_SOURCE_DISTANCE) {
        // Heating near bottom
        const heatIntensity = 1 - distanceFromBottom / HEAT_SOURCE_DISTANCE;
        p.heat += HEAT_RATE * heatIntensity;
      } else {
        // Cooling by air exposure (proportional to number of neighbors)
        const maxNeighbors = 8;
        const airExposure =
          1 - Math.min(neighborCounts[i], maxNeighbors) / maxNeighbors;
        p.heat -= COOL_RATE * (0.2 + airExposure * 0.8);
      }
      // Clamp heat
      p.heat = Math.max(0, Math.min(1, p.heat));

      // Boundaries (bounce)
      if (p.x < 0) {
        p.x = 0;
        p.vx *= -0.5;
      } else if (p.x > width) {
        p.x = width;
        p.vx *= -0.5;
      }
      if (p.y < 0) {
        p.y = 0;
        p.vy *= -0.5;
      } else if (p.y > height) {
        p.y = height;
        p.vy *= -0.5;
      }
    }

    // --- Cohesion and Heat Conduction ---
    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < COHESION_RADIUS) {
          // Attract
          const force = COHESION_STRENGTH * (1 - dist / COHESION_RADIUS);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          p1.vx += fx;
          p1.vy += fy;
          p2.vx -= fx;
          p2.vy -= fy;

          // Heat conduction (from hotter to colder)
          const heatDiff = p1.heat - p2.heat;
          const conduction = heatDiff * HEAT_CONDUCTION;
          p1.heat -= conduction;
          p2.heat += conduction;
        }
      }
    }
  }, []);

  // --- Metaball Render (pixellated) ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const particles = particlesRef.current;

    // Black background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Prepare image buffer
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    // Each PIXEL_SIZE "block"
    for (let y = 0; y < canvas.height; y += PIXEL_SIZE) {
      for (let x = 0; x < canvas.width; x += PIXEL_SIZE) {
        let influenceSum = 0;
        let heatSum = 0;

        // Sum up contributions from all particles (metaball field)
        for (const p of particles) {
          const dx = x - p.x;
          const dy = y - p.y;
          const distSq = dx * dx + dy * dy;
          const influence =
            (PARTICLE_RADIUS * PARTICLE_RADIUS) / (distSq + 1);
          influenceSum += influence;
          heatSum += influence * p.heat;
        }

        if (influenceSum > 0.8) {
          const heat = heatSum / influenceSum;

          // Color: cool = purple/blue, hot = yellow
          const r = Math.floor(100 + heat * 155);
          const g = Math.floor(50 + heat * 205);
          const b = Math.floor(200 - heat * 200);

          // Fill blocks with color
          for (let py = 0; py < PIXEL_SIZE; py++) {
            const yy = y + py;
            if (yy >= canvas.height) continue;
            for (let px = 0; px < PIXEL_SIZE; px++) {
              const xx = x + px;
              if (xx >= canvas.width) continue;
              const idx = (yy * canvas.width + xx) * 4;
              data[idx + 0] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // --- Animation Loop ---
  const animate = useCallback(() => {
    if (!running) return;
    updateParticles();
    render();
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [running, updateParticles, render]);

  useEffect(() => {
    if (running) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [running, animate]);

  // --- Resize Handler ---
  useEffect(() => {
    function handleResize() {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      particlesRef.current = initializeParticles();
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () =>
      window.removeEventListener("resize", handleResize);
  }, [initializeParticles]);

  // --- Mouse Handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    mouseDownRef.current = true;
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    mouseDownRef.current = false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      mouseDownRef.current = true;
      mousePositionRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      mousePositionRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    mouseDownRef.current = false;
  }, []);

  // --- Button Handlers ---
  const toggleRunning = useCallback(() => setRunning((p) => !p), []);
  const reset = useCallback(() => {
    particlesRef.current = initializeParticles();
    render();
  }, [initializeParticles, render]);

  // --- Render UI ---
  return (
    <div className="lava-lamp-container">
      <canvas
        ref={canvasRef}
        className="lava-lamp-canvas"
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <div className="lava-lamp-controls">
        <button
          className="lava-lamp-button"
          onClick={toggleRunning}
        >
          {running ? "⏸" : "▶"}
        </button>
        <button
          className="lava-lamp-button"
          onClick={reset}
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
