# Horus

Suite de gestión de personal y control de horas para pymes. Marca blanca: cada cliente tiene su propia instancia.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # tests de la lógica
npm run lint     # chequeo de tipos
npm run build
```

- La marca del cliente (nombre, logo y colores) se cambia en `src/config/tenant.config.ts`.
- Las pantallas y rutas permitidas por rol están en `src/config/navigation.ts`.
- En desarrollo la pantalla de entrada ofrece entrar con cada rol. En un build de producción no existe esa entrada.
