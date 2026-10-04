import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

/* Scroll-triggered reveal wrapper — IntersectionObserver, no deps. */
export function Reveal({
  children,
  delay = 0,
  variant = "up",
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  variant?: "up" | "left" | "right" | "zoom" | "none";
  className?: string;
  as?: "div" | "section" | "span" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const variantClass =
    variant === "left"
      ? "reveal-left"
      : variant === "right"
        ? "reveal-right"
        : variant === "zoom"
          ? "reveal-zoom"
          : variant === "none"
            ? ""
            : "";

  return (
    <Tag
      // @ts-expect-error polymorphic ref
      ref={ref}
      className={`reveal ${variantClass} ${inView ? "in" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/* Magnetic hover — element gravitates toward cursor, springs back on leave. */
export function Magnetic({ children, strength = 18 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="magnetic inline-block"
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${(x / r.width) * strength}px, ${(y / r.height) * strength}px)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "translate(0,0)";
      }}
    >
      {children}
    </div>
  );
}

/* Spotlight card — amber glow follows the cursor. */
export function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`spotlight ${className}`}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/* 3D tilt on hover — for template / project cards. */
export function Tilt({ children, className = "", max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: "900px" }}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -max * 2;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * max * 2;
        el.firstElementChild instanceof HTMLElement &&
          (el.firstElementChild.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px)`);
      }}
      onMouseLeave={() => {
        const el = ref.current;
        if (el?.firstElementChild instanceof HTMLElement) {
          el.firstElementChild.style.transform = "rotateX(0deg) rotateY(0deg)";
        }
      }}
    >
      <div className="transition-transform duration-200 ease-out will-change-transform">{children}</div>
    </div>
  );
}

/* Animated counter — counts up when scrolled into view. */
export function CountUp({ to, suffix = "", duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 4);
            setVal(Math.round(to * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className="tc tabular-nums">
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/* Kinetic headline — splits text into staggered rising letters per word.
 * `gradient` paints the animated gold onto each letter itself: a clipped
 * background on a PARENT goes invisible once the text lives in child
 * spans, so gradient text must own its own background per letter. */
export function Kinetic({ text, className = "", delayBase = 0, gradient = false }: { text: string; className?: string; delayBase?: number; gradient?: boolean }) {
  const words = text.split(" ");
  let li = 0;
  return (
    <span className={className} aria-label={text}>
      {words.map((w, wi) => (
        <span key={wi} className="inline-block whitespace-pre" aria-hidden>
          {w.split("").map((ch, ci) => {
            const d = delayBase + li++ * 18;
            return (
              <span key={ci} className={gradient ? "letter-rise-gold" : "letter-rise"} style={{ animationDelay: `${d}ms` }}>
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/* Infinite marquee row. */
export function Marquee({ children, fast = false, className = "" }: { children: ReactNode; fast?: boolean; className?: string }) {
  return (
    <div className={`mask-fade-x overflow-hidden ${className}`}>
      <div className={`marquee-track gap-3 pr-3 ${fast ? "marquee-fast" : ""}`}>
        {children}
        {children}
      </div>
    </div>
  );
}

/* Typing effect for the hero prompt bar. */
export function useTypewriter(phrases: string[], speed = 42, pause = 1800) {
  const [text, setText] = useState("");
  useEffect(() => {
    let pi = 0;
    let ci = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const phrase = phrases[pi % phrases.length]!;
      if (!deleting) {
        ci++;
        setText(phrase.slice(0, ci));
        if (ci >= phrase.length) {
          deleting = true;
          timer = setTimeout(step, pause);
          return;
        }
        timer = setTimeout(step, speed);
      } else {
        ci -= 2;
        if (ci <= 0) {
          ci = 0;
          deleting = false;
          pi++;
          setText("");
          timer = setTimeout(step, 350);
          return;
        }
        setText(phrase.slice(0, ci));
        timer = setTimeout(step, speed / 2);
      }
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [phrases, speed, pause]);
  return text;
}
