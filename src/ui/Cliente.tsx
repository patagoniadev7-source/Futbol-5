import { useMemo, useState } from 'react';
import type { App } from '../store';
import type { Reserva, SerieHoraFija } from '../domain/types';
import {
  buscarPorCodigo,
  cancelacionATiempo,
  cancelarPorCliente,
  diaCerrado,
  esUltimoMomento,
  fechasReservables,
  montoAPagar,
  solicitarHoraFija,
  solicitarTurno,
  turnosDelDia,
  type Turno,
} from '../domain/reglas';
import { aHoraAR, diaSemana, duracionTexto, fechaCorta, fechaLarga, hhmm, nombreDia, nombreDiaCorto } from '../domain/tiempo';
import { Campo, Chip, enlaceWhatsApp, MsgError, pesos, Segmentos, Tarjeta, textoMonto } from './comun';

type Pestana = 'reservar' | 'horafija' | 'misreservas';

export function Cliente({ app }: { app: App }) {
  const [pestana, setPestana] = useState<Pestana>('reservar');
  return (
    <div className="pantalla">
      <header className="cabecera">
        <div className="cabecera-titulo">⚽ {app.estado.config.nombreCancha}</div>
        <div className="cabecera-sub">
          Turno {app.estado.config.duracionMin} min · {pesos(app.estado.config.precio)} · Seña {pesos(app.estado.config.sena)}
        </div>
      </header>
      <main className="contenido">
        {pestana === 'reservar' && <Reservar app={app} />}
        {pestana === 'horafija' && <HoraFija app={app} />}
        {pestana === 'misreservas' && <MisReservas app={app} />}
      </main>
      <nav className="pestanas">
        <BotonPestana activa={pestana === 'reservar'} onClick={() => setPestana('reservar')} icono="📅" texto="Reservar" />
        <BotonPestana activa={pestana === 'horafija'} onClick={() => setPestana('horafija')} icono="🔁" texto="Hora fija" />
        <BotonPestana activa={pestana === 'misreservas'} onClick={() => setPestana('misreservas')} icono="🎟️" texto="Mi reserva" />
      </nav>
    </div>
  );
}

export function BotonPestana(p: { activa: boolean; onClick: () => void; icono: string; texto: string; badge?: number }) {
  return (
    <button className={`pestana ${p.activa ? 'activa' : ''}`} onClick={p.onClick}>
      <span className="pestana-icono" aria-hidden>
        {p.icono}
        {!!p.badge && <span className="badge">{p.badge}</span>}
      </span>
      <span>{p.texto}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function Reservar({ app }: { app: App }) {
  const { estado, ahora } = app;
  const fechas = useMemo(() => fechasReservables(estado.config, ahora), [estado.config, ahora]);
  const [fecha, setFecha] = useState(fechas[0]);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [hecha, setHecha] = useState<Reserva | null>(null);

  if (hecha) {
    const actual = estado.reservas.find((r) => r.id === hecha.id) ?? hecha;
    return <Comprobante app={app} reserva={actual} onVolver={() => setHecha(null)} />;
  }
  if (turno) return <FormSolicitud app={app} turno={turno} onCancelar={() => setTurno(null)} onListo={(r) => { setTurno(null); setHecha(r); }} />;

  const fechaSel = fechas.includes(fecha) ? fecha : fechas[0];
  const turnos = turnosDelDia(estado, fechaSel, ahora);
  const cerrado = diaCerrado(estado.config, fechaSel);
  const hoy = aHoraAR(ahora).fecha;

  return (
    <>
      <h2 className="titulo">Elija día y horario</h2>
      <div className="tira-fechas" role="listbox" aria-label="Fechas">
        {fechas.map((f) => {
          const c = diaCerrado(estado.config, f);
          return (
            <button key={f} role="option" aria-selected={f === fechaSel} className={`dia ${f === fechaSel ? 'activo' : ''} ${c ? 'cerrado' : ''}`} onClick={() => setFecha(f)}>
              <span className="dia-nombre">{f === hoy ? 'Hoy' : nombreDiaCorto(diaSemana(f))}</span>
              <span className="dia-num">{fechaCorta(f)}</span>
            </button>
          );
        })}
      </div>
      <p className="subtitulo">{fechaLarga(fechaSel)}</p>
      {cerrado ? (
        <Tarjeta className="vacio">La cancha está cerrada este día ({cerrado}).</Tarjeta>
      ) : (
        <div className="grilla-turnos">
          {turnos.map((t) => (
            <button key={t.inicio} className={`turno turno-${t.estado}`} disabled={t.estado !== 'libre'} onClick={() => setTurno(t)}>
              <span className="turno-hora">{hhmm(t.inicio)}</span>
              <span className="turno-estado">
                {t.estado === 'libre' ? 'Libre' : t.estado === 'pendiente' ? 'Reservado' : t.estado === 'ocupado' ? 'Ocupado' : 'Pasado'}
              </span>
            </button>
          ))}
          {!turnos.length && <Tarjeta className="vacio">No hay turnos configurados para este día.</Tarjeta>}
        </div>
      )}
      <div className="leyenda">
        <span><i className="punto libre" /> Libre</span>
        <span><i className="punto ocupado" /> Ocupado</span>
      </div>
    </>
  );
}

function FormSolicitud({ app, turno, onCancelar, onListo }: { app: App; turno: Turno; onCancelar: () => void; onListo: (r: Reserva) => void }) {
  const { config } = app.estado;
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [medio, setMedio] = useState<'transferencia' | 'efectivo'>('transferencia');
  const [monto, setMonto] = useState<'sena' | 'total'>('sena');
  const [error, setError] = useState<string | null>(null);
  const ultimo = esUltimoMomento(config, turno.fecha, turno.inicio, app.ahora);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    let creada: Reserva | null = null;
    const err = app.hacer((est, ahora) => {
      const r = solicitarTurno(est, { fecha: turno.fecha, inicio: turno.inicio, nombre, telefono, medio, monto, dispositivoId: app.dispositivoId }, ahora);
      creada = r.reserva;
      return r.estado;
    });
    setError(err);
    if (!err && creada) onListo(creada);
  };

  return (
    <form onSubmit={enviar}>
      <button type="button" className="volver" onClick={onCancelar}>← Volver</button>
      <h2 className="titulo">Solicitar turno</h2>
      <Tarjeta className="resumen-turno">
        <div className="resumen-hora">{hhmm(turno.inicio)}</div>
        <div>
          <strong>{fechaLarga(turno.fecha)}</strong>
          <div className="tenue">{turno.duracionMin} minutos · {pesos(config.precio)}</div>
        </div>
      </Tarjeta>
      {ultimo && (
        <div className="alerta alerta-info">
          <strong>Turno de último momento.</strong> No hace falta seña: se abona el total ({pesos(config.precio)}) al llegar a la cancha.
        </div>
      )}
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required />
      </Campo>
      <Campo etiqueta="Teléfono (WhatsApp)" ayuda="Con código de área, sin 0 ni 15. Ej.: 280 4123456">
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="280 4123456" autoComplete="tel" required />
      </Campo>
      {!ultimo && (
        <>
          <Campo etiqueta="Medio de pago">
            <Segmentos valor={medio} onChange={setMedio} opciones={[{ valor: 'transferencia', texto: 'Transferencia' }, { valor: 'efectivo', texto: 'Efectivo' }]} />
          </Campo>
          {medio === 'transferencia' && (
            <Campo etiqueta="¿Qué va a transferir?">
              <Segmentos valor={monto} onChange={setMonto} opciones={[{ valor: 'sena', texto: `Seña ${pesos(config.sena)}` }, { valor: 'total', texto: `Total ${pesos(config.precio)}` }]} />
            </Campo>
          )}
          <p className="nota">
            La cancha tiene {config.plazoPagoMin} min para confirmar su solicitud
            {medio === 'transferencia' ? ' después de recibir la transferencia' : ' (coordine el pago por WhatsApp)'}. Si no se confirma, el horario se libera.
          </p>
        </>
      )}
      <div className="captcha">☐ No soy un robot <span className="tenue">(control anti-bot simulado)</span></div>
      <MsgError msg={error} />
      <button className="boton boton-primario" type="submit">Enviar solicitud</button>
    </form>
  );
}

function Comprobante({ app, reserva, onVolver }: { app: App; reserva: Reserva; onVolver: () => void }) {
  const { config } = app.estado;
  const restante = reserva.venceEn ? reserva.venceEn - app.ahora : 0;
  const mensaje = `Hola! Soy ${reserva.nombre}. Solicité el turno del ${fechaLarga(reserva.fecha)} a las ${hhmm(reserva.inicio)}. Código de reserva: ${reserva.codigo}.${reserva.medio === 'transferencia' && !reserva.ultimoMomento ? ` Te envío el comprobante de ${textoMonto(reserva).toLowerCase()}.` : ''}`;
  return (
    <>
      <div className="exito">
        <div className="exito-icono">✓</div>
        <h2 className="titulo">Solicitud enviada</h2>
        <Chip estado={reserva.estado} />
      </div>
      <Tarjeta>
        <div className="fila"><span>Turno</span><strong>{fechaLarga(reserva.fecha)} · {hhmm(reserva.inicio)}</strong></div>
        <div className="fila"><span>A pagar</span><strong>{textoMonto(reserva)}</strong></div>
        <div className="fila"><span>Código de reserva</span><strong className="codigo">{reserva.codigo}</strong></div>
        {reserva.estado === 'pendiente' && !reserva.ultimoMomento && (
          <div className="fila"><span>Tiempo para confirmar</span><strong className="cuenta">{duracionTexto(restante)}</strong></div>
        )}
      </Tarjeta>
      {reserva.medio === 'transferencia' && !reserva.ultimoMomento && (
        <Tarjeta className="banco">
          <div className="tarjeta-titulo">Datos para transferir {pesos(montoAPagar(reserva))}</div>
          <div className="fila"><span>Alias</span><strong>{config.banco.alias}</strong></div>
          <div className="fila"><span>CBU</span><strong className="mono">{config.banco.cbu}</strong></div>
          <div className="fila"><span>Banco</span><strong>{config.banco.banco}</strong></div>
          <div className="fila"><span>Titular</span><strong>{config.banco.titular}</strong></div>
        </Tarjeta>
      )}
      <a className="boton boton-whatsapp" href={enlaceWhatsApp(config.telefonoDueno, mensaje)} target="_blank" rel="noreferrer">
        Enviar WhatsApp a la cancha
      </a>
      <p className="nota">Guarde el código: lo necesita junto con su teléfono para cancelar.</p>
      <button className="boton" onClick={onVolver}>Volver a los turnos</button>
    </>
  );
}

// ---------------------------------------------------------------------------

function HoraFija({ app }: { app: App }) {
  const { config } = app.estado;
  const dias = config.horarios.map((h, i) => ({ i, h })).filter((x) => x.h.abierto);
  const [dia, setDia] = useState(dias.find((d) => d.i === 4)?.i ?? dias[0]?.i ?? 1);
  const h = config.horarios[dia];
  const horas: number[] = [];
  for (let m = h.desde + config.desfaseInicioMin; m + config.duracionMin <= h.hasta; m += config.duracionMin) horas.push(m);
  const [inicio, setInicio] = useState<number>(horas.includes(20 * 60) ? 20 * 60 : horas[0]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serie, setSerie] = useState<SerieHoraFija | null>(null);

  if (serie) {
    return (
      <>
        <div className="exito">
          <div className="exito-icono">✓</div>
          <h2 className="titulo">Hora fija solicitada</h2>
        </div>
        <Tarjeta>
          <div className="fila"><span>Día y hora</span><strong>Todos los {nombreDia(serie.diaSemana)} · {hhmm(serie.inicio)}</strong></div>
          <div className="fila"><span>Fechas del período</span><strong>{serie.fechas.map(fechaCorta).join(', ')}</strong></div>
        </Tarjeta>
        <p className="nota">
          La cancha revisará la solicitud. Cada semana se paga la seña ({pesos(config.sena)}) y debe quedar confirmada hasta {config.limiteHoraFijaHoras} h antes del turno; si no, esa fecha se libera.
        </p>
        <button className="boton" onClick={() => setSerie(null)}>Nueva solicitud</button>
      </>
    );
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    let s: SerieHoraFija | null = null;
    const err = app.hacer((est, ahora) => {
      const r = solicitarHoraFija(est, { diaSemana: dia, inicio, nombre, telefono }, ahora);
      s = r.serie;
      return r.estado;
    });
    setError(err);
    if (!err) setSerie(s);
  };

  return (
    <form onSubmit={enviar}>
      <h2 className="titulo">Hora fija</h2>
      <p className="nota">Reserve el mismo día y horario todas las semanas, por un período de hasta un mes. Se puede renovar.</p>
      <Campo etiqueta="Día de la semana">
        <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {dias.map((d) => <option key={d.i} value={d.i}>{nombreDia(d.i)}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Horario">
        <select value={inicio} onChange={(e) => setInicio(Number(e.target.value))}>
          {horas.map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Nombre o equipo">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Teléfono (WhatsApp)">
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="280 4123456" required />
      </Campo>
      <MsgError msg={error} />
      <button className="boton boton-primario" type="submit">Solicitar hora fija</button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function MisReservas({ app }: { app: App }) {
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const r = id ? app.estado.reservas.find((x) => x.id === id) : undefined;

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const encontrada = buscarPorCodigo(app.estado, telefono, codigo);
    setError(encontrada ? null : 'No encontramos una reserva con ese teléfono y código.');
    setId(encontrada?.id ?? null);
    setConfirmando(false);
  };

  const activa = r && (r.estado === 'pendiente' || r.estado === 'confirmada');
  const aTiempo = r ? cancelacionATiempo(r, app.ahora) : true;

  return (
    <>
      <h2 className="titulo">Consultar o cancelar</h2>
      <form onSubmit={buscar}>
        <Campo etiqueta="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" required />
        </Campo>
        <Campo etiqueta="Código de reserva">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="mono" maxLength={6} required />
        </Campo>
        <MsgError msg={error} />
        <button className="boton" type="submit">Buscar</button>
      </form>
      {r && (
        <Tarjeta>
          <div className="fila"><span>Estado</span><Chip estado={r.estado} /></div>
          <div className="fila"><span>Turno</span><strong>{fechaLarga(r.fecha)} · {hhmm(r.inicio)}</strong></div>
          <div className="fila"><span>Pago</span><strong>{textoMonto(r)}</strong></div>
          {activa && !confirmando && (
            <button className="boton boton-peligro" onClick={() => setConfirmando(true)}>Cancelar reserva</button>
          )}
          {activa && confirmando && (
            <div className={`alerta ${aTiempo ? 'alerta-info' : 'alerta-advertencia'}`}>
              {aTiempo
                ? `Está cancelando con más de ${r.reglas.ventanaCancelacionHoras} h de anticipación. La cancha le contactará para devolver o reprogramar.`
                : `Faltan menos de ${r.reglas.ventanaCancelacionHoras} h para el turno: si cancela, pierde la seña.`}
              <div className="acciones">
                <button className="boton boton-peligro" onClick={() => { setError(app.hacer((e, a) => cancelarPorCliente(e, r.id, a))); setConfirmando(false); }}>Confirmar cancelación</button>
                <button className="boton" onClick={() => setConfirmando(false)}>No cancelar</button>
              </div>
            </div>
          )}
        </Tarjeta>
      )}
    </>
  );
}
