import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vitest corre en node sin renderizador de React: se sustituyen useState/useEffect
// por dobles que guardan el setter y el efecto, y se ejecuta el efecto a mano como
// lo haría React tras cada render con dependencias cambiadas.
const react = vi.hoisted(() => ({
  setState: vi.fn(),
  effect: null as null | (() => void | (() => void)),
  deps: null as null | unknown[],
}));

vi.mock("react", () => ({
  useState: <T,>(initial: T) => [initial, react.setState],
  useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
    react.effect = fn;
    react.deps = deps;
  },
}));

import { useDebouncedValue } from "@/lib/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    react.setState.mockReset();
    react.effect = null;
    react.deps = null;
  });
  afterEach(() => vi.useRealTimers());

  it("devuelve el valor inicial en el primer render", () => {
    expect(useDebouncedValue("ab", 300)).toBe("ab");
  });

  it("publica el valor solo cuando pasan los ms indicados sin cambios", () => {
    useDebouncedValue("abc", 300);
    react.effect!();
    vi.advanceTimersByTime(299);
    expect(react.setState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(react.setState).toHaveBeenCalledExactlyOnceWith("abc");
  });

  it("un cambio antes de tiempo cancela el valor pendiente (limpieza del efecto)", () => {
    useDebouncedValue("ab", 300);
    const cleanup = react.effect!();
    vi.advanceTimersByTime(200);
    (cleanup as () => void)();

    useDebouncedValue("abc", 300);
    react.effect!();
    vi.advanceTimersByTime(300);
    expect(react.setState).toHaveBeenCalledExactlyOnceWith("abc");
  });

  it("re-ejecuta el efecto cuando cambian el valor o el retardo", () => {
    useDebouncedValue("abc", 300);
    expect(react.deps).toEqual(["abc", 300]);
  });
});
