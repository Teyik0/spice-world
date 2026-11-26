// "L'Observatoire des arômes" (proposals-refs/_src/d2.html), opening sequence
// only: the jar on its plinth, the cap unscrews, the powder exhales and, when the
// molecule is known, braids into a glowing double helix. Scroll drives it all.
// biome-ignore lint/performance/noNamespaceImport: three is namespace-oriented; Bun tree-shakes ESM namespaces
import * as THREE from "three";

import type { Look } from "../lib/spice";
import { THEME } from "../lib/theme";
import type { Stage } from "./core";
import {
  buildJar,
  createStage,
  fontsReady,
  HANDOFF,
  JAR,
  loadTex,
  loop,
  makeHud,
  makePowder,
  makeStudioEnv,
  narrow,
  REDUCED,
  shiftView,
  smooth,
  tween,
} from "./core";

export type Chapter = "intro" | "open" | "origin" | "molecule" | "formats";
type V3 = [number, number, number];
// camera [position, target] per chapter, desktop then narrow. Framed on the jar:
// shiftView() then moves it into the left column (desktop) or the top (mobile).
// "intro" is the HANDOFF frame, so the carousel's jar lands exactly here.
const SHOTS: Record<Chapter, [V3, V3][]> = {
  intro: [
    [
      [0, 1.1, 4.8],
      [0, 0.75, 0],
    ],
    [
      [0, 1.1, 7.4],
      [0, 0.75, 0],
    ],
  ],
  open: [
    [
      [0.8, 2.3, 5.2],
      [-0.3, 1.35, 0],
    ],
    [
      [-0.5, 2.6, 8],
      [0.2, 1.5, 0],
    ],
  ],
  origin: [
    [
      [1.8, 1.2, 5],
      [0, 0.8, 0],
    ],
    [
      [1.2, 1.3, 7.6],
      [0, 0.9, 0],
    ],
  ],
  molecule: [
    [
      [0, 3.45, 9.4],
      [0, 3.35, 0],
    ],
    [
      [0, 3.45, 12],
      [0, 3.6, 0],
    ],
  ],
  formats: [
    [
      [-1.2, 1.2, 5.4],
      [0, 0.85, 0],
    ],
    [
      [-0.8, 1.2, 7.6],
      [0, 0.9, 0],
    ],
  ],
};
const H = 3.6;

/**
 * "jour" backdrop: a white pool of light on an even pale grey. The texture is twice
 * the screen; sliding its offset keeps the light behind the jar as it changes side.
 */
function backdrop(band: string) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 1024;
  const c = cv.getContext("2d") as CanvasRenderingContext2D;
  const hex = (base: number, k: number) =>
    `#${new THREE.Color(base).lerp(new THREE.Color(band), k).getHexString()}`;
  const g = c.createRadialGradient(512, 512, 0, 512, 512, 640);
  g.addColorStop(0, hex(0xff_ff_ff, 0.02));
  g.addColorStop(0.25, hex(0xf8_f6_f2, 0.03));
  g.addColorStop(0.75, hex(0xdc_d9_d3, 0.05));
  g.addColorStop(1, hex(0xd2_ce_c7, 0.06));
  c.fillStyle = g;
  c.fillRect(0, 0, 1024, 1024);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(0.5, 0.5);
  return tex;
}
/** jour: the carousel's lighting (light studio, dark env for the glass) on the white backdrop; nuit: the observatory. */
function studio(stage: Stage, band: string, day: boolean) {
  const { renderer, scene } = stage;
  if (!day) {
    const env = makeStudioEnv(renderer, {
      bg: "#070605",
      strength: 1.5,
      warm: "#ffd9a8",
    });
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    stage.bloom.luminanceMaterial.threshold = 0.55;
    return { env, jarEnv: env, light: null };
  }
  const env = makeStudioEnv(renderer, { bg: "#9a938a", strength: 0.5 });
  const light = backdrop(band);
  scene.environment = env;
  scene.background = light;
  return {
    env,
    jarEnv: makeStudioEnv(renderer, { bg: "#1d1a17", strength: 1.6 }),
    light,
  };
}
// Mist: screen-space smoke, static on screen (the jar moves, not the mist). Ragged
// diagonal trails from the top left down to the right, domain-warped fbm flowing
// that way; grey to near-black where dense. Drawn far behind everything, on a quad
// carried by the camera, so the jar always sits in front of it.
const MIST_VS =
  /* glsl */ "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const MIST_FS = /* glsl */ `
uniform float uTime, uFade; uniform vec2 uRes; uniform vec3 uDark, uLight;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
// trail across the screen: offset (along the normal), half-width, strength
float trail(float e, float off, float w, float k){ return k * exp(-(e - off) * (e - off) / (w * w)); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1.0 - uv.y;         // 0,0 = top left
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);
  float t = uTime * 0.03;
  vec2 dir = normalize(vec2(1.0, 0.55));                          // down to the right
  float e = dot(uv - 0.5, vec2(-dir.y, dir.x));                   // distance across the trails
  e += (fbm(p * 1.8 + vec2(t, 0.0)) - 0.5) * 0.45;                // ragged, disordered edges
  float m = max(max(trail(e, -0.02, 0.17, 1.0), trail(e, 0.36, 0.09, 0.6)),
                max(trail(e, -0.36, 0.08, 0.5), trail(e, 0.17, 0.05, 0.35)));
  vec2 flow = -dir * t * 3.0;
  vec2 q = vec2(fbm(p * 2.2 + flow), fbm(p * 2.2 - flow + 5.2));
  float d = fbm(p * 3.0 + q * 2.0 + flow);
  float a = smoothstep(0.34, 0.8, d) * m * uFade * 0.72;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uLight, uDark, smoothstep(0.42, 0.85, d)), a);
}`;
function makeMist(camera: THREE.Camera, day: boolean) {
  const uniforms = {
    uTime: { value: 0 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDark: { value: new THREE.Color(day ? 0x1c_1a_18 : 0x8a_85_7e) },
    uLight: { value: new THREE.Color(day ? 0x7a_76_70 : 0x3a_37_33) },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: MIST_VS,
      fragmentShader: MIST_FS,
      transparent: true,
      depthWrite: false,
      uniforms,
    }),
  );
  quad.position.z = -40; // far behind the jar; oversized to cover any view shift
  quad.scale.set(200, 200, 1);
  quad.renderOrder = -1;
  camera.add(quad);
  return uniforms;
}

const BASE = 1.6;

export async function mountObservatoire(
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
  o: {
    look: Look;
    img: string | null;
    chapters: Chapter[];
    chips: Partial<Record<Chapter, [string, string][]>>;
    /** Arriving from the carousel: start on the HANDOFF frame, no intro move. */
    handoff?: boolean;
  },
) {
  const nar = narrow();
  const day = THEME === "jour";
  const P = o.look.palette;
  const stage = createStage(canvas, {
    fog: new THREE.FogExp2(HANDOFF.bg(P.band), HANDOFF.density),
    fov: HANDOFF.fov,
    bokeh: 4,
    focusRange: 2.2,
    ...(day
      ? { bloom: 0.22, grain: 0.04, vignette: 0.12 }
      : { bloom: 0.9, grain: 0.13 }),
  });
  const { renderer, scene, camera } = stage;
  const [photo] = await Promise.all([loadTex(o.img), fontsReady()]);
  const { env, jarEnv, light } = studio(stage, P.band, day);
  const key = new THREE.DirectionalLight(0xff_e6_c8, 2);
  key.position.set(-3, 5, 5);
  const rim = new THREE.DirectionalLight(P.accent, 0.45);
  rim.position.set(2, 4, -6);
  scene.add(key, rim);

  // the observation stage: dark stone plinth ringed with the spice's accent
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.32, 0.22, 96),
    new THREE.MeshStandardMaterial({
      color: day ? 0xe9_e4_dc : 0x0d_0b_09,
      roughness: day ? 0.6 : 0.32,
      metalness: day ? 0 : 0.4,
      envMap: env,
      envMapIntensity: 0.5,
    }),
  );
  plinth.position.y = -0.11;
  const glow = new THREE.Color(P.accent).multiplyScalar(day ? 1 : 4);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.255, 0.007, 8, 200),
    new THREE.MeshBasicMaterial({ color: glow, toneMapped: day }),
  );
  ring.rotation.x = Math.PI / 2;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0b_09_07,
      roughness: 0.8,
      envMap: env,
      envMapIntensity: 0.3,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.22;
  const jar = buildJar(
    o.look,
    { renderer, photo, env: jarEnv },
    // same cap as the carousel jar, so the hand-off is one continuous object
    { capColor: "#cfd2d6", capRough: 0.24, shadow: 0.8 },
  );
  // jour: the jar floats on the gradient with its contact shadow, like a product shot
  floor.visible = !day;
  plinth.visible = !day;
  ring.visible = !day;
  const mist = makeMist(camera, day);
  scene.add(plinth, ring, floor, jar, camera);
  const res = new THREE.Vector2();

  // powder: exhales from the open jar, then (molecule known) braids into a helix
  const powder = makePowder({
    count: nar ? 12_000 : 26_000,
    colors: day
      ? [P.accent, P.band, P.band, P.accent]
      : [P.accent, P.glow, P.glow, "#ead9b6"],
    size: [0.008, 0.034],
    drift: 0.04,
    opacity: 0,
    emit: true,
    sorted: false,
    spawn: (v, _i, r) => v.set(r(), r(), r()),
    target: (v, i, r) => {
      const u = r();
      if (i % 9 < 7) {
        const a = u * Math.PI * 5.2 + (i % 2 ? Math.PI : 0);
        const rr = 0.62 + (r() - 0.5) * 0.08;
        const jit = (r() - 0.5) * 0.05;
        v.set(
          Math.cos(a) * rr + jit,
          BASE + u * H + (r() - 0.5) * 0.04,
          Math.sin(a) * rr + jit,
        );
      } else {
        const rung = Math.floor(u * 28) / 28;
        const a = rung * Math.PI * 5.2;
        const s = r() * 2 - 1;
        v.set(
          Math.cos(a) * 0.62 * s,
          BASE + rung * H + (r() - 0.5) * 0.02,
          Math.sin(a) * 0.62 * s,
        );
      }
    },
  });
  // the plume leaves from the open mouth (glass rim at JAR.neck)
  powder.material.uniforms.uOrigin.value.set(0, JAR.neck, 0);
  const dust = makePowder({
    count: nar ? 1400 : 2800,
    colors: day
      ? [P.band, P.accent, "#8a7f72"]
      : ["#e8c79a", "#b98a52", P.accent, "#f3e6cf"],
    size: [0.004, 0.022],
    drift: 0.2,
    opacity: day ? 0.5 : 0.8,
    additive: !day,
    spawn: (v, _i, r) => v.set((r() - 0.5) * 14, r() * 7 - 0.5, 4 - r() * 12),
  });
  stage.overlay.add(powder, dust);

  const shots = o.chapters.map((c) =>
    SHOTS[c][nar ? 1 : 0].map((x) => new THREE.Vector3(...x)),
  );
  const at = (c: Chapter) => o.chapters.indexOf(c);
  const hud = makeHud(hudRoot, 3);
  const helix = new THREE.Object3D();
  scene.add(helix);
  const A = {
    origin: [
      [-0.5, 1.3, 0.3],
      [0.52, 0.9, 0.3],
      [0.45, 0.2, 0.4],
    ],
    molecule: [
      [0.6, BASE + H * 0.82, 0],
      [-0.62, BASE + H * 0.52, 0],
      [0.62, BASE + H * 0.22, 0],
    ],
  };
  const O = {
    origin: nar
      ? [
          [10, -60],
          [40, -40],
          [20, 50],
        ]
      : [
          [-150, -90],
          [-170, -30],
          [-150, 60],
        ],
    molecule: nar
      ? [
          [20, -40],
          [-20, -30],
          [20, 30],
        ]
      : [
          [140, -40],
          [-150, -30],
          [140, 40],
        ],
  };

  let f = 0; // chapter units, from the (already eased) page scroll
  const dir = new THREE.Vector3();
  const intro = { k: REDUCED() || o.handoff ? 0 : 1 };
  const [sx, sy] = HANDOFF.shift(nar);
  const cp = new THREE.Vector3();
  const cl = new THREE.Vector3();
  const wp = new THREE.Vector3();
  const { cap } = jar.userData;
  const pu = powder.material.uniforms;
  /** Cap and powder for scroll position `f`; returns the helix morph (0..1). */
  /** `toward`: +1 when the jar sits on the left of the screen, -1 on the right. */
  const openJar = (k: number, t: number, toward: number) => {
    // the cap unscrews (two turns, barely rising), then lifts clear and sets aside;
    // only then does the spice exhale, so the plume never crosses the cap
    const oi = at("open");
    const unscrew = smooth(k, oi - 0.8, oi - 0.3);
    const aside = smooth(k, oi - 0.35, oi);
    cap.position.set(
      aside * -0.5 * toward, // set aside on the outer side, close enough to stay in frame
      JAR.capY +
        unscrew * 0.08 +
        Math.sin(aside * Math.PI) * 0.35 +
        aside * 0.1,
      // when the jar changes side the cap swings round behind the plume, not through it
      aside * (-0.2 - 1.4 * (1 - Math.abs(toward))),
    );
    cap.rotation.set(
      aside * 0.25,
      -unscrew * Math.PI * 4,
      aside * 0.6 * toward,
    );
    const exhale = smooth(k, oi - 0.1, oi + 0.9);
    const mi = at("molecule");
    const morph =
      mi < 0
        ? 0
        : smooth(k, mi - 0.75, mi) * (1 - smooth(k, mi + 0.6, mi + 1.3));
    pu.uRate.value = exhale;
    pu.uHeight.value = 0.5 + exhale * 1.9;
    pu.uMorph.value = morph;
    // matte powder; it only glows once it becomes the molecule
    powder.material.blending =
      morph > 0.35 && !day ? THREE.AdditiveBlending : THREE.NormalBlending;
    pu.uTwist.value = REDUCED() ? 0 : t * 0.25;
    pu.uOpacity.value =
      Math.min(1, exhale * 2.5) *
      (1 - 0.6 * smooth(k, o.chapters.length - 1.7, o.chapters.length - 1)) *
      (1 + morph * 0.6);
    return morph;
  };
  const frames = loop((_dt, t) => {
    const i = Math.max(0, Math.min(Math.floor(f), shots.length - 2));
    const u = smooth(f - i, 0, 1);
    // the jar changes side over f−i ∈ [0.25, 0.75]: the DOM maps that to the scroll
    // stretch where no text crosses the jar's band, so it never sweeps over copy…
    const c = smooth(f - i, 0.25, 0.75);
    const cross = c * c * (3 - 2 * c);
    cp.lerpVectors(shots[i][0], shots[Math.min(i + 1, shots.length - 1)][0], u);
    cl.lerpVectors(shots[i][1], shots[Math.min(i + 1, shots.length - 1)][1], u);
    // …and the camera breathes back while it crosses: the jar recedes into the mist,
    // drifts over and comes forward on the other side, instead of sliding sideways
    const breath = Math.sin(Math.PI * cross);
    cp.add(
      dir
        .subVectors(cp, cl)
        .normalize()
        .multiplyScalar(breath * 1.6),
    );
    cp.y += breath * 0.25 + intro.k * 1.5;
    cp.z += intro.k * 3;
    camera.position.copy(cp);
    camera.lookAt(cl);
    mist.uTime.value = REDUCED() ? 0 : t;
    mist.uRes.value.copy(renderer.getDrawingBufferSize(res));
    // chapters alternate sides: text right / jar left, then text left / jar right…
    const side = (k: number) => (k % 2 ? -1 : 1);
    const shift = sx * THREE.MathUtils.lerp(side(i), side(i + 1), cross);
    shiftView(camera, canvas, shift, sy);
    // the pool of light follows the jar on screen
    light?.offset.set(0.25 + 0.5 * shift, 0.25 - 0.5 * sy);
    const toward = sx ? shift / sx : 0;
    const morph = openJar(f, t, toward);
    powder.visible = pu.uOpacity.value > 0.001;
    jar.rotation.y = REDUCED() ? 0 : Math.sin(t * 0.35) * 0.35;
    (ring.material as THREE.MeshBasicMaterial).color
      .copy(glow)
      .multiplyScalar(0.8 + Math.sin(t * 2) * 0.15);
    wp.set(0, THREE.MathUtils.lerp(0.8, BASE + H * 0.5, morph), 0);
    const d = camera.position.distanceTo(wp);
    stage.setFocus(d);
    powder.userData.focus = d;
    let mode: "origin" | "molecule" | "" = "";
    // origin needs no HUD: its text sits right next to the jar
    if (morph > 0.7) {
      mode = "molecule";
    }
    hud.set(mode, (mode && o.chips[mode]) || []);
    if (mode) {
      // labels point toward the middle of the screen, away from the edge and the text
      const offs = O[mode].map(([x, y]) => [Math.abs(x) * (toward || 1), y]);
      hud.draw(mode === "molecule" ? helix : jar, camera, A[mode], offs);
    }
    stage.render(t);
  });
  frames.start();
  tween(2400, (k) => {
    mist.uFade.value = k;
  });
  if (intro.k) {
    tween(1800, (k) => {
      intro.k = 1 - k;
    });
  }
  return {
    setTarget: (next: number) => {
      f = Math.max(0, Math.min(o.chapters.length - 1, next));
    },
    setVisible: (v: boolean) => (v ? frames.start() : frames.stop()),
    dispose() {
      frames.stop();
      stage.dispose();
    },
  };
}
export type Observatoire = Awaited<ReturnType<typeof mountObservatoire>>;
