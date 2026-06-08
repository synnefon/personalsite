import { forwardRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "../styles/gun.css";
import { playGunshot } from "./gunSound";
import { makeCrater } from "./pixelCrater";

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

const MAX_CRATERS = 500; // safety cap; craters otherwise persist until reload
const DEBRIS_MS = 650;
const PIXEL = 4.5; // css px per art cell for the pistol sprite

const rand = (a, b) => a + Math.random() * (b - a);

const hasFinePointer = () =>
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Pixel-art pistol pointing right; the muzzle pixel sits at the cell below.
const PISTOL_ART = [
  "................",
  "..KKKKKKKKKK....",
  ".KDDDDDDDDDDK...",
  ".KDLLLLLLDDDDKK.",
  ".KDDDDDDDDDDDDDM",
  ".KKKKKDDDDDDKKK.",
  "..KGGKKDDDK.....",
  "..KGGK.KKK......",
  "..KGGK..........",
  "..KGGGK.........",
  "...KKKK.........",
];
const ART_W = 16;
const MUZZLE_COL = 15;
const MUZZLE_ROW = 4;
const PISTOL_PALETTE = {
  K: "#0d0d0d",
  D: "#3a3f45",
  L: "#6b727a",
  G: "#7a4a22",
  M: "#1a1a1a",
};

const FLASH_ART = ["..Y..", ".YOY.", "YOWOY", ".YOY.", "..Y.."];
const FLASH_PIXEL = 6;
const FLASH_PALETTE = { Y: "#ff8c1a", O: "#ffd23f", W: "#ffffff" };

function artToRects(art, palette) {
  const rects = [];
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[ch]} />
      );
    }
  });
  return rects;
}

const Pistol = forwardRef(function Pistol(_, ref) {
  const muzzleX = (MUZZLE_COL + 0.5) * PIXEL;
  const muzzleY = (MUZZLE_ROW + 0.5) * PIXEL;
  return (
    <svg
      ref={ref}
      className="gun-sprite"
      width={ART_W * PIXEL}
      height={PISTOL_ART.length * PIXEL}
      viewBox={`0 0 ${ART_W} ${PISTOL_ART.length}`}
      shapeRendering="crispEdges"
      style={{ left: -muzzleX, top: -muzzleY }}
    >
      {artToRects(PISTOL_ART, PISTOL_PALETTE)}
    </svg>
  );
});

const MuzzleFlash = forwardRef(function MuzzleFlash(_, ref) {
  const dim = FLASH_ART.length * FLASH_PIXEL;
  return (
    <svg
      ref={ref}
      className="gun-muzzle"
      width={dim}
      height={dim}
      viewBox={`0 0 ${FLASH_ART.length} ${FLASH_ART.length}`}
      shapeRendering="crispEdges"
      style={{ left: -dim / 2, top: -dim / 2, opacity: 0 }}
    >
      {artToRects(FLASH_ART, FLASH_PALETTE)}
    </svg>
  );
});

export default function GunCursor() {
  const [armed, setArmed] = useState(false);
  const [craters, setCraters] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [toast, setToast] = useState(null);

  const followerRef = useRef(null);
  const rotorRef = useRef(null);
  const spriteRef = useRef(null);
  const muzzleRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0, angle: 0, seen: false });
  const idRef = useRef(0);

  // Konami listener (and Escape to holster), attached once on hover-capable devices
  useEffect(() => {
    if (!hasFinePointer()) return;
    let idx = 0;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArmed(false);
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[idx]) {
        idx += 1;
        if (idx === KONAMI.length) {
          idx = 0;
          setArmed((a) => !a);
        }
      } else {
        idx = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Toggle the cursor-hiding body class with the armed state
  useEffect(() => {
    document.body.classList.toggle("gun-armed", armed);
    return () => document.body.classList.remove("gun-armed");
  }, [armed]);

  // Aim, fire, and click interception while armed
  useEffect(() => {
    if (!armed) return;
    const reduced = prefersReducedMotion();
    posRef.current.seen = false;

    setToast({ id: ++idRef.current, msg: "🔫 locked & loaded — esc to holster" });
    const toastTimer = setTimeout(() => setToast(null), 1500);

    const applyTransform = () => {
      const p = posRef.current;
      const follower = followerRef.current;
      const rotor = rotorRef.current;
      if (!follower || !rotor) return;
      follower.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      follower.style.opacity = p.seen ? "1" : "0";
      const norm = ((p.angle % 360) + 360) % 360;
      const flip = norm > 90 && norm < 270 ? -1 : 1;
      rotor.style.transform = `rotate(${p.angle}deg) scaleY(${flip})`;
    };

    const onMove = (e) => {
      const p = posRef.current;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) > 2.5) {
        let target = Math.atan2(dy, dx) * (180 / Math.PI);
        while (target - p.angle > 180) target -= 360;
        while (target - p.angle < -180) target += 360;
        p.angle = target;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      p.seen = true;
      applyTransform();
    };

    const fire = (x, y) => {
      playGunshot();

      spriteRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-7px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 130, easing: "ease-out" }
      );
      muzzleRef.current?.animate(
        [
          { opacity: 0, transform: "scale(0.3)" },
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.6)" },
        ],
        { duration: 110, easing: "ease-out" }
      );

      if (!reduced) {
        document.getElementById("app-base")?.animate(
          [
            { transform: "translate(0, 0)" },
            { transform: `translate(${rand(-6, 6)}px, ${rand(-5, 5)}px)` },
            { transform: `translate(${rand(-4, 4)}px, ${rand(-3, 3)}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 170, easing: "ease-out" }
        );
      }

      const { dataUrl, size } = makeCrater();
      const craterId = ++idRef.current;
      setCraters((cs) => {
        const next = [...cs, { id: craterId, x, y, dataUrl, size }];
        return next.length > MAX_CRATERS ? next.slice(next.length - MAX_CRATERS) : next;
      });

      if (!reduced) {
        const bits = Array.from({ length: 7 }, () => ({
          dx: rand(-55, 55),
          dy: rand(-60, -10),
          s: 3 + ((Math.random() * 3) | 0),
        }));
        const burstId = ++idRef.current;
        setBursts((bs) => [...bs, { id: burstId, x, y, bits }]);
        setTimeout(() => setBursts((bs) => bs.filter((b) => b.id !== burstId)), DEBRIS_MS);
      }
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      fire(e.clientX, e.clientY);
    };
    const swallowClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", swallowClick, true);
    return () => {
      clearTimeout(toastTimer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", swallowClick, true);
    };
  }, [armed]);

  if (!armed && craters.length === 0) return null;

  return createPortal(
    <div className="gun-overlay" aria-hidden="true">
      {craters.map((c) => (
        <img
          key={c.id}
          className="gun-crater"
          src={c.dataUrl}
          alt=""
          style={{ left: c.x, top: c.y, width: c.size, height: c.size }}
        />
      ))}
      {bursts.map((b) => (
        <div key={b.id} className="gun-burst" style={{ left: b.x, top: b.y }}>
          {b.bits.map((bit, i) => (
            <span
              key={i}
              className="gun-debris"
              style={{ "--dx": `${bit.dx}px`, "--dy": `${bit.dy}px`, width: bit.s, height: bit.s }}
            />
          ))}
        </div>
      ))}
      {armed && (
        <div ref={followerRef} className="gun-follower" style={{ opacity: 0 }}>
          <div ref={rotorRef} className="gun-rotor">
            <Pistol ref={spriteRef} />
            <MuzzleFlash ref={muzzleRef} />
          </div>
        </div>
      )}
      {toast && <div key={toast.id} className="gun-toast">{toast.msg}</div>}
    </div>,
    document.body
  );
}
