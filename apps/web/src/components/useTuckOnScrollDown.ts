import { useEffect, useState, type RefObject } from "react";

const TRAVEL_PX = 12;

export function useTuckOnScrollDown(ref: RefObject<HTMLElement | null>): boolean {
  const [tucked, setTucked] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const element = ref.current;
      const y = window.scrollY;
      if (Math.abs(y - lastY) < TRAVEL_PX) return;
      const goingDown = y > lastY;
      lastY = y;
      if (!element) return;
      const pinned = element.getBoundingClientRect().top <= 0;
      const typing = element.contains(document.activeElement) && document.activeElement !== document.body;
      setTucked(goingDown && pinned && !typing && y > element.offsetHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref]);

  return tucked;
}
