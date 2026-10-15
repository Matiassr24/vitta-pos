import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Categoria, Producto, ProductoInput, Proveedor, UnidadProducto } from '../../shared/types'
import { formatearPesos } from '../lib/formato'
import { aNumero, seleccionarTodoAlEnfocar } from '../lib/inputs'
import { ModalFondo } from './ModalFondo'
import { InputMonto } from './InputMonto'
import './Modal.css'
import './ModalProducto.css'

interface Props {
  producto: Producto | null
  codigoInicial: string | null
  // Cuando el alta rápida se abre desde un buscador y lo tipeado tenía
  // letras, era el nombre del producto y no un código escaneado.
  nombreInicial?: string | null
  categorias: Categoria[]
  proveedores: Proveedor[]
  // Cuando el alta rápida se dispara desde Compras, lo que se carga acá
  // no es un conteo de stock existente, es lo que se está comprando en
  // este momento — mismo campo, otra etiqueta para que tenga sentido.
  origenCompra?: boolean
  onProveedorCreado: (proveedor: Proveedor) => void
  onGuardar: (datos: ProductoInput) => Promise<void>
  onCancelar: () => void
}

interface FormState {
  codigo_barras: string
  nombre: string
  descripcion: string
  categoria_id: string
  proveedor_id: string
  unidad: UnidadProducto
  precio_costo: string
  margen: string
  precio_venta: string
  unidades_por_bulto: string
  costo_bulto: string
  stock: string
  stock_minimo: string
}

function estadoInicial(
  producto: Producto | null,
  codigoInicial: string | null,
  nombreInicial: string | null
): FormState {
  if (producto) {
    return {
      codigo_barras: producto.codigo_barras ?? '',
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      categoria_id: producto.categoria_id ? String(producto.categoria_id) : '',
      proveedor_id: producto.proveedor_id ? String(producto.proveedor_id) : '',
      unidad: producto.unidad,
      precio_costo: String(producto.precio_costo),
      margen: String(producto.margen),
      precio_venta: String(producto.precio_venta),
      unidades_por_bulto: String(producto.unidades_por_bulto),
      costo_bulto: producto.costo_bulto != null ? String(producto.costo_bulto) : '',
      stock: String(producto.stock),
      stock_minimo: String(producto.stock_minimo)
    }
  }
  return {
    codigo_barras: codigoInicial ?? '',
    nombre: nombreInicial ?? '',
    descripcion: '',
    categoria_id: '',
    proveedor_id: '',
    unidad: 'UNIDAD',
    precio_costo: '0',
    margen: '35',
    precio_venta: '0',
    unidades_por_bulto: '1',
    costo_bulto: '',
    stock: '0',
    stock_minimo: '0'
  }
}

function calcularSugerido(costo: number, margen: number): number {
  return Math.round(costo * (1 + margen / 100))
}

// Los precios y cantidades significan algo distinto según la unidad:
// para pan o fiambre (KG) todo es "por kilo", no "por unidad". Esto
// deja las etiquetas del formulario claras sin reestructurar nada.
const ETIQUETAS_UNIDAD: Record<UnidadProducto, { precio: string; cantidad: string }> = {
  UNIDAD: { precio: 'unitario', cantidad: 'unidades' },
  KG: { precio: '$/kg', cantidad: 'kg' },
  LITRO: { precio: '$/L', cantidad: 'litros' }
}

export function ModalProducto({
  producto,
  codigoInicial,
  nombreInicial = null,
  categorias,
  proveedores,
  origenCompra = false,
  onProveedorCreado,
  onGuardar,
  onCancelar
}: Props) {
  const [form, setForm] = useState<FormState>(() =>
    estadoInicial(producto, codigoInicial, nombreInicial)
  )
  // Mientras no se toque a mano, el precio de venta sigue al sugerido.
  // Si ya es un producto existente, asumimos que su precio fue una
  // decisión deliberada y no lo pisamos solo.
  const [precioVentaTocado, setPrecioVentaTocado] = useState(producto != null)
  const [guardando, setGuardando] = useState(false)
  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false)
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState('')
  // Colapsada por defecto: es un dato opcional y poco usado (el costo
  // unitario se puede tipear directo). Si el producto ya tenía datos de
  // bulto cargados, arranca abierta para no esconder algo que ya estaba.
  const [mostrarBulto, setMostrarBulto] = useState(() => !!producto?.costo_bulto)
  const nombreRef = useRef<HTMLInputElement>(null)
  const codigoRef = useRef<HTMLInputElement>(null)

  // Editar un producto que ya existe y todavía no tiene código: el foco
  // va directo ahí, para escanear apenas se abre la modal sin tener que
  // clickear el campo primero — pensado para ir completando códigos de a
  // uno en los productos que se cargaron por nombre mientras no había
  // lector. En cualquier otro caso (alta nueva, o ya tiene código) el
  // primer dato que hace falta sigue siendo el nombre.
  useEffect(() => {
    if (producto && !producto.codigo_barras) {
      codigoRef.current?.focus()
    } else {
      nombreRef.current?.focus()
    }
  }, [])

  const sugerido = calcularSugerido(Number(form.precio_costo) || 0, Number(form.margen) || 0)
  const etiquetas = ETIQUETAS_UNIDAD[form.unidad]

  // Para productos viejos (ej. los que vinieron con el fondo de
  // comercio) a veces no se sabe el costo real, solo el precio de
  // venta de siempre. En vez de dejar el costo en 0 —que ensuciaría
  // Reportes mostrando el precio de venta entero como ganancia— se
  // sugiere el costo invirtiendo la fórmula del margen: si $X de venta
  // sale de costo×(1+margen), el costo es venta/(1+margen). Es una
  // ESTIMACIÓN a partir del margen estándar, no un dato real, por eso
  // pide un click para aceptarla en vez de autocompletarse sola.
  const margenNumero = Number(form.margen) || 0
  const costoSugerido =
    !(Number(form.precio_costo) > 0) && Number(form.precio_venta) > 0 && margenNumero > -100
      ? Math.round(Number(form.precio_venta) / (1 + margenNumero / 100))
      : null

  useEffect(() => {
    if (!precioVentaTocado) {
      setForm((f) => ({ ...f, precio_venta: String(sugerido) }))
    }
  }, [sugerido, precioVentaTocado])

  // Mientras haya un costo de bulto cargado, el costo unitario se
  // recalcula solo con las unidades del bulto — sin importar cuál de
  // los dos campos se tocó último (antes solo recalculaba al tocar
  // "Costo del bulto", así que cambiar las unidades después no hacía
  // nada).
  useEffect(() => {
    const costoBulto = Number(form.costo_bulto)
    if (form.costo_bulto && costoBulto > 0) {
      const unidadesPorBulto = aNumero(form.unidades_por_bulto) || 1
      const nuevoCosto = String(Math.round(costoBulto / unidadesPorBulto))
      setForm((f) => (f.precio_costo === nuevoCosto ? f : { ...f, precio_costo: nuevoCosto }))
    }
  }, [form.costo_bulto, form.unidades_por_bulto])

  function actualizarCampo<K extends keyof FormState>(campo: K, valor: FormState[K]): void {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function confirmarNuevoProveedor(): Promise<void> {
    if (!nuevoProveedorNombre.trim()) return
    const nuevo = await window.api.proveedores.crear({
      nombre: nuevoProveedorNombre.trim(),
      telefono: null,
      email: null,
      notas: null
    })
    onProveedorCreado(nuevo)
    actualizarCampo('proveedor_id', String(nuevo.id))
    setNuevoProveedorNombre('')
    setMostrarNuevoProveedor(false)
  }

  function cancelarNuevoProveedor(): void {
    setNuevoProveedorNombre('')
    setMostrarNuevoProveedor(false)
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
        codigo_barras: form.codigo_barras.trim() || null,
        nombre: form.nombre,
        descripcion: form.descripcion.trim() || null,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
        unidad: form.unidad,
        precio_costo: Number(form.precio_costo) || 0,
        margen: Number(form.margen) || 0,
        precio_venta: Number(form.precio_venta) || 0,
        unidades_por_bulto: aNumero(form.unidades_por_bulto) || 1,
        costo_bulto: form.costo_bulto ? Number(form.costo_bulto) : null,
        stock: aNumero(form.stock) || 0,
        stock_minimo: aNumero(form.stock_minimo) || 0,
        // El control de stock es solo un aviso (stock bajo, "para
        // reponer"), nunca bloquea una venta — no tiene sentido pedirle
        // al usuario que lo desactive por producto.
        controla_stock: true
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-producto">
        <h2>{producto ? 'Editar producto' : 'Nuevo producto'}</h2>

        <form onSubmit={manejarSubmit} className="modal__formulario">
          <section className="modal-producto__seccion">
            <h3 className="modal-producto__seccion-titulo">Datos generales</h3>

            <label className="campo campo--ancho">
              Nombre *
              <input
                ref={nombreRef}
                type="text"
                value={form.nombre}
                onChange={(e) => actualizarCampo('nombre', e.target.value)}
                required
              />
            </label>

            <label className="campo campo--dosCol">
              Código de barras
              <input
                ref={codigoRef}
                type="text"
                value={form.codigo_barras}
                onChange={(e) => actualizarCampo('codigo_barras', e.target.value)}
                placeholder="Vacío si no tiene"
              />
            </label>

            <label className="campo">
              Categoría
              <select
                value={form.categoria_id}
                onChange={(e) => actualizarCampo('categoria_id', e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="campo campo--ancho">
              <span>Proveedor</span>
              {!mostrarNuevoProveedor ? (
                <div className="modal-producto__proveedor-fila">
                  <select
                    value={form.proveedor_id}
                    onChange={(e) => actualizarCampo('proveedor_id', e.target.value)}
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="boton boton--chico"
                    onClick={() => setMostrarNuevoProveedor(true)}
                  >
                    + Nuevo
                  </button>
                </div>
              ) : (
                <div className="modal-producto__proveedor-fila">
                  <input
                    type="text"
                    value={nuevoProveedorNombre}
                    onChange={(e) => setNuevoProveedorNombre(e.target.value)}
                    placeholder="Nombre del proveedor"
                    autoFocus
                  />
                  <button type="button" className="boton boton--chico" onClick={confirmarNuevoProveedor}>
                    Guardar
                  </button>
                  <button type="button" className="boton boton--chico" onClick={cancelarNuevoProveedor}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="modal-producto__seccion">
            <h3 className="modal-producto__seccion-titulo">Unidad y precio</h3>

            <label className="campo">
              Unidad
              <select
                value={form.unidad}
                onChange={(e) => actualizarCampo('unidad', e.target.value as UnidadProducto)}
              >
                <option value="UNIDAD">Unidad</option>
                <option value="KG">Kilo</option>
                <option value="LITRO">Litro</option>
              </select>
            </label>

            <label className="campo">
              Precio de costo ({etiquetas.precio})
              <InputMonto
                type="number"
                min="0"
                value={form.precio_costo}
                onChange={(e) => actualizarCampo('precio_costo', e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
              />
              {costoSugerido != null ? (
                <small className="campo__ayuda">
                  Sin costo cargado — invirtiendo el margen ({form.margen}%):{' '}
                  <button
                    type="button"
                    className="modal-producto__usar-sugerido"
                    onClick={() => actualizarCampo('precio_costo', String(costoSugerido))}
                  >
                    usar {formatearPesos(costoSugerido)}
                  </button>
                </small>
              ) : (
                form.unidad === 'KG' && (
                  <small className="campo__ayuda">
                    {formatearPesos((Number(form.precio_costo) || 0) / 10)} cada 100g
                  </small>
                )
              )}
            </label>

            <label className="campo">
              Margen (%)
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.margen}
                onChange={(e) => actualizarCampo('margen', e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
              />
            </label>

            {!mostrarBulto ? (
              <button
                type="button"
                className="boton boton--chico campo--ancho modal-producto__boton-bulto"
                onClick={() => setMostrarBulto(true)}
              >
                + Cargar por bulto
              </button>
            ) : (
              <fieldset className="campo campo--ancho campo--bulto">
                <legend>
                  Compra por bulto (opcional)
                  <button
                    type="button"
                    className="modal-producto__ocultar-bulto"
                    onClick={() => setMostrarBulto(false)}
                  >
                    Ocultar
                  </button>
                </legend>
                <div className="campo-fila">
                  <label className="campo">
                    Costo del bulto
                    <InputMonto
                      type="number"
                      min="0"
                      value={form.costo_bulto}
                      onChange={(e) => actualizarCampo('costo_bulto', e.target.value)}
                      onFocus={seleccionarTodoAlEnfocar}
                      placeholder="Ej: 12000"
                      autoFocus
                    />
                  </label>
                  <label className="campo">
                    Cantidad por bulto ({etiquetas.cantidad})
                    <input
                      type={form.unidad === 'UNIDAD' ? 'number' : 'text'}
                      inputMode={form.unidad === 'UNIDAD' ? undefined : 'decimal'}
                      min={form.unidad === 'UNIDAD' ? '1' : undefined}
                      value={form.unidades_por_bulto}
                      onChange={(e) => actualizarCampo('unidades_por_bulto', e.target.value)}
                      onFocus={seleccionarTodoAlEnfocar}
                    />
                  </label>
                  {form.costo_bulto && Number(form.costo_bulto) > 0 && (
                    <small className="campo__ayuda campo--ancho">
                      Costo unitario: {formatearPesos(Number(form.precio_costo))}
                    </small>
                  )}
                </div>
              </fieldset>
            )}

            <label className="campo campo--ancho">
              Precio de venta ({etiquetas.precio})
              <InputMonto
                type="number"
                min="0"
                value={form.precio_venta}
                onChange={(e) => {
                  setPrecioVentaTocado(true)
                  actualizarCampo('precio_venta', e.target.value)
                }}
                onFocus={seleccionarTodoAlEnfocar}
              />
              <small className="campo__ayuda">
                Sugerido: {formatearPesos(sugerido)}
                {form.unidad === 'KG' && ` (${formatearPesos(sugerido / 10)} cada 100g)`}
              </small>
            </label>
          </section>

          <section className="modal-producto__seccion modal-producto__seccion--dosCol">
            <h3 className="modal-producto__seccion-titulo">Stock</h3>

            <label className="campo">
              {origenCompra ? 'Cantidad de la compra' : 'Stock actual'} ({etiquetas.cantidad})
              <input
                type={form.unidad === 'UNIDAD' ? 'number' : 'text'}
                inputMode={form.unidad === 'UNIDAD' ? undefined : 'decimal'}
                step={form.unidad === 'UNIDAD' ? '1' : undefined}
                value={form.stock}
                onChange={(e) => actualizarCampo('stock', e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
              />
            </label>

            <label className="campo">
              Stock mínimo ({etiquetas.cantidad})
              <input
                type={form.unidad === 'UNIDAD' ? 'number' : 'text'}
                inputMode={form.unidad === 'UNIDAD' ? undefined : 'decimal'}
                step={form.unidad === 'UNIDAD' ? '1' : undefined}
                min={form.unidad === 'UNIDAD' ? '0' : undefined}
                value={form.stock_minimo}
                onChange={(e) => actualizarCampo('stock_minimo', e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
              />
            </label>
          </section>

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
