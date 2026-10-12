import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";

const HOLD_MS = 1200;

/**
 * Symbol-only sign out with a hold-to-confirm gesture: press and keep the icon
 * held until the ring fills, release early to cancel.
 */
export function HoldToSignOut({ onSignOut, name }: { onSignOut: () => void; name?: string }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startedAt = useRef(0);
  const frame = useRef(0);
  const done = useRef(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    const held = performance.now() - startedAt.current;
    const value = Math.min(1, held / HOLD_MS);
    setProgress(value);
    if (value >= 1) {
      if (!done.current) {
        done.current = true;
        stop();
        onSignOut();
      }
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [onSignOut, stop]);

  const begin = useCallback(() => {
    done.current = false;
    startedAt.current = performance.now();
    setHolding(true);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  }, [tick]);

  return (
    <span className={`signout-hold ${holding ? "holding" : ""}`} style={{ ["--hold" as string]: progress }}>
      <span className="signout-name">Log out</span>
      {!holding && <span className="signout-tip">Hold to sign out</span>}
      {holding && <span className="signout-tip live">Keep holding…</span>}
      <button
        className="signout-symbol"
        aria-label="Hold to sign out"
        onPointerDown={begin}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            begin();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key === " ") stop();
        }}
      >
        <LogOut size={16} />
      </button>
    </span>
  );
}
