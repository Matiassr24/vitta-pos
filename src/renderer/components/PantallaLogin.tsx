import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ShieldCheck, User } from 'lucide-react'
import type { Usuario } from '../../shared/types'
import { mensajeDeError } from '../lib/errores'
import { etiquetaRol } from '../lib/roles'
import './PantallaLogin.css'

interface Props {
  onIngreso: (usuario: Usuario) => void
}

export function PantallaLogin({ onIngreso }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [elegido, setElegido] = useState<Usuario | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ingresando, setIngresando] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.usuarios.listar().then(setUsuarios)
  }, [])

  useEffect(() => {
    if (elegido) pinRef.current?.focus()
  }, [elegido])

  async function elegirUsuario(usuario: Usuario): Promise<void> {
    setError(null)
    if (!usuario.tiene_pin) {
      await intentarIngreso(usuario, null)
      return
    }
    setElegido(usuario)
    setPin('')
  }

  async function intentarIngreso(usuario: Usuario, pinIngresado: string | null): Promise<void> {
    setIngresando(true)
    setError(null)
    try {
      const logueado = await window.api.usuarios.iniciarSesion(usuario.id, pinIngresado)
      onIngreso(logueado)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo iniciar sesión.'))
      setPin('')
      pinRef.current?.focus()
    } finally {
      setIngresando(false)
    }
  }

  function manejarSubmitPin(evento: FormEvent): void {
    evento.preventDefault()
    if (elegido) intentarIngreso(elegido, pin)
  }

  return (
    <div className="login">
      <div className="login__tarjeta">
        <h1 className="login__titulo">Vitta</h1>

        {!elegido && (
          <>
            <p className="login__subtitulo">¿Quién está atendiendo?</p>
            <div className="login__usuarios">
              {usuarios === null && <span className="login__cargando">Cargando...</span>}
              {usuarios?.map((u) => (
                <button key={u.id} className="login__usuario" onClick={() => elegirUsuario(u)}>
                  <span className="login__usuario-icono">
                    {u.rol === 'ADMIN' ? <ShieldCheck size={18} /> : <User size={18} />}
                  </span>
                  <span className="login__usuario-nombre">{u.nombre}</span>
                  <span className="login__usuario-rol">{etiquetaRol(u.rol)}</span>
                </button>
              ))}
              {usuarios?.length === 0 && (
                <span className="login__cargando">No hay usuarios activos.</span>
              )}
            </div>
          </>
        )}

        {elegido && (
          <form className="login__form-pin" onSubmit={manejarSubmitPin}>
            <p className="login__subtitulo">
              PIN de {elegido.nombre}
            </p>
            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={12}
            />
            <div className="login__form-pin-botones">
              <button type="button" className="boton" onClick={() => setElegido(null)}>
                Volver
              </button>
              <button type="submit" className="boton boton--primario" disabled={ingresando}>
                {ingresando ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        )}

        {error && <div className="login__error">{error}</div>}
      </div>
    </div>
  )
}
