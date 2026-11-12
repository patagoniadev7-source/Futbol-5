import { useMemo, useState } from 'react';
import type { App } from '../store';
import type { Config, Reserva } from '../domain/types';
import {
  actualizarBanco,
  actualizarConfig,
  aprobarHoraFija,
  cancelarPorDueno,
  confirmar,
  CONTRASENA_DEMO,
  crearManual,
  diaCerrado,
  fechasReservables,
  rechazar,
  rechazarHoraFija,
  reconfirmarLiberada,
  resolverAviso,
  turnosDelDia,
} from '../domain/reglas';
import { aHoraAR, diaSemana, duracionTexto, fechaCorta, fechaLarga, hhmm, nombreDia, nombreDiaCorto } from '../domain/tiempo';
import { BotonPestana } from './Cliente';
import { Campo, Chip, enlaceWhatsApp, MsgError, Tarjeta, textoMonto } from './comun';

type Pestana = 'pendientes' | 'agenda' | 'avisos' | 'ajustes';

export function Dueno({ app }: { app: App }) {
  const [logueado, setLogueado] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  if (!logueado) return <Login onOk={() => setLogueado(true)} />;

  const pendientes = app.estado.reservas.filter((r) => r.estado === 'pendiente').length + app.estado.series.filter((s) => s.estado === 'solicitada').length;
  const avisos = app.estado.reservas.filter((r) => r.aviso && !r.aviso.resuelto).length;

  return (
    <div className="pantalla">
      <header className="cabecera cabecera-dueno">
        <div className="cabecera-titulo">Panel del dueño</div>
        <div className="cabecera-sub">{app.estado.config.nombreCancha}</div>
      </header>
      <main className="contenido">
        {pestana === 'pendientes' && <Pendientes app={app} />}
        {pestana === 'agenda' && <Agenda app={app} />}
        {pestana === 'avisos' && <Avisos app={app} />}
        {pestana === 'ajustes' && <Ajustes app={app} onSalir={() => setLogueado(false)} />}
      </main>
      <nav className="pestanas">
        <BotonPestana activa={pestana === 'pendientes'} onClick={() => setPestana('pendientes')} icono="⏳" texto="Pendientes" badge={pendientes} />
        <BotonPestana activa={pestana === 'agenda'} onClick={() => setPestana('agenda')} icono="📅" texto="Agenda" />
        <BotonPestana activa={pestana === 'avisos'} onClick={() => setPestana('avisos')} icono="🔔" texto="Avisos" badge={avisos} />
        <BotonPestana activa={pestana === 'ajustes'} onClick={() => setPestana('ajustes')} icono="⚙️" texto="Ajustes" />
      </nav>
    </div>
  );
}

function Login({ onOk }: { onOk: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pantalla">
      <main className="contenido login">
        <div className="login-logo">⚽</div>
        <h2 className="titulo">Ingreso del dueño</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (clave === CONTRASENA_DEMO) onOk(); else setError('Contraseña incorrecta.'); }}>
          <Campo etiqueta="Contraseña" ayuda={`Preview: la contraseña es "${CONTRASENA_DEMO}"`}>
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus />
          </Campo>
          <MsgError msg={error} />
          <button className="boton boton-primario" type="submit">Ingresar</button>
        </form>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TarjetaReserva({ app, r, compacta }: { app: App; r: Reserva; compacta?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const restante = r.venceEn ? r.venceEn - app.ahora : 0;
  const urgente = r.estado === 'pendiente' && restante < 15 * 60_000;
  const hacer = (f: Parameters<App['hacer']>[0]) => setError(app.hacer(f));
  const msg =
    r.estado === 'pendiente'
      ? `Hola ${r.nombre}! Te escribo de la cancha por tu solicitud del ${fechaLarga(r.fecha)} a las ${hhmm(r.inicio)} (código ${r.codigo}).`
      : `Hola ${r.nombre}! Te recordamos tu turno del ${fechaLarga(r.fecha)} a las ${hhmm(r.inicio)}. ¡Te esperamos!`;
  return (
    <Tarjeta className={`reserva ${urgente ? 'urgente' : ''}`}>
      <div className="reserva-cabecera">
        <div>
          <strong>{r.nombre}</strong>
          {r.serieId && <span className="etiqueta">Hora fija</span>}
          {r.ultimoMomento && <span className="etiqueta">Último momento</span>}
          {r.origen === 'dueno' && <span className="etiqueta">Manual</span>}
          <div className="tenue">{fechaLarga(r.fecha)} · {hhmm(r.inicio)}</div>
        </div>
        <Chip estado={r.estado} />
      </div>
      {!compacta && (
        <div className="reserva-detalle">
          <span>{textoMonto(r)}</span>
          {r.telefono && <a href={`tel:${r.telefono}`}>📞 {r.telefono}</a>}
          <span className="mono">#{r.codigo}</span>
        </div>
      )}
      {r.estado === 'pendiente' && r.venceEn && (
        <div className={`vence ${urgente ? 'urgente' : ''}`}>
          {r.ultimoMomento ? `Se confirma sola al empezar, en ${duracionTexto(restante)}` : `Se libera en ${duracionTexto(restante)}`}
        </div>
      )}
      <div className="acciones">
        {r.estado === 'pendiente' && (
          <>
            <button className="boton boton-primario" onClick={() => hacer((e, a) => confirmar(e, r.id, a))}>Confirmar</button>
            <button className="boton" onClick={() => hacer((e, a) => rechazar(e, r.id, a))}>Rechazar</button>
          </>
        )}
        {r.estado === 'liberada' && (
          <button className="boton" onClick={() => hacer((e, a) => reconfirmarLiberada(e, r.id, a))}>Re-confirmar (pagó tarde)</button>
        )}
        {r.estado === 'confirmada' && (
          <button className="boton boton-peligro-suave" onClick={() => { if (confirm('¿Dar de baja esta reserva?')) hacer((e, a) => cancelarPorDueno(e, r.id, a)); }}>Dar de baja</button>
        )}
        {r.telefono && (r.estado === 'pendiente' || r.estado === 'confirmada') && (
          <a className="boton boton-whatsapp" href={enlaceWhatsApp(r.telefono, msg)} target="_blank" rel="noreferrer">WhatsApp</a>
        )}
      </div>
      <MsgError msg={error} />
    </Tarjeta>
  );
}

function Pendientes({ app }: { app: App }) {
  const { reservas, series } = app.estado;
  const pend = reservas.filter((r) => r.estado === 'pendiente').sort((a, b) => (a.venceEn ?? 0) - (b.venceEn ?? 0));
  const liberadas = reservas.filter((r) => r.estado === 'liberada' && r.venceEn && app.ahora - r.venceEn < 24 * 3_600_000);
  const seriesPend = series.filter((s) => s.estado === 'solicitada');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h2 className="titulo">Solicitudes pendientes</h2>
      {!pend.length && !seriesPend.length && <Tarjeta className="vacio">No hay solicitudes pendientes. 🎉</Tarjeta>}
      {seriesPend.map((s) => (
        <Tarjeta key={s.id} className="reserva">
          <div className="reserva-cabecera">
            <div>
              <strong>{s.nombre}</strong> <span className="etiqueta">Hora fija</span>
              <div className="tenue">Todos los {nombreDia(s.diaSemana)} · {hhmm(s.inicio)}</div>
            </div>
          </div>
          <div className="reserva-detalle"><span>Fechas: {s.fechas.map(fechaCorta).join(', ')}</span></div>
          <div className="acciones">
            <button className="boton boton-primario" onClick={() => setError(app.hacer((e, a) => aprobarHoraFija(e, s.id, a)))}>Aprobar</button>
            <button className="boton" onClick={() => setError(app.hacer((e, a) => rechazarHoraFija(e, s.id, a)))}>Rechazar</button>
            <a className="boton boton-whatsapp" href={enlaceWhatsApp(s.telefono, `Hola ${s.nombre}! Te escribo por la hora fija de los ${nombreDia(s.diaSemana)} a las ${hhmm(s.inicio)}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </Tarjeta>
      ))}
      <MsgError msg={error} />
      {pend.map((r) => <TarjetaReserva key={r.id} app={app} r={r} />)}
      {!!liberadas.length && (
        <>
          <h3 className="subtitulo">Liberadas por plazo (últimas 24 h)</h3>
          {liberadas.map((r) => <TarjetaReserva key={r.id} app={app} r={r} />)}
        </>
      )}
    </>
  );
}

function Agenda({ app }: { app: App }) {
  const { estado, ahora } = app;
  const fechas = useMemo(() => fechasReservables(estado.config, ahora), [estado.config, ahora]);
  const [fecha, setFecha] = useState(fechas[0]);
  const [nuevo, setNuevo] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fechaSel = fechas.includes(fecha) ? fecha : fechas[0];
  const turnos = turnosDelDia(estado, fechaSel, ahora);
  const cerrado = diaCerrado(estado.config, fechaSel);
  const hoy = aHoraAR(ahora).fecha;
  const ocupados = turnos.filter((t) => t.reserva).length;

  return (
    <>
      <h2 className="titulo">Agenda</h2>
      <div className="tira-fechas">
        {fechas.map((f) => (
          <button key={f} className={`dia ${f === fechaSel ? 'activo' : ''} ${diaCerrado(estado.config, f) ? 'cerrado' : ''}`} onClick={() => { setFecha(f); setNuevo(null); }}>
            <span className="dia-nombre">{f === hoy ? 'Hoy' : nombreDiaCorto(diaSemana(f))}</span>
            <span className="dia-num">{fechaCorta(f)}</span>
          </button>
        ))}
      </div>
      <p className="subtitulo">
        {fechaLarga(fechaSel)}
        {!cerrado && turnos.length > 0 && <span className="tenue"> · {ocupados}/{turnos.length} ocupados</span>}
      </p>
      {cerrado && <Tarjeta className="vacio">Cerrado: {cerrado}</Tarjeta>}
      <div className="agenda">
        {turnos.map((t) => (
          <div key={t.inicio} className={`agenda-fila agenda-${t.estado}`}>
            <div className="agenda-hora">{hhmm(t.inicio)}</div>
            <div className="agenda-cuerpo">
              {t.reserva ? (
                <TarjetaReserva app={app} r={t.reserva} compacta />
              ) : t.estado === 'pasado' ? (
                <span className="tenue">—</span>
              ) : nuevo === t.inicio ? (
                <form className="manual" onSubmit={(e) => {
                  e.preventDefault();
                  const err = app.hacer((est, a) => crearManual(est, { fecha: fechaSel, inicio: t.inicio, nombre, telefono }, a));
                  setError(err);
                  if (!err) { setNuevo(null); setNombre(''); setTelefono(''); }
                }}>
                  <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
                  <input placeholder="Teléfono (opcional)" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" />
                  <MsgError msg={error} />
                  <div className="acciones">
                    <button className="boton boton-primario" type="submit">Guardar</button>
                    <button className="boton" type="button" onClick={() => setNuevo(null)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <button className="agregar" onClick={() => { setNuevo(t.inicio); setError(null); }}>+ Cargar reserva</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Avisos({ app }: { app: App }) {
  const avisos = app.estado.reservas.filter((r) => r.aviso);
  const abiertos = avisos.filter((r) => !r.aviso!.resuelto);
  const resueltos = avisos.filter((r) => r.aviso!.resuelto);
  return (
    <>
      <h2 className="titulo">Avisos</h2>
      <p className="nota">Cancelaciones que requieren devolver la seña o reprogramar. El sistema no registra pagos: márquelos como resueltos cuando lo haya gestionado.</p>
      {!abiertos.length && <Tarjeta className="vacio">No hay avisos abiertos.</Tarjeta>}
      {abiertos.map((r) => (
        <Tarjeta key={r.id} className="reserva urgente">
          <div className="reserva-cabecera">
            <div>
              <strong>{r.nombre}</strong>
              <div className="tenue">{fechaLarga(r.fecha)} · {hhmm(r.inicio)} · {textoMonto(r)}</div>
            </div>
            <Chip estado={r.estado} />
          </div>
          <div className="reserva-detalle"><span>{r.aviso!.motivo}</span></div>
          <div className="acciones">
            <button className="boton boton-primario" onClick={() => app.hacer((e, a) => resolverAviso(e, r.id, a))}>Marcar resuelto</button>
            {r.telefono && <a className="boton boton-whatsapp" href={enlaceWhatsApp(r.telefono, `Hola ${r.nombre}! Te escribo por la reserva cancelada del ${fechaLarga(r.fecha)} (código ${r.codigo}).`)} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
        </Tarjeta>
      ))}
      {!!resueltos.length && <h3 className="subtitulo">Resueltos</h3>}
      {resueltos.map((r) => (
        <Tarjeta key={r.id} className="reserva">
          <div className="reserva-cabecera">
            <div><strong>{r.nombre}</strong><div className="tenue">{fechaCorta(r.fecha)} {hhmm(r.inicio)} · {r.aviso!.motivo}</div></div>
            <Chip estado={r.estado} />
          </div>
        </Tarjeta>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function Ajustes({ app, onSalir }: { app: App; onSalir: () => void }) {
  const { config, auditoria } = app.estado;
  const [borrador, setBorrador] = useState<Config>(config);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => { setBorrador((b) => ({ ...b, [k]: v })); setGuardado(false); };
  const setHorario = (i: number, cambio: Partial<Config['horarios'][number]>) =>
    set('horarios', borrador.horarios.map((h, j) => (j === i ? { ...h, ...cambio } : h)));
  const [nuevoCerrado, setNuevoCerrado] = useState({ fecha: '', motivo: 'Feriado' });
  const [banco, setBanco] = useState(config.banco);
  const [clave, setClave] = useState('');
  const [errBanco, setErrBanco] = useState<string | null>(null);
  const cambioBanco = auditoria.find((a) => a.accion.includes('datos bancarios'));

  const guardar = () => {
    const { banco: _b, ...resto } = borrador;
    void _b;
    setError(app.hacer((e, a) => actualizarConfig(e, resto, a, 'Actualizó la configuración de turnos, horarios y precios')));
    setGuardado(true);
  };

  const num = (k: 'duracionMin' | 'desfaseInicioMin' | 'precio' | 'sena' | 'ventanaCancelacionHoras' | 'plazoPagoMin' | 'limiteHoraFijaHoras', etiqueta: string, ayuda?: string, paso = 1) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <input type="number" min={0} step={paso} value={borrador[k]} onChange={(e) => set(k, Math.max(0, Number(e.target.value)))} />
    </Campo>
  );

  return (
    <>
      <h2 className="titulo">Configuración</h2>
      {cambioBanco && (
        <div className="alerta alerta-advertencia">
          ⚠️ Los datos bancarios se modificaron el {new Date(cambioBanco.en).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Si no fue usted, cambie su contraseña.
        </div>
      )}

      <Tarjeta>
        <div className="tarjeta-titulo">Turnos</div>
        {num('duracionMin', 'Duración del turno (min)', 'Por defecto 60 min', 15)}
        {num('desfaseInicioMin', 'Desfase de inicio (min)', '0 = en punto (14:00, 15:00…). 30 = y media (14:30, 15:30…)', 5)}
        <p className="nota">Los cambios no afectan reservas ya hechas.</p>
      </Tarjeta>

      <Tarjeta>
        <div className="tarjeta-titulo">Horarios de apertura</div>
        {borrador.horarios.map((h, i) => (
          <div key={i} className="horario">
            <label className="check">
              <input type="checkbox" checked={h.abierto} onChange={(e) => setHorario(i, { abierto: e.target.checked })} />
              <span>{nombreDia(i)}</span>
            </label>
            <SelectorHora valor={h.desde} disabled={!h.abierto} onChange={(m) => setHorario(i, { desde: m })} />
            <span>a</span>
            <SelectorHora valor={h.hasta} disabled={!h.abierto} onChange={(m) => setHorario(i, { hasta: m })} hasta />
          </div>
        ))}
      </Tarjeta>

      <Tarjeta>
        <div className="tarjeta-titulo">Días cerrados, feriados y suspensiones</div>
        {borrador.cerrados.map((c) => (
          <div key={c.fecha} className="fila">
            <span>{fechaLarga(c.fecha)} · {c.motivo}</span>
            <button className="enlace" onClick={() => set('cerrados', borrador.cerrados.filter((x) => x.fecha !== c.fecha))}>Quitar</button>
          </div>
        ))}
        <div className="horario">
          <input type="date" value={nuevoCerrado.fecha} onChange={(e) => setNuevoCerrado({ ...nuevoCerrado, fecha: e.target.value })} />
          <input value={nuevoCerrado.motivo} onChange={(e) => setNuevoCerrado({ ...nuevoCerrado, motivo: e.target.value })} placeholder="Motivo" />
          <button className="boton" disabled={!nuevoCerrado.fecha} onClick={() => {
            if (!borrador.cerrados.some((c) => c.fecha === nuevoCerrado.fecha)) set('cerrados', [...borrador.cerrados, nuevoCerrado].sort((a, b) => a.fecha.localeCompare(b.fecha)));
            setNuevoCerrado({ fecha: '', motivo: 'Feriado' });
          }}>Agregar</button>
        </div>
        <p className="nota">Las reservas existentes en esa fecha no se borran: revíselas en la agenda.</p>
      </Tarjeta>

      <Tarjeta>
        <div className="tarjeta-titulo">Precios y plazos</div>
        {num('precio', 'Precio del turno ($)', 'Valor de ejemplo (a definir)', 500)}
        {num('sena', 'Seña ($)', 'Valor de ejemplo (a definir)', 500)}
        {num('ventanaCancelacionHoras', 'Ventana de cancelación (horas antes)', 'Valor de ejemplo (a definir)')}
        {num('plazoPagoMin', 'Plazo para confirmar (min)', 'Por defecto 60 min. Si no confirma, el horario se libera.', 5)}
        {num('limiteHoraFijaHoras', 'Hora fija: confirmar hasta (horas antes)', 'Por defecto 2 h')}
      </Tarjeta>

      <MsgError msg={error} />
      <button className="boton boton-primario" onClick={guardar}>{guardado && !error ? '✓ Guardado' : 'Guardar cambios'}</button>

      <Tarjeta className="banco">
        <div className="tarjeta-titulo">Datos bancarios</div>
        <p className="nota">Se muestran al cliente solo después de enviar una solicitud. Cambiarlos exige su contraseña y queda registrado.</p>
        {(['alias', 'cbu', 'banco', 'titular'] as const).map((k) => (
          <Campo key={k} etiqueta={k === 'cbu' ? 'CBU' : k[0].toUpperCase() + k.slice(1)}>
            <input value={banco[k]} onChange={(e) => setBanco({ ...banco, [k]: e.target.value })} />
          </Campo>
        ))}
        <Campo etiqueta="Su contraseña" ayuda={`Preview: "${CONTRASENA_DEMO}"`}>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </Campo>
        <MsgError msg={errBanco} />
        <button className="boton" onClick={() => { const err = app.hacer((e, a) => actualizarBanco(e, banco, clave, a)); setErrBanco(err); if (!err) setClave(''); }}>Actualizar datos bancarios</button>
      </Tarjeta>

      <Tarjeta>
        <div className="tarjeta-titulo">Registro de auditoría</div>
        {!auditoria.length && <p className="tenue">Sin movimientos todavía.</p>}
        <ul className="auditoria">
          {auditoria.slice(0, 15).map((a, i) => (
            <li key={i}>
              <span className="tenue">{new Date(a.en).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}</span> {a.accion}
            </li>
          ))}
        </ul>
      </Tarjeta>
      <button className="boton" onClick={onSalir}>Cerrar sesión</button>
    </>
  );
}

/** Selector de hora en 24 h, en pasos de 30 min (independiente del idioma del navegador). */
function SelectorHora({ valor, onChange, disabled, hasta }: { valor: number; onChange: (m: number) => void; disabled?: boolean; hasta?: boolean }) {
  const opciones = Array.from({ length: 48 }, (_, i) => (hasta ? (i + 1) * 30 : i * 30));
  return (
    <select className="hora" value={valor} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {opciones.map((m) => <option key={m} value={m}>{m === 1440 ? '24:00' : hhmm(m)}</option>)}
    </select>
  );
}
