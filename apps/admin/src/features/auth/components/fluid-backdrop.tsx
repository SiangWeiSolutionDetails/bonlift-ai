import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type MotionValue,
} from "motion/react";

type Blob = {
  color: string;
  position: string;
  size: string;
  flow: string;
  morph: string;
};

const BLOBS: Blob[] = [
  { color: "#4285F4", position: "top-[-15%] left-[5%]", size: "size-160", flow: "login-flow-a 24s", morph: "14s" },
  { color: "#9B72CB", position: "top-[15%] right-[-5%]", size: "size-144", flow: "login-flow-b 28s", morph: "17s" },
  { color: "#D96570", position: "bottom-[-20%] left-[25%]", size: "size-136", flow: "login-flow-c 32s", morph: "20s" },
  { color: "#24C1E0", position: "bottom-[0%] right-[15%]", size: "size-96", flow: "login-flow-b 20s", morph: "23s" },
];

const PUSH_RADIUS = 720;
const PUSH_STRENGTH = 420;
const FLUID_SPRING = { stiffness: 35, damping: 14, mass: 1.4 };
const GLOW_SPRING = { stiffness: 120, damping: 20 };

type Center = { x: number; y: number };

function useBlobPush() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  return { x, y, springX: useSpring(x, FLUID_SPRING), springY: useSpring(y, FLUID_SPRING) };
}

function measureCenters(elements: (HTMLDivElement | null)[], springs: { springX: MotionValue<number>; springY: MotionValue<number> }[], centers: Center[]) {
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i]?.getBoundingClientRect();
    if (!rect) continue;
    centers[i].x = rect.left + rect.width / 2 - springs[i].springX.get();
    centers[i].y = rect.top + rect.height / 2 - springs[i].springY.get();
  }
}

function pushAway(pointerX: number, pointerY: number, center: Center, target: { x: MotionValue<number>; y: MotionValue<number> }) {
  const dx = center.x - pointerX;
  const dy = center.y - pointerY;
  const distance = Math.hypot(dx, dy) || 1;
  const force = Math.max(0, 1 - distance / PUSH_RADIUS) * PUSH_STRENGTH;
  target.x.set((dx / distance) * force);
  target.y.set((dy / distance) * force);
}

export function FluidBackdrop() {
  const reduceMotion = useReducedMotion();
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pushes = [useBlobPush(), useBlobPush(), useBlobPush(), useBlobPush()];
  const glowX = useMotionValue(-9999);
  const glowY = useMotionValue(-9999);
  const glowSpringX = useSpring(glowX, GLOW_SPRING);
  const glowSpringY = useSpring(glowY, GLOW_SPRING);
  const glowOpacity = useSpring(0, GLOW_SPRING);

  useEffect(() => {
    if (reduceMotion) return;

    const centers: Center[] = BLOBS.map(() => ({ x: 0, y: 0 }));
    const remeasure = () => measureCenters(blobRefs.current, pushes, centers);
    remeasure();

    const onPointerMove = (event: PointerEvent) => {
      glowX.set(event.clientX);
      glowY.set(event.clientY);
      glowOpacity.set(1);
      for (let i = 0; i < centers.length; i++) {
        pushAway(event.clientX, event.clientY, centers[i], pushes[i]);
      }
    };

    const onPointerLeave = () => {
      glowOpacity.set(0);
      for (let i = 0; i < pushes.length; i++) {
        pushes[i].x.set(0);
        pushes[i].y.set(0);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", remeasure);
    };
  }, [reduceMotion]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {BLOBS.map((blob, index) => (
        <motion.div
          key={blob.color}
          ref={(element) => {
            blobRefs.current[index] = element;
          }}
          className={`absolute ${blob.position} ${blob.size}`}
          style={{ x: pushes[index].springX, y: pushes[index].springY }}
        >
          <div
            className="login-blob size-full opacity-30 blur-[90px] dark:opacity-40"
            style={{
              backgroundColor: blob.color,
              animation: `login-morph ${blob.morph} ease-in-out infinite, ${blob.flow} ease-in-out infinite`,
            }}
          />
        </motion.div>
      ))}
      {!reduceMotion && (
        <motion.div
          className="absolute top-0 left-0 -mt-36 -ml-36 size-72"
          style={{ x: glowSpringX, y: glowSpringY, opacity: glowOpacity }}
        >
          <div
            className="login-blob size-full bg-[#9B72CB] opacity-30 blur-[70px] dark:opacity-40"
            style={{ animation: "login-morph 11s ease-in-out infinite" }}
          />
        </motion.div>
      )}
    </div>
  );
}
