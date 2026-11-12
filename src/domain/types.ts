// Modelo de dominio de la preview. Preparado para varias canchas (RF-50),
// aunque la interfaz opera con una sola (RF-51).

/** Fecha calendario en hora de Argentina, formato YYYY-MM-DD. */
export type Fecha = string;
/** Minutos desde la medianoche (0..1440). */
export type Minutos = number;

export interface HorarioDia {
  abierto: boolean;
  desde: Minutos;
  hasta: Minutos; // 1440 = 24:00
}

export interface DiaCerrado {
  fecha: Fecha;
  motivo: string;
}

export interface DatosBancarios {
  alias: string;
  cbu: string;
  banco: string;
  titular: string;
}

export interface Config {
  nombreCancha: string;
  telefonoDueno: string; // formato internacional sin "+", p. ej. 549280...
  duracionMin: number; // D25, D53: 60 por defecto
  desfaseInicioMin: number; // D40: 0 = turnos en punto
  horarios: HorarioDia[]; // índice 0 = domingo ... 6 = sábado
  cerrados: DiaCerrado[]; // D39, D38: días cerrados, feriados o suspendidos
  precio: number; // D41
  sena: number; // D10
  ventanaCancelacionHoras: number; // D4 (valor a definir: A3)
  plazoPagoMin: number; // D20, D45: 60 por defecto
  limiteHoraFijaHoras: number; // D44, D54: 2 por defecto
  horizonteDias: number; // D56: 1 mes
  maxPendientesPorDispositivo: number; // D23: 2
  banco: DatosBancarios;
}

export type MedioPago = 'transferencia' | 'efectivo';
export type TipoMonto = 'sena' | 'total' | 'completo_al_llegar';

export type EstadoReserva =
  | 'pendiente'
  | 'confirmada'
  | 'liberada'
  | 'rechazada'
  | 'cancelada_cliente_a_tiempo'
  | 'cancelada_cliente_tardia'
  | 'cancelada_dueno'
  | 'completada';

/** Valores vigentes al momento de crear la reserva (D26, RF-44). */
export interface ReglasSnapshot {
  precio: number;
  sena: number;
  ventanaCancelacionHoras: number;
}

export interface Reserva {
  id: string;
  codigo: string;
  canchaId: string;
  fecha: Fecha;
  inicio: Minutos;
  duracionMin: number;
  nombre: string;
  telefono: string;
  medio: MedioPago;
  monto: TipoMonto;
  ultimoMomento: boolean;
  origen: 'cliente' | 'dueno';
  estado: EstadoReserva;
  creadaEn: number; // epoch ms
  /** Momento en que vence la solicitud pendiente (epoch ms). */
  venceEn: number | null;
  reglas: ReglasSnapshot;
  serieId?: string;
  dispositivoId?: string;
  /** Aviso de devolución/reprogramación pendiente para el dueño (RF-30). */
  aviso?: { motivo: string; resuelto: boolean };
  historial: { en: number; texto: string }[];
}

export type EstadoSerie = 'solicitada' | 'aprobada' | 'rechazada';

export interface SerieHoraFija {
  id: string;
  canchaId: string;
  diaSemana: number;
  inicio: Minutos;
  duracionMin: number;
  nombre: string;
  telefono: string;
  fechas: Fecha[];
  fechasOmitidas: Fecha[]; // D37: ya ocupadas por una reserva previa
  estado: EstadoSerie;
  creadaEn: number;
}

export interface EntradaAuditoria {
  en: number;
  accion: string;
}

export interface Estado {
  version: number;
  config: Config;
  reservas: Reserva[];
  series: SerieHoraFija[];
  auditoria: EntradaAuditoria[];
  telefonosBloqueados: string[];
}
