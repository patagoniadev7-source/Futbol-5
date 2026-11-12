# Futbol-5 · Preview interactiva

Prototipo navegable (web adaptada a móvil) del sistema de reservas para una cancha de fútbol.
Sirve para **validar el flujo y las reglas de negocio** con el dueño antes de la fase técnica.
Se basa en el documento de requisitos v0.1 (borrador).

> Es una preview: los datos son ficticios y se guardan solo en el navegador. No envía mensajes,
> no procesa pagos y el inicio de sesión es simulado (contraseña `demo`).

## Qué se puede probar

**Barra de la preview (arriba)**
- Alternar entre la vista **Cliente** y la vista **Dueño**.
- Adelantar el reloj (+30 min, +2 h, +1 día) para ver vencer plazos, y volver a la hora real.
- Reiniciar los datos de demostración.

**Cliente (invitado, sin cuenta)**
- Ver turnos libres por fecha, hasta un mes hacia adelante.
- Solicitar un turno con nombre y teléfono; elegir transferencia (seña o total) o efectivo.
- Comprobante con código de reserva, datos bancarios, cuenta regresiva y enlace de WhatsApp prellenado.
- Turnos de último momento: sin seña, se abona al llegar.
- Solicitar una hora fija (mismo día y hora cada semana, por un mes).
- Consultar y cancelar con teléfono + código, con aviso si se pierde la seña.

**Dueño**
- Pendientes con tiempo restante, confirmar / rechazar / WhatsApp; aprobar horas fijas.
- Re-confirmar solicitudes liberadas por plazo (pago tardío, propuesta RF-35).
- Agenda diaria con carga de reservas manuales y bajas.
- Avisos de cancelaciones para devolver o reprogramar.
- Configuración: duración y desfase de turnos, horarios por día, feriados y cierres, precio, seña,
  ventana de cancelación, plazos; datos bancarios con contraseña y registro de auditoría.

## Reglas implementadas (motor de plazos)

| Regla | Requisito |
|---|---|
| La solicitud pendiente ocupa el horario y se libera a los 60 min sin confirmar | D14, D20, RF-40 |
| Último momento: sin seña y se auto-confirma al empezar | D46, D61, RF-41 |
| Máximo 2 solicitudes pendientes por dispositivo | D23 |
| Cada reserva conserva precio, seña y ventana vigentes al crearse | D26 |
| Hora fija: Regla A, fechas ocupadas se omiten, cada fecha vence 2 h antes | D50, D37, D44 |
| Hora oficial de Argentina (UTC-3) para todas las reglas | RNF-09 |

Las reglas viven en `src/domain/` como funciones puras, separadas de la interfaz, y tienen pruebas
automatizadas en `src/domain/reglas.test.ts`.

## Valores de ejemplo (a definir por el dueño)

Precio $ 40.000, seña $ 10.000 y ventana de cancelación de 12 h son **ejemplos** (punto abierto A3).
Para el fin de mes de la Regla A (punto abierto A7) la preview usa el último día del mes siguiente
(31/01 → 28/02); está pendiente de confirmación.

## Uso

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas de reglas
npm run build      # build de producción en dist/
SINGLE=1 npx vite build --outDir dist-single   # un único index.html autocontenido
```

## Fuera de esta preview

Backend, base de datos, autenticación real, CAPTCHA real y garantía de no doble reserva bajo
concurrencia (RNF-01). Se definen en la fase técnica.
