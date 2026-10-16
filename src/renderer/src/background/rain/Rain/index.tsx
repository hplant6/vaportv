import * as React from "react";
import { Drops } from "./Drops";
import { Splashes } from "./Splashes";

// vaporTV: the demo's rain and night-ambience sounds are left out; the launcher has
// its own background music.
export function Rain({
  children,
  rainProgressRef,
}: React.PropsWithChildren<{
  rainProgressRef: React.MutableRefObject<number>;
}>) {
  return (
    <>
      <Drops rainProgressRef={rainProgressRef} />
      <Splashes rainProgressRef={rainProgressRef}>{children}</Splashes>
    </>
  );
}
