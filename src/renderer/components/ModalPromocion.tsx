import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Producto, Promocion, PromocionInput } from '../../shared/types'
import { formatearPesos } from '../lib/formato'
import { aNumero, aTexto, seleccionarTodoAlEnfocar } from '../lib/inputs'
import {
  CANTIDAD_INICIAL_PESABLE,
  aCantidadChica,
  aCantidadGuardada,
  esPesable,
  unidadChica
} from '../lib/unidades'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalPromocion.css'

interface Props {
  promocion: Promocion | null
  onGuardar: (datos: PromocionInput) => Promise<void>
  onCancelar: () => void
}

interface LineaPromo {
  producto_id: number
  nombre: string
  unidad: Producto['unidad']
  precio_venta: number
  cantidad: number
  cantidadTexto: string
}

export function ModalPromocion({ promocion, onGuardar, onCancelar }: Props) {
  const [nombre, setNombre] = useState(promocion?.nombre ?? '')
  const [precioPromocional, setPrecioPromocional] = useState(
    promocion ? String(promocion.precio_promocional) : ''
  )
  const [items, setItems] = useState<LineaPromo[]>(
    (promocion?.items ?? []).map((it) => ({
      producto_id: it.producto_id,
      nombre: it.producto_nombre,
      unidad: it.producto_unidad,
      precio_venta: it.precio_venta,
      cantidad: it.cantidad,
      // Igual que en Venta: la cantidad de un pesable se teclea en
      // gramos/ml (200), aunque se guarde en kilos/litros (0,2).
      cantidadTexto: aTexto(aCantidadChica(it.cantidad, it.producto_unidad))
    }))
  )
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nombreRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([])
      return
    }
    const manija = setTimeout(async () => {
      setResultados(await window.api.productos.buscar(busqueda))
    }, 200)
    return () => clearTimeout(manija)
  }, [busqueda])

  function agregarItem(producto: Producto): void {
    setItems((actual) => {
      if (actual.some((l) => l.producto_id === producto.id)) return actual
      const cantidad = esPesable(producto.unidad) ? CANTIDAD_INICIAL_PESABLE : 1
      return [
        ...actual,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          unidad: producto.unidad,
          precio_venta: producto.precio_venta,
          cantidad,
          cantidadTexto: aTexto(aCantidadChica(cantidad, producto.unidad))
        }
      ]
    })
    setBusqueda('')
    setResultados([])
    inputBusquedaRef.current?.focus()
  }

  function quitarItem(productoId: number): void {
    setItems((actual) => actual.filter((l) => l.producto_id !== productoId))
  }

  function cambiarCantidadTexto(productoId: number, texto: string): void {
    const tecleado = aNumero(texto)
    setItems((actual) =>
      actual.map((l) => {
        if (l.producto_id !== productoId) return l
        if (texto.trim() !== '' && tecleado > 0) {
          return { ...l, cantidadTexto: texto, cantidad: aCantidadGuardada(tecleado, l.unidad) }
        }
        return { ...l, cantidadTexto: texto }
      })
    )
  }

  function confirmarCantidadTexto(productoId: number): void {
    setItems((actual) =>
      actual.map((l) =>
        l.producto_id === productoId
          ? { ...l, cantidadTexto: aTexto(aCantidadChica(l.cantidad, l.unidad)) }
          : l
      )
    )
  }

  const sumaSuelta = items.reduce((acc, l) => acc + l.precio_venta * l.cantidad, 0)
  const precioNumero = Number(precioPromocional) || 0
  const ahorro = sumaSuelta - precioNumero

  async function manejarSubmit(evento: FormEvent): Promise<void> {
    evento.preventDefault()
    setError(null)

    if (!nombre.trim()) {
      nombreRef.current?.focus()
      return
    }
    if (items.length === 0) {
      setError('Agregá al menos un producto.')
      return
    }
    // Mismo criterio que el backend: un solo producto solo vale como
    // promo si es por más de una unidad ("2 cervezas a $7.000"). Uno
    // solo llevando 1 no es una promo, es el precio de lista.
    if (items.length === 1 && items[0].cantidad <= 1) {
      setError(
        'Con un solo producto, la promo tiene que ser por más de una unidad (ej: 2 cervezas a $7.000). Para un producto suelto, cambiá el precio en Productos.'
      )
      return
    }

    setGuardando(true)
    try {
      await onGuardar({
        nombre,
        precio_promocional: Math.round(precioNumero),
        items: items.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }))
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-promocion">
        <h2>{promocion ? 'Editar promoción' : 'Nueva promoción'}</h2>

        <form onSubmit={manejarSubmit} className="modal__formulario">
          <div className="modal-promocion__cabecera">
            <label className="campo">
              Nombre *
              <input
                ref={nombreRef}
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Fernet + Coca"
                required
              />
            </label>

            <label className="campo">
              Precio de la promo
              <InputMonto
                type="number"
                min="0"
                value={precioPromocional}
                onChange={(e) => setPrecioPromocional(e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
              />
            </label>
          </div>

          <h3 className="modal-promocion__seccion-titulo">Productos que combina</h3>

          <div className="modal-promocion__buscador-contenedor">
            <input
              ref={inputBusquedaRef}
              type="text"
              className="modal-promocion__buscador"
              placeholder="Buscar producto para agregar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {resultados.length > 0 && (
              <ul className="modal-promocion__resultados">
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => agregarItem(p)}>
                      <span>{p.nombre}</span>
                      <span>{formatearPesos(p.precio_venta)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-promocion__tabla-contenedor">
            <table className="modal-promocion__tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio suelto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.producto_id}>
                    <td>{l.nombre}</td>
                    <td>
                      <input
                        className="modal-promocion__input-cantidad"
                        type="text"
                        inputMode="decimal"
                        value={l.cantidadTexto}
                        onChange={(e) => cambiarCantidadTexto(l.producto_id, e.target.value)}
                        onFocus={seleccionarTodoAlEnfocar}
                        onBlur={() => confirmarCantidadTexto(l.producto_id)}
                      />
                      {esPesable(l.unidad) && (
                        <span className="modal-promocion__unidad">{unidadChica(l.unidad)}</span>
                      )}
                    </td>
                    <td>{formatearPesos(l.precio_venta)}</td>
                    <td>
                      <button
                        type="button"
                        className="boton boton--chico"
                        onClick={() => quitarItem(l.producto_id)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="modal-promocion__vacio">
                      Buscá y agregá los productos que combina la promo (o uno
                      solo, si es por cantidad — ej: 2 cervezas a $7.000).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <div className="modal-promocion__resumen">
              <span>Suma de precios sueltos: {formatearPesos(sumaSuelta)}</span>
              <span className={ahorro > 0 ? 'modal-promocion__ahorro' : 'modal-promocion__ahorro-negativo'}>
                {ahorro > 0
                  ? `El cliente ahorra ${formatearPesos(ahorro)}`
                  : ahorro < 0
                    ? `Ojo: sale ${formatearPesos(-ahorro)} más caro que comprado suelto`
                    : 'Mismo precio que comprado suelto'}
              </span>
            </div>
          )}

          {error && <div className="modal-promocion__error">{error}</div>}

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
