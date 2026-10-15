import { useCallback, useEffect, useState } from 'react'
import type { CajaSesion, MovimientoCaja, ResumenCaja, TipoMovimientoManual } from '../../shared/types'
import { claseGanancia, formatearHora, formatearPesos } from '../lib/formato'
import { seleccionarTodoAlEnfocar } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalCierreCaja } from '../components/ModalCierreCaja'
import { InputMonto } from '../components/InputMonto'
import './Caja.css'

interface Props {
  esAdmin: boolean
}

export function CajaPage({ esAdmin }: Props) {
  const [caja, setCaja] = useState<CajaSesion | null | undefined>(undefined)
  const [montoApertura, setMontoApertura] = useState('0')
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])

  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoManual>('GASTO')
  const [montoMovimiento, setMontoMovimiento] = useState('')
  const [descripcionMovimiento, setDescripcionMovimiento] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [cierreAbierto, setCierreAbierto] = useState(false)
  const [ultimoCierre, setUltimoCierre] = useState<CajaSesion | null>(null)

  const cargarTodo = useCallback(async (cajaSesionId: number) => {
    const [resumenNuevo, movimientosNuevos] = await Promise.all([
      window.api.caja.obtenerResumen(cajaSesionId),
      window.api.caja.listarMovimientos(cajaSesionId)
    ])
    setResumen(resumenNuevo)
    setMovimientos(movimientosNuevos)
  }, [])

  useEffect(() => {
    window.api.caja.obtenerAbierta().then((abierta) => setCaja(abierta ?? null))
  }, [])

  useEffect(() => {
    if (caja) cargarTodo(caja.id)
  }, [caja, cargarTodo])

  async function abrirCaja(): Promise<void> {
    const monto = Number(montoApertura) || 0
    const nueva = await window.api.caja.abrir(monto)
    setUltimoCierre(null)
    setCaja(nueva)
  }

  async function registrarMovimiento(): Promise<void> {
    setError(null)
    const monto = Number(montoMovimiento)
    if (!(monto > 0)) {
      setError('Ingresá un monto mayor a cero.')
      return
    }
    try {
      await window.api.caja.registrarMovimiento({
        tipo: tipoMovimiento,
        monto,
        descripcion: descripcionMovimiento.trim() || null
      })
      setMontoMovimiento('')
      setDescripcionMovimiento('')
      if (caja) cargarTodo(caja.id)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el movimiento.'))
    }
  }

  async function confirmarCierre(montoDeclarado: number, notas: string | null): Promise<void> {
    if (!caja) return
    const cerrada = await window.api.caja.cerrar(caja.id, montoDeclarado, notas)
    setCierreAbierto(false)
    setUltimoCierre(cerrada)
    setCaja(null)
    setResumen(null)
    setMovimientos([])
  }

  if (caja === undefined) {
    return <div className="caja caja--cargando">Cargando...</div>
  }

  if (caja === null) {
    return (
      <div className="caja caja--apertura">
        <div className="apertura-caja">
          <h2>Abrir caja</h2>
          <p>Ingresá el monto con el que arranca el cajón hoy.</p>
          <label className="campo">
            Monto inicial
            <InputMonto
              type="number"
              min="0"
              value={montoApertura}
              onChange={(e) => setMontoApertura(e.target.value)}
              onFocus={seleccionarTodoAlEnfocar}
              autoFocus
            />
          </label>
          <button className="boton boton--primario" onClick={abrirCaja}>
            Abrir caja
          </button>

          {ultimoCierre && (
            <div className="caja__resumen-cierre">
              <h3>Última caja cerrada</h3>
              <p>Esperado: {formatearPesos(ultimoCierre.monto_esperado ?? 0)}</p>
              <p>Contado: {formatearPesos(ultimoCierre.monto_declarado ?? 0)}</p>
              <p className={ultimoCierre.diferencia === 0 ? '' : 'caja__diferencia'}>
                Diferencia: {formatearPesos(ultimoCierre.diferencia ?? 0)}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!resumen) {
    return <div className="caja caja--cargando">Cargando...</div>
  }

  return (
    <div className="caja">
      <div className="caja__resumen">
        <h2>Resumen del día</h2>

        <div className="caja__tarjetas">
          {/* Efectivo esperado va con el verde de la app: es EL número
              del día, contra el que se cuenta el cajón al cerrar. */}
          <div className="tarjeta tarjeta--acento">
            <span className="tarjeta__etiqueta">Efectivo esperado</span>
            <span className="tarjeta__valor">{formatearPesos(resumen.efectivo_esperado)}</span>
          </div>
          <div className="tarjeta">
            <span className="tarjeta__etiqueta">Facturación total</span>
            <span className="tarjeta__valor">{formatearPesos(resumen.facturacion_total)}</span>
          </div>
          {esAdmin && (
            <div className={`tarjeta ${claseGanancia(resumen.ganancia_bruta)}`}>
              <span className="tarjeta__etiqueta">Ganancia bruta</span>
              <span className="tarjeta__valor">{formatearPesos(resumen.ganancia_bruta)}</span>
            </div>
          )}
          {esAdmin && (
            <div className={`tarjeta ${claseGanancia(resumen.ganancia_neta)}`}>
              <span className="tarjeta__etiqueta">Ganancia neta</span>
              <span className="tarjeta__valor">{formatearPesos(resumen.ganancia_neta)}</span>
            </div>
          )}
          {/* Ámbar, no rojo: la plata salió del cajón pero no se perdió,
              se convirtió en mercadería. El color acompaña a la aclaración
              de abajo, que ya existía porque se confundía con un gasto.
              En cero se queda neutra: no hay nada que aclarar. */}
          <div
            className={`tarjeta ${resumen.compras_hoy > 0 ? 'tarjeta--aviso' : ''}`}
            title="Reponer stock no es un gasto: la plata pasa del cajón al estante, no se resta de la ganancia."
          >
            <span className="tarjeta__etiqueta">Compras de hoy (reposición)</span>
            <span className="tarjeta__valor">{formatearPesos(resumen.compras_hoy)}</span>
            <span className="tarjeta__ayuda">Mercadería para reponer stock (no gastos)</span>
          </div>
        </div>

        <h3>Ventas por medio de pago</h3>
        <ul className="caja__lista-simple">
          {resumen.ventas_por_medio.map((v) => (
            <li key={v.medio_pago_id}>
              <span>{v.nombre}</span>
              <span>{formatearPesos(v.total)}</span>
            </li>
          ))}
          {resumen.ventas_por_medio.length === 0 && (
            <li className="caja__vacio">Todavía no hay ventas.</li>
          )}
        </ul>

        <div className="caja__detalle-extra">
          <span>Gastos: {formatearPesos(resumen.gastos)}</span>
          <span>Retiros: {formatearPesos(resumen.retiros)}</span>
          <span>Aportes: {formatearPesos(resumen.aportes)}</span>
        </div>

        <button className="boton boton--primario" onClick={() => setCierreAbierto(true)}>
          Cerrar caja
        </button>
      </div>

      <div className="caja__movimientos">
        <h2>Movimientos manuales</h2>

        <div className="caja__form-movimiento">
          <select
            value={tipoMovimiento}
            onChange={(e) => setTipoMovimiento(e.target.value as TipoMovimientoManual)}
          >
            <option value="GASTO">Gasto</option>
            <option value="RETIRO">Retiro</option>
            <option value="APORTE">Aporte</option>
          </select>
          <InputMonto
            type="number"
            min="0"
            placeholder="Monto"
            value={montoMovimiento}
            onChange={(e) => setMontoMovimiento(e.target.value)}
            onFocus={seleccionarTodoAlEnfocar}
          />
          <input
            type="text"
            placeholder="Descripción (opcional)"
            value={descripcionMovimiento}
            onChange={(e) => setDescripcionMovimiento(e.target.value)}
          />
          <button className="boton boton--primario" onClick={registrarMovimiento}>
            Registrar
          </button>
        </div>

        {error && <div className="caja__error">{error}</div>}

        <ul className="caja__lista-movimientos">
          {movimientos.map((m) => (
            <li key={`${m.es_fiado ? 'fiado' : 'caja'}-${m.id}`} className={m.es_fiado ? 'caja__mov--fiado' : ''}>
              <span
                className={
                  m.es_fiado
                    ? 'caja__mov-fiado-monto'
                    : m.tipo === 'INGRESO'
                      ? 'caja__mov-ingreso'
                      : 'caja__mov-egreso'
                }
              >
                {m.es_fiado ? '' : m.tipo === 'INGRESO' ? '+' : '−'} {formatearPesos(m.monto)}
              </span>
              <span className="caja__mov-concepto">{m.es_fiado ? 'FIADO' : m.concepto}</span>
              <div className="caja__mov-detalle">
                <span className="caja__mov-titulo">
                  {m.numero_venta_caja != null && (
                    <span className="caja__mov-numero">Venta #{m.numero_venta_caja}</span>
                  )}
                  {m.medio_pago_nombre && !m.es_fiado && (
                    <span className="caja__mov-medio">{m.medio_pago_nombre}</span>
                  )}
                  {m.es_fiado === 1 && m.cliente_nombre && (
                    <span className="caja__mov-medio">a {m.cliente_nombre}</span>
                  )}
                  {m.descripcion && <span className="caja__mov-descripcion">{m.descripcion}</span>}
                </span>
                {m.detalle_venta && <span className="caja__mov-productos">{m.detalle_venta}</span>}
              </div>
              <span className="caja__mov-hora">{formatearHora(m.fecha)}</span>
            </li>
          ))}
          {movimientos.length === 0 && <li className="caja__vacio">Sin movimientos todavía.</li>}
        </ul>
      </div>

      {cierreAbierto && (
        <ModalCierreCaja
          montoEsperado={resumen.efectivo_esperado}
          onConfirmar={confirmarCierre}
          onCancelar={() => setCierreAbierto(false)}
        />
      )}
    </div>
  )
}
