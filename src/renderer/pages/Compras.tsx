import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  Categoria,
  CompraItemInput,
  CompraResumen,
  Producto,
  ProductoAReponer,
  Proveedor
} from '../../shared/types'
import { useEscaner } from '../lib/useEscaner'
import { beepError, beepOk } from '../lib/sonido'
import { formatearPesos } from '../lib/formato'
import { esPesable, unidadGrande } from '../lib/unidades'
import { aNumero, aTexto, pareceCodigoBarras, seleccionarTodoAlEnfocar } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalProducto } from '../components/ModalProducto'
import { InputMonto } from '../components/InputMonto'
import '../components/Modal.css'
import './Compras.css'

interface LineaCompra {
  producto: Producto
  producto_id: number
  nombre: string
  cantidad: number
  // Texto tal cual se está tipeando en el campo de cantidad — separado
  // del número ya confirmado, así "0,5" nunca se pisa a mitad de tecleo
  // (ver el mismo patrón en Venta.tsx).
  cantidadTexto: string
  costo_unitario: number
  subtotal: number
}

export function ComprasPage() {
  const [aReponer, setAReponer] = useState<ProductoAReponer[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [recientes, setRecientes] = useState<CompraResumen[]>([])
  const [cajaAbierta, setCajaAbierta] = useState(false)

  const [proveedorId, setProveedorId] = useState('')
  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false)
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState('')
  const [numeroComprobante, setNumeroComprobante] = useState('')
  const [pagadaEnEfectivo, setPagadaEnEfectivo] = useState(false)
  const [notas, setNotas] = useState('')

  const [items, setItems] = useState<LineaCompra[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [modalAlta, setModalAlta] = useState<{
    codigoInicial: string | null
    nombreInicial: string | null
  } | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  const cargarReponer = useCallback(async () => {
    setAReponer(await window.api.compras.listarAReponer())
  }, [])

  const cargarRecientes = useCallback(async () => {
    setRecientes(await window.api.compras.listarRecientes())
  }, [])

  useEffect(() => {
    cargarReponer()
    cargarRecientes()
    window.api.proveedores.listar().then(setProveedores)
    window.api.categorias.listar().then(setCategorias)
    window.api.caja.obtenerAbierta().then((c) => setCajaAbierta(!!c))
  }, [cargarReponer, cargarRecientes])

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

  const agregarItem = useCallback(
    (producto: Producto, cantidad = 1) => {
      setItems((actual) => {
        const existente = actual.find((l) => l.producto_id === producto.id)
        if (existente) {
          const nuevaCantidad = existente.cantidad + cantidad
          return actual.map((l) =>
            l.producto_id === producto.id
              ? {
                  ...l,
                  cantidad: nuevaCantidad,
                  cantidadTexto: aTexto(nuevaCantidad),
                  subtotal: Math.round(nuevaCantidad * l.costo_unitario)
                }
              : l
          )
        }
        return [
          ...actual,
          {
            producto,
            producto_id: producto.id,
            nombre: producto.nombre,
            cantidad,
            cantidadTexto: aTexto(cantidad),
            costo_unitario: producto.precio_costo,
            subtotal: Math.round(cantidad * producto.precio_costo)
          }
        ]
      })

      // Si todavía no se eligió proveedor para esta compra, se propone
      // el proveedor habitual del producto (el de su ficha) — no pisa
      // una elección que el usuario ya haya hecho.
      if (!proveedorId && producto.proveedor_id) {
        setProveedorId(String(producto.proveedor_id))
      }
    },
    [proveedorId]
  )

  async function manejarEnterBusqueda(): Promise<void> {
    const texto = busqueda.trim()
    if (!texto) return

    const encontrados = await window.api.productos.buscar(texto)
    if (encontrados.length === 1) {
      agregarItem(encontrados[0])
      setBusqueda('')
      setResultados([])
      return
    }
    if (encontrados.length > 1) {
      setResultados(encontrados)
      return
    }

    const producto = await window.api.productos.buscarPorCodigo(texto)
    if (producto) {
      beepOk()
      agregarItem(producto)
      setBusqueda('')
      setResultados([])
    } else {
      // No existe: se abre el alta rápida con lo tipeado ya cargado en
      // el campo que corresponda (código si son puros números, nombre
      // si tiene letras).
      beepError()
      abrirAltaCon(texto)
    }
  }

  function abrirAltaCon(texto: string): void {
    setModalAlta(
      pareceCodigoBarras(texto)
        ? { codigoInicial: texto, nombreInicial: null }
        : { codigoInicial: null, nombreInicial: texto }
    )
  }

  const manejarEscaneo = useCallback(
    async (codigo: string) => {
      const producto = await window.api.productos.buscarPorCodigo(codigo)
      if (producto) {
        beepOk()
        agregarItem(producto)
        setBusqueda('')
        setResultados([])
      } else {
        // Lo que viene del lector siempre es un código, no un nombre.
        beepError()
        setModalAlta({ codigoInicial: codigo, nombreInicial: null })
      }
    },
    [agregarItem]
  )

  // useEscaner ignora solo cualquier input/textarea enfocado.
  useEscaner({ onEscaneo: manejarEscaneo, activo: !modalAlta })

  async function agregarDesdeReponer(item: ProductoAReponer): Promise<void> {
    const producto = await window.api.productos.obtenerPorId(item.id)
    if (producto) {
      agregarItem(producto, Math.max(Math.ceil(item.faltante), 1))
    }
  }

  function quitarItem(productoId: number): void {
    setItems((actual) => actual.filter((l) => l.producto_id !== productoId))
  }

  // Igual que en Venta.tsx: el texto se actualiza siempre con lo que se
  // tipeó (acepta "," o "." como separador decimal), y la cantidad real
  // que se va a comprar solo se actualiza cuando el texto ya es un
  // número mayor a cero.
  function cambiarCantidadTexto(productoId: number, texto: string): void {
    setItems((actual) =>
      actual.map((l) => {
        if (l.producto_id !== productoId) return l
        const numero = aNumero(texto)
        if (texto.trim() !== '' && numero > 0) {
          return {
            ...l,
            cantidadTexto: texto,
            cantidad: numero,
            subtotal: Math.round(numero * l.costo_unitario)
          }
        }
        return { ...l, cantidadTexto: texto }
      })
    )
  }

  function confirmarCantidadTexto(productoId: number): void {
    setItems((actual) =>
      actual.map((l) => (l.producto_id === productoId ? { ...l, cantidadTexto: aTexto(l.cantidad) } : l))
    )
  }

  function cambiarCosto(productoId: number, costo: number): void {
    if (costo < 0) return
    setItems((actual) =>
      actual.map((l) =>
        l.producto_id === productoId
          ? { ...l, costo_unitario: costo, subtotal: Math.round(l.cantidad * costo) }
          : l
      )
    )
  }

  const total = items.reduce((acc, l) => acc + l.subtotal, 0)

  async function confirmarNuevoProveedor(): Promise<void> {
    if (!nuevoProveedorNombre.trim()) return
    const nuevo = await window.api.proveedores.crear({
      nombre: nuevoProveedorNombre.trim(),
      telefono: null,
      email: null,
      notas: null
    })
    setProveedores((actual) => [...actual, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setProveedorId(String(nuevo.id))
    setNuevoProveedorNombre('')
    setMostrarNuevoProveedor(false)
  }

  function cancelarNuevoProveedor(): void {
    setNuevoProveedorNombre('')
    setMostrarNuevoProveedor(false)
  }

  async function confirmarCompra(): Promise<void> {
    setError(null)
    if (items.length === 0) {
      setError('Agregá al menos un producto.')
      return
    }

    setEnviando(true)
    try {
      const itemsInput: CompraItemInput[] = items.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        costo_unitario: l.costo_unitario,
        subtotal: l.subtotal
      }))

      await window.api.compras.registrar({
        proveedor_id: proveedorId ? Number(proveedorId) : null,
        numero_comprobante: numeroComprobante.trim() || null,
        pagadaEnEfectivo,
        notas: notas.trim() || null,
        items: itemsInput
      })

      setItems([])
      setNumeroComprobante('')
      setNotas('')
      setPagadaEnEfectivo(false)
      setMensaje('Compra registrada.')
      setTimeout(() => setMensaje(null), 2500)
      cargarReponer()
      cargarRecientes()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar la compra.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="compras">
      <aside className="compras__lateral">
        <h2>Para reponer</h2>
        <ul className="compras__reponer">
          {aReponer.map((p) => (
            <li key={p.id}>
              <div className="compras__reponer-info">
                <span className="compras__reponer-nombre">{p.nombre}</span>
                <span className="compras__reponer-detalle">
                  Stock {p.stock} / mín. {p.stock_minimo}
                  {p.proveedor ? ` · ${p.proveedor}` : ''}
                </span>
              </div>
              <button className="boton boton--chico" onClick={() => agregarDesdeReponer(p)}>
                + Agregar
              </button>
            </li>
          ))}
          {aReponer.length === 0 && <li className="compras__vacio">Nada por debajo del mínimo.</li>}
        </ul>

        <h2>Compras recientes</h2>
        <ul className="compras__recientes">
          {recientes.map((c) => (
            <li key={c.id}>
              <span className="compras__reciente-id">#{c.id}</span>
              <span className="compras__reciente-proveedor">{c.proveedor_nombre || 'Sin proveedor'}</span>
              <span className="compras__reciente-total">{formatearPesos(c.total)}</span>
            </li>
          ))}
          {recientes.length === 0 && <li className="compras__vacio">Todavía no hay compras.</li>}
        </ul>
      </aside>

      <div className="compras__principal">
        <h2>Nueva compra</h2>

        <section className="compras__seccion">
          <h3 className="compras__seccion-titulo">Datos de la compra</h3>

          <div className="compras__cabecera">
            <div className="campo">
              <span>Proveedor</span>
              {!mostrarNuevoProveedor ? (
                <div className="compras__proveedor-fila">
                  <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
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
                <div className="compras__proveedor-fila">
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

            <label className="campo">
              N° de comprobante
              <input
                type="text"
                value={numeroComprobante}
                onChange={(e) => setNumeroComprobante(e.target.value)}
                placeholder="Opcional"
              />
            </label>

            <label className="campo campo--check compras__campo-pagada">
              <input
                type="checkbox"
                checked={pagadaEnEfectivo}
                disabled={!cajaAbierta}
                onChange={(e) => setPagadaEnEfectivo(e.target.checked)}
              />
              Pagado con dinero de la caja de hoy
              {!cajaAbierta && <small className="campo__ayuda"> (no hay caja abierta)</small>}
            </label>
          </div>
        </section>

        <section className="compras__seccion">
          <h3 className="compras__seccion-titulo">Productos</h3>

          <div className="compras__buscador-fila">
            <div className="compras__buscador-contenedor">
              <input
                ref={inputBusquedaRef}
                className="compras__buscador"
                type="text"
                placeholder="Buscar producto o escaneá lo que llegó"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    manejarEnterBusqueda()
                  }
                }}
              />
              {resultados.length > 0 && (
                <ul className="compras__resultados">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          agregarItem(p)
                          setBusqueda('')
                          setResultados([])
                          inputBusquedaRef.current?.focus()
                        }}
                      >
                        <span>{p.nombre}</span>
                        <span>{formatearPesos(p.precio_costo)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              className="boton"
              title="Cargar un producto que todavía no está en el sistema"
              onClick={() => abrirAltaCon(busqueda.trim())}
            >
              + Producto nuevo
            </button>
          </div>

          <div className="compras__tabla-contenedor">
            <table className="compras__tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Costo unit.</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((linea) => (
                  <tr key={linea.producto_id}>
                    <td>{linea.nombre}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={linea.cantidadTexto}
                        onChange={(e) => cambiarCantidadTexto(linea.producto_id, e.target.value)}
                        onFocus={seleccionarTodoAlEnfocar}
                        onBlur={() => confirmarCantidadTexto(linea.producto_id)}
                      />
                      {/* La compra va en kilos/litros (así viene el remito
                          del proveedor), pero la venta va en gramos: sin
                          esta etiqueta es fácil cargar 5000 acá pensando
                          que son gramos y meter 5 toneladas de stock. */}
                      {esPesable(linea.producto.unidad) && (
                        <span className="compras__unidad-cantidad">
                          {unidadGrande(linea.producto.unidad)}
                        </span>
                      )}
                    </td>
                    <td>
                      <InputMonto
                        type="number"
                        min="0"
                        value={linea.costo_unitario}
                        onChange={(e) => cambiarCosto(linea.producto_id, Number(e.target.value))}
                        onFocus={seleccionarTodoAlEnfocar}
                      />
                    </td>
                    <td>{formatearPesos(linea.subtotal)}</td>
                    <td>
                      <button className="boton boton--chico" onClick={() => quitarItem(linea.producto_id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="compras__vacio">
                      Todavía no agregaste productos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="compras__seccion">
          <label className="campo">
            Notas
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </label>

          {mensaje && <div className="compras__mensaje">{mensaje}</div>}
          {error && <div className="compras__error">{error}</div>}

          <div className="compras__barra-total">
            <span className="compras__total">{formatearPesos(total)}</span>
            <button
              className="boton boton--primario boton--grande"
              disabled={items.length === 0 || enviando}
              onClick={confirmarCompra}
            >
              {enviando ? 'Guardando...' : 'Registrar compra'}
            </button>
          </div>
        </section>
      </div>

      {modalAlta && (
        <ModalProducto
          producto={null}
          codigoInicial={modalAlta.codigoInicial}
          nombreInicial={modalAlta.nombreInicial}
          categorias={categorias}
          proveedores={proveedores}
          origenCompra
          onProveedorCreado={(nuevo) =>
            setProveedores((actual) => [...actual, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
          }
          onGuardar={async (datos) => {
            const nuevo = await window.api.productos.crear(datos)
            agregarItem(nuevo)
            setModalAlta(null)
          }}
          onCancelar={() => setModalAlta(null)}
        />
      )}
    </div>
  )
}
