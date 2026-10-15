import { useState } from 'react'
import type { Cliente } from '../../shared/types'
import { formatearPesos } from '../lib/formato'
import { seleccionarTodoAlEnfocar } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalCobroFiado.css'

interface Props {
  cliente: Cliente
  cajaAbierta: boolean
  onConfirmar: (monto: number, pagadaEnEfectivo: boolean) => Promise<void>
  onCancelar: () => void
}

export function ModalCobroFiado({ cliente, cajaAbierta, onConfirmar, onCancelar }: Props) {
  const [monto, setMonto] = useState(String(cliente.saldo))
  const [pagadaEnEfectivo, setPagadaEnEfectivo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar(): Promise<void> {
    setError(null)
    const montoNumero = Number(monto)
    if (!(montoNumero > 0)) {
      setError('Ingresá un monto mayor a cero.')
      return
    }
    setEnviando(true)
    try {
      await onConfirmar(montoNumero, pagadaEnEfectivo)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el pago.'))
      setEnviando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-cobro-fiado">
        <h2>Cobrar a {cliente.nombre}</h2>
        <div className="modal-cobro-fiado__saldo">
          Debe: <strong>{formatearPesos(cliente.saldo)}</strong>
        </div>

        <label className="campo">
          Monto que paga
          <InputMonto
            type="number"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onFocus={seleccionarTodoAlEnfocar}
            autoFocus
          />
        </label>

        <label className="campo campo--check">
          <input
            type="checkbox"
            checked={pagadaEnEfectivo}
            disabled={!cajaAbierta}
            onChange={(e) => setPagadaEnEfectivo(e.target.checked)}
          />
          Entra al cajón (efectivo)
          {!cajaAbierta && <small className="campo__ayuda"> (no hay caja abierta)</small>}
        </label>

        {error && <div className="modal-cobro-fiado__error">{error}</div>}

        <div className="modal__acciones">
          <button type="button" className="boton" onClick={onCancelar}>
            Cancelar (Esc)
          </button>
          <button type="button" className="boton boton--primario" disabled={enviando} onClick={confirmar}>
            {enviando ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </ModalFondo>
  )
}
