import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Cliente, ClienteInput } from '../../shared/types'
import { seleccionarTodoAlEnfocar } from '../lib/inputs'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalCliente.css'

interface Props {
  cliente: Cliente | null
  onGuardar: (datos: ClienteInput) => Promise<void>
  onCancelar: () => void
}

interface FormState {
  nombre: string
  telefono: string
  direccion: string
  limite_credito: string
  notas: string
}

function estadoInicial(cliente: Cliente | null): FormState {
  if (cliente) {
    return {
      nombre: cliente.nombre,
      telefono: cliente.telefono ?? '',
      direccion: cliente.direccion ?? '',
      limite_credito: String(cliente.limite_credito),
      notas: cliente.notas ?? ''
    }
  }
  return { nombre: '', telefono: '', direccion: '', limite_credito: '0', notas: '' }
}

export function ModalCliente({ cliente, onGuardar, onCancelar }: Props) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(cliente))
  const [guardando, setGuardando] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)

  function actualizarCampo<K extends keyof FormState>(campo: K, valor: FormState[K]): void {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function manejarSubmit(evento: FormEvent): Promise<void> {
    evento.preventDefault()
    if (!form.nombre.trim()) {
      nombreRef.current?.focus()
      return
    }

    setGuardando(true)
    try {
      await onGuardar({
        nombre: form.nombre,
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        limite_credito: Number(form.limite_credito) || 0,
        notas: form.notas.trim() || null
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal">
        <h2>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>

        <form onSubmit={manejarSubmit} className="modal__formulario modal-cliente__formulario">
          <label className="campo campo--ancho">
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
            Teléfono
            <input
              type="text"
              value={form.telefono}
              onChange={(e) => actualizarCampo('telefono', e.target.value)}
              placeholder="Opcional"
            />
          </label>

          <label className="campo">
            Dirección
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => actualizarCampo('direccion', e.target.value)}
              placeholder="Opcional"
            />
          </label>

          <label className="campo">
            Límite de crédito
            <InputMonto
              type="number"
              min="0"
              value={form.limite_credito}
              onChange={(e) => actualizarCampo('limite_credito', e.target.value)}
              onFocus={seleccionarTodoAlEnfocar}
            />
            <small className="campo__ayuda">0 = sin límite configurado, no avisa nunca</small>
          </label>

          <label className="campo campo--ancho">
            Notas
            <input
              type="text"
              value={form.notas}
              onChange={(e) => actualizarCampo('notas', e.target.value)}
              placeholder="Opcional"
            />
          </label>

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
