import { useEffect, useState } from 'react'
import type { Usuario, UsuarioInput } from '../../shared/types'
import { etiquetaRol } from '../lib/roles'
import { mensajeDeError } from '../lib/errores'
import { ModalUsuario } from '../components/ModalUsuario'
import './Usuarios.css'

type EstadoModal = { abierto: false } | { abierto: true; usuario: Usuario | null }

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<EstadoModal>({ abierto: false })
  const [carpetaBackup, setCarpetaBackup] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    window.api.backup.obtenerCarpeta().then(setCarpetaBackup)
  }, [])

  async function elegirCarpetaBackup(): Promise<void> {
    setCarpetaBackup(await window.api.backup.elegirCarpeta())
  }

  async function quitarCarpetaBackup(): Promise<void> {
    await window.api.backup.quitarCarpeta()
    setCarpetaBackup(null)
  }

  async function recargar(): Promise<void> {
    setCargando(true)
    try {
      setUsuarios(await window.api.usuarios.listar(false))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  async function guardarUsuario(datos: UsuarioInput): Promise<void> {
    setError(null)
    try {
      if (modal.abierto && modal.usuario) {
        await window.api.usuarios.actualizar(modal.usuario.id, datos)
      } else {
        await window.api.usuarios.crear(datos)
      }
      setModal({ abierto: false })
      await recargar()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el usuario.'))
    }
  }

  async function alternarActivo(usuario: Usuario): Promise<void> {
    setError(null)
    try {
      await window.api.usuarios.cambiarActivo(usuario.id, usuario.activo === 0)
      await recargar()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado del usuario.'))
    }
  }

  return (
    <div className="usuarios">
      <header className="usuarios__barra">
        <h1>Usuarios</h1>
        <button
          className="boton boton--primario"
          onClick={() => setModal({ abierto: true, usuario: null })}
        >
          + Nuevo usuario
        </button>
      </header>

      {error && <div className="usuarios__error">{error}</div>}

      <div className="usuarios__tabla-contenedor">
        <table className="usuarios__tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>PIN</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo === 0 ? 'usuarios__fila--inactivo' : ''}>
                <td>{u.nombre}</td>
                <td>{etiquetaRol(u.rol)}</td>
                <td>{u.tiene_pin ? 'Configurado' : 'Sin configurar'}</td>
                <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <div className="usuarios__acciones">
                    <button
                      className="boton boton--chico"
                      onClick={() => setModal({ abierto: true, usuario: u })}
                    >
                      Editar
                    </button>
                    <button className="boton boton--chico" onClick={() => alternarActivo(u)}>
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!cargando && usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="usuarios__vacio">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="usuarios__backup">
        <h2>Copia de seguridad</h2>
        <p className="usuarios__backup-ayuda">
          Además del backup diario automático, se puede elegir una carpeta extra (por ejemplo, una
          sincronizada con Google Drive o Dropbox, o un pendrive) para guardar ahí una copia también.
        </p>
        <div className="usuarios__backup-carpeta">
          <span>
            {carpetaBackup === undefined
              ? 'Cargando...'
              : carpetaBackup === null
                ? 'No hay ninguna carpeta configurada.'
                : carpetaBackup}
          </span>
          <div className="usuarios__backup-botones">
            <button className="boton boton--chico" onClick={elegirCarpetaBackup}>
              {carpetaBackup ? 'Cambiar carpeta' : 'Elegir carpeta'}
            </button>
            {carpetaBackup && (
              <button className="boton boton--chico" onClick={quitarCarpetaBackup}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </section>

      {modal.abierto && (
        <ModalUsuario
          usuario={modal.usuario}
          onGuardar={guardarUsuario}
          onCancelar={() => setModal({ abierto: false })}
        />
      )}
    </div>
  )
}
