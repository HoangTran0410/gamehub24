import { createPortal } from "react-dom";
import { useState, useEffect, type ReactNode } from "react";

interface PortalProps {
  children: ReactNode;
  container?: HTMLElement | null;
}

/**
 * A Portal component that dynamically attaches its children to the current fullscreen element
 * or document.body if no element is in fullscreen.
 * This ensures modals and overlays are visible even in fullscreen mode.
 */
export default function Portal({ children, container }: PortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateTarget = () => {
      // If a container is explicitly provided, use it
      if (container) {
        setTarget(container);
        return;
      }

      // Otherwise, use the current fullscreen element or fallback to document.body
      const fullscreenElement =
        document.fullscreenElement as HTMLElement | null;
      setTarget(fullscreenElement || document.body);
    };

    updateTarget();

    // Listen to fullscreen changes to move the portal target
    window.addEventListener("fullscreenchange", updateTarget);
    return () => window.removeEventListener("fullscreenchange", updateTarget);
  }, [container]);

  if (!target) return null;

  return createPortal(children, target);
}
