"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface ParticleParams {
  hue: number; // 0-360
  sat: number; // 0-100
  light: number; // 0-100
  form: "orb" | "shard" | "wave" | "ember" | "mist";
  turbulence: number; // 0-1
  expansion: number; // -1 .. 1
  gravity: number; // 0-1
  tremor: number; // Hz-ish
  density: number; // 0-1, nose hint
  /** signature scalars in [-1, 1]; we use the first four for shader steering */
  signature: number[];
}

const FORM_INDEX: Record<ParticleParams["form"], number> = {
  orb: 0,
  shard: 1,
  wave: 2,
  ember: 3,
  mist: 4,
};

const DEFAULT_PARAMS: ParticleParams = {
  hue: 30,
  sat: 60,
  light: 60,
  form: "orb",
  turbulence: 0.25,
  expansion: 0.1,
  gravity: 0.2,
  tremor: 0.5,
  density: 0.4,
  signature: [0, 0, 0, 0],
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uExpansion;
  uniform float uGravity;
  uniform float uTremor;
  uniform float uDensity;
  uniform int   uForm;
  uniform vec4  uSig;

  attribute float aSeed;
  varying float vIntensity;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  void main() {
    vec3 pos = position;
    float t = uTime;

    float nz = noise3(pos * 1.6 + vec3(0.0, t * 0.18, 0.0));
    float nz2 = noise3(pos * 3.2 - vec3(t * 0.1));
    vec3 dir = normalize(pos + vec3(0.0001));

    vec3 disp = vec3(0.0);
    if (uForm == 0) {
      // orb: gentle radial breathing
      float r = 0.08 * sin(t * 1.2 + aSeed * 6.28) + nz * 0.18 * uTurbulence;
      disp = dir * r;
    } else if (uForm == 1) {
      // shard: sharp crystalline spikes
      float spikeMask = step(0.72, fract(aSeed * 9.17));
      float r = spikeMask * (0.6 + 0.4 * sin(t * 1.6 + aSeed * 30.0));
      disp = dir * r + dir * nz * 0.35 * uTurbulence;
    } else if (uForm == 2) {
      // wave: sinusoidal undulation
      disp.x = 0.35 * sin(pos.y * 2.4 + t * 1.1) * (0.5 + uTurbulence);
      disp.z = 0.25 * cos(pos.x * 2.0 + t * 0.9);
      disp.y = 0.15 * sin(pos.x * 3.0 + t * 0.6);
    } else if (uForm == 3) {
      // ember: chaotic upward flicker
      disp = dir * nz2 * 0.5 * uTurbulence;
      disp.y += 0.45 * fract(aSeed + t * 0.6);
    } else {
      // mist: diffuse outward, slow swirl
      float swirl = t * 0.4 + aSeed * 6.28;
      disp = dir * (nz * 0.4 + 0.2);
      disp.x += sin(swirl) * 0.18;
      disp.z += cos(swirl) * 0.18;
    }

    disp += dir * uExpansion * 0.45;
    disp.y -= uGravity * 0.5 * (0.5 + 0.5 * sin(aSeed * 12.0));
    disp += vec3(
      sin(t * uTremor * 3.0 + aSeed * 22.0),
      cos(t * uTremor * 2.4 + aSeed * 13.0),
      sin(t * uTremor * 2.8 + aSeed * 31.0)
    ) * 0.012 * uTremor;

    // Signature: 4 scalars steer the cloud
    disp += vec3(uSig.x, uSig.y, uSig.z) * 0.18;
    disp += dir * uSig.w * 0.2;

    disp += dir * uDensity * 0.25 * nz2;

    vec3 finalPos = pos + disp;
    vec4 mv = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = length(mv.xyz);
    gl_PointSize = 9.0 * (1.0 / max(dist, 0.8));

    vIntensity = clamp(0.45 + nz * 0.7 + uTurbulence * 0.4 + abs(uSig.x) * 0.6, 0.0, 1.4);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uColorB;
  varying float vIntensity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColor, uColorB, smoothstep(0.0, 0.5, d));
    col *= vIntensity * 1.2;
    gl_FragColor = vec4(col, alpha * 0.85);
  }
`;

function hslColor(h: number, s: number, l: number): THREE.Color {
  const c = new THREE.Color();
  c.setHSL((((h % 360) + 360) % 360) / 360, s / 100, l / 100);
  return c;
}

export default function ParticleField({
  params,
}: {
  params: ParticleParams | null;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef<ParticleParams>(DEFAULT_PARAMS);

  useEffect(() => {
    if (params) paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const COUNT = 7000;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const phi = Math.PI * (Math.sqrt(5) - 1);
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = phi * i;
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius;
      seeds[i] = Math.random();
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const uniforms = {
      uTime: { value: 0 },
      uTurbulence: { value: 0.25 },
      uExpansion: { value: 0.1 },
      uGravity: { value: 0.2 },
      uTremor: { value: 0.5 },
      uDensity: { value: 0.4 },
      uForm: { value: 0 },
      uColor: { value: new THREE.Color(0xffa86b) },
      uColorB: { value: new THREE.Color(0xff5e3a) },
      uSig: { value: new THREE.Vector4(0, 0, 0, 0) },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geom, mat);
    scene.add(points);

    let raf = 0;
    const start = performance.now();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const cur = { ...DEFAULT_PARAMS };
    const sigCur = new THREE.Vector4(0, 0, 0, 0);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      const t = (performance.now() - start) / 1000;
      const target = paramsRef.current;
      const k = 0.05;
      cur.turbulence = lerp(cur.turbulence, target.turbulence, k);
      cur.expansion = lerp(cur.expansion, target.expansion, k);
      cur.gravity = lerp(cur.gravity, target.gravity, k);
      cur.tremor = lerp(cur.tremor, target.tremor, k);
      cur.density = lerp(cur.density, target.density, k);

      uniforms.uTime.value = t;
      uniforms.uTurbulence.value = cur.turbulence;
      uniforms.uExpansion.value = cur.expansion;
      uniforms.uGravity.value = cur.gravity;
      uniforms.uTremor.value = cur.tremor;
      uniforms.uDensity.value = cur.density;
      uniforms.uForm.value = FORM_INDEX[target.form];

      const tgtA = hslColor(target.hue, target.sat, target.light);
      const tgtB = hslColor(
        target.hue + 30,
        Math.min(100, target.sat + 10),
        Math.max(20, target.light - 20),
      );
      (uniforms.uColor.value as THREE.Color).lerp(tgtA, 0.06);
      (uniforms.uColorB.value as THREE.Color).lerp(tgtB, 0.06);

      const s = target.signature;
      sigCur.x = lerp(sigCur.x, s[0] || 0, 0.05);
      sigCur.y = lerp(sigCur.y, s[1] || 0, 0.05);
      sigCur.z = lerp(sigCur.z, s[2] || 0, 0.05);
      sigCur.w = lerp(sigCur.w, s[3] || 0, 0.05);
      (uniforms.uSig.value as THREE.Vector4).copy(sigCur);

      points.rotation.y += 0.0018 + cur.turbulence * 0.004;
      points.rotation.x = Math.sin(t * 0.15) * 0.18;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geom.dispose();
      mat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
