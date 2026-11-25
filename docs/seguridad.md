# Revisión de seguridad — Horus

Revisión hecha sobre el código y las reglas de Firestore del repositorio, al cierre del desarrollo inicial. Está escrita para alguien que no tiene el código delante. Severidad: 🔴 crítico · 🟡 mejorable · 🟢 menor · ✅ bien resuelto.

## Resumen

No se encontraron fallas críticas abiertas. Los permisos los hacen cumplir las **reglas de Firestore** (no solo la pantalla), están probadas con 110 casos contra el emulador y no hay ninguna colección sin regla explícita. Lo que queda son mejoras de endurecimiento (🟡) que conviene hacer cuando la instancia pase a producción con clientes reales.

## Lo que está bien resuelto (✅)

- **Permisos en el servidor.** Cada lectura y escritura pasa por reglas que leen el rol del token (`role`), no de un campo editable. Un empleado solo ve y edita lo suyo; un supervisor, lo de su equipo; el administrador, lo de la empresa. No existe un comodín `/{document=**}`: lo que no está escrito está denegado.
- **Roles.** Solo se asignan con un script de Admin SDK (el administrador de la pyme no puede cambiarlos ni crear usuarios). El campo `role` de `users` es una copia informativa que las reglas no dejan modificar.
- **Bajas.** Poner a una persona como inactiva le corta el acceso de inmediato desde las reglas, aunque su sesión siga abierta.
- **Datos sensibles separados.** CUIL, DNI y teléfono viven en `employee_private`; sueldos en `employee_pay`; recibos en `payslips`. Solo el administrador los lee, y los de sueldos solo con el módulo activo. Ni el supervisor, ni la propia persona (salvo su recibo publicado), ni el Configurador.
- **Configurador.** Entra solo con su cuenta de Google y su correo exacto, verificado, y la sesión tiene que haber iniciado con Google: una sesión con contraseña del mismo correo no sirve, ni otra cuenta de Google. No tiene rol, así que no ve datos de la empresa. Solo él escribe `settings/features` (módulos y modelo de pago); el administrador de la pyme no puede, aunque lo intente desde la consola del navegador.
- **Módulos apagados = datos bloqueados.** Si un módulo no está activo, las reglas niegan sus colecciones aunque alguien las pida directamente.
- **Período cerrado.** Con el mes de liquidaciones cerrado, las reglas rechazan crear, cambiar o borrar recibos (solo se puede publicar o retirar la publicación).
- **Recibos publicados.** La persona solo puede pedir los suyos y publicados; una consulta sin esas condiciones es rechazada. El costo patronal de la empresa no se guarda en el recibo.
- **Proyectos asignados.** Cada persona carga horas solo en los proyectos que su supervisor o el administrador le asignó (por defecto); las reglas lo exigen, y un supervisor solo asigna a su equipo.
- **Registros aprobados congelados.** Las horas y el desglose los escribe solo quien aprueba y no se pueden editar después.
- **Sin XSS por construcción.** React escapa lo que muestra; no hay `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `new Function` en el código.
- **Sin secretos en el repositorio.** Solo está la configuración web de Firebase (pública por diseño). Las claves de cuenta de servicio están excluidas por `.gitignore` y los scripts las leen de un archivo local.
- **Dependencias.** `npm audit`: 0 vulnerabilidades. Las dependencias de administración (`firebase-admin`) son solo de desarrollo y no entran en lo que se publica.
- **Sin mapas de código en producción** y con encabezados de seguridad en Hosting (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; HSTS lo agrega Firebase).
- **Sesión.** Se cierra sola a los 30 minutos sin actividad (hay datos de sueldos y personales en pantalla).
- **Exportaciones.** El CSV de la liquidación y el de Reportes neutralizan los textos que empiezan con `= + - @` (inyección de fórmulas en Excel).
- **Cada instancia es un proyecto de Firebase aparte:** la base de un cliente nunca contiene datos de otro.

## Hallazgos y qué hacer

### 🟡 Los cálculos de horas se hacen en el navegador de quien aprueba
Al aprobar, el supervisor o el administrador calcula `hours` y `breakdown` en su navegador y las reglas solo verifican que sean números. Un supervisor malintencionado podría escribir horas de más para su equipo. Es una limitación del diseño sin servidor propio.
**Recomendación:** cuando el cliente tenga el plan Blaze, mover el cálculo de la aprobación a una Cloud Function que reciba "aprobar" y calcule ella. Mientras tanto, el administrador ve y puede auditar todo en Reportes.

### 🟡 Falta una política de contenido (CSP)
Sería una capa extra contra scripts inyectados. No se agregó porque una política mal ajustada puede romper el inicio de sesión con Google del Configurador, y no se pudo probar contra el servicio real.
**Recomendación:** después del primer deploy, probar una CSP en modo solo reporte (`Content-Security-Policy-Report-Only`) con el Configurador entrando por Google, y recién después hacerla efectiva.

### 🟡 App Check no está activado
Sin App Check, cualquiera con la configuración web (que es pública) puede intentar escribir contra Firestore; las reglas siguen siendo la barrera, pero App Check evita el abuso automatizado y el consumo de cuota.
**Recomendación:** activar App Check con reCAPTCHA Enterprise en cada proyecto de cliente, primero en modo monitoreo.

### 🟡 Configuración de Firebase Authentication por revisar en cada proyecto
Son ajustes del proyecto, no del código: activar la **protección contra enumeración de correos**, una **política de contraseñas** más exigente que la por defecto (mínimo 10 caracteres) y **restringir la clave de API por dominio** en Google Cloud (solo el dominio de la instancia). Están en la guía de instalación.

### 🟡 El correo del Configurador está en el repositorio
`src/config/configurator.ts` y `firestore.rules` contienen el correo de quien administra los módulos (hace falta para que las reglas lo exijan). No es un secreto, pero sí un dato personal.
**Recomendación:** mantener el repositorio privado. Si el proveedor cambia, se actualiza en esos dos archivos y se vuelven a publicar las reglas.

### 🟡 Un mismo correo no debe ser Configurador y usuario de una pyme
Si una cuenta con contraseña y la cuenta de Google comparten correo, Firebase puede vincularlas y **descartar la contraseña**. Los scripts de alta ya rechazan el correo del Configurador.

### 🟢 Costo de lecturas de las reglas
Las reglas consultan `users/{uid}` y `settings/features` para decidir. Con decenas de usuarios es irrelevante; si una instancia crece mucho conviene medirlo.

### 🟢 Registros en la consola del navegador
Los errores de carga y guardado se escriben en la consola con el código técnico de Firebase (útil para soporte). No incluyen montos ni datos personales.

### 🟢 Liquidación: límites funcionales
No es seguridad pero sí riesgo para el cliente: la liquidación es una herramienta de anotación y seguimiento. Ganancias es simplificado y no reemplaza al contador (ver `docs/configurador.md`).

## Cómo se verificó

- Revisión línea por línea de `firestore.rules` y sus 110 pruebas (`npm run test:rules`).
- Búsqueda de secretos, correos, `innerHTML`/`eval`, almacenamiento local y archivos sensibles versionados.
- `npm audit` y revisión de dependencias sin uso (se quitó `lucide-react`).
- Recorridos de punta a punta en navegador contra los emuladores de Auth y Firestore para cada rol y cada módulo.
- Lo que **no** se pudo probar en el entorno de desarrollo: el inicio de sesión con Google en vivo (el servicio de Google no es accesible desde ahí). La regla que lo protege sí está probada con tokens reales del emulador; el recorrido completo hay que probarlo una vez en el sitio publicado.
