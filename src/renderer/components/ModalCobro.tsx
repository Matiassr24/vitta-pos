import { useEffect, useState } from 'react'
import type { Cliente, MedioPago } from '../../shared/types'
import { formatearPesos } from '../lib/formato'
import { seleccionarTodoAlEnfocar } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalCobro.css'

interface Props {
  total: number
  clientes: Cliente[]
  onClienteCreado: (cliente: Cliente) => void
  onConfirmar: (pagos: { medio_pago_id: number; monto: number }[], clienteId: number | null) => Promise<void>
  onCancelar: () => void
}

interface FilaPago {
  medio_pago_id: number
  nombre: string
  afecta_caja_efectivo: number
  es_fiado: number
  monto: number
}

export function ModalCobro({ total, clientes, onClienteCreado, onConfirmar, onCancelar }: Props) {
  const [medios, setMedios] = useState<MedioPago[]>([])
  const [dividido, setDividido] = useState(false)
  const [pagos, setPagos] = useState<FilaPago[]>([])
  const [recibido, setRecibido] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false)
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.mediosPago.listar().then(setMedios)
  }, [])

  const sumaPagos = pagos.reduce((acc, p) => acc + p.monto, 0)
  // Positivo = sobra plata, negativo = falta.
  const diferencia = sumaPagos - total
  const indiceFilaEfectivo = pagos.findIndex((p) => p.afecta_caja_efectivo === 1)
  const hayFilaEfectivo = indiceFilaEfectivo !== -1
  const filaFiado = pagos.find((p) => p.es_fiado === 1)
  const hayFilaFiado = !!filaFiado

  const pagoUnicoEfectivo = !dividido && pagos.length === 1 && pagos[0].afecta_caja_efectivo === 1
  const montoRecibido = Number(recibido) || 0
  const vueltoPagoUnico = pagoUnicoEfectivo ? Math.max(0, montoRecibido - total) : 0
  // En el pago dividido el vuelto solo tiene sentido si sobra plata Y
  // hay una fila de efectivo de la que descontarlo (no se puede dar
  // vuelto por transferencia).
  const vueltoDividido = dividido && diferencia > 0 && hayFilaEfectivo ? diferencia : 0

  const clienteElegido = clienteId ? clientes.find((c) => c.id === Number(clienteId)) : undefined
  const superaLimite =
    hayFilaFiado &&
    clienteElegido &&
    clienteElegido.limite_credito > 0 &&
    clienteElegido.saldo + (filaFiado?.monto ?? 0) > clienteElegido.limite_credito

  function elegirPagoUnico(medio: MedioPago): void {
    setError(null)
    setRecibido('')
    setPagos([
      {
        medio_pago_id: medio.id,
        nombre: medio.nombre,
        afecta_caja_efectivo: medio.afecta_caja_efectivo,
        es_fiado: medio.es_fiado,
        monto: total
      }
    ])
    if (!medio.es_fiado) {
      setClienteId('')
    }
  }

  function activarDividido(): void {
    setError(null)
    setDividido(true)
    setPagos([])
    setRecibido('')
  }

  function volverASimple(): void {
    setError(null)
    setDividido(false)
    setPagos([])
    setRecibido('')
    setClienteId('')
  }

  function agregarFila(medio: MedioPago): void {
    setError(null)
    setPagos((actual) => [
      ...actual,
      {
        medio_pago_id: medio.id,
        nombre: medio.nombre,
        afecta_caja_efectivo: medio.afecta_caja_efectivo,
        es_fiado: medio.es_fiado,
        monto: Math.max(total - sumaPagos, 0)
      }
    ])
  }

  function actualizarMonto(indice: number, monto: number): void {
    setPagos((actual) => actual.map((p, i) => (i === indice ? { ...p, monto } : p)))
  }

  function quitarFila(indice: number): void {
    setPagos((actual) => {
      const fila = actual[indice]
      if (fila?.es_fiado) setClienteId('')
      return actual.filter((_, i) => i !== indice)
    })
  }

  async function confirmarNuevoCliente(): Promise<void> {
    if (!nuevoClienteNombre.trim()) return
    const nuevo = await window.api.clientes.crear({
      nombre: nuevoClienteNombre.trim(),
      telefono: null,
      direccion: null,
      limite_credito: 0,
      notas: null
    })
    onClienteCreado(nuevo)
    setClienteId(String(nuevo.id))
    setNuevoClienteNombre('')
    setMostrarNuevoCliente(false)
  }

  async function confirmar(): Promise<void> {
    setError(null)

    if (pagos.length === 0) {
      setError('Elegí un medio de pago.')
      return
    }
    if (hayFilaFiado && !clienteId) {
      setError('Elegí a quién le estás fiando.')
      return
    }
    if (dividido) {
      if (diferencia < 0) {
        setError('Los pagos no cubren el total.')
        return
      }
      if (diferencia > 0 && !hayFilaEfectivo) {
        setError('Sobra plata y no hay ningún pago en efectivo del que descontar el vuelto.')
        return
      }
      // El vuelto sale de lo recibido en efectivo: si otro medio (ej. una
      // transferencia) ya sobrepasa el total por su cuenta, no hay forma
      // de "dar vuelto" ahí, es un monto mal cargado.
      if (diferencia > 0 && hayFilaEfectivo && pagos[indiceFilaEfectivo].monto < vueltoDividido) {
        setError('El vuelto no puede ser mayor a lo recibido en efectivo. Revisá los otros montos.')
        return
      }
    } else if (pagoUnicoEfectivo && montoRecibido < total) {
      setError('El monto recibido es menor al total.')
      return
    }

    setEnviando(true)
    try {
      // Lo que se manda al backend es lo que efectivamente cuenta como
      // pago de la venta: si sobró plata en efectivo, esa fila se manda
      // con el monto ya neto de vuelto, no con lo que el cliente entregó.
      const pagosFinales = pagos.map((p, i) => ({
        medio_pago_id: p.medio_pago_id,
        monto: dividido && i === indiceFilaEfectivo ? p.monto - vueltoDividido : p.monto
      }))
      await onConfirmar(pagosFinales, clienteId ? Number(clienteId) : null)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar la venta.'))
      setEnviando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-cobro">
        <h2>Cobrar</h2>
        <div className="modal-cobro__total">{formatearPesos(total)}</div>

        {!dividido && (
          <>
            <div className="modal-cobro__accesos">
              {medios.map((m) => (
                <button
                  key={m.id}
                  className={`boton ${pagos[0]?.medio_pago_id === m.id ? 'boton--primario' : ''}`}
                  onClick={() => elegirPagoUnico(m)}
                >
                  {m.nombre}
                </button>
              ))}
              <button className="boton" onClick={activarDividido}>
                Dividir en varios medios
              </button>
            </div>

            {pagoUnicoEfectivo && (
              <>
                <label className="campo">
                  ¿Con cuánto paga?
                  <input
                    type="number"
                    min={total}
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    onFocus={seleccionarTodoAlEnfocar}
                    autoFocus
                  />
                </label>
                {montoRecibido >= total && (
                  <div className="modal-cobro__vuelto">Vuelto: {formatearPesos(vueltoPagoUnico)}</div>
                )}
              </>
            )}
          </>
        )}

        {dividido && (
          <>
            <ul className="modal-cobro__filas">
              {pagos.map((p, i) => (
                <li key={i}>
                  <span>{p.nombre}</span>
                  <InputMonto
                    type="number"
                    min="0"
                    value={p.monto}
                    onChange={(e) => actualizarMonto(i, Number(e.target.value))}
                    onFocus={seleccionarTodoAlEnfocar}
                  />
                  <button className="boton boton--chico" onClick={() => quitarFila(i)}>
                    Quitar
                  </button>
                </li>
              ))}
              {pagos.length === 0 && (
                <li className="modal-cobro__filas-vacio">Agregá los medios de pago de abajo.</li>
              )}
            </ul>

            <div className="modal-cobro__accesos">
              {medios.map((m) => (
                <button
                  key={m.id}
                  className="boton"
                  disabled={
                    (m.afecta_caja_efectivo === 1 && hayFilaEfectivo) || (m.es_fiado === 1 && hayFilaFiado)
                  }
                  title={
                    m.afecta_caja_efectivo === 1 && hayFilaEfectivo
                      ? 'El efectivo es un solo cajón: no tiene sentido dos filas'
                      : m.es_fiado === 1 && hayFilaFiado
                        ? 'El fiado va a un solo cliente por venta'
                        : undefined
                  }
                  onClick={() => agregarFila(m)}
                >
                  + {m.nombre}
                </button>
              ))}
            </div>

            <div className="modal-cobro__resumen">
              {diferencia === 0 && 'Cubre el total exacto.'}
              {diferencia < 0 && `Falta ${formatearPesos(-diferencia)}`}
              {diferencia > 0 && hayFilaEfectivo && `Vuelto: ${formatearPesos(vueltoDividido)}`}
              {diferencia > 0 && !hayFilaEfectivo && (
                <>Sobra {formatearPesos(diferencia)} — ajustá los montos o agregá Efectivo para dar vuelto</>
              )}
            </div>

            <button className="boton--link" onClick={volverASimple}>
              Volver a pago simple
            </button>
          </>
        )}

        {hayFilaFiado && (
          <div className="modal-cobro__cliente">
            {!mostrarNuevoCliente ? (
              <label className="campo">
                ¿A quién le fiás?
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} autoFocus>
                  <option value="">Elegí un cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.saldo > 0 ? ` (debe ${formatearPesos(c.saldo)})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="modal-cobro__nuevo-cliente">
                <input
                  type="text"
                  value={nuevoClienteNombre}
                  onChange={(e) => setNuevoClienteNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  autoFocus
                />
                <button className="boton boton--chico" onClick={confirmarNuevoCliente}>
                  Guardar
                </button>
              </div>
            )}
            {!mostrarNuevoCliente && (
              <button className="boton--link" onClick={() => setMostrarNuevoCliente(true)}>
                + nuevo cliente
              </button>
            )}
            {superaLimite && (
              <div className="modal-cobro__aviso-limite">
                {clienteElegido?.nombre} va a quedar debiendo{' '}
                {formatearPesos(clienteElegido!.saldo + (filaFiado?.monto ?? 0))}, por encima de su límite de{' '}
                {formatearPesos(clienteElegido!.limite_credito)}.
              </div>
            )}
          </div>
        )}

        {error && <div className="modal-cobro__error">{error}</div>}

        <div className="modal__acciones">
          <button type="button" className="boton" onClick={onCancelar}>
            Cancelar (Esc)
          </button>
          <button
            type="button"
            className="boton boton--primario"
            disabled={enviando || pagos.length === 0}
            onClick={confirmar}
          >
            {enviando ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </ModalFondo>
  )
}
