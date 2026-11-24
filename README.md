# Horus

Gestión de horas, licencias y pre-liquidación para pymes. Marca blanca: cada cliente tiene su propia instancia.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000, con la entrada por rol de la demo si se corre con --mode demo
npm test             # tests de la lógica (horas extra, feriados, planilla)
npm run lint         # chequeo de tipos
npm run build
```

- La marca del cliente (nombre, logo y colores) se cambia en `src/config/tenant.config.ts`.
- Las pantallas y rutas permitidas por rol están en `src/config/navigation.ts`.
- La lógica de negocio (horas extra, feriados, planilla de Excel) está en `src/domain/`, sin dependencias de pantalla ni de Firebase.

## Instancia de demostración

`npm run build:demo` genera el build con `VITE_DEMO_MODE=true` (archivo `.env.demo`): muestra la entrada por rol y usa datos de ejemplo que no se conservan. Un build sin esa variable no incluye la entrada de demostración.

Para publicarla en Firebase Hosting (proyecto `demo` de `.firebaserc`):

```bash
npx firebase-tools login
npm run deploy:demo
```
