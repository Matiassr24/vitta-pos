import type Database from 'better-sqlite3'

/**
 * Migraciones sobre una base YA EXISTENTE (con datos reales adentro).
 *
 * `schema.sql` solo se ejecuta una vez, al crear el archivo por primera
 * vez — así que un cambio de esquema posterior (agregar una tabla, una
 * columna) nunca le llega solo a una base que ya existía antes de ese
 * cambio. Esto corre en cada arranque, sobre bases nuevas y viejas por
 * igual, y hace avanzar la base vieja paso a paso hasta la versión
 * actual — usando `config.version_esquema` (ya estaba en el schema
 * desde el principio, sin usarse) para saber en qué paso se quedó.
 *
 * Cada migración tiene que ser IDEMPOTENTE (CREATE TABLE IF NOT EXISTS,
 * chequear antes de un ALTER) porque una base recién creada desde
 * schema.sql ya arranca en la versión más alta — si esta función corre
 * igual ahí (y corre), no tiene que romper ni duplicar nada.
 */

const VERSION_ESQUEMA_ACTUAL = 3

export function aplicarMigraciones(db: Database.Database): void {
  const fila = db.prepare("SELECT valor FROM config WHERE clave = 'version_esquema'").get() as
    | { valor: string }
    | undefined
  let version = fila ? Number(fila.valor) : 1

  if (version < 2) {
    migrarA2(db)
    version = 2
  }

  if (version < 3) {
    migrarA3(db)
    version = 3
  }

  db.prepare(
    "INSERT INTO config (clave, valor) VALUES ('version_esquema', ?) ON CONFLICT(clave) DO UPDATE SET valor = ?"
  ).run(String(version), String(version))
}

// v2: promociones (combos de productos a precio de conjunto, ej.
// "Fernet + Coca"). Ver la nota en schema.sql, sección PROMOCIONES.
function migrarA2(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS promociones (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre              TEXT    NOT NULL,
        precio_promocional  INTEGER NOT NULL CHECK (precio_promocional >= 0),
        activo              INTEGER NOT NULL DEFAULT 1,
        creado_en           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS promocion_items (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        promocion_id   INTEGER NOT NULL REFERENCES promociones(id),
        producto_id    INTEGER NOT NULL REFERENCES productos(id),
        cantidad       REAL    NOT NULL CHECK (cantidad > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_promocion_items_promocion ON promocion_items(promocion_id);
  `)

  agregarColumnaSiFalta(db, 'venta_items', 'promocion_id', 'INTEGER REFERENCES promociones(id)')
  agregarColumnaSiFalta(db, 'venta_items', 'promocion_nombre', 'TEXT')
}

// v3: categorías para el resumen de reposición (2026-10-14, pedido de la
// dueña: separar cigarrillos y partir Bebidas en gaseosas / con alcohol).
// Son categorías PLANAS a propósito, no subcategorías: el reporte agrupa
// por categoría, así que dos categorías hermanas se separan solas sin
// ninguna estructura nueva. `nombre` es UNIQUE, entonces OR IGNORE hace
// la migración idempotente (y no pisa nada si la dueña ya las creó
// importando un Excel con esos mismos nombres). "Bebidas" queda tal
// cual: la dueña mueve los productos a mano a las nuevas.
function migrarA3(db: Database.Database): void {
  const insertar = db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)')
  for (const nombre of ['Cigarrillos', 'Gaseosas', 'Bebidas con alcohol']) {
    insertar.run(nombre)
  }
}

function agregarColumnaSiFalta(db: Database.Database, tabla: string, columna: string, definicion: string): void {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]
  if (!columnas.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`)
  }
}

export { VERSION_ESQUEMA_ACTUAL }
