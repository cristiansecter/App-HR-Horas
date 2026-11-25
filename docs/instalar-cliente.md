# Instalar Horus para un cliente nuevo

Guía paso a paso. Cada cliente tiene **su propio proyecto de Firebase y su propio sitio**: nada se comparte entre clientes. Tiempo estimado: 45 a 60 minutos la primera vez.

> Convención: `CLIENTE` es un nombre corto del cliente, por ejemplo `acme`. `<proyecto>` es el ID del proyecto de Firebase que vas a crear.

## 0. Antes de empezar

- Node.js 20 o más nuevo y este repositorio descargado (`npm install`).
- Una cuenta de Google con permiso para crear proyectos en Firebase (la tuya, de Configurador).
- Del cliente: nombre de la empresa, logo (opcional), colores de marca (opcional), nombre y correo de quien va a ser el **administrador** de la empresa.
- **El correo del administrador del cliente tiene que ser distinto del tuyo (el del Configurador).** Tu correo entra solo con Google a la consola del Configurador y no se puede usar como usuario de una empresa.

## 1. Crear el proyecto de Firebase

1. En la consola de Firebase: *Agregar proyecto* → nombre del cliente. Sin Google Analytics.
2. **Authentication → Método de acceso:** activar **Correo electrónico y contraseña** (para las personas) y **Google** (para vos, el Configurador).
3. En esa misma pantalla, **Configuración**: activar la protección contra enumeración de correos y exigir contraseñas de al menos 10 caracteres.
4. **Firestore Database → Crear base de datos:** modo producción, región `southamerica-east1` (São Paulo) para Argentina.
5. **Configuración del proyecto → Tus apps → Web:** registrar una app web. Copiá los valores de configuración (`apiKey`, `authDomain`, `projectId`, etc.): no son secretos.
6. En Google Cloud (credenciales), **restringí la clave de API** a los dominios del sitio del cliente (`<proyecto>.web.app` y el dominio propio, si hay).

## 2. Configurar la aplicación

1. Copiá `.env.example` a `.env.CLIENTE` y completá los valores de la app web (`VITE_FIREBASE_*`).
2. **Marca de entrada:** editá `src/config/tenant.config.ts` (nombre, logo y colores con los que abre la aplicación). Después, dentro de la aplicación, el administrador puede cambiar nombre, logo y colores desde *Configuración → Empresa*.
3. Agregá el proyecto a `.firebaserc`:
   ```json
   { "projects": { "demo": "horus-demo-929b0", "CLIENTE": "<proyecto>" } }
   ```

## 3. Publicar las reglas de seguridad (antes de crear datos)

```bash
npx firebase-tools login
npm run test:rules
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project CLIENTE
```

Las reglas son la barrera real de permisos: no sigas sin publicarlas.

## 4. Poner en marcha la instancia

1. En Firebase → *Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.* Guardá el `.json` **fuera del repositorio** (o con un nombre que termine en `-adminsdk.json`, que `.gitignore` excluye). Nunca lo subas ni lo mandes por chat o mail.
2. Simulación (no escribe nada) y después aplicar:
   ```bash
   npm run provision -- --company "Nombre del cliente" --admin-email admin@cliente.com --admin-name "Nombre Apellido" --key ruta/clave.json
   npm run provision -- --company "Nombre del cliente" --admin-email admin@cliente.com --admin-name "Nombre Apellido" --key ruta/clave.json --apply
   ```
   Crea la configuración inicial, carga los feriados nacionales y da de alta al administrador. **Te muestra la contraseña inicial una sola vez:** anotala y pasásela al cliente por un canal seguro; que la cambie al entrar.
3. Altas de personal (hasta que se active la invitación por mail con el plan Blaze):
   ```bash
   npm run create-user -- --email persona@cliente.com --name "Nombre Apellido" --role employee --supervisor jefe@cliente.com --key ruta/clave.json
   ```
   Roles: `admin`, `supervisor`, `employee`. Para cambiar un rol: `npm run set-role -- --email persona@cliente.com --role supervisor --key ruta/clave.json`.
4. **Borrá la clave de cuenta de servicio** del equipo cuando termines y revocala desde Firebase si ya no la necesitás.

## 5. Publicar la aplicación

```bash
npm run build -- --mode CLIENTE
npx firebase-tools deploy --only hosting --project CLIENTE
```

(Para la demo de ventas el comando es `npm run deploy:demo`, que además publica reglas e índices.)

## 6. Activar los módulos (solo vos)

1. Entrá al sitio, pestaña **Configurador** (o el enlace "Acceso del Configurador" debajo del formulario), y elegí **Continuar con Google** con tu cuenta.
2. Elegí el **modelo de pago** de la pyme (por jornada o por hora) y prendé los módulos que contrató: *Sueldos en el legajo*, *Rendimiento*, *Seguimiento de liquidaciones*, *Facturación por proyecto*, *Dedicación y proyección*. Para una consultora usá el atajo "Consultoría". Guardá.
3. El administrador del cliente solo ve las pantallas de los módulos activos; no ve esta consola.

## 7. Que el cliente complete

- **Organigrama** (*Configuración → Organigrama*): ordenar quién supervisa a quién, y **asignar proyectos** a cada persona (*Asignar proyectos*) o, si prefiere no asignar, apagar "Cada persona carga horas solo en los proyectos que le asignan" en *Configuración → Jornada y horas extra*. Sin asignaciones (y con la opción activa) nadie puede cargar horas.

- **Proyectos** (sin proyectos nadie puede cargar horas), **jornada general** y **reglas de horas extra** (*Configuración → Jornada y horas extra*), **fichas** de cada persona (CUIL, legajo, supervisor, jornada propia si corresponde), **feriados** de años siguientes si hacen falta.
- Si contrató sueldos: cargar el sueldo o valor hora en cada ficha.

## 8. Lista de verificación antes de entregar

- [ ] Entrar con el administrador, un supervisor y un empleado de prueba: cada uno ve solo lo suyo.
- [ ] Un supervisor asigna un proyecto a un empleado → el empleado lo ve en "Cargar horas" y en ningún otro.
- [ ] Un empleado carga horas → el supervisor las aprueba → aparecen en Reportes y en la planilla de Excel.
- [ ] Un empleado pide una licencia → el supervisor la aprueba → aparece en el calendario del equipo.
- [ ] Entrar como Configurador con Google: se ve la consola y el administrador del cliente **no** ve los módulos.
- [ ] Si hay módulos de sueldos: cargar un sueldo, ver Rendimiento y el seguimiento de liquidaciones; publicar un mes y comprobar que el empleado ve solo el suyo.
- [ ] Se borró (y revocó) la clave de cuenta de servicio.
- [ ] Se cambió la contraseña inicial del administrador.
- [ ] Se revisó `docs/seguridad.md` (App Check, política de contenido) para esta instancia.

## 9. Respaldo

Recomendación para producción: activar **recuperación a un punto en el tiempo** y **copias de seguridad programadas** de Firestore (requieren el plan Blaze). Es también lo que habilita las Cloud Functions para invitar usuarios por mail.

## 10. Si el proveedor (Configurador) cambia

El correo autorizado está en dos lugares: `src/config/configurator.ts` y la función `isConfigurator()` de `firestore.rules`. Hay que cambiarlo en ambos, correr `npm run test:rules` y volver a publicar las reglas y la aplicación en **cada** instancia.
