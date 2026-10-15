import { useState } from 'react'
import { formatearPesos } from '../lib/formato'
import { seleccionarTodoAlEnfocar } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalCierreCaja.css'

interface Props {
  montoEsperado: number
  onConfirmar: (montoDeclarado: number, notas: string | null) => Promise<void>
  onCancelar: () => void
}

export function ModalCierreCaja({ montoEsperado, onConfirmar, onCancelar }: Props) {
  const [montoDeclarado, setMontoDeclarado] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const declarado = Number(montoDeclarado) || 0
  const diferencia = montoDeclarado ? declarado - montoEsperado : null

  async function confirmar(): Promise<void> {
    setError(null)
    if (!montoDeclarado) {
      setError('Contá el efectivo y cargá el monto.')
      return
    }
    setEnviando(true)
    try {
      await onConfirmar(declarado, notas.trim() || null)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cerrar la caja.'))
      setEnviando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-cierre">
        <h2>Cerrar caja</h2>

        <div className="modal-cierre__esperado">
          Efectivo esperado: <strong>{formatearPesos(montoEsperado)}</strong>
        </div>

        <label className="campo">
          Efectivo contado
          <InputMonto
            type="number"
            min="0"
            value={montoDeclarado}
            onChange={(e) => setMontoDeclarado(e.target.value)}
            onFocus={seleccionarTodoAlEnfocar}
            autoFocus
          />
        </label>

        {diferencia !== null && (
          <div
            className={`modal-cierre__diferencia ${
              diferencia === 0 ? 'modal-cierre__diferencia--ok' : 'modal-cierre__diferencia--mal'
            }`}
          >
            {diferencia === 0
              ? 'Cierra justo.'
              : diferencia > 0
                ? `Sobran ${formatearPesos(diferencia)}`
                : `Faltan ${formatearPesos(-diferencia)}`}
          </div>
        )}

        <label className="campo">
          Notas (opcional)
          <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>

        {error && <div className="modal-cierre__error">{error}</div>}

        <div className="modal__acciones">
          <button type="button" className="boton" onClick={onCancelar}>
            Cancelar (Esc)
          </button>
          <button type="button" className="boton boton--primario" disabled={enviando} onClick={confirmar}>
            {enviando ? 'Cerrando...' : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </ModalFondo>
  )
}
