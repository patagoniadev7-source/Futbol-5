import { useState } from 'react';
import { useApp } from './store';
import { Cliente } from './ui/Cliente';
import { Dueno } from './ui/Dueno';
import { aHoraAR, fechaLarga, hhmm } from './domain/tiempo';

const MIN = 60_000;

export function App() {
  const app = useApp();
  const [vista, setVista] = useState<'cliente' | 'dueno'>('cliente');
  const { fecha, minutos } = aHoraAR(app.ahora);

  return (
    <div className="escenario">
      <aside className="barra-demo" aria-label="Controles de la preview">
        <div className="barra-demo-fila">
          <strong className="marca">Preview</strong>
          <div className="selector-vista" role="tablist">
            <button role="tab" aria-selected={vista === 'cliente'} className={vista === 'cliente' ? 'activo' : ''} onClick={() => setVista('cliente')}>Cliente</button>
            <button role="tab" aria-selected={vista === 'dueno'} className={vista === 'dueno' ? 'activo' : ''} onClick={() => setVista('dueno')}>Dueño</button>
          </div>
        </div>
        <div className="barra-demo-fila reloj">
          <span title="Hora simulada de Argentina">🕒 {fechaLarga(fecha)} · {hhmm(minutos)}{app.desfaseRelojMs !== 0 && ' (simulada)'}</span>
          <span className="reloj-botones">
            <button onClick={() => app.adelantarReloj(30 * MIN)}>+30 min</button>
            <button onClick={() => app.adelantarReloj(120 * MIN)}>+2 h</button>
            <button onClick={() => app.adelantarReloj(24 * 60 * MIN)}>+1 día</button>
            {app.desfaseRelojMs !== 0 && <button onClick={() => app.adelantarReloj(0)}>Hora real</button>}
            <button onClick={() => { if (confirm('¿Borrar todos los datos de la preview y volver a empezar?')) app.reiniciar(); }}>Reiniciar</button>
          </span>
        </div>
      </aside>
      {/* Ambas vistas quedan montadas para conservar su estado (sesión del dueño, formularios) al alternar. */}
      <div className="telefono">
        <div className="vista" hidden={vista !== 'cliente'}><Cliente app={app} /></div>
        <div className="vista" hidden={vista !== 'dueno'}><Dueno app={app} /></div>
      </div>
      <p className="pie">Prototipo navegable con datos ficticios guardados en este navegador. No envía mensajes ni procesa pagos.</p>
    </div>
  );
}
