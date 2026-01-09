import React, {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "../styles/lavalamp.css";

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number;
  radius: number;
}

const BLOB_COUNT = 8;
const GRAVITY = 0.01;
const BUOYANCY = 0.04;
const FRICTION = 0.98;
const HEAT_RATE = 0.005;
const COOL_RATE = 0.0015;

// Pixelation block size for blobs
const PIXEL_SIZE = 6;

export default function LavaLamp(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const blobsRef = useRef<Blob[]>([]);
  const [running, setRunning] = useState<boolean>(true);

  // Initialize blobs - place at random spots
  const initializeBlobs = useCallback((): Blob[] => {
    const blobs: Blob[] = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Define a reasonable random range for the blob radius
    const MIN_RADIUS = 30;
    const MAX_RADIUS = 70;

    for (let i = 0; i < BLOB_COUNT; i++) {
      const radius = Math.random() * (MAX_RADIUS - MIN_RADIUS) + MIN_RADIUS;
      const x = Math.random() * (width - 2 * radius) + radius; // keep inside viewport horizontally
      const y = Math.random() * (height - 2 * radius) + radius; // keep inside viewport vertically
      blobs.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        heat: 1, // fully heated - will rise
        radius: radius, // randomized size
      });
    }

    return blobs;
  }, []);

  useEffect(() => {
    blobsRef.current = initializeBlobs();
  }, [initializeBlobs]);

  // Update blobs
  const updateBlobs = useCallback(() => {
    const blobs = blobsRef.current;
    const height = window.innerHeight;
    const width = window.innerWidth;

    blobs.forEach((blob) => {
      // Gravity and buoyancy
      const buoyancy = blob.heat * BUOYANCY;
      blob.vy += GRAVITY - buoyancy;

      // Apply friction
      blob.vx *= FRICTION;
      blob.vy *= FRICTION;

      // Update position
      blob.x += blob.vx;
      blob.y += blob.vy;

      // Heat/cool based on position
      const normalizedY = blob.y / height;
      if (normalizedY > 0.7) {
        // Near bottom - heat up
        blob.heat += HEAT_RATE * (normalizedY - 0.7) * 3;
      } else {
        // Higher up - cool down
        blob.heat -= COOL_RATE * (1 - normalizedY);
      }

      blob.heat = Math.max(0, Math.min(1, blob.heat));

      // Wall collisions
      if (blob.x < blob.radius) {
        blob.x = blob.radius;
        blob.vx *= -0.5;
      } else if (blob.x > width - blob.radius) {
        blob.x = width - blob.radius;
        blob.vx *= -0.5;
      }

      if (blob.y < blob.radius) {
        blob.y = blob.radius;
        blob.vy *= -0.5;
      } else if (blob.y > height - blob.radius) {
        blob.y = height - blob.radius;
        blob.vy *= -0.5;
      }
    });

    // Blob interactions
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const b1 = blobs[i];
        const b2 = blobs[j];

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = b1.radius + b2.radius;

        if (dist < minDist && dist > 0) {
          // Repel
          const force = (minDist - dist) / dist * 0.5;
          const fx = dx * force;
          const fy = dy * force;

          b1.vx -= fx * 0.5;
          b1.vy -= fy * 0.5;
          b2.vx += fx * 0.5;
          b2.vy += fy * 0.5;

          // Heat transfer
          const avgHeat = (b1.heat + b2.heat) / 2;
          b1.heat += (avgHeat - b1.heat) * 0.05;
          b2.heat += (avgHeat - b2.heat) * 0.05;
        }
      }
    }
  }, []);

  // Render with metaball effect - pixelated blobs (6px blocks)
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const blobs = blobsRef.current;

    // Clear with black
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create metaball field with pixelation (6px block size)
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    // Step by PIXEL_SIZE for pixelated effect
    for (let y = 0; y < canvas.height; y += PIXEL_SIZE) {
      for (let x = 0; x < canvas.width; x += PIXEL_SIZE) {
        let sum = 0;
        let heatSum = 0;

        // Calculate metaball field for the block's topleft corner
        for (const blob of blobs) {
          const dx = x - blob.x;
          const dy = y - blob.y;
          const distSq = dx * dx + dy * dy;
          const influence = (blob.radius * blob.radius) / (distSq + 1);
          sum += influence;
          heatSum += influence * blob.heat;
        }

        if (sum > 0.8) {
          const heat = heatSum / sum;

          // Color: purple/blue (cool) to yellow (hot)
          const r = Math.floor(100 + heat * 155);
          const g = Math.floor(50 + heat * 205);
          const b = Math.floor(200 - heat * 200);

          // Fill in the 6x6 pixel block for pixelation
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
      updateBlobs();
      render();
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [running, updateBlobs, render]);

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
        blobsRef.current = initializeBlobs();
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initializeBlobs]);

  const toggleRunning = useCallback(() => {
    setRunning((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    blobsRef.current = initializeBlobs();
    render();
  }, [initializeBlobs, render]);

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
