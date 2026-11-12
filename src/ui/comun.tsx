import type { ReactNode } from 'react';
import type { EstadoReserva, Reserva } from '../domain/types';

export const pesos = (n: number) => `$ ${n.toLocaleString('es-AR')}`;

export function enlaceWhatsApp(telefono: string, texto: string): string {
  let t = telefono.replace(/\D/g, '');
  if (!t.startsWith('54')) t = `549${t}`; // números locales de Argentina
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
}

const ETIQUETAS: Record<EstadoReserva, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  liberada: 'Liberada',
  rechazada: 'Rechazada',
  cancelada_cliente_a_tiempo: 'Cancelada a tiempo',
  cancelada_cliente_tardia: 'Cancelada tarde',
  cancelada_dueno: 'Baja por la cancha',
  completada: 'Jugada',
};

export function Chip({ estado }: { estado: EstadoReserva }) {
  return <span className={`chip chip-${estado}`}>{ETIQUETAS[estado]}</span>;
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`tarjeta ${className}`}>{children}</div>;
}

export function MsgError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="alerta alerta-error" role="alert">
      {msg}
    </div>
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="campo-ayuda">{ayuda}</span>}
    </label>
  );
}

export function Segmentos<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: T;
  opciones: { valor: T; texto: string; deshabilitado?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmentos" role="radiogroup">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={o.deshabilitado}
          className={valor === o.valor ? 'activo' : ''}
          onClick={() => onChange(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function textoMonto(r: Reserva): string {
  if (r.monto === 'completo_al_llegar') return `${pesos(r.reglas.precio)} al llegar a la cancha`;
  if (r.medio === 'efectivo') return `${pesos(r.reglas.precio)} en efectivo`;
  return r.monto === 'sena' ? `Seña ${pesos(r.reglas.sena)}` : `Total ${pesos(r.reglas.precio)}`;
}
