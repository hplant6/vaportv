import { Circle, useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";
import { AdditiveBlending, MathUtils, RepeatWrapping } from "three";

export function Trash() {
  // vaporTV: litter drawn by scripts/make-debris-decal.mjs (the demo's Megascans decal
  // couldn't be redistributed), colour and opacity only.
  const maps = useTexture({
    map: "backdrops/rain/debris/debris_albedo.png",
    alphaMap: "backdrops/rain/debris/debris_opacity.png",
  });

  useLayoutEffect(() => {
    for (const key in maps) {
      const map = maps[key as keyof typeof maps];
      if (map) {
        map.wrapS = map.wrapT = RepeatWrapping;
        map.repeat.set(2, 2);
      }
    }
  }, []);

  return (
    <>
      <Circle
        args={[0.5]}
        renderOrder={1}
        frustumCulled={false}
        rotation-z={MathUtils.degToRad(30)}
        position={[0, 0, 0]}
      >
        <meshStandardMaterial
          {...maps}
          polygonOffset
          polygonOffsetFactor={-2}
          depthWrite={false}
          transparent
          blending={AdditiveBlending}
        />
      </Circle>
    </>
  );
}
