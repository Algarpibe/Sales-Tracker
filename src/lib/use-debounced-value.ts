import { useEffect, useState } from "react";

/**
 * Devuelve `value` con retraso: solo se actualiza cuando han pasado `delayMs` sin que
 * cambie. Sirve para no lanzar una consulta por cada tecla de un buscador.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
