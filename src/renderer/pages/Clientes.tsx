import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { Cliente, ClienteInput, MovimientoCuentaCorriente } from '../../shared/types'
import { formatearFechaHora, formatearPesos } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { ModalCliente } from '../components/ModalCliente'
import { ModalCobroFiado } from '../components/ModalCobroFiado'
import './Clientes.css'

type EstadoModal = { abierto: false } | { abierto: true; cliente: Cliente | null }

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<EstadoModal>({ abierto: false })
  const [cobrando, setCobrando] = useState<Cliente | null>(null)
  const [cajaAbierta, setCajaAbierta] = useState(false)

  const [expandido, setExpandido] = useState<number | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCuentaCorriente[]>([])

  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  const recargarClientes = useCallback(async (texto: string) => {
    setCargando(true)
    try {
      const lista = texto.trim() ? await window.api.clientes.buscar(texto) : await window.api.clientes.listar()
      setClientes(lista)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    window.api.caja.obtenerAbierta().then((c) => setCajaAbierta(!!c))
  }, [])

  useEffect(() => {
    const manija = setTimeout(() => {
      recargarClientes(busqueda)
    }, 200)
    return () => clearTimeout(manija)
  }, [busqueda, recargarClientes])

  async function guardarCliente(datos: ClienteInput): Promise<void> {
    setError(null)
    try {
      if (modal.abierto && modal.cliente) {
        await window.api.clientes.actualizar(modal.cliente.id, datos)
      } else {
        await window.api.clientes.crear(datos)
      }
      setModal({ abierto: false })
      await recargarClientes(busqueda)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el cliente.'))
    }
  }

  async function confirmarCobro(monto: number, pagadaEnEfectivo: boolean): Promise<void> {
    if (!cobrando) return
    await window.api.clientes.registrarPago({
      cliente_id: cobrando.id,
      monto,
      pagadaEnEfectivo,
      notas: null
    })
    setCobrando(null)
    await recargarClientes(busqueda)
  }

  async function alternarMovimientos(cliente: Cliente): Promise<void> {
    if (expandido === cliente.id) {
      setExpandido(null)
      return
    }
    setExpandido(cliente.id)
    setMovimientos(await window.api.clientes.listarMovimientos(cliente.id))
  }

  return (
    <div className="clientes">
      <header className="clientes__barra">
        <h1>Clientes</h1>
        <input
          ref={inputBusquedaRef}
          className="clientes__buscador"
          type="text"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoFocus
        />
        <button
          className="boton boton--primario"
          onClick={() => setModal({ abierto: true, cliente: null })}
        >
          + Nuevo cliente
        </button>
      </header>

      {error && <div className="clientes__error">{error}</div>}

      <div className="clientes__tabla-contenedor">
        <table className="clientes__tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Debe</th>
              <th>Límite</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const debe = c.saldo > 0
              const superaLimite = c.limite_credito > 0 && c.saldo > c.limite_credito
              return (
                <Fragment key={c.id}>
                  <tr onClick={() => setModal({ abierto: true, cliente: c })}>
                    <td>{c.nombre}</td>
                    <td>{c.telefono || '—'}</td>
                    <td className={superaLimite ? 'celda-alerta' : debe ? 'celda-debe' : ''}>
                      {formatearPesos(c.saldo)}
                    </td>
                    <td className={superaLimite ? 'celda-alerta' : ''}>
                      {c.limite_credito === 0
                        ? 'Sin límite'
                        : superaLimite
                          ? `Superado por ${formatearPesos(c.saldo - c.limite_credito)}`
                          : `Quedan ${formatearPesos(c.limite_credito - c.saldo)}`}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="clientes__acciones">
                        <button
                          className="boton boton--chico"
                          onClick={() => alternarMovimientos(c)}
                        >
                          {expandido === c.id ? 'Ocultar' : 'Movimientos'}
                        </button>
                        {debe && (
                          <button className="boton boton--chico" onClick={() => setCobrando(c)}>
                            Cobrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandido === c.id && (
                    <tr className="clientes__fila-movimientos">
                      <td colSpan={5}>
                        {movimientos.length === 0 ? (
                          <span className="clientes__vacio">Todavía no hay movimientos.</span>
                        ) : (
                          <ul className="clientes__movimientos">
                            {movimientos.map((m) => (
                              <li key={m.id}>
                                <span className={m.tipo === 'CARGO' ? 'clientes__mov-cargo' : 'clientes__mov-pago'}>
                                  {m.tipo === 'CARGO' ? '+' : '−'} {formatearPesos(m.monto)}
                                </span>
                                <span className="clientes__mov-tipo">{m.tipo}</span>
                                <span className="clientes__mov-fecha">{formatearFechaHora(m.fecha)}</span>
                                {m.detalle_venta && (
                                  <span className="clientes__mov-detalle">{m.detalle_venta}</span>
                                )}
                                {m.notas && <span className="clientes__mov-notas">{m.notas}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {!cargando && clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="clientes__vacio">
                  No hay clientes para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.abierto && (
        <ModalCliente
          cliente={modal.cliente}
          onGuardar={guardarCliente}
          onCancelar={() => setModal({ abierto: false })}
        />
      )}

      {cobrando && (
        <ModalCobroFiado
          cliente={cobrando}
          cajaAbierta={cajaAbierta}
          onConfirmar={confirmarCobro}
          onCancelar={() => setCobrando(null)}
        />
      )}
    </div>
  )
}
