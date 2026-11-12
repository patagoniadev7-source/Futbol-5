import type { Config, Estado, Reserva } from './types';
import { CANCHA_ID, generarCodigo } from './reglas';
import { aHoraAR, instanteAR, sumarDias } from './tiempo';

export const VERSION_ESTADO = 1;

/** Valores por defecto. Precio, seña y ventana de cancelación son EJEMPLOS (punto abierto A3). */
export function configPorDefecto(): Config {
  const semana = { abierto: true, desde: 14 * 60, hasta: 24 * 60 };
  const finde = { abierto: true, desde: 10 * 60, hasta: 24 * 60 };
  return {
    nombreCancha: 'Cancha de Fútbol 5',
    telefonoDueno: '5492800000000',
    duracionMin: 60,
    desfaseInicioMin: 0,
    horarios: [finde, semana, semana, semana, semana, semana, finde],
    cerrados: [],
    precio: 40000,
    sena: 10000,
    ventanaCancelacionHoras: 12,
    plazoPagoMin: 60,
    limiteHoraFijaHoras: 2,
    horizonteDias: 30,
    maxPendientesPorDispositivo: 2,
    banco: { alias: 'CANCHA.FUTBOL.DEMO', cbu: '0000003100000000000000', banco: 'Banco de ejemplo', titular: 'Titular de ejemplo' },
  };
}

/** Datos ficticios para que la preview no arranque vacía. */
export function estadoInicial(ahora: number): Estado {
  const config = configPorDefecto();
  const hoy = aHoraAR(ahora).fecha;
  const manana = sumarDias(hoy, 1);
  const base = (over: Partial<Reserva>): Reserva => ({
    id: `demo-${Math.random().toString(36).slice(2, 9)}`,
    codigo: generarCodigo(),
    canchaId: CANCHA_ID,
    fecha: manana,
    inicio: 20 * 60,
    duracionMin: 60,
    nombre: 'Cliente',
    telefono: '2804000000',
    medio: 'transferencia',
    monto: 'sena',
    ultimoMomento: false,
    origen: 'cliente',
    estado: 'confirmada',
    creadaEn: ahora - 3_600_000,
    venceEn: null,
    reglas: { precio: config.precio, sena: config.sena, ventanaCancelacionHoras: config.ventanaCancelacionHoras },
    historial: [{ en: ahora - 3_600_000, texto: 'Datos de demostración' }],
    ...over,
  });
  const reservas: Reserva[] = [
    base({ nombre: 'Martín (demo)', telefono: '2804111111', fecha: manana, inicio: 19 * 60 }),
    base({ nombre: 'Los Pibes FC (demo)', telefono: '2804222222', fecha: manana, inicio: 21 * 60, origen: 'dueno', medio: 'efectivo', monto: 'total' }),
    base({
      nombre: 'Lucía (demo)',
      telefono: '2804333333',
      fecha: manana,
      inicio: 22 * 60,
      estado: 'pendiente',
      creadaEn: ahora - 20 * 60_000,
      venceEn: ahora + 40 * 60_000,
      dispositivoId: 'otro-dispositivo',
    }),
    base({ nombre: 'Sergio (demo)', telefono: '2804444444', fecha: sumarDias(hoy, 2), inicio: 20 * 60 }),
  ];
  // Evita que un dato de demo caiga en el pasado si se abre tarde por la noche.
  const futuras = reservas.filter((r) => instanteAR(r.fecha, r.inicio) > ahora);
  return { version: VERSION_ESTADO, config, reservas: futuras, series: [], auditoria: [], telefonosBloqueados: [] };
}
