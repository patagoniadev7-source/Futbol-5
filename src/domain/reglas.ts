import type {
  Config,
  Estado,
  EstadoReserva,
  Fecha,
  MedioPago,
  Minutos,
  Reserva,
  SerieHoraFija,
  TipoMonto,
} from './types';
import { aHoraAR, diaSemana, fechaCorta, hhmm, instanteAR, mismoDiaMesSiguiente, sumarDias } from './tiempo';

export const CANCHA_ID = 'cancha-1';
const MS_MIN = 60_000;
const MS_H = 3_600_000;

export class ErrorRegla extends Error {}

// ---------------------------------------------------------------------------
// Ocupación

/** Estados que bloquean el horario (RF-06: la solicitud pendiente figura ocupada). */
export function ocupaHorario(estado: EstadoReserva): boolean {
  return estado === 'pendiente' || estado === 'confirmada' || estado === 'completada';
}

function seSolapan(aIni: number, aDur: number, bIni: number, bDur: number): boolean {
  return aIni < bIni + bDur && bIni < aIni + aDur;
}

export function reservasQueOcupan(estado: Estado, fecha: Fecha, inicio: Minutos, duracion: number): Reserva[] {
  return estado.reservas.filter(
    (r) =>
      r.canchaId === CANCHA_ID &&
      r.fecha === fecha &&
      ocupaHorario(r.estado) &&
      seSolapan(r.inicio, r.duracionMin, inicio, duracion),
  );
}

export function diaCerrado(config: Config, fecha: Fecha): string | null {
  const c = config.cerrados.find((x) => x.fecha === fecha);
  if (c) return c.motivo || 'Cerrado';
  if (!config.horarios[diaSemana(fecha)].abierto) return 'Cerrado';
  return null;
}

// ---------------------------------------------------------------------------
// Grilla de turnos (D25, D40, D53, D39)

export type EstadoTurno = 'libre' | 'pendiente' | 'ocupado' | 'pasado';

export interface Turno {
  fecha: Fecha;
  inicio: Minutos;
  duracionMin: number;
  estado: EstadoTurno;
  reserva?: Reserva;
}

export function turnosDelDia(estado: Estado, fecha: Fecha, ahora: number): Turno[] {
  const { config } = estado;
  if (diaCerrado(config, fecha)) return [];
  const h = config.horarios[diaSemana(fecha)];
  const dur = config.duracionMin;
  const turnos: Turno[] = [];
  for (let ini = h.desde + config.desfaseInicioMin; ini + dur <= h.hasta; ini += dur) {
    const ocupan = reservasQueOcupan(estado, fecha, ini, dur);
    let est: EstadoTurno = 'libre';
    if (ocupan.some((r) => r.estado !== 'pendiente')) est = 'ocupado';
    else if (ocupan.length) est = 'pendiente';
    else if (instanteAR(fecha, ini) <= ahora) est = 'pasado';
    turnos.push({ fecha, inicio: ini, duracionMin: dur, estado: est, reserva: ocupan[0] });
  }
  return turnos;
}

export function fechasReservables(config: Config, ahora: number): Fecha[] {
  const hoy = aHoraAR(ahora).fecha;
  return Array.from({ length: config.horizonteDias + 1 }, (_, i) => sumarDias(hoy, i));
}

// ---------------------------------------------------------------------------
// Utilidades

export function generarCodigo(azar: () => number = Math.random): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para evitar confusiones
  return Array.from({ length: 6 }, () => letras[Math.floor(azar() * letras.length)]).join('');
}

function nuevoId(prefijo: string): string {
  return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, '');
}

function conHistorial(r: Reserva, en: number, texto: string): Reserva {
  return { ...r, historial: [...r.historial, { en, texto }] };
}

function reemplazar(estado: Estado, r: Reserva): Estado {
  return { ...estado, reservas: estado.reservas.map((x) => (x.id === r.id ? r : x)) };
}

function auditar(estado: Estado, en: number, accion: string): Estado {
  return { ...estado, auditoria: [{ en, accion }, ...estado.auditoria].slice(0, 200) };
}

export function montoAPagar(r: Pick<Reserva, 'monto' | 'reglas'>): number {
  return r.monto === 'sena' ? r.reglas.sena : r.reglas.precio;
}

// ---------------------------------------------------------------------------
// Solicitud del cliente (RF-03..RF-09)

export interface DatosSolicitud {
  fecha: Fecha;
  inicio: Minutos;
  nombre: string;
  telefono: string;
  medio: MedioPago;
  monto: 'sena' | 'total';
  dispositivoId: string;
}

/** Último momento: el turno empieza antes de que venza el plazo de pago (glosario). */
export function esUltimoMomento(config: Config, fecha: Fecha, inicio: Minutos, ahora: number): boolean {
  return instanteAR(fecha, inicio) < ahora + config.plazoPagoMin * MS_MIN;
}

export function pendientesDelDispositivo(estado: Estado, dispositivoId: string): number {
  return estado.reservas.filter((r) => r.dispositivoId === dispositivoId && r.estado === 'pendiente').length;
}

function validarTurnoLibre(estado: Estado, fecha: Fecha, inicio: Minutos, duracion: number, ahora: number) {
  const motivo = diaCerrado(estado.config, fecha);
  if (motivo) throw new ErrorRegla(`Ese día la cancha está cerrada (${motivo}).`);
  if (instanteAR(fecha, inicio) <= ahora) throw new ErrorRegla('Ese turno ya comenzó.');
  // RNF-01: nunca una doble reserva. En el sistema real esto lo garantiza la base de datos.
  if (reservasQueOcupan(estado, fecha, inicio, duracion).length)
    throw new ErrorRegla('Ese turno ya no está disponible. Elija otro horario.');
}

export function solicitarTurno(estado: Estado, d: DatosSolicitud, ahora: number): { estado: Estado; reserva: Reserva } {
  const { config } = estado;
  const tel = normalizarTelefono(d.telefono);
  if (d.nombre.trim().length < 2) throw new ErrorRegla('Ingrese su nombre.');
  if (tel.length < 8) throw new ErrorRegla('Ingrese un teléfono válido, con código de área.');
  if (estado.telefonosBloqueados.includes(tel))
    throw new ErrorRegla('No es posible reservar con este teléfono. Comuníquese con la cancha.');
  if (!fechasReservables(config, ahora).includes(d.fecha))
    throw new ErrorRegla('Solo se puede reservar hasta un mes hacia adelante.');
  validarTurnoLibre(estado, d.fecha, d.inicio, config.duracionMin, ahora);
  // D23: máximo de solicitudes pendientes por dispositivo (incluye efectivo, D59).
  if (pendientesDelDispositivo(estado, d.dispositivoId) >= config.maxPendientesPorDispositivo)
    throw new ErrorRegla(
      `Ya tiene ${config.maxPendientesPorDispositivo} solicitudes pendientes. Espere a que la cancha las confirme.`,
    );

  const ultimo = esUltimoMomento(config, d.fecha, d.inicio, ahora);
  const inicioMs = instanteAR(d.fecha, d.inicio);
  const monto: TipoMonto = ultimo ? 'completo_al_llegar' : d.medio === 'efectivo' ? 'total' : d.monto;
  const reserva: Reserva = {
    id: nuevoId('r'),
    codigo: generarCodigo(),
    canchaId: CANCHA_ID,
    fecha: d.fecha,
    inicio: d.inicio,
    duracionMin: config.duracionMin,
    nombre: d.nombre.trim(),
    telefono: tel,
    medio: ultimo ? 'efectivo' : d.medio,
    monto,
    ultimoMomento: ultimo,
    origen: 'cliente',
    estado: 'pendiente',
    creadaEn: ahora,
    // D20: se libera al vencer el plazo. D61: en último momento, se resuelve a la hora de inicio.
    venceEn: ultimo ? inicioMs : ahora + config.plazoPagoMin * MS_MIN,
    reglas: { precio: config.precio, sena: config.sena, ventanaCancelacionHoras: config.ventanaCancelacionHoras },
    dispositivoId: d.dispositivoId,
    historial: [{ en: ahora, texto: ultimo ? 'Solicitud de último momento' : 'Solicitud enviada' }],
  };
  return { estado: { ...estado, reservas: [...estado.reservas, reserva] }, reserva };
}

// ---------------------------------------------------------------------------
// Motor de plazos (RF-40..RF-43)

/** Aplica las reglas automáticas. Es idempotente: ejecutarlo dos veces da el mismo resultado (RNF-10). */
export function aplicarPlazos(estado: Estado, ahora: number): Estado {
  let cambio = false;
  const reservas = estado.reservas.map((r) => {
    const fin = instanteAR(r.fecha, r.inicio + r.duracionMin);
    if (r.estado === 'pendiente' && r.venceEn !== null && ahora >= r.venceEn) {
      cambio = true;
      if (r.ultimoMomento) return conHistorial({ ...r, estado: 'confirmada' }, r.venceEn, 'Confirmada automáticamente al iniciar el turno (último momento)');
      return conHistorial({ ...r, estado: 'liberada' }, r.venceEn, 'Liberada: venció el plazo sin confirmación');
    }
    if (r.estado === 'confirmada' && ahora >= fin) {
      cambio = true;
      return conHistorial({ ...r, estado: 'completada' }, fin, 'Turno jugado');
    }
    return r;
  });
  return cambio ? { ...estado, reservas } : estado;
}

// ---------------------------------------------------------------------------
// Acciones del dueño (RF-24, RF-25, RF-35)

export function confirmar(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (r.estado !== 'pendiente') throw new ErrorRegla('Solo se pueden confirmar solicitudes pendientes.');
  return auditar(
    reemplazar(estado, conHistorial({ ...r, estado: 'confirmada', venceEn: null }, ahora, 'Confirmada por el dueño')),
    ahora,
    `Confirmó la reserva ${r.codigo} (${r.nombre}, ${fechaCorta(r.fecha)} ${hhmm(r.inicio)})`,
  );
}

export function rechazar(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (r.estado !== 'pendiente') throw new ErrorRegla('Solo se pueden rechazar solicitudes pendientes.');
  return auditar(
    reemplazar(estado, conHistorial({ ...r, estado: 'rechazada', venceEn: null }, ahora, 'Rechazada por el dueño')),
    ahora,
    `Rechazó la reserva ${r.codigo} (${r.nombre})`,
  );
}

/** RF-35 (propuesto): re-confirmar una solicitud liberada si el horario sigue libre. */
export function reconfirmarLiberada(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (r.estado !== 'liberada') throw new ErrorRegla('Solo aplica a solicitudes liberadas por plazo.');
  validarTurnoLibre(estado, r.fecha, r.inicio, r.duracionMin, ahora);
  return auditar(
    reemplazar(estado, conHistorial({ ...r, estado: 'confirmada', venceEn: null }, ahora, 'Re-confirmada tras pago tardío')),
    ahora,
    `Re-confirmó la reserva liberada ${r.codigo}`,
  );
}

export function cancelarPorDueno(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (r.estado !== 'pendiente' && r.estado !== 'confirmada') throw new ErrorRegla('Esta reserva no está activa.');
  const aviso = r.origen === 'cliente' ? { motivo: 'Cancelada por la cancha: devolver o reprogramar', resuelto: false } : undefined;
  return auditar(
    reemplazar(estado, conHistorial({ ...r, estado: 'cancelada_dueno', venceEn: null, aviso }, ahora, 'Dada de baja por el dueño')),
    ahora,
    `Dio de baja la reserva ${r.codigo} (${r.nombre})`,
  );
}

export interface DatosManual {
  fecha: Fecha;
  inicio: Minutos;
  nombre: string;
  telefono: string;
}

/** RF-25: reservas manuales del dueño, confirmadas de inmediato (D28, D42). */
export function crearManual(estado: Estado, d: DatosManual, ahora: number): Estado {
  const { config } = estado;
  if (d.nombre.trim().length < 2) throw new ErrorRegla('Ingrese el nombre del cliente.');
  validarTurnoLibre(estado, d.fecha, d.inicio, config.duracionMin, ahora);
  const r: Reserva = {
    id: nuevoId('r'),
    codigo: generarCodigo(),
    canchaId: CANCHA_ID,
    fecha: d.fecha,
    inicio: d.inicio,
    duracionMin: config.duracionMin,
    nombre: d.nombre.trim(),
    telefono: normalizarTelefono(d.telefono),
    medio: 'efectivo',
    monto: 'total',
    ultimoMomento: false,
    origen: 'dueno',
    estado: 'confirmada',
    creadaEn: ahora,
    venceEn: null,
    reglas: { precio: config.precio, sena: config.sena, ventanaCancelacionHoras: config.ventanaCancelacionHoras },
    historial: [{ en: ahora, texto: 'Cargada por el dueño' }],
  };
  return auditar({ ...estado, reservas: [...estado.reservas, r] }, ahora, `Cargó una reserva manual para ${r.nombre} (${fechaCorta(r.fecha)} ${hhmm(r.inicio)})`);
}

export function resolverAviso(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (!r.aviso) return estado;
  return auditar(reemplazar(estado, { ...r, aviso: { ...r.aviso, resuelto: true } }), ahora, `Marcó como resuelto el aviso de ${r.codigo}`);
}

// ---------------------------------------------------------------------------
// Cancelación del cliente (RF-10, RF-11)

export function buscarPorCodigo(estado: Estado, telefono: string, codigo: string): Reserva | undefined {
  const tel = normalizarTelefono(telefono);
  const cod = codigo.trim().toUpperCase();
  return estado.reservas.find((r) => r.telefono === tel && r.codigo === cod);
}

export function cancelacionATiempo(r: Reserva, ahora: number): boolean {
  return ahora <= instanteAR(r.fecha, r.inicio) - r.reglas.ventanaCancelacionHoras * MS_H;
}

export function cancelarPorCliente(estado: Estado, id: string, ahora: number): Estado {
  const r = buscar(estado, id);
  if (r.estado !== 'pendiente' && r.estado !== 'confirmada') throw new ErrorRegla('Esta reserva ya no está activa.');
  if (instanteAR(r.fecha, r.inicio) <= ahora) throw new ErrorRegla('El turno ya comenzó.');
  const aTiempo = cancelacionATiempo(r, ahora);
  // Una pendiente nunca fue confirmada: no hay nada que devolver.
  const requiereAviso = r.estado === 'confirmada';
  const nuevo: Reserva = {
    ...r,
    estado: aTiempo ? 'cancelada_cliente_a_tiempo' : 'cancelada_cliente_tardia',
    venceEn: null,
    aviso: requiereAviso
      ? { motivo: aTiempo ? 'Cancelación a tiempo: devolver o reprogramar' : 'Cancelación tardía: la seña queda para la cancha', resuelto: !aTiempo }
      : undefined,
  };
  return reemplazar(estado, conHistorial(nuevo, ahora, aTiempo ? 'Cancelada por el cliente a tiempo' : 'Cancelada por el cliente fuera de término'));
}

// ---------------------------------------------------------------------------
// Hora fija (D15, D50, D37, D44)

export function fechasDeSerie(desde: Fecha): Fecha[] {
  const hasta = mismoDiaMesSiguiente(desde);
  const fechas: Fecha[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 7)) fechas.push(f);
  return fechas;
}

/** Primera fecha >= hoy con ese día de semana cuyo horario todavía no pasó. */
export function primeraFecha(diaSem: number, inicio: Minutos, ahora: number): Fecha {
  const hoy = aHoraAR(ahora).fecha;
  for (let i = 0; i < 8; i++) {
    const f = sumarDias(hoy, i);
    if (diaSemana(f) === diaSem && instanteAR(f, inicio) > ahora) return f;
  }
  return sumarDias(hoy, 7);
}

export function solicitarHoraFija(
  estado: Estado,
  d: { diaSemana: number; inicio: Minutos; nombre: string; telefono: string },
  ahora: number,
): { estado: Estado; serie: SerieHoraFija } {
  const tel = normalizarTelefono(d.telefono);
  if (d.nombre.trim().length < 2) throw new ErrorRegla('Ingrese su nombre.');
  if (tel.length < 8) throw new ErrorRegla('Ingrese un teléfono válido, con código de área.');
  const h = estado.config.horarios[d.diaSemana];
  if (!h.abierto) throw new ErrorRegla('La cancha no abre ese día de la semana.');
  const fechas = fechasDeSerie(primeraFecha(d.diaSemana, d.inicio, ahora));
  const serie: SerieHoraFija = {
    id: nuevoId('s'),
    canchaId: CANCHA_ID,
    diaSemana: d.diaSemana,
    inicio: d.inicio,
    duracionMin: estado.config.duracionMin,
    nombre: d.nombre.trim(),
    telefono: tel,
    fechas,
    fechasOmitidas: [],
    estado: 'solicitada',
    creadaEn: ahora,
  };
  return { estado: { ...estado, series: [...estado.series, serie] }, serie };
}

/**
 * RF-34: el dueño aprueba la serie. Cada fecha libre se convierte en una reserva pendiente
 * que debe confirmarse hasta N horas antes (D44). Las fechas ocupadas se omiten (D37) y las
 * cerradas también (D38).
 */
export function aprobarHoraFija(estado: Estado, serieId: string, ahora: number): Estado {
  const s = estado.series.find((x) => x.id === serieId);
  if (!s || s.estado !== 'solicitada') throw new ErrorRegla('La solicitud de hora fija no está pendiente.');
  const { config } = estado;
  let est = estado;
  const omitidas: Fecha[] = [];
  for (const fecha of s.fechas) {
    const inicioMs = instanteAR(fecha, s.inicio);
    if (diaCerrado(config, fecha) || inicioMs <= ahora || reservasQueOcupan(est, fecha, s.inicio, s.duracionMin).length) {
      omitidas.push(fecha);
      continue;
    }
    const r: Reserva = {
      id: nuevoId('r'),
      codigo: generarCodigo(),
      canchaId: s.canchaId,
      fecha,
      inicio: s.inicio,
      duracionMin: s.duracionMin,
      nombre: s.nombre,
      telefono: s.telefono,
      medio: 'transferencia',
      monto: 'sena',
      ultimoMomento: false,
      origen: 'cliente',
      estado: 'pendiente',
      creadaEn: ahora,
      venceEn: Math.max(ahora, inicioMs - config.limiteHoraFijaHoras * MS_H),
      reglas: { precio: config.precio, sena: config.sena, ventanaCancelacionHoras: config.ventanaCancelacionHoras },
      serieId: s.id,
      historial: [{ en: ahora, texto: 'Fecha de hora fija aprobada; falta confirmar la seña semanal' }],
    };
    est = { ...est, reservas: [...est.reservas, r] };
  }
  est = { ...est, series: est.series.map((x) => (x.id === s.id ? { ...x, estado: 'aprobada', fechasOmitidas: omitidas } : x)) };
  return auditar(est, ahora, `Aprobó la hora fija de ${s.nombre} (${s.fechas.length - omitidas.length} fechas)`);
}

export function rechazarHoraFija(estado: Estado, serieId: string, ahora: number): Estado {
  const s = estado.series.find((x) => x.id === serieId);
  if (!s || s.estado !== 'solicitada') throw new ErrorRegla('La solicitud de hora fija no está pendiente.');
  return auditar(
    { ...estado, series: estado.series.map((x) => (x.id === s.id ? { ...x, estado: 'rechazada' } : x)) },
    ahora,
    `Rechazó la hora fija de ${s.nombre}`,
  );
}

// ---------------------------------------------------------------------------
// Configuración (RF-26..RF-29)

export const CONTRASENA_DEMO = 'demo';

export function actualizarConfig(estado: Estado, cambios: Partial<Config>, ahora: number, descripcion: string): Estado {
  // D26: los cambios no afectan reservas existentes, porque cada una guarda su snapshot.
  return auditar({ ...estado, config: { ...estado.config, ...cambios } }, ahora, descripcion);
}

export function actualizarBanco(estado: Estado, banco: Config['banco'], contrasena: string, ahora: number): Estado {
  // D48: reautenticación + auditoría + aviso visible.
  if (contrasena !== CONTRASENA_DEMO) throw new ErrorRegla('Contraseña incorrecta.');
  return auditar({ ...estado, config: { ...estado.config, banco } }, ahora, '⚠️ Cambió los datos bancarios (alias/CBU/banco/titular)');
}

function buscar(estado: Estado, id: string): Reserva {
  const r = estado.reservas.find((x) => x.id === id);
  if (!r) throw new ErrorRegla('Reserva no encontrada.');
  return r;
}
