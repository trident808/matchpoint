# MatchPoint

Plataforma de pronósticos deportivos con créditos sin valor monetario.

## Estructura

```
matchpoint/
├── index.html          Página principal, carga estilos y scripts
├── css/estilos.css     Estilos compartidos
└── js/
    ├── core.js         Núcleo compartido (almacén, fechas, errores, registro de pantallas)
    ├── cuentas.js      Integrante 1 · HU-01, HU-02, HU-03, HU-09
    ├── torneos.js      Integrante 2 · HU-04, HU-05, HU-06, HU-10
    ├── pronosticos.js  Integrante 3 · HU-07, HU-08
    └── app.js          Integración: menú por rol, enrutador, eventos y datos de prueba
```

## Integración

Cada módulo registra sus pantallas, formularios y acciones en los objetos
`views`, `forms` y `actions` de `core.js`. `app.js` los une y decide qué
pantalla mostrar según el rol del usuario.

Puntos de contacto entre módulos:

- `requireRole`, `currentUser` y `saldo` (cuentas.js) los usan torneos y pronósticos.
- `estadoEvento` y `cerrarVencidos` (torneos.js) los usa pronósticos para validar el periodo.
- `opcionesPronostico` (pronosticos.js) la llama torneos.js al pintar cada tarjeta de evento.

## Cómo ejecutarlo

Abrir `index.html` en el navegador. Los datos se guardan en `localStorage`.

Cuentas de prueba:

| Correo | Clave | Rol |
|---|---|---|
| laura@demo.co | Demo2026 | Participante (100 créditos) |
| andres@demo.co | Demo2026 | Participante (sin asignación) |
| admin@matchpoint.co | Admin2026 | Administrador |
| auditor@matchpoint.co | Audit2026 | Auditor |
