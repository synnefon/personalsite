import React, {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "../styles/lavalamp.css";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number;
}

const PARTICLE_COUNT = 300;
const GRAVITY = 0.01;
const BUOYANCY = 0.05;
const FRICTION = 0.98;
const HEAT_RATE = 0.01; // Fast heating at bottom
const COOL_RATE = 0.003; // Faster cooling
const HEAT_CONDUCTION = 0.02; // Heat spreads between nearby particles
const HEAT_SOURCE_DISTANCE = 30; // Only heat particles within 30px of bottom
const COHESION_RADIUS = 25;
const COHESION_STRENGTH = 0.003;
const PARTICLE_RADIUS = 10;
const PIXEL_SIZE = 6;

export default function LavaLamp(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const [running, setRunning] = useState<boolean>(true);

  // Initialize particles - cold lava at bottom
  const initializeParticles = useCallback((): Particle[] => {
    const particles: Particle[] = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: height * 0.85 + Math.random() * height * 0.15,
        vx: 0,
        vy: 0,
        heat: 0.0, // Start cold
      });
    }

    return particles;
  }, []);

  useEffect(() => {
    particlesRef.current = initializeParticles();
  }, [initializeParticles]);

  // Update particles
  const updateParticles = useCallback(() => {
    const particles = particlesRef.current;
    const height = window.innerHeight;
    const width = window.innerWidth;

    particles.forEach((particle) => {
      // Gravity and buoyancy
      const buoyancy = particle.heat * BUOYANCY;
      particle.vy += GRAVITY - buoyancy;

      // Apply friction
      particle.vx *= FRICTION;
      particle.vy *= FRICTION;

      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Heat only particles very close to bottom (heat source)
      const distanceFromBottom = height - particle.y;
      if (distanceFromBottom < HEAT_SOURCE_DISTANCE) {
        const heatIntensity = 1 - distanceFromBottom / HEAT_SOURCE_DISTANCE;
        particle.heat += HEAT_RATE * heatIntensity;
      } else {
        // Cool when away from heat source
        particle.heat -= COOL_RATE;
      }

      particle.heat = Math.max(0, Math.min(1, particle.heat));

      // Wall bounces
      if (particle.x < 0) {
        particle.x = 0;
        particle.vx *= -0.5;
      } else if (particle.x > width) {
        particle.x = width;
        particle.vx *= -0.5;
      }

      if (particle.y < 0) {
        particle.y = 0;
        particle.vy *= -0.5;
      } else if (particle.y > height) {
        particle.y = height;
        particle.vy *= -0.5;
      }
    });

    // Cohesion - particles attract nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < COHESION_RADIUS && dist > 0) {
          // Attract
          const force = COHESION_STRENGTH * (1 - dist / COHESION_RADIUS);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          p1.vx += fx;
          p1.vy += fy;
          p2.vx -= fx;
          p2.vy -= fy;

          // Heat transfer
          const avgHeat = (p1.heat + p2.heat) / 2;
          p1.heat += (avgHeat - p1.heat) * 0.05;
          p2.heat += (avgHeat - p2.heat) * 0.05;
        }
      }
    }
  }, []);

  // Render with metaball effect
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = particlesRef.current;

    // Clear with black
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create metaball field with pixelation
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let y = 0; y < canvas.height; y += PIXEL_SIZE) {
      for (let x = 0; x < canvas.width; x += PIXEL_SIZE) {
        let sum = 0;
        let heatSum = 0;

        // Calculate metaball field
        for (const particle of particles) {
          const dx = x - particle.x;
          const dy = y - particle.y;
          const distSq = dx * dx + dy * dy;
          const influence =
            (PARTICLE_RADIUS * PARTICLE_RADIUS) / (distSq + 1);
          sum += influence;
          heatSum += influence * particle.heat;
        }

        if (sum > 0.8) {
          const heat = heatSum / sum;

          // Color: purple/blue (cool) to yellow (hot)
          const r = Math.floor(100 + heat * 155);
          const g = Math.floor(50 + heat * 205);
          const b = Math.floor(200 - heat * 200);

          // Fill pixel block
          for (let py = 0; py < PIXEL_SIZE; py++) {
            for (let px = 0; px < PIXEL_SIZE; px++) {
              const xx = x + px;
              const yy = y + py;
              if (xx < canvas.width && yy < canvas.height) {
                const idx = (yy * canvas.width + xx) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    if (running) {
      updateParticles();
      render();
      animationFrameRef.current = requestAnimationFrame(animate);
    }
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

  // Handle resize
  useEffect(() => {
    const handleResize = (): void => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        particlesRef.current = initializeParticles();
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initializeParticles]);

  const toggleRunning = useCallback(() => {
    setRunning((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    particlesRef.current = initializeParticles();
    render();
  }, [initializeParticles, render]);

  return (
    <div className="lava-lamp-container">
      <canvas
        ref={canvasRef}
        className="lava-lamp-canvas"
        width={window.innerWidth}
        height={window.innerHeight}
      />

      <div className="lava-lamp-controls">
        <button className="lava-lamp-button" onClick={toggleRunning}>
          {running ? "⏸" : "▶"}
        </button>
        <button className="lava-lamp-button" onClick={reset}>
          ⟲
        </button>
      </div>
    </div>
  );
}
