import { useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import './Modal.css'

interface Props {
  onCancelar: () => void
  children: ReactNode
}

// Fondo compartido por todos los modales: cierra con Escape o con un
// clic afuera. Ojo con el bug típico de "clic afuera cierra": si solo
// se mira dónde terminó el clic, seleccionar texto adentro del modal y
// soltar el mouse fuera de sus bordes (algo que pasa fácil) cerraría
// el modal sin querer. Por eso se pide que el mousedown Y el mouseup
// hayan sido los dos, por separado, sobre el fondo mismo — no sobre
// el contenido del modal.
export function ModalFondo({ onCancelar, children }: Props) {
  const [mouseDownEnFondo, setMouseDownEnFondo] = useState(false)

  function manejarMouseDown(evento: MouseEvent<HTMLDivElement>): void {
    setMouseDownEnFondo(evento.target === evento.currentTarget)
  }

  function manejarMouseUp(evento: MouseEvent<HTMLDivElement>): void {
    if (mouseDownEnFondo && evento.target === evento.currentTarget) {
      onCancelar()
    }
    setMouseDownEnFondo(false)
  }

  function manejarTecla(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === 'Escape') {
      evento.stopPropagation()
      onCancelar()
    }
  }

  return (
    <div
      className="modal-fondo"
      onMouseDown={manejarMouseDown}
      onMouseUp={manejarMouseUp}
      onKeyDown={manejarTecla}
    >
      {children}
    </div>
  )
}
