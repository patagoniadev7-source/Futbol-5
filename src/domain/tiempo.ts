import type { Fecha, Minutos } from './types';

// RNF-09: todas las reglas usan la hora oficial de Argentina (UTC-3, sin horario de verano).
export const OFFSET_AR_MIN = -180;
const MS_MIN = 60_000;
const MS_DIA = 86_400_000;

/** Convierte un instante (epoch ms) a fecha y minutos en hora de Argentina. */
export function aHoraAR(ms: number): { fecha: Fecha; minutos: Minutos; diaSemana: number } {
  const d = new Date(ms + OFFSET_AR_MIN * MS_MIN);
  const fecha = d.toISOString().slice(0, 10);
  return { fecha, minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), diaSemana: d.getUTCDay() };
}

/** Instante (epoch ms) de una fecha y minuto en hora de Argentina. */
export function instanteAR(fecha: Fecha, minutos: Minutos): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a, m - 1, d) + (minutos - OFFSET_AR_MIN) * MS_MIN;
}

export function sumarDias(fecha: Fecha, dias: number): Fecha {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

export function diaSemana(fecha: Fecha): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Regla A (D50): el período va de la fecha al mismo día del mes siguiente.
 * Punto abierto A7: si el mes siguiente no tiene ese día, la preview usa el último día
 * de ese mes (31/01 -> 28/02). Debe confirmarlo el dueño del proyecto.
 */
export function mismoDiaMesSiguiente(fecha: Fecha): Fecha {
  const [a, m, d] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate(); // último día del mes siguiente
  return new Date(Date.UTC(a, m, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

export function hhmm(min: Minutos): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseHHMM(txt: string): Minutos {
  const [h, m] = txt.split(':').map(Number);
  return h * 60 + (m || 0);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const nombreDia = (i: number) => DIAS[i];
export const nombreDiaCorto = (i: number) => DIAS_CORTOS[i];

export function fechaLarga(fecha: Fecha): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
}

export function fechaCorta(fecha: Fecha): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d}/${m}`;
}

export function duracionTexto(ms: number): string {
  if (ms <= 0) return '0 min';
  const min = Math.ceil(ms / MS_MIN);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h < 48) return r ? `${h} h ${r} min` : `${h} h`;
  return `${Math.floor(h / 24)} días`;
}
