import { describe, expect, it } from 'vitest';
import {
  aplicarPlazos,
  aprobarHoraFija,
  cancelarPorCliente,
  confirmar,
  crearManual,
  ErrorRegla,
  fechasDeSerie,
  reconfirmarLiberada,
  solicitarHoraFija,
  solicitarTurno,
  turnosDelDia,
} from './reglas';
import { configPorDefecto } from './semilla';
import { aHoraAR, instanteAR, mismoDiaMesSiguiente } from './tiempo';
import type { Estado } from './types';

const MIN = 60_000;
const H = 60 * MIN;
// Miércoles 11/11/2026 10:00 en Argentina.
const AHORA = instanteAR('2026-11-11', 10 * 60);

function vacio(): Estado {
  return { version: 1, config: configPorDefecto(), reservas: [], series: [], auditoria: [], telefonosBloqueados: [] };
}

const pedido = (over = {}) => ({
  fecha: '2026-11-12',
  inicio: 20 * 60,
  nombre: 'Ana',
  telefono: '280 411-1111',
  medio: 'transferencia' as const,
  monto: 'sena' as const,
  dispositivoId: 'dev-1',
  ...over,
});

describe('tiempo', () => {
  it('convierte a hora de Argentina (UTC-3)', () => {
    expect(aHoraAR(Date.UTC(2026, 10, 12, 2, 30))).toMatchObject({ fecha: '2026-11-11', minutos: 23 * 60 + 30 });
  });
  it('Regla A: mismo día del mes siguiente, con fin de mes acotado', () => {
    expect(mismoDiaMesSiguiente('2026-11-05')).toBe('2026-12-05');
    expect(mismoDiaMesSiguiente('2027-01-31')).toBe('2027-02-28');
    expect(mismoDiaMesSiguiente('2028-01-31')).toBe('2028-02-29');
  });
  it('ejemplo de D50: pedida el jueves 5/11 incluye 5, 12, 19, 26/11 y 3/12', () => {
    expect(fechasDeSerie('2026-11-05')).toEqual(['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26', '2026-12-03']);
  });
});

describe('grilla de turnos', () => {
  it('genera turnos de 60 min en punto dentro del horario', () => {
    const t = turnosDelDia(vacio(), '2026-11-12', AHORA); // jueves 14 a 24
    expect(t).toHaveLength(10);
    expect(t[0].inicio).toBe(14 * 60);
    expect(t.at(-1)!.inicio).toBe(23 * 60);
  });
  it('respeta duración y desfase configurables', () => {
    const e = vacio();
    e.config.duracionMin = 90;
    e.config.desfaseInicioMin = 30;
    const t = turnosDelDia(e, '2026-11-12', AHORA);
    expect(t.map((x) => x.inicio)).toEqual([870, 960, 1050, 1140, 1230, 1320]);
  });
  it('no muestra turnos en días cerrados', () => {
    const e = vacio();
    e.config.cerrados = [{ fecha: '2026-11-12', motivo: 'Feriado' }];
    expect(turnosDelDia(e, '2026-11-12', AHORA)).toEqual([]);
  });
});

describe('solicitud y plazos', () => {
  it('una solicitud deja el turno pendiente y bloquea una segunda (RNF-01)', () => {
    const { estado } = solicitarTurno(vacio(), pedido(), AHORA);
    expect(turnosDelDia(estado, '2026-11-12', AHORA).find((t) => t.inicio === 1200)!.estado).toBe('pendiente');
    expect(() => solicitarTurno(estado, pedido({ dispositivoId: 'dev-2', telefono: '2804999999' }), AHORA)).toThrow(ErrorRegla);
  });
  it('libera la solicitud al vencer el plazo de 60 min (RF-40) y es idempotente', () => {
    const { estado, reserva } = solicitarTurno(vacio(), pedido(), AHORA);
    expect(aplicarPlazos(estado, AHORA + 59 * MIN).reservas[0].estado).toBe('pendiente');
    const liberado = aplicarPlazos(estado, AHORA + 60 * MIN);
    expect(liberado.reservas[0].estado).toBe('liberada');
    expect(aplicarPlazos(liberado, AHORA + 61 * MIN)).toBe(liberado);
    expect(reserva.reglas.sena).toBe(10000);
  });
  it('último momento: sin seña y auto-confirmada al iniciar (RF-41)', () => {
    const { estado, reserva } = solicitarTurno(vacio(), pedido({ fecha: '2026-11-11', inicio: 10 * 60 + 30 }), AHORA);
    expect(reserva.ultimoMomento).toBe(true);
    expect(reserva.monto).toBe('completo_al_llegar');
    expect(aplicarPlazos(estado, AHORA + 30 * MIN).reservas[0].estado).toBe('confirmada');
  });
  it('máximo 2 pendientes por dispositivo (D23)', () => {
    let e = solicitarTurno(vacio(), pedido({ inicio: 18 * 60 }), AHORA).estado;
    e = solicitarTurno(e, pedido({ inicio: 19 * 60 }), AHORA).estado;
    expect(() => solicitarTurno(e, pedido({ inicio: 21 * 60 }), AHORA)).toThrow(/pendientes/);
  });
  it('solo hasta un mes hacia adelante (D56)', () => {
    expect(() => solicitarTurno(vacio(), pedido({ fecha: '2026-12-20' }), AHORA)).toThrow(/un mes/);
  });
  it('el dueño puede re-confirmar una liberada si sigue libre (RF-35)', () => {
    const { estado, reserva } = solicitarTurno(vacio(), pedido(), AHORA);
    const lib = aplicarPlazos(estado, AHORA + 2 * H);
    expect(reconfirmarLiberada(lib, reserva.id, AHORA + 2 * H).reservas[0].estado).toBe('confirmada');
  });
});

describe('cancelación', () => {
  it('a tiempo genera aviso de devolución; tardía pierde la seña', () => {
    const { estado, reserva } = solicitarTurno(vacio(), pedido(), AHORA);
    const conf = confirmar(estado, reserva.id, AHORA);
    const aTiempo = cancelarPorCliente(conf, reserva.id, AHORA + H);
    expect(aTiempo.reservas[0].estado).toBe('cancelada_cliente_a_tiempo');
    expect(aTiempo.reservas[0].aviso?.resuelto).toBe(false);
    const tarde = cancelarPorCliente(conf, reserva.id, instanteAR('2026-11-12', 19 * 60));
    expect(tarde.reservas[0].estado).toBe('cancelada_cliente_tardia');
  });
  it('los cambios de política no afectan reservas hechas (D26)', () => {
    const { estado, reserva } = solicitarTurno(vacio(), pedido(), AHORA);
    const e = { ...estado, config: { ...estado.config, ventanaCancelacionHoras: 1 } };
    // Con la ventana original de 12 h, cancelar 3 h antes es tardío.
    const r = cancelarPorCliente(confirmar(e, reserva.id, AHORA), reserva.id, instanteAR('2026-11-12', 17 * 60));
    expect(r.reservas[0].estado).toBe('cancelada_cliente_tardia');
  });
});

describe('hora fija', () => {
  it('omite fechas ya ocupadas por reservas previas (D37) y crea pendientes semanales', () => {
    let e = crearManual(vacio(), { fecha: '2026-11-19', inicio: 20 * 60, nombre: 'Previo', telefono: '' }, AHORA);
    const { estado, serie } = solicitarHoraFija(e, { diaSemana: 4, inicio: 20 * 60, nombre: 'Equipo', telefono: '2804555555' }, AHORA);
    expect(serie.fechas[0]).toBe('2026-11-12');
    e = aprobarHoraFija(estado, serie.id, AHORA);
    const deSerie = e.reservas.filter((r) => r.serieId === serie.id);
    expect(e.series[0].fechasOmitidas).toEqual(['2026-11-19']);
    expect(deSerie).toHaveLength(serie.fechas.length - 1);
    // Cada fecha vence 2 h antes del turno (D44).
    expect(deSerie[0].venceEn).toBe(instanteAR('2026-11-12', 18 * 60));
  });
});
