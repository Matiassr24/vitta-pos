# Vitta — Decisiones de diseño y roadmap

> Documento de planificación escrito al comienzo del proyecto. Algunas partes del roadmap ya están implementadas y otras quedaron como ideas a futuro.

Sistema de punto de venta (POS), control de stock y control de caja para el polirubro Vitta.
Corre 100% local en la notebook del negocio, sin internet obligatorio.

---

## 1. Stack elegido

| Capa | Tecnología | Por qué |
|---|---|---|
| App de escritorio | **Electron** | Se instala como un `.exe`, se abre con doble clic, no necesita servidor ni internet. |
| UI | **React + TypeScript + Vite** | Rápido de construir, TypeScript evita errores tontos al manejar plata y stock. |
| Estilos | **CSS propio por componente** | Control total de la interfaz. Botones grandes para usar rápido en el mostrador. |
| Base de datos | **SQLite** (vía `better-sqlite3`) | Un solo archivo `vitta.db`. Sin instalar nada, sin usuario/contraseña, backup = copiar el archivo. Aguanta millones de ventas sin problema. |
| Empaquetado | **electron-builder** | Genera el instalador de Windows. |
| Inspección de la DB | **DB Browser for SQLite** (opcional) | Para mirar/editar la base a mano cuando haga falta. |

### Alternativas que descarté (y por qué)

- **Python + FastAPI + navegador**: perfectamente válido, y si te sentís mucho más cómodo con Python, andá por ahí sin culpa. Lo descarté porque la experiencia final es "abrir una terminal + abrir el navegador" en vez de un ícono en el escritorio.
- **Tauri**: más liviano que Electron, pero necesita toolchain de Rust. Buena opción para una v2 si el `.exe` de ~150 MB molesta.
- **C# + WPF**: excelente para Windows, pero curva más empinada y menos material/ejemplos para consultar.
- **MySQL / PostgreSQL**: overkill total. Son motores pensados para varias máquinas conectadas; acá hay una sola notebook. Sumarían mantenimiento sin darte nada.
- **Excel / Access**: se rompe apenas crece, no maneja bien el escáner ni la concurrencia de caja.

---

## 2. Estructura de carpetas propuesta

```
vitta/
├── db/
│   ├── schema.sql              # Esquema completo de la base (incluido)
│   └── migrations/             # Cambios futuros al esquema, numerados
├── docs/
│   └── operacion-y-hardware.md # Escáner, balanza, flujo diario, backups
├── src/
│   ├── main/                   # Proceso principal de Electron
│   │   ├── index.ts            # Arranque de la app, ventana
│   │   ├── db.ts               # Conexión SQLite, migraciones
│   │   ├── ipc/                # Handlers IPC (puente UI <-> DB)
│   │   └── services/           # Lógica de negocio
│   │       ├── productos.ts
│   │       ├── ventas.ts
│   │       ├── caja.ts
│   │       ├── compras.ts
│   │       └── reportes.ts
│   ├── preload/
│   │   └── index.ts            # API segura expuesta al renderer
│   └── renderer/               # React
│       ├── pages/
│       │   ├── Venta.tsx       # Pantalla principal (mostrador)
│       │   ├── Productos.tsx
│       │   ├── Caja.tsx
│       │   ├── Compras.tsx
│       │   ├── Clientes.tsx    # Fiado / cuenta corriente
│       │   └── Reportes.tsx
│       ├── components/
│       └── lib/
├── backups/                    # Copias automáticas de la base
└── package.json
```

---

## 3. Decisiones importantes (leer antes de escribir código)

### 3.1 La plata se guarda en pesos enteros
Vitta trabaja con precios redondeados, así que no hay centavos en ningún lado. Un producto de $1.350 se guarda como `1350`.

Lo importante: **usá `INTEGER`, nunca `REAL`/`float`**. Aunque hoy no haya decimales, si en algún cálculo se cuela un float (un descuento, un promedio) empiezan las diferencias de 1 peso en el arqueo. Con enteros el problema no existe.

Si algún día hicieran falta centavos, se migra multiplicando todo por 100 y solo cambia el formateo en pantalla.

### 3.1.b El precio de venta se calcula, pero lo decide una persona
La regla de Vitta es costo + 35%. En la tabla `productos` eso está en tres campos:

- `precio_costo` — lo que se paga por **una unidad** (no por el bulto)
- `margen` — 35 por defecto, editable por producto
- `precio_sugerido` — columna calculada por SQLite: `costo × (1 + margen/100)` redondeado
- `precio_venta` — el que realmente se cobra

Están separados a propósito. El sugerido de un producto de $1.000 da $1.350, y ahí lo dejás. Pero si el costo es $1.037 el sugerido da $1.400 y quizás quieras ponerlo en $1.400 igual, o en $1.450. La fórmula propone, la persona dispone.

En la UI: al cargar el costo, el precio de venta se autocompleta con el sugerido, pero el campo queda editable. Y en la lista de productos conviene marcar en amarillo los que tienen `precio_venta` distinto del sugerido, para detectar precios que quedaron viejos.

**Feature que vale oro (Fase 1):** actualización masiva. Seleccionás los productos de un proveedor, cargás el aumento (%), y el sistema recalcula costos y precios de venta de todos juntos. Hacer eso a mano con 200 productos es lo que hace que la gente abandone el sistema.

### 3.1.c Compra por bulto
En el mayorista se compra por cajón, no por unidad. Los campos `costo_bulto` y `unidades_por_bulto` dejan cargar "pagué $12.000 por un cajón de 12" y que el sistema calcule solo el costo unitario de $1.000 y el precio de venta de $1.350.

### 3.2 Cada venta guarda una foto del precio Y del costo
`venta_items` guarda `precio_unitario`, `costo_unitario` y `nombre` copiados del producto en ese momento.
Si mañana subís el precio de la Coca, las ventas de ayer tienen que seguir mostrando lo que realmente cobraste. Sin esto, con la inflación argentina, cualquier reporte de ganancia histórica queda inservible.

### 3.3 El stock nunca se toca "a mano"
Toda modificación de stock genera una fila en `movimientos_stock` (venta, compra, ajuste, merma, devolución). Así, cuando falten 4 paquetes de yerba, podés reconstruir qué pasó en vez de adivinar. Producto + movimiento se escriben **en la misma transacción**.

### 3.4 No todo medio de pago entra a la caja física
El negocio cobra de dos formas: **efectivo** y **transferencia** (por ejemplo, a una cuenta de Mercado Pago).

La transferencia suma a la facturación y a la ganancia del día, pero **no** al efectivo del cajón. Por eso `medios_pago` tiene la bandera `afecta_caja_efectivo`. Sin esa distinción, al cerrar la caja el sistema va a esperar plata que nunca estuvo en el cajón.

Al cerrar el día vas a ver tres números distintos y los tres importan:
- **Efectivo esperado en el cajón** (lo que se cuenta a mano)
- **Total cobrado por transferencia** (se chequea contra la app de Mercado Pago)
- **Facturación total** = los dos anteriores

El fiado queda cargado como medio de pago también, pero no suma a ninguna caja: genera deuda en la cuenta del cliente y entra recién cuando el cliente paga.

### 3.5 Una venta puede tener varios pagos
"Te pago $10.000 en efectivo y el resto por transferencia" pasa todo el tiempo. Por eso los pagos están en una tabla aparte (`venta_pagos`) y no como una columna en `ventas`.

### 3.6 El fiado es parte del negocio, no un extra
En un negocio de barrio la cuenta corriente existe sí o sí. Está modelada desde el día uno (`clientes` + `cuenta_corriente`) para no tener que retorcer el sistema después.

---

## 4. Roadmap por fases

Cada fase deja algo **usable**. La idea es que el negocio empiece a usarlo lo antes posible, aunque esté incompleto, porque el feedback real vale más que cualquier feature planeada.

### Fase 0 — Preparación (1 día)
- Instalar Node.js LTS, Git, VS Code en tu máquina de desarrollo.
- `npm create vite@latest` + integrar Electron, o partir de un template `electron-vite`.
- Correr `db/schema.sql` y verificar que la base se crea.
- Repo en Git desde el minuto cero.

### Fase 1 — Productos y escáner (la base de todo)
- ABM de productos: nombre, código de barras, precio de costo, precio de venta, stock, categoría.
- Buscador por nombre y por código.
- **Prueba clave**: conectar el escáner, apuntar a un producto, que aparezca en pantalla. Si esto anda, el 80% del riesgo técnico se fue.
- Importador desde CSV/Excel para la carga inicial masiva.

### Fase 2 — Pantalla de venta
- Escanear → suma al ticket → total en vivo.
- Productos sin código (pan, fiambre, sueltos): grilla de botones de acceso rápido + búsqueda por nombre.
- Cobro: selección de medio(s) de pago, cálculo de vuelto.
- Al confirmar, **en una sola transacción**: crea venta + items + pagos, descuenta stock, registra movimiento de stock y movimiento de caja.
- Anulación de venta (que revierta todo, no que borre la fila).

### Fase 3 — Caja
- Apertura de caja con monto inicial.
- Movimientos manuales: retiro, aporte, gasto (el flete, la luz, el café).
- Cierre con arqueo: monto esperado vs. contado, y la diferencia queda registrada.
- Resumen del día: ventas por medio de pago, egresos, ganancia bruta.

### Fase 4 — Compras y reposición
- Carga de compras a proveedor: actualiza stock y costo, y descuenta de caja si se pagó en efectivo.
- Alerta de productos bajo el stock mínimo.
- Listado de "qué reponer" para llevar al mayorista.

### Fase 5 — Clientes y fiado
- Cuenta corriente: cargos, pagos, saldo.
- Aviso al vender a un cliente con deuda alta.

### Fase 6 — Reportes y cierre
- Ventas por día / semana / mes.
- Ganancia neta = ventas − costo de lo vendido − gastos.
- Productos más vendidos y productos parados (plata dormida en el estante).
- Exportar a Excel.

### Fase 7 — Robustez
- **Backup automático diario** a una carpeta de Google Drive / Dropbox + pendrive.
- Impresión de ticket (opcional).
- Usuarios con PIN si trabaja alguien más.

---

## 5. Los dos riesgos reales del proyecto

1. **Cargar el catálogo.** Un polirubro tiene fácil 800–2000 artículos. Cargarlos todos antes de arrancar es un mes de trabajo aburrido y es lo que mata a estos proyectos.
   **Solución**: cargar al vuelo. Si se escanea un código desconocido, se abre un modal chiquito (nombre, costo, precio) y se sigue vendiendo. En 3 semanas de operación normal queda cargado el 90% de lo que realmente rota.

2. **Perder la base.** Un disco que muere sin backup = se perdió el negocio entero.
   **Solución**: backup automático al cerrar la app, con el archivo copiado a una carpeta sincronizada en la nube. No es opcional, va en la Fase 1, no en la 7.

---

## 6. Nota sobre facturación

Este sistema es de **gestión interna** (stock, caja, ganancias). Emitir facturas electrónicas es un tema aparte que involucra ARCA (ex AFIP) y certificados digitales. Recomendación: no mezclarlo con la v1. Si más adelante hace falta, se integra un servicio de facturación por API en vez de implementar el webservice a mano.

Conviene consultar con el contador del negocio qué corresponde según su condición fiscal antes de decidir.
