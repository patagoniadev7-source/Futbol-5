import { useCallback, useEffect, useRef, useState } from 'react';
import type { Estado } from './domain/types';
import { aplicarPlazos, ErrorRegla } from './domain/reglas';
import { estadoInicial, VERSION_ESTADO } from './domain/semilla';

// La preview guarda todo en el navegador (localStorage). En el sistema real esto vive en el servidor.
const CLAVE = 'futbol5-preview';

interface Persistido {
  estado: Estado;
  desfaseRelojMs: number;
  dispositivoId: string;
}

function leer(): Persistido | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persistido;
    return p.estado?.version === VERSION_ESTADO ? p : null;
  } catch {
    return null;
  }
}

function guardar(p: Persistido) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento disponible: la preview sigue funcionando en memoria */
  }
}

function nuevo(): Persistido {
  return {
    estado: estadoInicial(Date.now()),
    desfaseRelojMs: 0,
    dispositivoId: `dev-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export type Accion = (e: Estado, ahora: number) => Estado;

export function useApp() {
  const [p, setP] = useState<Persistido>(() => leer() ?? nuevo());
  const [tic, setTic] = useState(0);
  const ref = useRef(p);
  ref.current = p;

  const ahora = Date.now() + p.desfaseRelojMs;

  // Motor de plazos: se aplica cada 5 segundos y en cada cambio de reloj.
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const cur = ref.current;
    const sig = aplicarPlazos(cur.estado, Date.now() + cur.desfaseRelojMs);
    if (sig !== cur.estado) setP({ ...cur, estado: sig });
  }, [tic, p.desfaseRelojMs]);

  useEffect(() => guardar(p), [p]);

  /** Ejecuta una acción de dominio. Devuelve el mensaje de error si la regla la rechaza. */
  const hacer = useCallback((accion: Accion): string | null => {
    const cur = ref.current;
    const t = Date.now() + cur.desfaseRelojMs;
    try {
      const sig = aplicarPlazos(accion(aplicarPlazos(cur.estado, t), t), t);
      setP({ ...cur, estado: sig });
      return null;
    } catch (e) {
      if (e instanceof ErrorRegla) return e.message;
      throw e;
    }
  }, []);

  const adelantarReloj = useCallback((ms: number) => {
    setP((cur) => ({ ...cur, desfaseRelojMs: ms === 0 ? 0 : cur.desfaseRelojMs + ms }));
  }, []);

  const reiniciar = useCallback(() => setP(nuevo()), []);

  return { estado: p.estado, ahora, desfaseRelojMs: p.desfaseRelojMs, dispositivoId: p.dispositivoId, hacer, adelantarReloj, reiniciar };
}

export type App = ReturnType<typeof useApp>;
