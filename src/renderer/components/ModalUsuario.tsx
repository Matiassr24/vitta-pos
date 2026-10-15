import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { RolUsuario, Usuario, UsuarioInput } from '../../shared/types'
import { ModalFondo } from './ModalFondo'
import './Modal.css'
import './ModalUsuario.css'

interface Props {
  usuario: Usuario | null
  onGuardar: (datos: UsuarioInput) => Promise<void>
  onCancelar: () => void
}

interface FormState {
  nombre: string
  rol: RolUsuario
  pin: string
  confirmarPin: string
}

function estadoInicial(usuario: Usuario | null): FormState {
  return {
    nombre: usuario?.nombre ?? '',
    rol: usuario?.rol ?? 'VENDEDOR',
    pin: '',
    confirmarPin: ''
  }
}

export function ModalUsuario({ usuario, onGuardar, onCancelar }: Props) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(usuario))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombreRef = useRef<HTMLInputElement>(null)

  function actualizarCampo<K extends keyof FormState>(campo: K, valor: FormState[K]): void {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function manejarSubmit(evento: FormEvent): Promise<void> {
    evento.preventDefault()
    setError(null)

    if (!form.nombre.trim()) {
      nombreRef.current?.focus()
      return
    }
    if (!usuario && !form.pin.trim()) {
      setError('El PIN es obligatorio para un usuario nuevo.')
      return
    }
    if (form.pin && form.pin !== form.confirmarPin) {
      setError('Los dos PIN no coinciden.')
      return
    }

    setGuardando(true)
    try {
      await onGuardar({
        nombre: form.nombre,
        rol: form.rol,
        pin: form.pin.trim() || null
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal">
        <h2>{usuario ? 'Editar usuario' : 'Nuevo usuario'}</h2>

        <form onSubmit={manejarSubmit} className="modal__formulario">
          <label className="campo">
            Nombre *
            <input
              ref={nombreRef}
              type="text"
              value={form.nombre}
              onChange={(e) => actualizarCampo('nombre', e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="campo">
            Rol
            <select value={form.rol} onChange={(e) => actualizarCampo('rol', e.target.value as RolUsuario)}>
              <option value="VENDEDOR">Cajera/o (no ve reportes ni ganancias)</option>
              <option value="ADMIN">Administrador (acceso total)</option>
            </select>
          </label>

          <label className="campo">
            {usuario ? 'Nuevo PIN' : 'PIN *'}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={form.pin}
              onChange={(e) => actualizarCampo('pin', e.target.value)}
              placeholder={usuario ? 'Dejar vacío para no cambiarlo' : 'Mínimo 4 dígitos'}
              maxLength={12}
            />
          </label>

          <label className="campo">
            Confirmar PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={form.confirmarPin}
              onChange={(e) => actualizarCampo('confirmarPin', e.target.value)}
              maxLength={12}
            />
          </label>

          {error && <div className="modal-usuario__error">{error}</div>}

          <div className="modal__acciones">
            <button type="button" className="boton" onClick={onCancelar}>
              Cancelar (Esc)
            </button>
            <button type="submit" className="boton boton--primario" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </ModalFondo>
  )
}
