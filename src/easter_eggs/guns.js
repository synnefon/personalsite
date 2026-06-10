// Registry of the three guns. Each sprite is a list of rectangles in grid
// units (rendered as crisp SVG pixels); `muzzle` is where shots originate and
// is pinned to the cursor. Tab cycles through these in order.

import { playGunshot, playLaserShot, playUziShot } from "./gunSound";

// Shared palette
const METAL = "#3a3f45";
const METAL_LIGHT = "#6b727a";
const DARK = "#20242a";
const MUZZLE = "#141414";
const GRIP_WOOD = "#4a3420";
const GRIP_DARK = "#23262b";
const GLOW = "#29f0e0";

const FLASH_WARM = { Y: "#ff8c1a", O: "#ffd23f", W: "#ffffff" };
const FLASH_COOL = { Y: "#0aa6c2", O: "#29f0e0", W: "#eafffd" };

export const GUNS = [
  {
    id: "pistol",
    label: "pistol",
    grid: { w: 19, h: 13 },
    pixel: 4.2,
    muzzle: { x: 19, y: 5 },
    rects: [
      { x: 4, y: 2, w: 7, h: 1, c: METAL }, // top strap
      { x: 3, y: 3, w: 2, h: 4, c: METAL }, // rear frame
      { x: 10, y: 3, w: 1, h: 1, c: METAL }, // frame at barrel join
      { x: 5, y: 3, w: 5, h: 4, c: METAL }, // cylinder
      { x: 5, y: 3, w: 5, h: 1, c: METAL_LIGHT }, // cylinder highlight
      { x: 6, y: 4, w: 1, h: 2, c: DARK }, // cylinder flute
      { x: 8, y: 4, w: 1, h: 2, c: DARK }, // cylinder flute
      { x: 5, y: 7, w: 5, h: 1, c: METAL }, // bottom strap
      { x: 10, y: 4, w: 8, h: 2, c: METAL }, // barrel
      { x: 10, y: 4, w: 7, h: 1, c: METAL_LIGHT }, // barrel highlight
      { x: 18, y: 4, w: 1, h: 2, c: MUZZLE }, // muzzle tip
      { x: 17, y: 3, w: 1, h: 1, c: DARK }, // front sight
      { x: 2, y: 1, w: 2, h: 1, c: DARK }, // hammer spur
      { x: 3, y: 2, w: 1, h: 1, c: DARK }, // hammer
      { x: 6, y: 8, w: 1, h: 1, c: DARK }, // trigger guard rear
      { x: 9, y: 8, w: 1, h: 1, c: DARK }, // trigger guard front
      { x: 6, y: 9, w: 4, h: 1, c: DARK }, // trigger guard bottom
      { x: 7, y: 8, w: 1, h: 1, c: DARK }, // trigger
      { x: 2, y: 4, w: 2, h: 3, c: GRIP_WOOD }, // grip top
      { x: 1, y: 7, w: 4, h: 2, c: GRIP_WOOD }, // grip mid
      { x: 0, y: 9, w: 4, h: 2, c: GRIP_WOOD }, // grip low
      { x: 0, y: 11, w: 3, h: 1, c: GRIP_DARK }, // butt cap
    ],
    sound: playGunshot,
    auto: false,
    recoil: 7,
    shake: 6,
    crater: "scorch",
    craterScale: 1,
    flash: FLASH_WARM,
  },
  {
    id: "uzi",
    label: "uzi",
    grid: { w: 20, h: 13 },
    pixel: 4,
    muzzle: { x: 19, y: 4 },
    rects: [
      { x: 2, y: 2, w: 13, h: 4, c: METAL }, // receiver
      { x: 3, y: 2, w: 11, h: 1, c: METAL_LIGHT }, // highlight
      { x: 14, y: 1, w: 1, h: 1, c: DARK }, // front sight
      { x: 15, y: 3, w: 4, h: 2, c: METAL }, // barrel
      { x: 18, y: 3, w: 1, h: 2, c: MUZZLE }, // muzzle tip
      { x: 7, y: 6, w: 3, h: 6, c: GRIP_DARK }, // magazine
      { x: 3, y: 6, w: 3, h: 5, c: GRIP_DARK }, // rear grip
      { x: 6, y: 6, w: 1, h: 2, c: DARK }, // trigger
    ],
    sound: playUziShot,
    auto: true,
    fireRate: 70,
    recoil: 4,
    shake: 3,
    crater: "scorch",
    craterScale: 0.6,
    flash: FLASH_WARM,
  },
  {
    id: "laser",
    label: "laser",
    grid: { w: 18, h: 12 },
    pixel: 4.2,
    muzzle: { x: 17, y: 5 },
    rects: [
      { x: 2, y: 3, w: 11, h: 4, c: METAL }, // body
      { x: 3, y: 3, w: 9, h: 1, c: METAL_LIGHT }, // highlight
      { x: 5, y: 4, w: 3, h: 2, c: GLOW }, // energy cell
      { x: 8, y: 2, w: 1, h: 1, c: DARK }, // vent
      { x: 10, y: 2, w: 1, h: 1, c: DARK }, // vent
      { x: 13, y: 4, w: 3, h: 2, c: METAL }, // emitter barrel
      { x: 16, y: 3, w: 1, h: 4, c: GLOW }, // glowing emitter tip
      { x: 3, y: 7, w: 3, h: 5, c: GRIP_DARK }, // grip
      { x: 6, y: 7, w: 1, h: 2, c: DARK }, // trigger
    ],
    sound: playLaserShot,
    auto: false,
    charge: true,
    chargeMs: 3000,
    hint: "hold to charge",
    recoil: 5,
    shake: 5,
    crater: "molten",
    craterScale: 0.9,
    flash: FLASH_COOL,
  },
];
