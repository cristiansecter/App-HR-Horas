# Horus

Gestión de horas, licencias y datos del equipo para pymes argentinas, con pre-liquidación para el contador. Marca blanca: **cada cliente tiene su propio proyecto de Firebase y su propio sitio**.

## Qué incluye

- **Horas:** carga manual (fecha, desde, hasta), clasificación automática en normales y extra según la jornada y las reglas de la empresa, aprobación por supervisor o administrador, y semana en grilla.
- **Licencias y ausencias:** pedidos, aprobación, ausencias injustificadas y calendario del equipo (sin mostrar el motivo a quien no corresponde).
- **Directorio y fichas** con datos sensibles separados, jornada propia y bajas.
- **Reportes:** planilla mensual en Excel/CSV lista para el contador.
- **Configuración:** marca, jornada, reglas de horas extra y feriados.
- **Avisos**: campanita y Inicio con vacaciones próximas, licencias que terminan, incorporaciones, vencimientos (seguros, períodos de prueba, pasantías), superposición de vacaciones del equipo y saldo de vacaciones.
- **Dos modos de trabajo** (los define el Configurador): *por proyectos* (horas en proyectos) o *por asistencia* (marcar presente, ausencias, llegadas tarde y resumen mensual para el contador, sin proyectos ni horas).
- **Módulos activables** (los activa el Configurador, el administrador de la empresa no los ve): *Sueldos en el legajo*, *Rendimiento* (costos por proyecto), *Facturación por proyecto* (por hora, precio cerrado o interno; ingresos y margen) *Dedicación y proyección* (porcentaje por asignación y reparto de horas por proyecto y mes) y *Seguimiento de liquidaciones* (anotación y seguimiento digital, no liquidación legal).

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:3000 (con --mode demo muestra la entrada por rol)
npm test               # lógica: horas extra, feriados, licencias, planilla, liquidación...
npm run test:rules     # reglas de Firestore contra el emulador (no toca datos reales)
npm run lint           # chequeo de tipos
npm run build
```

- `src/domain/`: lógica de negocio pura (horas extra, feriados, licencias, planilla, costos, liquidación), sin pantalla ni Firebase.
- `src/services/`: **único lugar que habla con Firebase.**
- `src/features/`: pantallas por tema. `src/config/`: marca, navegación y constantes de seguridad.
- `firestore.rules` + `rules-tests/`: las reglas y sus pruebas. Las reglas son la barrera real de permisos.
- `scripts/`: alta de la instancia, de usuarios y cambios de rol (Admin SDK, con clave local).

## Documentación

- [`docs/instalar-cliente.md`](docs/instalar-cliente.md): instalar una instancia nueva, paso a paso.
- [`docs/configurador.md`](docs/configurador.md): operación del día a día, módulos, modelo de pago y límites de cada pieza.
- [`docs/seguridad.md`](docs/seguridad.md): revisión de seguridad, hallazgos y pendientes de endurecimiento.

## Instancia de demostración

`npm run build:demo` genera el build con `VITE_DEMO_MODE=true`: muestra la entrada por rol con datos de ejemplo que no se conservan, la entrada con cuenta real y la del Configurador. Para publicarla (Hosting, reglas e índices, proyecto `demo` de `.firebaserc`):

```bash
npx firebase-tools login
npm run deploy:demo
```
