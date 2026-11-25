// "La Vitrine en apesanteur" (proposals-refs/_src/d3.html): floating jars on an
// arc toward the lens, sharp centre jar, blurred neighbours, a colour world and
// curved type per product, HUD chips. Scroll drives the arc; React owns the DOM.
// biome-ignore lint/performance/noNamespaceImport: three is namespace-oriented; Bun tree-shakes ESM namespaces
import * as THREE from "three";

import type { Look } from "../lib/spice";
import {
  buildJar,
  createStage,
  FOG_DAY,
  fontsReady,
  HANDOFF,
  type Jar,
  loadTex,
  loop,
  makeHud,
  makePowder,
  makeStudioEnv,
  narrow,
  overlayMaterial,
  REDUCED,
  shiftView,
  tween,
} from "./core";

export interface VitrineItem {
  chips: [string, string][];
  img: string | null;
  look: Look;
}

export async function mountVitrine(
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
  items: VitrineItem[],
  on: { hover: (i: number | null) => void; pick: (i: number) => void },
) {
  const N = items.length;
  const nar = narrow();
  const stage = createStage(canvas, {
    fog: new THREE.FogExp2(FOG_DAY, 0.04),
    fov: 28,
    bloom: 0.22,
    bokeh: 7,
    // neighbours sit ~1.0 (desktop) / ~0.6 (mobile) off the centre jar's depth
    focusRange: nar ? 1 : 1.8,
    sharpRange: nar ? 0.5 : 0.65,
    grain: 0.06,
    maxDpr: nar ? 1.5 : 2,
  });
  const { renderer, scene, camera } = stage;
  const [photos] = await Promise.all([
    Promise.all(items.map((it) => loadTex(it.img))),
    fontsReady(),
  ]);
  scene.environment = makeStudioEnv(renderer, { bg: "#9a938a", strength: 0.5 });
  const jarEnv = makeStudioEnv(renderer, { bg: "#1d1a17", strength: 1.6 });
  const key = new THREE.DirectionalLight(0xff_f4_e8, 2.2);
  key.position.set(-3, 4, 6);
  scene.add(key);

  // arc of floating, tilted jars
  const R = nar ? 2.4 : 3.3;
  const SP = nar ? 0.55 : 0.6;
  const ring = new THREE.Group();
  scene.add(ring);
  const rest = (i: number) =>
    new THREE.Euler(0.12, -0.35, (i % 2 ? 1 : -1) * 0.2);
  const jars = items.map((it, i) => {
    const pivot = new THREE.Group();
    const tilt = new THREE.Group();
    const jar = buildJar(
      it.look,
      { renderer, photo: photos[i], env: jarEnv },
      {
        capColor: "#cfd2d6",
        capRough: 0.24,
        shadow: 0,
        index: i,
        fastGlass: true,
      },
    );
    jar.position.y = -0.72;
    tilt.add(jar);
    tilt.rotation.copy(rest(i));
    pivot.add(tilt);
    ring.add(pivot);
    return { pivot, tilt, jar };
  });

  // large organic colour shape behind the product (Agrumea)
  const shape = new THREE.Shape();
  for (let k = 0; k <= 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const r = 2.3 * (0.86 + 0.14 * Math.cos(k * 2.1));
    if (k === 0) {
      shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    } else {
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const blobMat = new THREE.MeshStandardMaterial({
    color: items[0].look.palette.band,
    roughness: 0.85,
    envMapIntensity: 0.6,
  });
  const blob = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelThickness: 0.08,
      bevelSize: 0.35,
      bevelSegments: 8,
      curveSegments: 6,
    }),
    blobMat,
  );
  blob.position.set(nar ? 0 : 0.4, -0.6, -2.6);
  blob.scale.setScalar(nar ? 0.8 : 1);
  scene.add(blob);

  // curved italic type wrapping behind the jar
  const ringCv = document.createElement("canvas");
  ringCv.width = 4096;
  ringCv.height = 512;
  const ringTex = new THREE.CanvasTexture(ringCv);
  ringTex.wrapS = THREE.RepeatWrapping;
  ringTex.repeat.x = -1;
  const drawRing = ({ word, sub, palette }: Look) => {
    const c = ringCv.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, 4096, 512);
    c.fillStyle = palette.accent;
    c.font = 'italic 500 340px "Bodoni Moda"';
    const t = `${[word, sub].filter(Boolean).join(" — ").toLocaleLowerCase("fr-FR")} — `;
    const w = c.measureText(t).width;
    for (let x = 0; x < 4096; x += w) {
      c.fillText(t, x, 360);
    }
    ringTex.needsUpdate = true;
  };
  const typeRing = new THREE.Mesh(
    new THREE.CylinderGeometry(
      nar ? 1.35 : 1.75,
      nar ? 1.35 : 1.75,
      0.8,
      200,
      1,
      true,
    ),
    overlayMaterial(ringTex),
  );
  typeRing.position.set(0, -0.05, -0.2);
  typeRing.rotation.set(0.38, 0, -0.18);
  stage.overlay.add(typeRing);
  const motes = makePowder({
    count: nar ? 1500 : 3000,
    colors: ["#f4ece2", "#e6dccf", "#cfc3b4"],
    size: [0.004, 0.02],
    drift: 0.18,
    sorted: false,
    spawn: (v, _i, r) => v.set((r() - 0.5) * 12, (r() - 0.5) * 6, 3 - r() * 12),
  });
  stage.overlay.add(motes);

  // HUD chips with leader lines around the centre jar
  const hud = makeHud(hudRoot, 3);
  const anchors = [
    [-0.45, 1.3, 0.3],
    [0.52, 0.95, 0.3],
    [-0.5, 0.25, 0.3],
  ];
  const offs = nar
    ? [
        [-20, -60],
        [40, -40],
        [20, 50],
      ]
    : [
        [-150, -70],
        [170, -60],
        [-170, 80],
      ];

  // pointer: parallax, hover pill and click targets (raycast on the jars)
  const pointer = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  let hovered: number | null = null;
  // raycast against each visible jar's glass shell only (no recursion into label, fill, cap)
  const hit = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - b.left) / b.width) * 2 - 1,
      -((e.clientY - b.top) / b.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const shells = jars
      .filter((j) => j.pivot.visible)
      .map((j) => j.jar.children[0]);
    const o = ray.intersectObjects(shells, false)[0]?.object;
    return o ? (o.parent as Jar).userData.index : null;
  };
  let pending: PointerEvent | null = null;
  let lastInput = 0;
  const move = (e: PointerEvent) => {
    pending = e;
    lastInput = performance.now();
  };
  const hover = () => {
    if (!pending) {
      return;
    }
    const i = hit(pending);
    pending = null;
    if (i !== hovered) {
      hovered = i;
      canvas.style.cursor = i === null ? "" : "pointer";
      on.hover(i);
    }
  };
  const click = (e: PointerEvent) => {
    const i = hit(e);
    if (i !== null) {
      on.pick(i);
    }
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("click", click);

  // state
  let target = 0;
  let f = 0;
  let shown = -1;
  let opening = -1;
  const intro = { k: REDUCED() ? 0 : 1 };
  const ov = { k: 0 };
  const base = {
    pos: new THREE.Vector3(0, 0.55, nar ? 9.8 : 6.6),
    look: new THREE.Vector3(0, nar ? -0.15 : 0, 0),
  };
  // filled each frame from the opening jar: the product page's first frame (HANDOFF)
  const close = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const [sx, sy] = HANDOFF.shift(nar);
  let lastT = 0;
  const fogBase = new THREE.Color(FOG_DAY);
  const handBg = new THREE.Color();
  const world = new THREE.Color(items[0].look.palette.band);
  const tmp = new THREE.Color();
  const wp = new THREE.Vector3();
  const look = new THREE.Vector3();

  // light mouse parallax at rest; while opening, glide into the HANDOFF frame
  const placeCamera = () => {
    const par = REDUCED() ? 0 : 1 - ov.k;
    if (opening >= 0) {
      jars[opening].jar.getWorldPosition(wp);
      close.pos.copy(wp).add(HANDOFF.eye(nar));
      close.look.copy(wp).add(HANDOFF.look);
    }
    camera.position.lerpVectors(base.pos, close.pos, ov.k);
    camera.position.x += pointer.x * 0.12 * par;
    camera.position.y += pointer.y * 0.07 * par;
    camera.lookAt(look.lerpVectors(base.look, close.look, ov.k));
    camera.fov = 28 + (HANDOFF.fov - 28) * ov.k;
    shiftView(camera, canvas, sx * ov.k, sy * ov.k);
    stage.setBokeh(1 - ov.k); // the product page opens on a sharp jar
  };
  let odd = false;
  const frames = loop((dt, t) => {
    lastT = t;
    stage.adapt(dt);
    hover();
    // at rest (no scroll travel, tween or pointer for 1.5 s) the idle float renders at 30 fps
    const settled =
      Math.abs(target - f) < 0.002 &&
      intro.k === 0 &&
      ov.k === 0 &&
      performance.now() - lastInput > 1500;
    odd = !odd;
    if (settled && odd) {
      return;
    }
    f += (target - f) * (REDUCED() ? 1 : 1 - Math.exp(-4.5 * dt));
    const idx = Math.round(f);
    const at = ((idx % N) + N) % N; // the lap never ends: f keeps growing, jars repeat
    if (at !== shown && opening < 0) {
      shown = at;
      drawRing(items[at].look);
    }
    ring.position.y = intro.k * -3.2;
    const calm = 1 - ov.k; // the opening jar stops floating and turns to face the lens
    jars.forEach((j, k) => {
      let dk = k - f;
      dk = ((((dk + N / 2) % N) + N) % N) - N / 2;
      const ang = dk * SP;
      j.pivot.visible = Math.abs(ang) < 1.5;
      j.pivot.position.set(
        Math.sin(ang) * R,
        REDUCED() ? 0 : Math.sin(t * 0.8 + k * 1.7) * 0.07 * calm,
        (1 - Math.cos(ang)) * R * 1.7,
      );
      j.pivot.rotation.y = -ang * 0.9;
      j.pivot.scale.setScalar(k === opening ? 1 : Math.max(0.001, 1 - ov.k));
      j.jar.rotation.y = REDUCED() ? 0 : Math.sin(t * 0.3 + k) * 0.25 * calm;
    });
    // the colour world follows the centre jar
    world.lerp(tmp.set(items[shown].look.palette.band), 0.05);
    blobMat.color.copy(world);
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(fogBase).lerp(world, 0.06).lerp(handBg, ov.k);
    fog.density = 0.04 + ov.k * (HANDOFF.density - 0.04);
    blob.scale.setScalar((nar ? 0.8 : 1) * Math.max(0.001, 1 - ov.k));
    motes.material.uniforms.uOpacity.value = 1 - ov.k;
    (scene.background as THREE.Color).copy((scene.fog as THREE.FogExp2).color);
    blob.rotation.z = t * 0.03;
    blob.position.y = -0.6 + intro.k * -2;
    typeRing.rotation.y = t * 0.06 + f * 0.8;
    typeRing.material.uniforms.uOpacity.value = 1 - ov.k;
    placeCamera();
    const focus = jars[opening >= 0 ? opening : shown].jar;
    focus.getWorldPosition(wp);
    wp.y += 0.6;
    stage.setFocus(camera.position.distanceTo(wp));
    const near = Math.abs(f - idx) < 0.2 && opening < 0 && intro.k < 0.2;
    hud.set(`${at}`, near ? items[at].chips : []);
    if (near) {
      hud.draw(focus, camera, anchors, offs);
    }
    stage.render(t);
  });

  frames.start();
  tween(2800, (k) => {
    intro.k = 1 - k;
  });

  return {
    setTarget: (next: number) => {
      target = next;
    },
    setVisible: (v: boolean) => (v ? frames.start() : frames.stop()),
    /**
     * The jar straightens and flies into the product page's opening frame while the
     * world falls to night; resolves with that last frame (JPEG data URL).
     */
    async open(i: number) {
      opening = i;
      handBg.copy(HANDOFF.bg(items[i].look.palette.band));
      const { tilt } = jars[i];
      const from = tilt.rotation.clone();
      await tween(1100, (k) => {
        ov.k = k;
        tilt.rotation.set(from.x * (1 - k), from.y * (1 - k), from.z * (1 - k));
      });
      stage.fullRes();
      stage.render(lastT); // same task as toDataURL: the drawing buffer is still intact
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    dispose() {
      frames.stop();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("click", click);
      stage.dispose();
    },
  };
}
export type Vitrine = Awaited<ReturnType<typeof mountVitrine>>;
