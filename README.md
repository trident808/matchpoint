# MatchPoint

Plataforma de pronósticos deportivos con créditos sin valor monetario.
La página se publica en **GitHub Pages** y los datos se guardan en **Supabase**.

## Estructura

```
index.html                     Página principal
.nojekyll                      Le indica a GitHub Pages que publique los archivos tal cual
css/estilos.css                Estilos
js/config.js                   Dirección y llave publicable de Supabase
js/core.js                     Núcleo compartido (llamadas a Supabase, fechas, errores)
js/cuentas.js                  Usuarios, sesión y créditos
js/torneos.js                  Torneos y eventos 1X2
js/pronosticos.js              Pronósticos y débito
js/app.js                      Integración: menú por rol, pantallas y temporizadores
supabase/01_cuentas.sql        Tablas y funciones de usuarios, sesiones y movimientos
supabase/02_torneos.sql        Tablas y funciones de torneos y eventos
supabase/03_pronosticos.sql    Tabla y funciones de pronósticos
supabase/04_datos_iniciales.sql Cuentas de administración y torneo de ejemplo
```

## Reparto del trabajo

| Integrante | Módulo | Historias | Archivos |
|---|---|---|---|
| 1 | Usuarios y créditos | HU-01, HU-02, HU-03, HU-09 | `js/config.js`, `js/core.js`, `js/cuentas.js`, `supabase/01_cuentas.sql` |
| 2 | Torneos y partidos | HU-04, HU-05, HU-06, HU-10 | `index.html`, `css/estilos.css`, `js/torneos.js`, `supabase/02_torneos.sql` |
| 3 | Pronósticos y cobro | HU-07, HU-08 | `js/pronosticos.js`, `js/app.js`, `supabase/03_pronosticos.sql`, `supabase/04_datos_iniciales.sql`, `README.md`, `.nojekyll` |

## Cómo se conectan los módulos

- Cada archivo `.js` registra sus pantallas, formularios y acciones en `views`, `forms` y `actions` (definidos en `core.js`). `app.js` los une.
- `torneos.js` llama a `cargarMisPronosticos()` y `opcionesPronostico()` de `pronosticos.js` para pintar los botones 1/X/2.
- En la base de datos, `02_torneos.sql` y `03_pronosticos.sql` usan `mp_sesion()` y `mp_saldo()` de `01_cuentas.sql`.

## Seguridad

- La página no puede leer las tablas directamente (RLS activo y sin permisos para `anon`).
- Todo pasa por funciones `mp_*` que validan el token de sesión y el rol.
- Las contraseñas se guardan cifradas con bcrypt.
- La sesión vence tras 5 minutos sin actividad (lo valida el servidor).
- El cobro de un pronóstico se hace en una sola transacción, con llave de idempotencia, para que un reintento no cobre dos veces.
- Un trabajo programado (`pg_cron`) cierra los eventos vencidos cada minuto.

## Base de datos

El proyecto de Supabase **MatchPoint** ya tiene ejecutados los cuatro archivos de `supabase/`.
Para montarlo en otro proyecto, ejecútalos en el **SQL Editor** de Supabase en este orden:
`01_cuentas.sql`, `02_torneos.sql`, `03_pronosticos.sql`, `04_datos_iniciales.sql`.
Luego cambia la dirección y la llave en `js/config.js`.

## Cuentas de administración

Estas cuentas no aparecen en la página. Cambien las claves antes de la entrega final.

| Correo | Clave | Rol |
|---|---|---|
| admin@matchpoint.co | Admin2026 | Administrador de torneos |
| auditor@matchpoint.co | Audit2026 | Auditor |

Los participantes se crean desde la página con **Registrarme**.

## Publicar en GitHub Pages

1. Los archivos deben quedar en la raíz del repositorio, con las carpetas `css`, `js` y `supabase`.
2. **Settings → Pages → Branch: `main`, carpeta `/ (root)`**.
3. Esperar a que termine el proceso en la pestaña **Actions** y abrir el enlace de Pages.
