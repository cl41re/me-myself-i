"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { cn } from "@/lib/utils";

interface ShaderPlaneProps {
  vertexShader: string;
  fragmentShader: string;
  uniforms: { [key: string]: { value: unknown } };
}

const ShaderPlane = ({
  vertexShader,
  fragmentShader,
  uniforms,
}: ShaderPlaneProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size } = useThree();
  const mousePos = useRef(new THREE.Vector2(0, 0));
  const targetPos = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      targetPos.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useFrame((state) => {
    if (!meshRef.current) {
      return;
    }

    const material = meshRef.current.material as THREE.ShaderMaterial;

    material.uniforms.u_time.value = state.clock.elapsedTime;
    material.uniforms.u_resolution.value.set(size.width, size.height);
    mousePos.current.lerp(targetPos.current, 0.045);
    material.uniforms.u_mouse.value.copy(mousePos.current);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        vertexShader={vertexShader}
        side={THREE.FrontSide}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

interface Shader0Props {
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: { [key: string]: { value: unknown } };
  className?: string;
  glowColor?: string;
}

const Shader0 = ({
  vertexShader = `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader = `
    precision highp float;

    varying vec2 vUv;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform vec3 u_glowColor;

    #define PI 3.14159265359

    mat2 rotate2d(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
    }

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;

      for (int i = 0; i < 5; i++) {
        value += noise(p) * amplitude;
        p = rotate2d(0.55) * p * 2.02 + vec2(3.1, 1.7);
        amplitude *= 0.5;
      }

      return value;
    }

    vec2 aspectUv(vec2 uv) {
      vec2 p = uv - 0.5;
      p.x *= u_resolution.x / max(u_resolution.y, 1.0);
      return p;
    }

    float softBand(float value, float width) {
      return exp(-pow(abs(value) / max(width, 0.0001), 1.35));
    }

    float flowingBeam(vec2 p, float angle, float width, float offset) {
      vec2 q = rotate2d(angle) * p;
      float flow = fbm(q * 2.4 + vec2(offset, u_time * 0.18));
      q.y += (flow - 0.5) * 0.6;

      float ribbon = softBand(q.y, width);
      float taper =
        smoothstep(-1.3, -0.08, q.x) *
        (1.0 - smoothstep(0.28, 1.45, q.x));
      float breakup = mix(
        0.35,
        1.0,
        smoothstep(0.28, 0.9, fbm(q * 3.4 - vec2(u_time * 0.12, offset)))
      );

      return ribbon * taper * breakup;
    }

    float ringStriations(vec2 p) {
      float r = length(p);
      float a = atan(p.y, p.x);
      float wobble = fbm(vec2(a * 2.0, r * 5.2 - u_time * 0.15));
      float bands = sin(r * 42.0 - a * 7.5 + wobble * 7.0 - u_time * 1.6);

      bands = pow(max(0.0, 0.5 + 0.5 * bands), 18.0);
      return bands * smoothstep(0.6, 1.55, r);
    }

    float renderIntensity(vec2 uv) {
      vec2 p = aspectUv(uv);
      p -= u_mouse * vec2(0.08, 0.05);

      float radius = 0.38;
      float dist = length(p);
      float sphereMask = 1.0 - smoothstep(radius - 0.012, radius + 0.012, dist);

      float fog = exp(-dist * 3.2) * 0.035;
      float halo = exp(-abs(dist - radius) * 10.0) * 0.18;
      float outerBloom = exp(-pow(max(dist - radius, 0.0) * 4.0, 1.35)) * 0.18;

      vec2 lightDir = normalize(vec2(0.78, 0.62));
      float rim = exp(-abs(dist - radius) * 56.0);
      rim *= 0.35 + 1.55 * pow(max(dot(normalize(p + vec2(0.0001)), lightDir), 0.0), 2.6);

      float beamA = flowingBeam(p + vec2(-0.08, 0.02), -0.85, 0.2, 0.0);
      float beamB = flowingBeam(p + vec2(0.09, -0.04), 0.92, 0.16, 4.0);
      float beamMask = smoothstep(radius + 0.02, radius + 0.34, dist);
      float beams = (beamA + beamB) * beamMask;

      float rings = ringStriations(p * 1.05);
      rings *= 0.15 + 0.85 * smoothstep(radius + 0.05, 1.4, dist);

      float eddies = smoothstep(
        0.58,
        0.95,
        fbm(p * 2.1 + vec2(u_time * 0.08, -u_time * 0.06))
      );
      eddies *= exp(-dist * 2.3) * 0.16;

      float intensity =
        fog +
        halo +
        outerBloom +
        beams * 0.85 +
        rings * 0.4 +
        eddies +
        rim * 0.95;

      intensity *= 1.0 - sphereMask;

      float innerEdge = exp(-abs(dist - radius) * 105.0) * sphereMask;
      float interiorGlow = sphereMask * 0.015;
      interiorGlow *= 1.0 - smoothstep(0.0, 0.7, dist / radius);

      return max(0.0, intensity + innerEdge * 0.18 + interiorGlow);
    }

    void main() {
      vec2 p = aspectUv(vUv);
      float radial = length(p);
      vec2 dir = radial > 0.0 ? p / radial : vec2(0.0, 1.0);

      float aberration = 0.0012 + 0.0085 * pow(clamp(radial, 0.0, 1.6), 1.5);
      vec2 shift = dir * aberration;

      float red = renderIntensity(vUv + shift * 1.2);
      float green = renderIntensity(vUv);
      float blue = renderIntensity(vUv - shift * 1.2);

      float mono = (red + green + blue) / 3.0;
      vec3 spectral = vec3(red, green, blue);
      vec3 neutral = vec3(mono);

      vec3 tint = mix(vec3(0.82, 0.84, 0.88), u_glowColor, 0.25);
      vec3 color = mix(neutral * tint, spectral, 0.55);
      color += neutral * 0.18;

      float vignette = smoothstep(1.55, 0.18, radial);
      color *= vignette;
      color = pow(color, vec3(0.95));

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms = {},
  className,
  glowColor = "#efe6db",
}: Shader0Props) => {
  const shaderUniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_mouse: { value: new THREE.Vector2(0, 0) },
      u_glowColor: { value: new THREE.Color(glowColor) },
      ...uniforms,
    }),
    [uniforms, glowColor],
  );

  return (
    <section className={cn(className, "absolute inset-0 h-full w-full")}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ShaderPlane
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={shaderUniforms}
        />
      </Canvas>
    </section>
  );
};

export { Shader0 };
