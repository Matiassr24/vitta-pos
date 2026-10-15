-- ============================================================
-- Vitta — Esquema de base de datos (SQLite)
-- ============================================================
-- CONVENCIONES:
--   * Toda la plata se guarda en PESOS ENTEROS (INTEGER), sin centavos.
--     $1.350  ->  1350
--     Vitta trabaja con precios redondeados, así que no hay decimales
--     en ningún lado. Esto elimina de raíz los errores de redondeo.
--     Si algún día hicieran falta centavos, se migra multiplicando
--     todos los montos por 100; el resto del código no cambia.
--   * Las cantidades son REAL para soportar productos pesables
--     (0.250 kg de fiambre). Para unidades siempre son enteros.
--   * Las fechas se guardan como TEXT en formato ISO local:
--     'YYYY-MM-DD HH:MM:SS'
--   * Los booleanos son INTEGER 0/1.
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;


-- ============================================================
-- CATÁLOGO
-- ============================================================

CREATE TABLE categorias (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT    NOT NULL UNIQUE,
    activo  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE proveedores (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT    NOT NULL UNIQUE,
    telefono  TEXT,
    email     TEXT,
    notas     TEXT,
    activo    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE productos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Código del escáner. Puede ser NULL (pan, fiambre suelto, sueltos varios).
    -- SQLite permite múltiples NULL en una columna UNIQUE, así que esto funciona.
    codigo_barras   TEXT    UNIQUE,

    nombre          TEXT    NOT NULL,
    descripcion     TEXT,
    categoria_id    INTEGER REFERENCES categorias(id),
    proveedor_id    INTEGER REFERENCES proveedores(id),

    -- UNIDAD: se vende de a 1, 2, 3...
    -- KG / LITRO: admite decimales, el precio es POR KILO o POR LITRO.
    unidad          TEXT    NOT NULL DEFAULT 'UNIDAD'
                            CHECK (unidad IN ('UNIDAD','KG','LITRO')),

    -- ---- PRECIOS ----
    -- Precio al que se compra UNA unidad (no el bulto).
    precio_costo    INTEGER NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),

    -- Margen que se le aplica al costo. Vitta usa 35% por defecto,
    -- pero se puede cambiar por producto (ej: regalería con más margen,
    -- cigarrillos con menos).
    margen          REAL    NOT NULL DEFAULT 35 CHECK (margen >= 0),

    -- Precio que se cobra. Se calcula con el margen y después se
    -- REDONDEA a criterio. Se guarda aparte del sugerido porque el
    -- precio final lo decide una persona, no la fórmula.
    precio_venta    INTEGER NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),

    -- Columna calculada: costo + margen%, redondeado al peso.
    -- No ocupa espacio, SQLite la resuelve al leer.
    -- Ej: costo 1000, margen 35  ->  1350
    precio_sugerido INTEGER GENERATED ALWAYS AS
                    (CAST(ROUND(precio_costo * (1 + margen / 100.0)) AS INTEGER)) VIRTUAL,

    -- ---- COMPRA POR BULTO ----
    -- En el mayorista se compra por caja/paquete. Guardar esto permite
    -- cargar "pagué 12000 por un cajón de 12" y que el sistema calcule
    -- el costo unitario de 1000 solo.
    unidades_por_bulto REAL NOT NULL DEFAULT 1 CHECK (unidades_por_bulto > 0),
    costo_bulto        INTEGER,

    stock           REAL    NOT NULL DEFAULT 0,
    stock_minimo    REAL    NOT NULL DEFAULT 0,

    -- 0 para servicios o cosas cuyo stock no vale la pena seguir
    -- (ej: fotocopias, recargas).
    controla_stock  INTEGER NOT NULL DEFAULT 1,

    activo          INTEGER NOT NULL DEFAULT 1,
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_productos_codigo   ON productos(codigo_barras);
CREATE INDEX idx_productos_nombre   ON productos(nombre);
CREATE INDEX idx_productos_activo   ON productos(activo, categoria_id);

-- Mantiene actualizado_en al día sin que la app tenga que acordarse.
CREATE TRIGGER trg_productos_touch
AFTER UPDATE ON productos
FOR EACH ROW
BEGIN
    UPDATE productos
       SET actualizado_en = datetime('now','localtime')
     WHERE id = OLD.id;
END;


-- ============================================================
-- MEDIOS DE PAGO
-- ============================================================

CREATE TABLE medios_pago (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre                TEXT    NOT NULL UNIQUE,

    -- 1 = la plata entra/sale del cajón físico y afecta el arqueo.
    -- 0 = transferencias, débito, QR: suman a la venta pero NO al efectivo.
    afecta_caja_efectivo  INTEGER NOT NULL DEFAULT 0,

    -- 1 = no se cobra ahora, va a la cuenta corriente del cliente.
    es_fiado              INTEGER NOT NULL DEFAULT 0,

    orden                 INTEGER NOT NULL DEFAULT 0,
    activo                INTEGER NOT NULL DEFAULT 1
);


-- ============================================================
-- CLIENTES / FIADO
-- ============================================================

CREATE TABLE clientes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    telefono        TEXT,
    direccion       TEXT,

    -- POSITIVO = el cliente debe plata.
    saldo           INTEGER NOT NULL DEFAULT 0,
    limite_credito  INTEGER NOT NULL DEFAULT 0,

    notas           TEXT,
    activo          INTEGER NOT NULL DEFAULT 1,
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_clientes_nombre ON clientes(nombre);


-- ============================================================
-- USUARIOS
-- ============================================================

CREATE TABLE usuarios (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT    NOT NULL UNIQUE,
    pin_hash  TEXT,                 -- hash, NUNCA el PIN en texto plano
    rol       TEXT    NOT NULL DEFAULT 'VENDEDOR'
                      CHECK (rol IN ('ADMIN','VENDEDOR')),
    activo    INTEGER NOT NULL DEFAULT 1
);


-- ============================================================
-- CAJA
-- ============================================================

CREATE TABLE caja_sesiones (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    fecha_apertura    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    monto_inicial     INTEGER NOT NULL DEFAULT 0,   -- con lo que arranca el cajón

    fecha_cierre      TEXT,
    monto_declarado   INTEGER,   -- lo que se contó físicamente al cerrar
    monto_esperado    INTEGER,   -- lo que el sistema dice que debería haber
    diferencia        INTEGER,   -- declarado - esperado (negativo = falta plata)

    usuario_id        INTEGER REFERENCES usuarios(id),
    notas             TEXT,
    estado            TEXT    NOT NULL DEFAULT 'ABIERTA'
                              CHECK (estado IN ('ABIERTA','CERRADA'))
);

-- Solo puede haber UNA caja abierta a la vez.
CREATE UNIQUE INDEX idx_caja_unica_abierta
    ON caja_sesiones(estado) WHERE estado = 'ABIERTA';


-- ============================================================
-- VENTAS
-- ============================================================

CREATE TABLE ventas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    caja_sesion_id   INTEGER NOT NULL REFERENCES caja_sesiones(id),
    cliente_id       INTEGER REFERENCES clientes(id),
    usuario_id       INTEGER REFERENCES usuarios(id),

    fecha            TEXT    NOT NULL DEFAULT (datetime('now','localtime')),

    subtotal         INTEGER NOT NULL DEFAULT 0,
    descuento        INTEGER NOT NULL DEFAULT 0,
    total            INTEGER NOT NULL DEFAULT 0,

    -- Costo total de la mercadería vendida en este ticket.
    -- Permite calcular la ganancia real sin depender de precios actuales.
    costo_total      INTEGER NOT NULL DEFAULT 0,

    estado           TEXT    NOT NULL DEFAULT 'COMPLETADA'
                             CHECK (estado IN ('COMPLETADA','ANULADA')),
    anulada_en       TEXT,
    motivo_anulacion TEXT,
    notas            TEXT
);

CREATE INDEX idx_ventas_fecha  ON ventas(fecha);
CREATE INDEX idx_ventas_caja   ON ventas(caja_sesion_id);
CREATE INDEX idx_ventas_estado ON ventas(estado, fecha);


CREATE TABLE venta_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id         INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id      INTEGER REFERENCES productos(id),

    -- SNAPSHOT: se copian del producto en el momento de la venta.
    -- Si mañana cambia el precio o el nombre, el ticket viejo no se altera.
    nombre           TEXT    NOT NULL,
    cantidad         REAL    NOT NULL CHECK (cantidad > 0),
    precio_unitario  INTEGER NOT NULL,
    costo_unitario   INTEGER NOT NULL DEFAULT 0,
    subtotal         INTEGER NOT NULL,

    -- Si esta línea vino de una promo (ver más abajo), queda marcada acá.
    -- promocion_nombre es otro snapshot, igual que el resto de la fila:
    -- si mañana se borra o renombra la promo, el ticket viejo no cambia.
    promocion_id      INTEGER REFERENCES promociones(id),
    promocion_nombre  TEXT
);

CREATE INDEX idx_venta_items_venta    ON venta_items(venta_id);
CREATE INDEX idx_venta_items_producto ON venta_items(producto_id);


-- Una venta puede pagarse con varios medios (mitad efectivo, mitad transferencia).
CREATE TABLE venta_pagos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id       INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    medio_pago_id  INTEGER NOT NULL REFERENCES medios_pago(id),
    monto          INTEGER NOT NULL CHECK (monto > 0)
);

CREATE INDEX idx_venta_pagos_venta ON venta_pagos(venta_id);


-- ============================================================
-- COMPRAS / REPOSICIÓN DE STOCK
-- ============================================================

CREATE TABLE compras (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id        INTEGER REFERENCES proveedores(id),
    fecha               TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    numero_comprobante  TEXT,
    total               INTEGER NOT NULL DEFAULT 0,
    medio_pago_id       INTEGER REFERENCES medios_pago(id),

    -- Si se pagó en efectivo del cajón, queda linkeado a la sesión de caja
    -- para que el arqueo lo descuente. Si se pagó por transferencia, va NULL.
    caja_sesion_id      INTEGER REFERENCES caja_sesiones(id),

    notas               TEXT
);

CREATE INDEX idx_compras_fecha ON compras(fecha);


CREATE TABLE compra_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id       INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    cantidad        REAL    NOT NULL CHECK (cantidad > 0),
    costo_unitario  INTEGER NOT NULL,
    subtotal        INTEGER NOT NULL
);

CREATE INDEX idx_compra_items_compra ON compra_items(compra_id);


-- ============================================================
-- MOVIMIENTOS DE CAJA
-- ============================================================
-- Toda entrada o salida de plata pasa por acá. El arqueo se calcula
-- sumando esta tabla, nunca leyendo las ventas directamente.

CREATE TABLE movimientos_caja (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    caja_sesion_id    INTEGER NOT NULL REFERENCES caja_sesiones(id),
    fecha             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),

    tipo              TEXT    NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),

    concepto          TEXT    NOT NULL CHECK (concepto IN (
                          'VENTA',          -- cobro de una venta
                          'COBRO_FIADO',    -- un cliente salda su cuenta
                          'APORTE',         -- se mete plata al cajón
                          'COMPRA_STOCK',   -- se paga mercadería
                          'GASTO',          -- luz, flete, limpieza, etc.
                          'RETIRO',         -- se saca plata del cajón
                          'AJUSTE'          -- corrección manual
                      )),

    -- Siempre POSITIVO. El signo lo define la columna 'tipo'.
    monto             INTEGER NOT NULL CHECK (monto > 0),

    -- 1 solo si movió efectivo físico. Las transferencias van con 0
    -- para que no rompan el arqueo del cajón.
    afecta_efectivo   INTEGER NOT NULL DEFAULT 1,

    medio_pago_id     INTEGER REFERENCES medios_pago(id),
    descripcion       TEXT,

    -- Trazabilidad hacia el origen: 'ventas', 'compras', 'cuenta_corriente'...
    referencia_tabla  TEXT,
    referencia_id     INTEGER,

    usuario_id        INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_caja_sesion ON movimientos_caja(caja_sesion_id);
CREATE INDEX idx_mov_caja_fecha  ON movimientos_caja(fecha);


-- ============================================================
-- MOVIMIENTOS DE STOCK
-- ============================================================
-- Historial completo. Permite reconstruir por qué falta mercadería.

CREATE TABLE movimientos_stock (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id       INTEGER NOT NULL REFERENCES productos(id),
    fecha             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),

    tipo              TEXT    NOT NULL CHECK (tipo IN (
                          'INICIAL',     -- carga inicial del inventario
                          'VENTA',
                          'COMPRA',
                          'AJUSTE',      -- corrección tras contar
                          'MERMA',       -- vencido, roto, robado
                          'DEVOLUCION',
                          'ANULACION'    -- se revierte una venta anulada
                      )),

    -- CON SIGNO: negativo descuenta, positivo suma.
    cantidad          REAL    NOT NULL,

    -- Stock que quedó después de aplicar el movimiento. Redundante a
    -- propósito: hace las auditorías triviales.
    stock_resultante  REAL    NOT NULL,

    referencia_tabla  TEXT,
    referencia_id     INTEGER,
    motivo            TEXT,
    usuario_id        INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_stock_producto ON movimientos_stock(producto_id, fecha);
CREATE INDEX idx_mov_stock_fecha    ON movimientos_stock(fecha);


-- ============================================================
-- CUENTA CORRIENTE (FIADO)
-- ============================================================

CREATE TABLE cuenta_corriente (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
    fecha             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),

    tipo              TEXT    NOT NULL CHECK (tipo IN ('CARGO','PAGO')),
    monto             INTEGER NOT NULL CHECK (monto > 0),

    venta_id          INTEGER REFERENCES ventas(id),
    saldo_resultante  INTEGER NOT NULL,
    notas             TEXT
);

CREATE INDEX idx_cc_cliente ON cuenta_corriente(cliente_id, fecha);


-- ============================================================
-- PROMOCIONES
-- ============================================================

-- Una promo NO es un producto con su propio stock: es una combinación
-- de productos que ya existen (Fernet + Coca, 200g queso + 200g jamón),
-- vendidos juntos a un precio de conjunto. Al venderse, se descuenta el
-- stock real de cada producto componente por separado — mismo mecanismo
-- que una venta suelta, así todo lo que ya existe (reportes, control de
-- stock, anulación) sigue funcionando sin tocarse.
CREATE TABLE promociones (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre              TEXT    NOT NULL,
    precio_promocional  INTEGER NOT NULL CHECK (precio_promocional >= 0),
    activo              INTEGER NOT NULL DEFAULT 1,
    creado_en           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE promocion_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    promocion_id   INTEGER NOT NULL REFERENCES promociones(id),
    producto_id    INTEGER NOT NULL REFERENCES productos(id),
    -- CON SIGNO siempre positivo: cuánto de este producto lleva UNA
    -- unidad de la promo (ej. 0.2 para 200g de queso).
    cantidad       REAL    NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX idx_promocion_items_promocion ON promocion_items(promocion_id);


-- ============================================================
-- CONFIGURACIÓN
-- ============================================================

CREATE TABLE config (
    clave  TEXT PRIMARY KEY,
    valor  TEXT
);


-- ============================================================
-- VISTAS DE REPORTE
-- ============================================================

-- Resumen diario: facturación, costo y ganancia bruta.
CREATE VIEW v_ventas_por_dia AS
SELECT
    date(fecha)                        AS dia,
    COUNT(*)                           AS cantidad_tickets,
    SUM(total)                         AS facturado,
    SUM(costo_total)                   AS costo_mercaderia,
    SUM(total) - SUM(costo_total)      AS ganancia_bruta
FROM ventas
WHERE estado = 'COMPLETADA'
GROUP BY date(fecha);


-- Productos que hay que reponer.
CREATE VIEW v_reponer AS
SELECT
    p.id,
    p.nombre,
    p.stock,
    p.stock_minimo,
    p.stock_minimo - p.stock AS faltante,
    pr.nombre                AS proveedor
FROM productos p
LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
WHERE p.activo = 1
  AND p.controla_stock = 1
  AND p.stock <= p.stock_minimo
ORDER BY faltante DESC;


-- Ranking de productos más vendidos.
CREATE VIEW v_mas_vendidos AS
SELECT
    vi.producto_id,
    vi.nombre,
    SUM(vi.cantidad)                             AS unidades,
    SUM(vi.subtotal)                             AS facturado,
    SUM(vi.subtotal - vi.costo_unitario * vi.cantidad) AS ganancia
FROM venta_items vi
JOIN ventas v ON v.id = vi.venta_id
WHERE v.estado = 'COMPLETADA'
GROUP BY vi.producto_id, vi.nombre
ORDER BY facturado DESC;


-- Estado de una sesión de caja: efectivo esperado en el cajón.
CREATE VIEW v_arqueo_caja AS
SELECT
    cs.id                                       AS caja_sesion_id,
    cs.fecha_apertura,
    cs.monto_inicial,
    COALESCE(SUM(CASE WHEN mc.tipo = 'INGRESO' AND mc.afecta_efectivo = 1
                      THEN mc.monto ELSE 0 END), 0) AS ingresos_efectivo,
    COALESCE(SUM(CASE WHEN mc.tipo = 'EGRESO'  AND mc.afecta_efectivo = 1
                      THEN mc.monto ELSE 0 END), 0) AS egresos_efectivo,
    cs.monto_inicial
        + COALESCE(SUM(CASE WHEN mc.tipo = 'INGRESO' AND mc.afecta_efectivo = 1
                            THEN mc.monto ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN mc.tipo = 'EGRESO'  AND mc.afecta_efectivo = 1
                            THEN mc.monto ELSE 0 END), 0) AS efectivo_esperado
FROM caja_sesiones cs
LEFT JOIN movimientos_caja mc ON mc.caja_sesion_id = cs.id
GROUP BY cs.id;


-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Solo los medios que Vitta usa hoy. Si mañana suman posnet,
-- se agrega una fila y listo, no hay que tocar nada de código.
INSERT INTO medios_pago (nombre, afecta_caja_efectivo, es_fiado, orden, activo) VALUES
    ('Efectivo',                    1, 0, 1, 1),
    ('Transferencia (Mercado Pago)',0, 0, 2, 1),
    ('Fiado',                       0, 1, 3, 1),
    ('Débito',                      0, 0, 4, 0),
    ('Crédito',                     0, 0, 5, 0);

INSERT INTO categorias (nombre) VALUES
    ('Almacén'),
    ('Panadería'),
    ('Fiambrería'),
    ('Bebidas'),
    ('Lácteos'),
    ('Limpieza'),
    ('Perfumería'),
    ('Papelería'),
    ('Regalería'),
    ('Kiosco'),
    ('Varios'),
    -- v3 (ver migrarA3 en src/main/migraciones.ts): una base nueva ya las
    -- trae, una base vieja las recibe por la migración.
    ('Cigarrillos'),
    ('Gaseosas'),
    ('Bebidas con alcohol');

INSERT INTO usuarios (nombre, rol) VALUES ('Administrador', 'ADMIN');

INSERT INTO config (clave, valor) VALUES
    ('negocio_nombre',    'Polirubro Vitta'),
    ('version_esquema',   '3'),
    ('margen_default',    '35'),      -- % que se suma al costo por defecto
    ('redondeo_precio',   '10'),      -- redondear precio sugerido al múltiplo de N
                                      -- (10 = termina en 0, 50 = en 0 o 50, 1 = sin redondeo)
    ('alias_transferencia',''),      -- alias de cobro por transferencia (se configura en cada negocio)
    ('backup_carpeta',    ''),
    ('prefijo_balanza',   '2');
