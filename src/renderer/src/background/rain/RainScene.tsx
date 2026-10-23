// "Puddle in rain" by Faraz Shaikh (github.com/Faraz-Portfolio/demo-2023-rain-puddle),
// GPL-3.0 (see LICENSE here). Adapted for vaporTV: no controls, sound or start button;
// the camera sits close over the puddle and slowly circles it.
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import * as React from "react";
import * as THREE from "three";
import { Floor } from "./Floor";
import { Lights } from "./Lights";
import { Rain } from "./Rain";
import { useBattery } from "../../power";
import { BATTERY_FPS } from "../pace";

/** How far above the ground the camera looks down at the puddle, in degrees (the demo's view). */
const ELEVATION = 23.4;
/** Camera direction from the puddle's centre: the demo's heading, at ELEVATION. */
const VIEW_DIRECTION = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - ELEVATION),
  Math.atan2(0.7137, 0.3213),
);
/** Camera distance from the puddle's centre (the demo starts at 0.85; this matches it zoomed in a little). */
const DISTANCE = 0.7;
/**
 * Shifts the view up by this fraction of its height (negative: down), placing the
 * puddle's far edge 38% of the way down the screen, as in Henry's reference shot.
 */
const CENTRE_SHIFT = -0.065;
/** Orbit speed in radians per second (the demo's OrbitControls autoRotateSpeed -0.25). */
const ORBIT_SPEED = -((2 * Math.PI) / 60) * 0.25;
/** The rain builds up over this many seconds, as after the demo's start button. */
const RAIN_IN_SECONDS = 5;

function Director({ rainProgressRef }: { rainProgressRef: React.MutableRefObject<number> }) {
  const angle = React.useRef(0);
  const { camera, size } = useThree();
  React.useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.setViewOffset(size.width, size.height, 0, size.height * CENTRE_SHIFT, size.width, size.height);
    return () => camera.clearViewOffset();
  }, [camera, size]);
  useFrame(({ camera }, dt) => {
    rainProgressRef.current = Math.min(1, rainProgressRef.current + dt / RAIN_IN_SECONDS);
    angle.current += ORBIT_SPEED * dt;
    camera.position.copy(VIEW_DIRECTION).multiplyScalar(DISTANCE).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle.current);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

export default function RainScene() {
  const rainProgressRef = React.useRef(0);

  // Nothing to draw while a game or app is in front.
  const power = useBattery();
  const battery = !!power && !power.charging;
  const [hidden, setHidden] = React.useState(document.hidden);
  React.useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return (
    <div style={overlay}>
      <Canvas
        dpr={1}
        // Measure without the stage's scale-to-fit transform: the scene renders at stage
        // size (1920x1080) and is scaled with the page, like the other backdrops.
        resize={{ offsetSize: true }}
        // On battery it draws on request instead, BATTERY_FPS times a second (BatteryPace).
        frameloop={hidden ? "never" : battery ? "demand" : "always"}
        shadows={false}
        // Opaque, on the demo page's own background colour: a transparent canvas leaves a
        // bright rim where the puddle fades out at its edge.
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#00010b")}
        style={{ filter: "contrast(1.2) saturate(1.1) brightness(1.1)" }}
      >
        <BatteryPace on={battery} />
        <PerspectiveCamera makeDefault position={VIEW_DIRECTION.clone().multiplyScalar(DISTANCE)} />
        <Director rainProgressRef={rainProgressRef} />

        <Lights rainEnabled />
        <Rain rainProgressRef={rainProgressRef}>
          <Floor rainProgressRef={rainProgressRef} />
        </Rain>

        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={1} mipmapBlur luminanceSmoothing={0.0} intensity={0.05} />
          <ToneMapping />
        </EffectComposer>
      </Canvas>

      {/* The demo's grading, with a lighter vignette: vaporTV's cards cover the edges anyway */}
      <div style={{ ...overlay, background: "radial-gradient(circle at center, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.7) 100%)" }} />
      <div
        style={{
          ...overlay,
          background: "linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 255, 0.2) 100%)",
          mixBlendMode: "overlay",
        }}
      />
      <div style={{ ...overlay, background: "linear-gradient(to top, rgba(0, 0, 0, 0) 40%, rgba(255, 222, 165, 0.2) 100%)" }} />
    </div>
  );
}

/** On battery the scene draws on request: this asks BATTERY_FPS times a second. */
function BatteryPace({ on }: { on: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  React.useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => invalidate(), 1000 / BATTERY_FPS);
    return () => clearInterval(timer);
  }, [on, invalidate]);
  return null;
}
