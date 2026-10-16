import { useFrame } from "@react-three/fiber";
import * as React from "react";
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";

// vaporTV: lightning flashes without the thunder sound. Each flash flickers for as
// long as the demo's thunder clips did (a twentieth of their 14s and 12s lengths).
const FLASH_MS = [14000 / 20, 12000 / 20];

export function Thunder({ rainEnabled }: { rainEnabled: boolean }) {
  const lightformerRef = React.useRef<THREE.Mesh>(null!);

  const noise = React.useMemo(() => createNoise2D(), []);

  const thunderingDuration = React.useRef(-1);

  React.useEffect(() => {
    if (!rainEnabled) return;

    const getRandInterval = () => THREE.MathUtils.randInt(5000, 20000);

    let timer = setTimeout(function makeThunder() {
      thunderingDuration.current = FLASH_MS[THREE.MathUtils.randInt(0, FLASH_MS.length - 1)];
      timer = setTimeout(makeThunder, getRandInterval());
    }, 5 * 1000);
    return () => clearTimeout(timer);
  }, [rainEnabled]);

  useFrame(({ clock }, dt) => {
    if (thunderingDuration.current > 0) {
      const time = clock.elapsedTime;
      const n = THREE.MathUtils.mapLinear(noise(0, time * 5), -1, 1, 0, 1);

      const mat = lightformerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.smoothstep(n, 0.7, 0.95);

      thunderingDuration.current -= dt * 1000;
    } else {
      const mat = lightformerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0;
    }
  });

  return (
    <mesh
      ref={lightformerRef}
      position={[-2, 1, -1]}
      scale={[1, 2, 0.1]}
      material-transparent={true}
    >
      <boxGeometry />
      <meshBasicMaterial
        color={new THREE.Color("#8886f5").multiplyScalar(100)}
        transparent
      />
    </mesh>
  );
}
