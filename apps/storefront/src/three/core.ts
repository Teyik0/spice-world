// Shared 3D core ported from the B prototypes (proposals-refs/_src/core.js):
// photoreal jar, generated label, DOF powder, cinematic post. Browser-only,
// loaded with a dynamic import, never on the critical path.
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import * as THREE from "three";

import type { Look } from "../lib/spice";
import { THEME } from "../lib/theme";

export const REDUCED = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export const narrow = () => innerWidth < 760;
export const smooth = THREE.MathUtils.smoothstep;
/** The carousel's light fog, also the "jour" product page backdrop. */
export const FOG_DAY = 0xd8_d3_cb;
const day = THEME === "jour";
/**
 * The product page's opening frame, relative to the jar's base. The carousel flies
 * its jar into exactly this framing before navigating, so the jar never "swaps".
 */
export const HANDOFF = {
  fov: 30,
  eye: (nar: boolean) => new THREE.Vector3(0, 1.1, nar ? 7.4 : 4.8),
  look: new THREE.Vector3(0, 0.75, 0),
  /** viewport fraction the jar is moved left (desktop: left column) or up (mobile) */
  shift: (nar: boolean): [number, number] => (nar ? [0, 0.2] : [0.22, 0]),
  /** product page backdrop for a spice's colour world */
  bg: (band: string) =>
    day
      ? new THREE.Color(FOG_DAY).lerp(new THREE.Color(band), 0.06)
      : new THREE.Color(0x16_13_0f),
  density: day ? 0.04 : 0.06,
};
/** Off-centres the render (keeps perspective): content moves left by sx·w and up by sy·h. */
export function shiftView(
  cam: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (sx || sy) {
    cam.setViewOffset(w, h, sx * w, sy * h, w, h);
  } else {
    cam.clearViewOffset();
  }
}
/** Tiny time-based tween (replaces GSAP for the few non-scroll animations). */
export const tween = (ms: number, step: (k: number) => void) =>
  new Promise<void>((done) => {
    const t0 = performance.now();
    const ease = (t: number) =>
      t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const tick = (now: number) => {
      const t = REDUCED() ? 1 : Math.min(1, (now - t0) / ms);
      step(ease(t));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        done();
      }
    };
    requestAnimationFrame(tick);
  });

export const loadTex = (url: string | null | undefined) =>
  new Promise<THREE.Texture | null>((res) => {
    if (!url) {
      return res(null);
    }
    new THREE.TextureLoader().setCrossOrigin("anonymous").load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        res(t);
      },
      undefined,
      () => res(null),
    );
  });

export const fontsReady = () =>
  Promise.all(
    [
      '400 40px "Anton"',
      '500 40px "Bodoni Moda"',
      'italic 400 40px "Bodoni Moda"',
      '400 20px "Martian Mono"',
    ].map((f) => document.fonts.load(f)),
  ).catch(() => undefined);

// ── Label: the brand lives on the packaging ────────────────────────────────
type Ctx = CanvasRenderingContext2D;
// biome-ignore-start lint/suspicious/noBitwiseOperators: 32-bit LCG for stable label patterns
const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
};
// biome-ignore-end lint/suspicious/noBitwiseOperators: see above
function leaf(
  c: Ctx,
  x: number,
  y: number,
  len: number,
  w: number,
  ang: number,
) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.45, -w, len, 0);
  c.quadraticCurveTo(len * 0.45, w, 0, 0);
  c.fill();
  c.restore();
}
type Illu = (c: Ctx, r: () => number, P: Look["palette"]) => void;
const ILLU: Record<string, Illu> = {
  paprika(c, r, P) {
    for (let i = 0; i < 9; i += 1) {
      const x = 80 + i * 240 + r() * 60;
      const L = 170 + r() * 90;
      c.fillStyle = i % 2 ? P.tone : P.tone2;
      c.save();
      c.translate(x, 70 + r() * 200);
      c.rotate(-0.6 + r() * 1.2);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(L * 0.25, -38, L * 0.8, -30, L, 10);
      c.bezierCurveTo(L * 0.7, 22, L * 0.3, 40, 0, 26);
      c.closePath();
      c.fill();
      c.fillStyle = P.band;
      c.fillRect(-26, -2, 30, 22);
      c.restore();
    }
  },
  poivre(c, r, P) {
    for (let i = 0; i < 9; i += 1) {
      const x = 60 + i * 235 + r() * 50;
      const y = 40 + r() * 140;
      const a = 1.2 + r() * 0.6;
      c.fillStyle = P.tone;
      leaf(c, x, y, 230, 85, a - 0.9);
      c.fillStyle = P.tone2;
      c.save();
      c.translate(x + 30, y + 20);
      c.rotate(a - 1.57);
      for (let k = 0; k < 14; k += 1) {
        c.beginPath();
        c.arc((k % 2) * 16 - 8, k * 15, 13 - k * 0.35, 0, 7);
        c.fill();
      }
      c.restore();
    }
  },
  safran(c, r, P) {
    for (let i = 0; i < 8; i += 1) {
      const s = 0.8 + r() * 0.4;
      c.save();
      c.translate(130 + i * 260 + r() * 40, 160 + r() * 90);
      c.scale(s, s);
      c.fillStyle = P.tone;
      for (let k = 0; k < 6; k += 1) {
        leaf(c, 0, 0, 150, 52, -Math.PI / 2 + (k - 2.5) * 0.36);
      }
      c.strokeStyle = P.tone2;
      c.lineWidth = 7;
      c.lineCap = "round";
      for (let k = 0; k < 3; k += 1) {
        c.beginPath();
        c.moveTo(0, 10);
        c.quadraticCurveTo((k - 1) * 40, -60, (k - 1) * 70, -170);
        c.stroke();
      }
      c.fillRect(-5, 0, 10, 260);
      c.restore();
    }
  },
  curcuma(c, r, P) {
    for (let i = 0; i < 7; i += 1) {
      const x = 90 + i * 300 + r() * 50;
      const y = 230 + r() * 60;
      c.fillStyle = P.tone;
      leaf(c, x, y, 300, 70, -1.3 - r() * 0.4);
      leaf(c, x, y, 260, 60, -1.9 + r() * 0.3);
      c.fillStyle = P.tone2;
      for (let k = 0; k < 4; k += 1) {
        c.beginPath();
        c.ellipse(
          x + k * 34 - 50,
          y + 20 + (k % 2) * 16,
          54,
          22,
          -0.5 + k * 0.35,
          0,
          7,
        );
        c.fill();
      }
    }
  },
  cumin(c, _r, P) {
    c.lineWidth = 6;
    for (let i = 0; i < 8; i += 1) {
      const x = 110 + i * 260;
      for (let k = 0; k < 9; k += 1) {
        const a = -Math.PI / 2 + (k - 4) * 0.2;
        const ex = x + Math.cos(a) * 200;
        const ey = 300 + Math.sin(a) * 200;
        c.strokeStyle = P.tone;
        c.beginPath();
        c.moveTo(x, 300);
        c.lineTo(ex, ey);
        c.stroke();
        c.fillStyle = k % 2 ? P.tone2 : P.tone;
        c.beginPath();
        c.ellipse(ex, ey, 18, 8, a, 0, 7);
        c.fill();
      }
    }
  },
  cannelle(c, r, P) {
    for (let i = 0; i < 8; i += 1) {
      const x = 90 + i * 260 + r() * 40;
      const y = 70 + r() * 180;
      c.save();
      c.translate(x, y);
      c.rotate(-0.4 + r() * 0.8);
      c.fillStyle = P.tone2;
      c.fillRect(0, -26, 240, 52);
      c.fillStyle = P.tone;
      c.fillRect(0, -26, 240, 12);
      c.strokeStyle = P.band;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, 24, 0, 7);
      c.stroke();
      c.restore();
      c.fillStyle = P.tone;
      leaf(c, x + 120, y + 60, 150, 50, 0.7 + r());
    }
  },
  // Unknown products: a neutral botanical sprig pattern, no claim about the contents.
  generic(c, r, P) {
    for (let i = 0; i < 10; i += 1) {
      const x = 60 + i * 210 + r() * 40;
      const y = 120 + r() * 140;
      for (let k = 0; k < 5; k += 1) {
        c.fillStyle = k % 2 ? P.tone2 : P.tone;
        leaf(c, x, y, 120 + r() * 60, 34, -2.6 + k * 0.55);
      }
    }
  },
};

function makeLabelTexture(look: Look, anisotropy: number) {
  const W = 2048;
  const H = 720;
  const k = narrow() ? 0.5 : 1;
  const cv = document.createElement("canvas");
  cv.width = W * k;
  cv.height = H * k;
  const c = cv.getContext("2d") as Ctx;
  const P = look.palette;
  const { facts } = look;
  const split = 300;
  c.scale(k, k);
  c.fillStyle = P.paper;
  c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath();
  c.rect(0, 0, W, split + 60);
  c.clip();
  c.globalAlpha = 0.9;
  (ILLU[facts?.palette ?? "generic"] ?? ILLU.generic)(
    c,
    rnd(look.word.length * 997 + 13),
    P,
  );
  c.restore();
  // colour band with an organic top edge
  c.fillStyle = P.band;
  c.beginPath();
  c.moveTo(0, split + 40);
  for (let x = 0; x <= W; x += 64) {
    c.lineTo(x, split + 30 + Math.sin(x * 0.006 + 1.3) * 18);
  }
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  // wordmark
  c.textAlign = "center";
  c.fillStyle = P.paper;
  c.globalAlpha = 0.86;
  c.fillRect(W / 2 - 300, 70, 600, 150);
  c.globalAlpha = 1;
  c.fillStyle = P.band;
  c.font = '500 74px "Bodoni Moda"';
  c.letterSpacing = "14px";
  c.fillText("SPICE WORLD", W / 2 + 7, 160);
  c.font = '400 22px "Martian Mono", monospace';
  c.letterSpacing = "8px";
  c.fillText("MAISON D’ÉPICES", W / 2 + 4, 200);
  // product name, shrunk to fit the front panel
  c.letterSpacing = "0px";
  c.fillStyle = P.ink;
  let fs = 300;
  do {
    c.font = `400 ${fs}px "Anton"`;
    fs -= 8;
  } while (c.measureText(look.word).width > 760 && fs > 60);
  c.fillText(look.word, W / 2, split + 60 + fs * 0.92);
  c.font = 'italic 400 64px "Bodoni Moda"';
  let { sub } = look;
  while (sub.length > 4 && c.measureText(sub).width > 900) {
    sub = `${sub.slice(0, -5).trimEnd()}…`;
  }
  c.fillText(sub, W / 2, H - 70);
  // side panels wrap round the jar (only facts we know)
  c.textAlign = "left";
  c.font = '400 21px "Martian Mono", monospace';
  c.letterSpacing = "2px";
  c.globalAlpha = 0.85;
  const side = (x: number, lines: string[]) =>
    lines.forEach((l, i) => {
      c.fillText(l, x, split + 120 + i * 36);
    });
  if (facts) {
    side(250, [
      facts.latin.toUpperCase(),
      "",
      facts.part.toUpperCase().slice(0, 30),
    ]);
    c.textAlign = "center";
    c.font = '400 20px "Martian Mono", monospace';
    c.fillText(facts.latin.toUpperCase(), W / 2, H - 26);
    c.textAlign = "left";
    c.font = '400 21px "Martian Mono", monospace';
  }
  side(1560, [
    ...(facts ? ["MOLÉCULE CLÉ", facts.molecule.toUpperCase(), ""] : []),
    "CONSERVER À L’ABRI",
    "DE LA LUMIÈRE ET",
    "DE L’HUMIDITÉ",
  ]);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// Cap top: embossed ring text + monogram (bump + roughness).
function makeCapTopTexture() {
  const S = 1024;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const c = cv.getContext("2d") as Ctx;
  c.fillStyle = "#808080";
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i += 1) {
    c.strokeStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)";
    c.beginPath();
    c.arc(S / 2, S / 2, i * 2.2, 0, 7);
    c.stroke();
  }
  c.fillStyle = "#c8c8c8";
  c.font = '500 64px "Bodoni Moda"';
  c.textAlign = "center";
  c.textBaseline = "middle";
  const txt = [
    ..."SPICE WORLD · MAISON D’ÉPICES · SPICE WORLD · MAISON D’ÉPICES · ",
  ];
  c.save();
  c.translate(S / 2, S / 2);
  txt.forEach((ch, i) => {
    c.save();
    c.rotate((i / txt.length) * Math.PI * 2);
    c.fillText(ch, 0, -S * 0.36);
    c.restore();
  });
  c.restore();
  c.font = 'italic 500 180px "Bodoni Moda"';
  c.fillText("Sw", S / 2, S / 2 + 6);
  c.lineWidth = 6;
  c.strokeStyle = "#c8c8c8";
  c.beginPath();
  c.arc(S / 2, S / 2, S * 0.29, 0, 7);
  c.stroke();
  return new THREE.CanvasTexture(cv);
}
function makeKnurlTexture() {
  const data = new Uint8Array(1024 * 4);
  for (let x = 0; x < 1024; x += 1) {
    data.set(
      [128 + Math.cos((x / 1024) * Math.PI * 2 * 160) * 90, 128, 230, 255],
      x * 4,
    );
  }
  const t = new THREE.DataTexture(data, 1024, 1);
  t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function radialTex() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext("2d") as Ctx;
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,.55)");
  g.addColorStop(0.45, "rgba(0,0,0,.27)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

// ── Photoreal jar: thick lathe glass (transmission, IOR 1.5), spice fill
// textured with the product photo, varnished paper label, knurled metal cap.
export const JAR = {
  R: 0.5,
  Rn: 0.44,
  t: 0.024,
  base: 0.085,
  Hs: 1.06,
  neck: 1.31,
  capY: 1.15,
  capH: 0.23,
};
function jarProfile() {
  const { R, Rn, t, base, Hs, neck } = JAR;
  const P: THREE.Vector2[] = [];
  const v = (x: number, y: number) => P.push(new THREE.Vector2(x, y));
  const arc = (
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    n = 8,
  ) => {
    for (let i = 1; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      v(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  v(0.0001, 0.004);
  v(R - 0.08, 0);
  arc(R - 0.06, 0.06, 0.06, -Math.PI / 2, 0, 10);
  v(R, Hs);
  arc(R - 0.07, Hs, 0.07, 0, (Math.PI / 2) * 0.86, 10);
  v(Rn, Hs + 0.1);
  v(Rn, neck - 0.01);
  arc(Rn - t / 2, neck - 0.01, t / 2, 0, Math.PI, 8);
  v(Rn - t, Hs + 0.09);
  arc(R - 0.07, Hs, 0.07 - t, (Math.PI / 2) * 0.86, 0, 10);
  v(R - t, base + 0.04);
  arc(R - t - 0.04, base + 0.04, 0.04, 0, -Math.PI / 2, 8);
  v(0.0001, base);
  return P;
}
let shared:
  | { knurl: THREE.Texture; capTop: THREE.Texture; shadow: THREE.Texture }
  | undefined;
export interface Jar extends THREE.Group {
  userData: { cap: THREE.Group; height: number; index: number };
}
export function buildJar(
  look: Look,
  {
    renderer,
    photo,
    env,
  }: {
    renderer: THREE.WebGLRenderer;
    photo: THREE.Texture | null;
    env: THREE.Texture;
  },
  opt: {
    capColor: string;
    capRough: number;
    shadow: number;
    index?: number;
    /** Plain transparent glass: skips three's per-frame transmission pass (carousel). */
    fastGlass?: boolean;
  },
): Jar {
  const { R, t, base, capY, capH, Rn } = JAR;
  const g = new THREE.Group() as Jar;
  shared ??= {
    knurl: makeKnurlTexture(),
    capTop: makeCapTopTexture(),
    shadow: radialTex(),
  };
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(jarProfile(), 128),
    new THREE.MeshPhysicalMaterial(
      opt.fastGlass
        ? {
            color: "#e4efe9",
            envMapIntensity: 1.25,
            ior: 1.5,
            roughness: 0.03,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
          }
        : {
            attenuationColor: new THREE.Color("#e4efe9"),
            attenuationDistance: 0.9,
            envMapIntensity: 1.25,
            ior: 1.5,
            roughness: 0.03,
            thickness: 0.06,
            transmission: 1,
          },
    ),
  );
  glass.renderOrder = 2;
  g.add(glass);
  // spice fill: product photo, mirrored to hide seams, plus a lumpy mound
  const Ri = R - t - 0.005;
  let fillMat: THREE.MeshStandardMaterial;
  if (photo) {
    photo.wrapS = THREE.MirroredRepeatWrapping;
    photo.wrapT = THREE.MirroredRepeatWrapping;
    const side = photo.clone();
    side.repeat.set(3, 1.35);
    side.needsUpdate = true;
    fillMat = new THREE.MeshStandardMaterial({
      map: side,
      bumpMap: side,
      bumpScale: 2.2,
      roughness: 0.92,
      envMapIntensity: 0.7,
    });
  } else {
    fillMat = new THREE.MeshStandardMaterial({
      color: look.palette.glow,
      roughness: 1,
    });
  }
  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(Ri, Ri - 0.012, 1 - base, 96, 1, true),
    fillMat,
  );
  fill.position.y = base + (1 - base) / 2;
  g.add(fill);
  const domeGeo = new THREE.SphereGeometry(
    Ri,
    96,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const pa = domeGeo.attributes.position;
  const rr = rnd(look.word.length * 31);
  const bumps = Array.from({ length: 7 }, () => [
    rr() * 2 - 1,
    rr() * 2 - 1,
    0.008 + rr() * 0.018,
  ]);
  for (let i = 0; i < pa.count; i += 1) {
    const x = pa.getX(i);
    const z = pa.getZ(i);
    let y = pa.getY(i) * 0.07;
    for (const [bx, bz, h] of bumps) {
      y += h * Math.exp(-((x - bx * 0.3) ** 2 + (z - bz * 0.3) ** 2) * 18);
    }
    pa.setY(i, y);
  }
  domeGeo.computeVertexNormals();
  const topMat = fillMat.clone();
  if (photo) {
    topMat.map = photo.clone();
    topMat.map.repeat.set(1.4, 1.4);
    topMat.map.needsUpdate = true;
    topMat.bumpMap = topMat.map;
  }
  const dome = new THREE.Mesh(domeGeo, topMat);
  dome.position.y = 1;
  g.add(dome);
  // label (front: printed paper; back: plain paper seen through the glass)
  const L = 3.5;
  const lh = 0.6;
  const labGeo = new THREE.CylinderGeometry(
    R + 0.0035,
    R + 0.0035,
    lh,
    160,
    1,
    true,
    -L / 2,
    L,
  );
  const lab = new THREE.Mesh(
    labGeo,
    new THREE.MeshPhysicalMaterial({
      map: makeLabelTexture(look, renderer.capabilities.getMaxAnisotropy()),
      roughness: 0.62,
      clearcoat: 0.35,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.9,
    }),
  );
  const labBack = new THREE.Mesh(
    labGeo,
    new THREE.MeshStandardMaterial({
      color: look.palette.paper,
      roughness: 0.95,
      side: THREE.BackSide,
    }),
  );
  lab.position.y = 0.24 + lh / 2;
  labBack.position.y = lab.position.y;
  g.add(lab, labBack);
  // knurled metal cap with an embossed top
  const cap = new THREE.Group();
  cap.position.y = capY;
  g.add(cap);
  const capColor = new THREE.Color(opt.capColor);
  const metal = new THREE.MeshPhysicalMaterial({
    color: capColor,
    metalness: 1,
    roughness: opt.capRough,
    normalMap: shared.knurl,
    normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 1.3,
    clearcoat: 0.2,
  });
  const Rc = Rn + 0.036;
  const capSide = new THREE.Mesh(
    new THREE.CylinderGeometry(Rc, Rc, capH - 0.04, 160, 1, true),
    metal,
  );
  capSide.position.y = (capH - 0.04) / 2;
  const tp: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const a = ((Math.PI / 2) * i) / 10;
    tp.push(
      new THREE.Vector2(
        Rc - 0.04 + 0.04 * Math.cos(a),
        capH - 0.04 + 0.04 * Math.sin(a),
      ),
    );
  }
  tp.push(new THREE.Vector2(0.0001, capH));
  const rim = new THREE.Mesh(
    new THREE.LatheGeometry(tp, 160),
    new THREE.MeshPhysicalMaterial({
      color: capColor,
      metalness: 1,
      roughness: opt.capRough * 0.8,
      envMapIntensity: 1.3,
    }),
  );
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(Rc - 0.04, 96),
    new THREE.MeshPhysicalMaterial({
      color: capColor,
      metalness: 1,
      roughness: 0.22,
      roughnessMap: shared.capTop,
      bumpMap: shared.capTop,
      bumpScale: 1.2,
      envMapIntensity: 1.3,
    }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = capH + 0.0005;
  const ring = new THREE.Mesh(new THREE.RingGeometry(Rn - 0.01, Rc, 96), metal);
  ring.rotation.x = Math.PI / 2;
  cap.add(capSide, rim, top, ring);
  if (opt.shadow) {
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: shared.shadow,
        transparent: true,
        depthWrite: false,
        opacity: opt.shadow,
      }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.002;
    g.add(sh);
  }
  g.userData = { cap, height: capY + capH, index: opt.index ?? 0 };
  g.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      o.material instanceof THREE.MeshStandardMaterial
    ) {
      o.material.envMap = env;
    }
  });
  return g;
}

// ── Powder (Resn-style DOF points, depth-sorted, soft, optional helix target)
const POWDER_VS = /* glsl */ `
attribute float aSize; attribute float aSeed; attribute vec3 aColor; attribute vec3 aTarget;
uniform float uTime, uScale, uFocus, uAperture, uDrift, uMaxBlur, uSpread, uRise, uMorph, uTwist, uFogDensity; uniform vec3 uOrigin;
uniform float uEmit, uRate, uHeight, uWidth, uMouthR;
varying vec3 vColor; varying float vAlpha; varying float vBlur; varying float vViewZ; varying float vFog;
float vLife;
float h1(float n){ return fract(sin(n) * 43758.5453); }
// Plume from the jar mouth: each grain loops on its own lifetime, but is only born
// during gusts (sampled at its birth time), so the powder leaves in irregular puffs.
// position holds three random numbers in [0,1).
vec3 plume(vec3 r, float s){
  float life = 2.2 + r.x * 2.6;
  float tb = uTime / life + s * 9.0;
  float cyc = floor(tb); float a = fract(tb);
  float born = (cyc - s * 9.0) * life;
  float gust = pow(0.5 + 0.5 * sin(born * 1.7 + sin(born * 0.61) * 2.3 + sin(born * 0.23) * 3.0), 1.4);
  vLife = step(h1(cyc * 17.13 + s * 311.7), gust * uRate) * smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.5, 1.0, a));
  float heavy = step(0.82, r.z);
  float h = uHeight * (a * (0.55 + 0.6 * r.x) - heavy * a * a * 0.9);
  float ang = r.y * 6.2832 + a * (r.z - 0.5) * 2.0;
  float rad = sqrt(r.z) * uMouthR + pow(a, 1.4) * uWidth * (0.35 + 0.65 * r.x);
  vec3 p = vec3(cos(ang) * rad, h, sin(ang) * rad);
  float tt = uTime * 0.7;
  // the whole column sways like a breath of air, eddies grow as the grains rise
  float sway = sin(tt * 0.55 + h * 0.9) + 0.5 * sin(tt * 1.3 - h * 2.1);
  p.x += sway * 0.09 * h + (sin(h * 2.3 + tt + s * 17.0) * 0.12 + sin(h * 6.1 - tt * 1.9 + s * 7.0) * 0.05) * a;
  p.z += cos(tt * 0.4 + h * 0.7) * 0.05 * h + cos(h * 1.9 - tt * 1.1 + s * 13.0) * 0.12 * a;
  return uOrigin + p;
}
vec3 drift(vec3 p, float s){
  float t = uTime * (0.15 + s * 0.2);
  return vec3(sin(t + s*40.0 + p.y*1.7), cos(t*0.8 + s*23.0 + p.x*1.3), sin(t*0.9 + s*11.0 + p.z*1.5)) * uDrift;
}
void main(){
  vLife = 1.0;
  vec3 p;
  if (uEmit > 0.5) {
    p = plume(position, aSeed);
  } else {
    p = uOrigin + (position - uOrigin) * mix(1.0, uSpread, aSeed * 0.6 + 0.4) + drift(position, aSeed) * (0.5 + uSpread * 0.5);
    p.y += uRise * (0.4 + aSeed);
  }
  float m = smoothstep(aSeed * 0.45, aSeed * 0.45 + 0.55, uMorph);
  float ca = cos(uTwist), sa = sin(uTwist); vec3 tg = vec3(aTarget.x * ca - aTarget.z * sa, aTarget.y, aTarget.x * sa + aTarget.z * ca);
  p = mix(p, tg + drift(aTarget, aSeed) * 0.35, m);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z; vViewZ = d;
  float coc = min(abs(d - uFocus) * uAperture, uMaxBlur);
  float px = aSize * uScale / d;
  float sz = px + coc * 26.0;
  gl_PointSize = clamp(sz, 1.0, 180.0);
  vBlur = clamp(coc * 26.0 / max(sz, 1.0), 0.0, 1.0);
  vAlpha = clamp(px * px / (sz * sz), 0.015, 1.0) * clamp(px * 1.4, 0.0, 1.0) * mix(vLife, 1.0, m);
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
const DEPTH_GLSL = /* glsl */ `uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
float viewZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }`;
const POWDER_FS = /* glsl */ `
precision highp float;
${DEPTH_GLSL}
uniform float uOpacity; uniform vec3 uFogColor, uLight;
varying vec3 vColor; varying float vAlpha; varying float vBlur; varying float vViewZ; varying float vFog;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
  float a = exp(-r2 * mix(3.2, 1.6, vBlur) * 1.6) * (1.0 - r2);
  vec3 n = normalize(vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - r2))));
  vec3 col = mix(vColor * mix(0.55 + 0.6 * max(dot(n, uLight), 0.0), 1.0, vBlur), uFogColor, vFog);
  float alpha = a * vAlpha * uOpacity;
  alpha *= smoothstep(0.0, 0.12, viewZ(texture2D(uDepth, gl_FragCoord.xy / uRes).r) - vViewZ);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(col, alpha);
}`;
type Spawn = (v: THREE.Vector3, i: number, r: () => number) => void;
export interface Powder extends THREE.Points<
  THREE.BufferGeometry,
  THREE.ShaderMaterial
> {
  userData: { focus?: number; sort: (cam: THREE.Camera) => void };
}
export function makePowder(o: {
  count: number;
  spawn: Spawn;
  colors: string[];
  size: [number, number];
  drift: number;
  opacity?: number;
  target?: Spawn;
  additive?: boolean;
  /** Back-to-front sorting; ambient dust does not need it. */
  sorted?: boolean;
  /** Procedural plume from `uOrigin` (spawn must then write three randoms in [0,1)). */
  emit?: boolean;
}): Powder {
  const { count } = o;
  const pos = new Float32Array(count * 3);
  const tgt = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const cs = o.colors.map((c) => new THREE.Color(c));
  const v = new THREE.Vector3();
  const r = Math.random;
  for (let i = 0; i < count; i += 1) {
    o.spawn(v, i, r);
    pos.set([v.x, v.y, v.z], i * 3);
    sizes[i] = o.size[0] + (o.size[1] - o.size[0]) * r() ** 5; // mostly fine, few coarse
    seeds[i] = r();
    const c = cs[Math.floor(r() * cs.length)]
      .clone()
      .multiplyScalar(0.75 + r() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
    if (o.target) {
      o.target(v, i, r);
      tgt.set([v.x, v.y, v.z], i * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aTarget", new THREE.BufferAttribute(tgt, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  const idx = new Uint32Array(count).map((_, i) => i);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const u = (value: unknown) => ({ value });
  const mat = new THREE.ShaderMaterial({
    vertexShader: POWDER_VS,
    fragmentShader: POWDER_FS,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: u(0),
      uMorph: u(0),
      uTwist: u(0),
      uSpread: u(1),
      uRise: u(0),
      uOrigin: u(new THREE.Vector3()),
      uScale: u(800),
      uFocus: u(6),
      uAperture: u(0.35),
      uDrift: u(o.drift),
      uEmit: u(o.emit ? 1 : 0),
      uRate: u(0),
      uHeight: u(0),
      uWidth: u(0.12),
      uMouthR: u(0.36),
      uMaxBlur: u(2.2),
      uDepth: u(null),
      uRes: u(new THREE.Vector2(1, 1)),
      uNear: u(0.1),
      uFar: u(120),
      uOpacity: u(o.opacity ?? 1),
      uFogColor: u(new THREE.Color()),
      uFogDensity: u(0.05),
      uLight: u(new THREE.Vector3(0.4, 0.7, 0.6).normalize()),
    },
  });
  const pts = new THREE.Points(geo, mat) as unknown as Powder;
  pts.frustumCulled = false;
  const depth = new Float32Array(count);
  const m = new THREE.Matrix4();
  let frame = 0;
  pts.userData = {
    sort(cam) {
      frame += 1;
      if (o.sorted === false || frame % 6) {
        return;
      }
      m.multiplyMatrices(cam.matrixWorldInverse, pts.matrixWorld);
      const e = m.elements;
      const src = mat.uniforms.uMorph.value > 0.5 ? tgt : pos;
      for (let i = 0; i < count; i += 1) {
        depth[i] =
          e[2] * src[i * 3] +
          e[6] * src[i * 3 + 1] +
          e[10] * src[i * 3 + 2] +
          e[14];
      }
      idx.sort((a, b) => depth[a] - depth[b]);
      (geo.index as THREE.BufferAttribute).needsUpdate = true;
    },
  };
  return pts;
}

/** Shader for flat type drawn after post and depth-tested by hand (stays crisp like print). */
export const overlayMaterial = (map: THREE.Texture) =>
  new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      map: { value: map },
      uDepth: { value: null },
      uRes: { value: new THREE.Vector2() },
      uNear: { value: 0.1 },
      uFar: { value: 120 },
      uOpacity: { value: 1 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.04 },
    },
    vertexShader:
      "varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vZ = -mv.z; gl_Position = projectionMatrix * mv; }",
    fragmentShader: `${DEPTH_GLSL} uniform sampler2D map; uniform float uOpacity, uFogDensity; uniform vec3 uFogColor; varying vec2 vUv; varying float vZ;
      void main(){ vec4 c = texture2D(map, vec2(1.0 - vUv.x, vUv.y)); if (c.a < 0.01) discard;
        if (viewZ(texture2D(uDepth, gl_FragCoord.xy / uRes).r) < vZ - 0.02) discard;
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vZ * vZ); gl_FragColor = vec4(mix(c.rgb, pow(uFogColor, vec3(1.0/2.2)), f * 0.6), c.a * uOpacity); }`,
  });

// ── Renderer + cinematic post (DOF, bloom, neutral tone mapping, grain, vignette)
export type Stage = ReturnType<typeof createStage>;
export function createStage(
  canvas: HTMLCanvasElement,
  o: {
    fog: THREE.FogExp2;
    fov: number;
    bloom: number;
    bokeh: number;
    focusRange: number;
    /** Half-depth (world units) kept fully sharp around the focus distance (default 0). */
    sharpRange?: number;
    grain: number;
    /** Edge darkening of the post vignette (default 0.55). */
    vignette?: number;
    /** Pixel-ratio ceiling; the stage lowers it further when frames run long. */
    maxDpr?: number;
    msaa?: boolean;
  },
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  const maxDpr = Math.min(
    devicePixelRatio,
    o.maxDpr ?? (narrow() ? 1.5 : 1.75),
  );
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = o.fog;
  scene.background = o.fog.color.clone();
  const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.1, 120);
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling:
      o.msaa === false || narrow()
        ? 0
        : Math.min(4, renderer.capabilities.maxSamples),
  });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, {
    worldFocusDistance: 6,
    worldFocusRange: o.focusRange,
    bokehScale: o.bokeh,
    resolutionScale: 0.5,
  });
  // The effect saturates CoC × bokehScale at 1, so with a big bokeh even the jar's
  // front face (a radius off the focus plane) came entirely from the half-res
  // blur. A dead zone keeps the whole focused jar on the full-res buffer. The
  // shader works in normalised depth ((z - near) / (far - near)), not world units.
  const sharp = (o.sharpRange ?? 0) / (camera.far - camera.near);
  dof.cocMaterial.fragmentShader = dof.cocMaterial.fragmentShader.replace(
    "smoothstep(0.0,focusRange",
    `smoothstep(${sharp.toFixed(6)},focusRange`,
  );
  const bloom = new BloomEffect({
    intensity: o.bloom,
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
    radius: 0.7,
  });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
  noise.blendMode.opacity.value = o.grain;
  composer.addPass(
    new EffectPass(
      camera,
      dof,
      bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.28, darkness: o.vignette ?? 0.55 }),
      noise,
    ),
  );
  const overlay = new THREE.Scene(); // composited after post, depth-tested manually
  const size = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  const v2 = new THREE.Vector2();
  const fog = scene.fog as THREE.FogExp2;
  let spent = 0;
  let frames = 0;
  return {
    /** Adaptive resolution: every 40 frames, step the pixel ratio down (never below 1) while frames exceed ~22 ms. */
    adapt(dt: number) {
      spent += dt;
      frames += 1;
      if (frames < 40) {
        return;
      }
      if (spent / frames > 0.022 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        size();
      }
      spent = 0;
      frames = 0;
    },
    renderer,
    scene,
    camera,
    overlay,
    bloom,
    setFocus: (d: number) => {
      dof.cocMaterial.worldFocusDistance = d;
    },
    /** 0..1 depth-of-field strength (1 = configured bokeh). */
    setBokeh: (k: number) => {
      dof.bokehScale = o.bokeh * k;
    },
    /** Back to full resolution (undoes adapt), e.g. before capturing a frame. */
    fullRes() {
      dpr = maxDpr;
      renderer.setPixelRatio(dpr);
      size();
    },
    render(t: number) {
      composer.render();
      renderer.getDrawingBufferSize(v2);
      const scale =
        (v2.y * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const depth = (composer as unknown as { depthTexture: THREE.Texture })
        .depthTexture;
      for (const p of overlay.children) {
        const u = (p as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>)
          .material.uniforms;
        u.uDepth.value = depth;
        u.uRes.value.copy(v2);
        u.uNear.value = camera.near;
        u.uFar.value = camera.far;
        u.uFogColor.value.copy(fog.color);
        u.uFogDensity.value = fog.density;
        if (p instanceof THREE.Points) {
          u.uTime.value = REDUCED() ? 0 : t;
          u.uScale.value = scale;
          u.uFocus.value =
            p.userData.focus ?? dof.cocMaterial.worldFocusDistance;
          p.userData.sort(camera);
        }
      }
      renderer.autoClear = false;
      renderer.render(overlay, camera);
      renderer.autoClear = true;
    },
    dispose() {
      ro.disconnect();
      scene.traverse(disposeObject);
      overlay.traverse(disposeObject);
      shared = undefined;
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function disposeObject(obj: THREE.Object3D) {
  if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Points)) {
    return;
  }
  obj.geometry.dispose();
  for (const m of [obj.material].flat() as THREE.Material[]) {
    for (const val of Object.values(m)) {
      if (val instanceof THREE.Texture) {
        val.dispose();
      }
    }
    m.dispose();
  }
}

/** Product-photography "lightformer" environment: dark room + emissive strips. */
export function makeStudioEnv(
  renderer: THREE.WebGLRenderer,
  { bg = "#0b0b0c", warm = "#fff1e0", strength = 1 } = {},
) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(bg);
  const lf = (
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    c: string,
    i: number,
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(c).multiplyScalar(i * strength),
        side: THREE.DoubleSide,
      }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  lf(2.2, 9, -6, 1, 3, "#ffffff", 3.2); // key strip left-front
  lf(1.4, 9, 6.5, 0.5, 1, warm, 2.4); // warm strip right
  lf(10, 4, 0, 8, 0, "#ffffff", 1.6); // top softbox
  lf(1, 9, 2, 0, -7, "#ffffff", 2.2); // rim from behind
  lf(14, 1.2, 0, -2.5, 6, "#ffffff", 0.5); // floor bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.035).texture;
  pm.dispose();
  return tex;
}

// ── HUD: monospace chips with leader lines anchored to points in the scene ──
const _p = new THREE.Vector3();
export function makeHud(root: HTMLElement, n: number) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const lines = Array.from({ length: n }, () =>
    svg.appendChild(document.createElementNS(NS, "polyline")),
  );
  const dots = Array.from({ length: n }, () => {
    const c = svg.appendChild(document.createElementNS(NS, "circle"));
    c.setAttribute("r", "2.5");
    return c;
  });
  const tags = Array.from({ length: n }, (_, k) => {
    const d = document.createElement("div");
    d.className = `tag t${k}`;
    return d;
  });
  root.replaceChildren(svg, ...tags);
  let key = "";
  return {
    set(next: string, chips: [string, string][]) {
      root.dataset.on = chips.length ? "1" : "0";
      if (`${next}:${chips.length}` === key) {
        return;
      }
      key = `${next}:${chips.length}`;
      tags.forEach((t, k) => {
        const [label, value] = chips[k] ?? ["", ""];
        t.hidden = !chips[k];
        lines[k].style.display = chips[k] ? "" : "none";
        dots[k].style.display = chips[k] ? "" : "none";
        t.innerHTML = '<span class="k"></span><b></b>';
        (t.firstChild as HTMLElement).textContent = label;
        scramble(t.lastChild as HTMLElement, value);
      });
    },
    draw(
      obj: THREE.Object3D,
      cam: THREE.Camera,
      anchors: number[][],
      offs: number[][],
    ) {
      const w = root.clientWidth;
      const h = root.clientHeight;
      anchors.forEach(([ax, ay, az], k) => {
        _p.set(ax, ay, az);
        obj.localToWorld(_p).project(cam);
        const x = ((_p.x + 1) / 2) * w;
        const y = ((1 - _p.y) / 2) * h;
        const [dx, dy] = offs[k];
        const tw = tags[k].offsetWidth;
        tags[k].style.transform =
          `translate(${Math.max(8, Math.min(w - tw - 8, dx < 0 ? x + dx - tw : x + dx))}px, ${y + dy - 24}px)`;
        lines[k].setAttribute(
          "points",
          `${x},${y} ${x + dx * 0.5},${y + dy} ${x + dx},${y + dy}`,
        );
        dots[k].setAttribute("cx", String(x));
        dots[k].setAttribute("cy", String(y));
      });
    },
  };
}
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789°·/_";
function scramble(el: HTMLElement, text: string) {
  const t0 = performance.now();
  const tick = (now: number) => {
    const n = REDUCED()
      ? text.length
      : Math.floor(Math.min(1, (now - t0) / 600) * text.length);
    el.textContent =
      text.slice(0, n) +
      [...text.slice(n, n + 6)]
        .map((ch) =>
          ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        )
        .join("");
    if (n < text.length) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/** Render loop that only runs while `visible`, with a clamped delta. */
export function loop(frame: (dt: number, t: number) => void) {
  let raf = 0;
  let last = 0;
  let t = 0;
  const tick = (now: number) => {
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    t += dt;
    frame(dt, t);
    raf = requestAnimationFrame(tick);
  };
  return {
    start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
