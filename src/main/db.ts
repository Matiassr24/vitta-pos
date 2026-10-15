import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs'
import Database from 'better-sqlite3'
import { aplicarMigraciones } from './migraciones'

export const CLAVE_CARPETA_BACKUP_EXTRA = 'carpeta_backup_extra'

let db: Database.Database | null = null

function rutaSchema(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'db', 'schema.sql')
    : join(__dirname, '../../db/schema.sql')
}

export function initDb(): Database.Database {
  if (db) return db

  const rutaDb = join(app.getPath('userData'), 'vitta.db')
  const esNueva = !existsSync(rutaDb)

  db = new Database(rutaDb)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  if (esNueva) {
    db.exec(readFileSync(rutaSchema(), 'utf-8'))
  }

  // Corre siempre, sobre bases nuevas y viejas: una base que ya existía
  // antes de un cambio de esquema nunca recibe schema.sql de nuevo, así
  // que tiene que ponerse al día acá. Ver migraciones.ts.
  aplicarMigraciones(db)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('La base de datos todavía no fue inicializada')
  return db
}

// Backup con VACUUM INTO: da una copia consistente aunque haya algo
// escribiendo en ese momento, a diferencia de copiar el archivo a mano.
export function hacerBackup(): void {
  if (!db) return

  const carpetaBackups = join(app.getPath('userData'), 'backups')
  if (!existsSync(carpetaBackups)) mkdirSync(carpetaBackups, { recursive: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const rutaBackup = join(carpetaBackups, `vitta-${hoy}.db`)

  if (!existsSync(rutaBackup)) {
    db.exec(`VACUUM INTO '${rutaBackup.replace(/'/g, "''")}'`)
    limpiarBackupsViejos(carpetaBackups, 30)
  }

  copiarACarpetaExtra(rutaBackup, hoy)
}

// Copia opcional a una carpeta elegida por el usuario (Drive, Dropbox,
// un pendrive...). Si no está configurada, o la carpeta no está
// disponible en este momento (pendrive desconectado, Drive no
// instalado), no rompe nada: el backup local ya se hizo igual.
function copiarACarpetaExtra(rutaBackup: string, hoy: string): void {
  if (!db) return
  const fila = db.prepare('SELECT valor FROM config WHERE clave = ?').get(CLAVE_CARPETA_BACKUP_EXTRA) as
    | { valor: string | null }
    | undefined
  const carpetaExtra = fila?.valor
  if (!carpetaExtra || !existsSync(carpetaExtra)) return

  try {
    copyFileSync(rutaBackup, join(carpetaExtra, `vitta-${hoy}.db`))
  } catch {
    // Si falla (carpeta de red caída, sin espacio, etc.) no queremos
    // que antes de cerrar la app rompa nada: el backup local ya existe.
  }
}

function limpiarBackupsViejos(carpeta: string, diasAConservar: number): void {
  const limiteMs = diasAConservar * 24 * 60 * 60 * 1000
  const ahora = Date.now()

  for (const archivo of readdirSync(carpeta)) {
    const rutaArchivo = join(carpeta, archivo)
    if (ahora - statSync(rutaArchivo).mtimeMs > limiteMs) {
      unlinkSync(rutaArchivo)
    }
  }
}

export function cerrarDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
