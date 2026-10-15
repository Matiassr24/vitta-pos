import { useEffect, useState } from 'react'
import type { Promocion, PromocionInput } from '../../shared/types'
import { formatearCantidadVenta, formatearPesos } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { ModalPromocion } from '../components/ModalPromocion'
import './Promociones.css'

type EstadoModal = { abierto: false } | { abierto: true; promocion: Promocion | null }

export function PromocionesPage() {
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<EstadoModal>({ abierto: false })

  async function recargar(): Promise<void> {
    setCargando(true)
    try {
      setPromociones(await window.api.promociones.listar(false))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  async function guardarPromocion(datos: PromocionInput): Promise<void> {
    setError(null)
    try {
      if (modal.abierto && modal.promocion) {
        await window.api.promociones.actualizar(modal.promocion.id, datos)
      } else {
        await window.api.promociones.crear(datos)
      }
      setModal({ abierto: false })
      await recargar()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la promoción.'))
    }
  }

  async function alternarActivo(promocion: Promocion): Promise<void> {
    setError(null)
    try {
      await window.api.promociones.cambiarActivo(promocion.id, promocion.activo === 0)
      await recargar()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado de la promoción.'))
    }
  }

  return (
    <div className="promociones">
      <header className="promociones__barra">
        <h1>Promociones</h1>
        <button
          className="boton boton--primario"
          onClick={() => setModal({ abierto: true, promocion: null })}
        >
          + Nueva promoción
        </button>
      </header>

      {error && <div className="promociones__error">{error}</div>}

      <div className="promociones__lista">
        {promociones.map((p) => {
          const sumaSuelta = p.items.reduce((acc, it) => acc + it.precio_venta * it.cantidad, 0)
          const ahorro = sumaSuelta - p.precio_promocional
          return (
            <div
              key={p.id}
              className={`promociones__tarjeta ${p.activo === 0 ? 'promociones__tarjeta--inactiva' : ''}`}
            >
              <div className="promociones__tarjeta-cabecera">
                <h2>{p.nombre}</h2>
                <span className="promociones__precio">{formatearPesos(p.precio_promocional)}</span>
              </div>

              <p className="promociones__items">
                {p.items
                  .map(
                    (it) =>
                      `${it.producto_nombre} x${formatearCantidadVenta(it.cantidad, it.producto_unidad)}`
                  )
                  .join(' + ')}
              </p>

              {ahorro !== 0 && (
                <p className={ahorro > 0 ? 'promociones__ahorro' : 'promociones__ahorro-negativo'}>
                  {ahorro > 0
                    ? `Ahorra ${formatearPesos(ahorro)} contra comprarlo suelto`
                    : `Sale ${formatearPesos(-ahorro)} más caro que suelto`}
                </p>
              )}

              <div className="promociones__acciones">
                <button
                  className="boton boton--chico"
                  onClick={() => setModal({ abierto: true, promocion: p })}
                >
                  Editar
                </button>
                <button className="boton boton--chico" onClick={() => alternarActivo(p)}>
                  {p.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          )
        })}

        {!cargando && promociones.length === 0 && (
          <p className="promociones__vacio">
            Todavía no hay promociones cargadas. Una promo combina productos que ya existen a un
            precio de conjunto (Fernet + Coca), o es un solo producto por cantidad (2 cervezas a
            $7.000, 2kg de milanesa a otro precio).
          </p>
        )}
      </div>

      {modal.abierto && (
        <ModalPromocion
          promocion={modal.promocion}
          onGuardar={guardarPromocion}
          onCancelar={() => setModal({ abierto: false })}
        />
      )}
    </div>
  )
}
