import { forwardRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "../styles/gun.css";
import { GUNS } from "./guns";
import { startLaserCharge } from "./gunSound";
import {
  createMoltenHole,
  isInMoltenVoid,
  makeScorchCrater,
  PIXEL,
  renderMoltenHoles,
} from "./pixelCrater";

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

const MAX_CRATERS = 500; // safety cap; craters otherwise persist until reload
const MAX_MOLTEN = 150; // bounds the molten-field redraw cost
const DEBRIS_MS = 650;

const FLASH_ART = ["..Y..", ".YOY.", "YOWOY", ".YOY.", "..Y.."];
const FLASH_PIXEL = 6;

const rand = (a, b) => a + Math.random() * (b - a);

const hasFinePointer = () =>
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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

const GunSprite = forwardRef(function GunSprite({ gun }, ref) {
  const { grid, pixel, muzzle, rects, id } = gun;
  return (
    <svg
      ref={ref}
      className={`gun-sprite gun-sprite--${id}`}
      width={grid.w * pixel}
      height={grid.h * pixel}
      viewBox={`0 0 ${grid.w} ${grid.h}`}
      shapeRendering="crispEdges"
      style={{ left: -muzzle.x * pixel, top: -muzzle.y * pixel }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
      ))}
    </svg>
  );
});

const MuzzleFlash = forwardRef(function MuzzleFlash({ palette }, ref) {
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
      {artToRects(FLASH_ART, palette)}
    </svg>
  );
});

const ICON_HEIGHT = 32; // px; gun icons in the menu share a height

function GunIcon({ gun }) {
  const { grid, rects, id } = gun;
  const pixel = ICON_HEIGHT / grid.h;
  return (
    <svg
      className={`gun-icon gun-icon--${id}`}
      width={grid.w * pixel}
      height={ICON_HEIGHT}
      viewBox={`0 0 ${grid.w} ${grid.h}`}
      shapeRendering="crispEdges"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
      ))}
    </svg>
  );
}

export default function GunCursor() {
  const [armed, setArmed] = useState(false);
  const [gunIndex, setGunIndex] = useState(0);
  const [craters, setCraters] = useState([]);
  const [moltenHoles, setMoltenHoles] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [toast, setToast] = useState(null);

  const armedRef = useRef(false);
  const moltenCanvasRef = useRef(null);
  const moltenHolesRef = useRef([]);
  const followerRef = useRef(null);
  const rotorRef = useRef(null);
  const spriteRef = useRef(null);
  const muzzleRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0, angle: 0 });
  const idRef = useRef(0);
  const autoTimerRef = useRef(null);
  const chargeRef = useRef({ active: false, start: 0, sound: null, raf: 0 });
  const chargeIndicatorRef = useRef(null);

  const gun = GUNS[gunIndex];

  // Konami to toggle, Escape to holster, Tab to switch guns. Attached once.
  useEffect(() => {
    if (!hasFinePointer()) return;
    let idx = 0;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArmed(false);
        return;
      }
      if (e.key === "Tab" && armedRef.current) {
        e.preventDefault();
        setGunIndex((i) => (i + 1) % GUNS.length);
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

  // Mirror armed state to a ref and toggle the cursor-hiding body class
  useEffect(() => {
    armedRef.current = armed;
    document.body.classList.toggle("gun-armed", armed);
    return () => document.body.classList.remove("gun-armed");
  }, [armed]);

  // Repaint the shared molten-hole canvas whenever the set of holes changes (or
  // the viewport resizes). All live holes share one surface so that overlapping
  // ones merge into a single cavity. The canvas backing store is at cell
  // resolution and CSS-scaled up by PIXEL to keep the crisp pixel look.
  useEffect(() => {
    moltenHolesRef.current = moltenHoles;
    const canvas = moltenCanvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const cols = Math.max(1, Math.ceil(window.innerWidth / PIXEL));
      const rows = Math.max(1, Math.ceil(window.innerHeight / PIXEL));
      if (canvas.width !== cols) canvas.width = cols;
      if (canvas.height !== rows) canvas.height = rows;
      canvas.style.width = `${cols * PIXEL}px`;
      canvas.style.height = `${rows * PIXEL}px`;
      const holes = moltenHoles.map((h) => ({
        cx: h.x / PIXEL,
        cy: h.y / PIXEL,
        r: h.r,
        lobes: h.lobes,
        drips: h.drips,
      }));
      renderMoltenHoles(canvas.getContext("2d"), holes, cols, rows);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [moltenHoles]);

  // Aim, fire, click interception. Re-binds when the active gun changes.
  useEffect(() => {
    if (!armed) return;
    const reduced = prefersReducedMotion();

    setToast({ id: ++idRef.current, msg: `🔫 ${gun.label}${gun.hint ? ` · ${gun.hint}` : ""}` });
    const toastTimer = setTimeout(() => setToast(null), 1500);

    const applyTransform = () => {
      const p = posRef.current;
      const follower = followerRef.current;
      const rotor = rotorRef.current;
      if (!follower || !rotor) return;
      follower.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      follower.style.opacity = "1";
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
      applyTransform();
    };

    const chargeMs = gun.chargeMs || 3000;

    // A shot landing in the black center of an existing molten hole passes
    // straight through it — no new decal, no debris, and the hole is unchanged.
    const inMoltenVoid = (x, y) => {
      const holes = moltenHolesRef.current;
      if (holes.length === 0) return false;
      const cells = holes.map((h) => ({
        cx: h.x / PIXEL,
        cy: h.y / PIXEL,
        r: h.r,
        lobes: h.lobes,
      }));
      return isInMoltenVoid(cells, x / PIXEL, y / PIXEL);
    };

    // power is 0..1 for a charge gun (how charged), else 1
    const fire = (x, y, power = 1) => {
      if (gun.charge) gun.sound(power);
      else gun.sound();

      const recoil = gun.recoil * (gun.charge ? 0.4 + power * 1.6 : 1);
      spriteRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(-${recoil}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 130, easing: "ease-out" }
      );

      const flashScale = gun.charge ? 0.6 + power * 1.8 : 1;
      muzzleRef.current?.animate(
        [
          { opacity: 0, transform: "scale(0.3)" },
          { opacity: 1, transform: `scale(${flashScale})` },
          { opacity: 0, transform: `scale(${flashScale * 0.6})` },
        ],
        { duration: 110 + power * 120, easing: "ease-out" }
      );

      if (!reduced) {
        // Bigger shots (more charge) shake harder AND longer. Frames scale with
        // duration to keep a roughly constant rattle frequency, and decay toward
        // the end so the screen settles instead of snapping back.
        const intensity = gun.charge ? 0.5 + power * 2.5 : 1;
        const a = gun.shake * intensity;
        const duration = 170 * intensity;
        const steps = Math.max(3, Math.round(duration / 45));
        const frames = [{ transform: "translate(0, 0)" }];
        for (let i = 1; i < steps; i++) {
          const decay = 1 - i / steps;
          frames.push({
            transform: `translate(${rand(-a, a) * decay}px, ${rand(-a, a) * decay}px)`,
          });
        }
        frames.push({ transform: "translate(0, 0)" });
        document.getElementById("app-base")?.animate(frames, {
          duration,
          easing: "ease-out",
        });
      }

      // The trigger still fired (sound/recoil/flash above), but there's nothing
      // to crater or kick up when shooting into an existing hole.
      if (inMoltenVoid(x, y)) return;

      const craterScale = gun.charge ? 0.6 + power * 3.4 : gun.craterScale;
      const id = ++idRef.current;
      if (gun.crater === "molten") {
        const hole = createMoltenHole(craterScale);
        setMoltenHoles((hs) => {
          const next = [...hs, { id, x, y, ...hole }];
          return next.length > MAX_MOLTEN ? next.slice(next.length - MAX_MOLTEN) : next;
        });
      } else {
        const crater = makeScorchCrater(craterScale);
        setCraters((cs) => {
          const next = [...cs, { id, x, y, ...crater }];
          return next.length > MAX_CRATERS ? next.slice(next.length - MAX_CRATERS) : next;
        });
      }

      if (!reduced) {
        const count = Math.round(7 + (gun.charge ? power * 16 : 0));
        const spread = 55 * (gun.charge ? 0.6 + power * 1.8 : 1);
        const bits = Array.from({ length: count }, () => ({
          dx: rand(-spread, spread),
          dy: rand(-spread - 5, -10),
          s: 3 + ((Math.random() * 3) | 0),
        }));
        const burstId = ++idRef.current;
        setBursts((bs) => [...bs, { id: burstId, x, y, bits }]);
        setTimeout(() => setBursts((bs) => bs.filter((b) => b.id !== burstId)), DEBRIS_MS);
      }
    };

    const stopAuto = () => {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    };

    const startCharge = () => {
      const cs = chargeRef.current;
      if (cs.active) return;
      cs.active = true;
      cs.start = performance.now();
      cs.sound = startLaserCharge(chargeMs);
      const tick = () => {
        const c = chargeRef.current;
        if (!c.active) return;
        const level = Math.min((performance.now() - c.start) / chargeMs, 1);
        const el = chargeIndicatorRef.current;
        if (el) {
          el.style.opacity = String(0.35 + level * 0.65);
          el.style.transform = `translate(-50%, -50%) scale(${0.25 + level * 1.4})`;
        }
        c.raf = requestAnimationFrame(tick);
      };
      cs.raf = requestAnimationFrame(tick);
    };

    // Ends charging, returns the charge level (0..1), or null if not charging
    const teardownCharge = () => {
      const cs = chargeRef.current;
      if (!cs.active) return null;
      cs.active = false;
      cancelAnimationFrame(cs.raf);
      const level = Math.min((performance.now() - cs.start) / chargeMs, 1);
      cs.sound?.stop();
      cs.sound = null;
      const el = chargeIndicatorRef.current;
      if (el) {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%, -50%) scale(0)";
      }
      return level;
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (gun.charge) {
        startCharge();
        return;
      }
      fire(e.clientX, e.clientY);
      if (gun.auto) {
        stopAuto();
        autoTimerRef.current = setInterval(
          () => fire(posRef.current.x, posRef.current.y),
          gun.fireRate
        );
      }
    };

    const onPointerUp = () => {
      stopAuto();
      const level = teardownCharge();
      if (level !== null) fire(posRef.current.x, posRef.current.y, level);
    };

    const onCancel = () => {
      stopAuto();
      teardownCharge();
    };

    const swallowClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("blur", onCancel);
    window.addEventListener("click", swallowClick, true);
    return () => {
      clearTimeout(toastTimer);
      onCancel();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("click", swallowClick, true);
    };
  }, [armed, gun]);

  if (!armed && craters.length === 0 && moltenHoles.length === 0) return null;

  return createPortal(
    <div className="gun-overlay" aria-hidden="true">
      {craters.map((c) => (
        <img
          key={c.id}
          className="gun-crater"
          src={c.dataUrl}
          alt=""
          style={{
            left: c.x,
            top: c.y,
            width: c.w,
            height: c.h,
            transform: `translate(${-c.ox * 100}%, ${-c.oy * 100}%)`,
          }}
        />
      ))}
      {/* Above the scorch marks so a laser hole punches through and covers
          them; below debris/sprite/menu, which sit on top of everything. */}
      <canvas ref={moltenCanvasRef} className="gun-molten" />
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
          {gun.charge && <div ref={chargeIndicatorRef} className="gun-charge" />}
          <div ref={rotorRef} className="gun-rotor">
            <GunSprite ref={spriteRef} gun={gun} />
            <MuzzleFlash ref={muzzleRef} palette={gun.flash} />
          </div>
        </div>
      )}
      {armed && (
        <div className="gun-menu">
          <div className="gun-menu-title">arsenal</div>
          {GUNS.map((g, i) => (
            <div
              key={g.id}
              className={`gun-menu-row${i === gunIndex ? " is-selected" : ""}`}
            >
              <span className="gun-menu-marker">{i === gunIndex ? "▸" : ""}</span>
              <span className="gun-menu-label">{g.label}</span>
              <span className="gun-menu-icon">
                <GunIcon gun={g} />
              </span>
            </div>
          ))}
          <div className="gun-menu-note">↹ tab to switch · esc to holster</div>
        </div>
      )}
      {toast && <div key={toast.id} className="gun-toast">{toast.msg}</div>}
    </div>,
    document.body
  );
}
