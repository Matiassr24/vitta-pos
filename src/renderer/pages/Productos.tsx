import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Categoria, Producto, ProductoInput, Proveedor } from '../../shared/types'
import { useEscaner } from '../lib/useEscaner'
import { beepError, beepOk } from '../lib/sonido'
import { formatearCantidad, formatearPesos } from '../lib/formato'
import { pareceCodigoBarras } from '../lib/inputs'
import { mensajeDeError } from '../lib/errores'
import { ModalProducto } from '../components/ModalProducto'
import { ModalImportar } from '../components/ModalImportar'
import './Productos.css'

type EstadoModal =
  | { abierto: false }
  | {
      abierto: true
      producto: Producto | null
      codigoInicial: string | null
      nombreInicial?: string | null
    }

type FiltroPrecio = 'todos' | 'debajo' | 'igual' | 'encima'
type FiltroStock = 'todos' | 'bajo_minimo' | 'sin_stock'

interface Filtros {
  categoriaId: string
  proveedorId: string
  precio: FiltroPrecio
  stock: FiltroStock
  sinCodigo: boolean
}

const FILTROS_VACIOS: Filtros = {
  categoriaId: '',
  proveedorId: '',
  precio: 'todos',
  stock: 'todos',
  sinCodigo: false
}

// Se filtra acá y no en SQL a propósito: la lista completa ya viene
// cargada, y con el tamaño que puede tener este catálogo (1500 y pico)
// recorrerla en memoria es instantáneo. Evita un viaje de ida y vuelta
// al proceso principal por cada tecla.
function aplicarFiltros(productos: Producto[], f: Filtros): Producto[] {
  return productos.filter((p) => {
    if (f.categoriaId && String(p.categoria_id ?? '') !== f.categoriaId) return false
    if (f.proveedorId && String(p.proveedor_id ?? '') !== f.proveedorId) return false
    if (f.sinCodigo && p.codigo_barras) return false

    // "Debajo del sugerido" = se está vendiendo con menos margen del que
    // se configuró para ese producto; "igual" = el precio respeta
    // exactamente el margen configurado.
    if (f.precio === 'debajo' && !(p.precio_venta < p.precio_sugerido)) return false
    if (f.precio === 'igual' && p.precio_venta !== p.precio_sugerido) return false
    if (f.precio === 'encima' && !(p.precio_venta > p.precio_sugerido)) return false

    // Los que no controlan stock quedan afuera de los filtros de stock:
    // su cantidad no significa nada.
    if (f.stock === 'bajo_minimo' && !(p.controla_stock === 1 && p.stock <= p.stock_minimo)) return false
    if (f.stock === 'sin_stock' && !(p.controla_stock === 1 && p.stock <= 0)) return false

    return true
  })
}

export function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [destacadoId, setDestacadoId] = useState<number | null>(null)
  const [modal, setModal] = useState<EstadoModal>({ abierto: false })
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [importando, setImportando] = useState(false)
  const [avisoImportacion, setAvisoImportacion] = useState<string | null>(null)
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState<number | null>(null)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<number | null>(null)

  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  const recargarProductos = useCallback(
    async (texto: string) => {
      setCargando(true)
      try {
        const soloActivos = !mostrarInactivos
        const lista = texto.trim()
          ? await window.api.productos.buscar(texto, soloActivos)
          : await window.api.productos.listar(soloActivos)
        setProductos(lista)
      } finally {
        setCargando(false)
      }
    },
    [mostrarInactivos]
  )

  useEffect(() => {
    window.api.categorias.listar().then(setCategorias)
    window.api.proveedores.listar().then(setProveedores)
  }, [])

  // Buscador con un pequeño debounce para no golpear la base en cada tecla.
  useEffect(() => {
    const manija = setTimeout(() => {
      recargarProductos(busqueda)
    }, 200)
    return () => clearTimeout(manija)
  }, [busqueda, recargarProductos])

  const manejarEscaneo = useCallback(
    async (codigo: string) => {
      const producto = await window.api.productos.buscarPorCodigo(codigo)
      if (producto) {
        beepOk()
        setBusqueda('')
        await recargarProductos('')
        setDestacadoId(producto.id)
        setTimeout(() => setDestacadoId(null), 2500)
      } else {
        // Código desconocido: no frena nada, abre el alta rápida.
        beepError()
        setModal({ abierto: true, producto: null, codigoInicial: codigo })
      }
    },
    [recargarProductos]
  )

  useEscaner({
    onEscaneo: manejarEscaneo,
    activo: !modal.abierto
    // No hace falta ignorarSiEnfocado para el buscador: useEscaner ya
    // ignora cualquier input/textarea enfocado (ver el hook). Antes esta
    // pantalla no lo tenía registrado y un escaneo con el buscador
    // enfocado se procesaba dos veces — bug real encontrado en la
    // revisión previa a instalar en la máquina de la dueña.
  })

  // Sin lector físico: escribir el código a mano y apretar Enter tiene
  // que funcionar igual que un escaneo. Si la búsqueda no encuentra
  // nada (ni por nombre ni por código), abre el alta rápida directo.
  async function manejarEnterBusqueda(): Promise<void> {
    const texto = busqueda.trim()
    if (!texto) return

    const encontrados = await window.api.productos.buscar(texto, !mostrarInactivos)
    setProductos(encontrados)

    if (encontrados.length === 0) {
      // Lo tipeado va al campo que corresponda: código si son puros
      // números, nombre si tiene letras.
      beepError()
      setModal({
        abierto: true,
        producto: null,
        codigoInicial: pareceCodigoBarras(texto) ? texto : null,
        nombreInicial: pareceCodigoBarras(texto) ? null : texto
      })
    } else if (encontrados.length === 1) {
      beepOk()
      setDestacadoId(encontrados[0].id)
      setTimeout(() => setDestacadoId(null), 2500)
    }
  }

  const productosFiltrados = useMemo(() => aplicarFiltros(productos, filtros), [productos, filtros])
  const hayFiltros = useMemo(
    () => JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS),
    [filtros]
  )

  function cambiarFiltro<K extends keyof Filtros>(campo: K, valor: Filtros[K]): void {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  async function guardarProducto(datos: ProductoInput): Promise<void> {
    setError(null)
    try {
      if (modal.abierto && modal.producto) {
        await window.api.productos.actualizar(modal.producto.id, datos)
      } else {
        await window.api.productos.crear(datos)
      }
      setModal({ abierto: false })
      await recargarProductos(busqueda)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el producto.'))
    }
  }

  async function alternarActivo(producto: Producto): Promise<void> {
    await window.api.productos.cambiarActivo(producto.id, producto.activo === 0)
    setConfirmandoDesactivar(null)
    await recargarProductos(busqueda)
  }

  async function borrarProducto(producto: Producto): Promise<void> {
    setError(null)
    try {
      await window.api.productos.eliminar(producto.id)
      setConfirmandoBorrar(null)
      await recargarProductos(busqueda)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo borrar el producto.'))
      setConfirmandoBorrar(null)
    }
  }

  return (
    <div className="productos">
      <header className="productos__barra">
        <h1>Productos</h1>
        <input
          ref={inputBusquedaRef}
          className="productos__buscador"
          type="text"
          placeholder="Buscar por nombre o código... (o escaneá)"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              manejarEnterBusqueda()
            }
          }}
          autoFocus
        />
        <label className="productos__toggle-inactivos">
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <button className="boton" onClick={() => setImportando(true)}>
          Importar Excel
        </button>
        <button
          className="boton boton--primario"
          onClick={() => setModal({ abierto: true, producto: null, codigoInicial: null })}
        >
          + Nuevo producto
        </button>
      </header>

      <div className="productos__filtros">
        <label className="campo campo--chico">
          Categoría
          <select
            value={filtros.categoriaId}
            onChange={(e) => cambiarFiltro('categoriaId', e.target.value)}
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="campo campo--chico">
          Proveedor
          <select
            value={filtros.proveedorId}
            onChange={(e) => cambiarFiltro('proveedorId', e.target.value)}
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="campo campo--chico">
          Precio
          <select
            value={filtros.precio}
            onChange={(e) => cambiarFiltro('precio', e.target.value as FiltroPrecio)}
          >
            <option value="todos">Todos</option>
            <option value="debajo">Debajo del sugerido</option>
            <option value="igual">Igual al sugerido</option>
            <option value="encima">Arriba del sugerido</option>
          </select>
        </label>

        <label className="campo campo--chico">
          Stock
          <select
            value={filtros.stock}
            onChange={(e) => cambiarFiltro('stock', e.target.value as FiltroStock)}
          >
            <option value="todos">Todos</option>
            <option value="bajo_minimo">Bajo el mínimo</option>
            <option value="sin_stock">Sin stock</option>
          </select>
        </label>

        <label className="productos__filtro-check">
          <input
            type="checkbox"
            checked={filtros.sinCodigo}
            onChange={(e) => cambiarFiltro('sinCodigo', e.target.checked)}
          />
          Sin código de barras
        </label>

        <span className="productos__conteo">
          {hayFiltros
            ? `${productosFiltrados.length} de ${productos.length}`
            : `${productos.length} producto${productos.length === 1 ? '' : 's'}`}
        </span>

        {hayFiltros && (
          <button className="boton boton--chico" onClick={() => setFiltros(FILTROS_VACIOS)}>
            Limpiar filtros
          </button>
        )}
      </div>

      {avisoImportacion && <div className="productos__aviso">{avisoImportacion}</div>}
      {error && <div className="productos__error">{error}</div>}

      <div className="productos__tabla-contenedor">
        <table className="productos__tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Costo</th>
              <th>Margen</th>
              <th>Sugerido</th>
              <th>Venta</th>
              <th>Stock</th>
              <th>Mín.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => {
              // Que el precio quede arriba del sugerido es lo normal (se
              // redondea para arriba); solo llama la atención cuando
              // quedó por debajo, porque ahí se está perdiendo margen.
              const precioPorDebajo = p.precio_venta < p.precio_sugerido
              const stockBajo = p.controla_stock === 1 && p.stock <= p.stock_minimo

              return (
                <tr
                  key={p.id}
                  className={[
                    p.id === destacadoId ? 'fila-destacada' : '',
                    p.activo === 0 ? 'fila-inactiva' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setModal({ abierto: true, producto: p, codigoInicial: null })}
                >
                  <td>{p.codigo_barras || '—'}</td>
                  <td>{p.nombre}</td>
                  <td>{p.categoria_nombre || '—'}</td>
                  <td>{formatearPesos(p.precio_costo)}</td>
                  <td>{p.margen}%</td>
                  <td>{formatearPesos(p.precio_sugerido)}</td>
                  <td className={precioPorDebajo ? 'celda-alerta' : ''}>
                    {formatearPesos(p.precio_venta)}
                  </td>
                  <td className={stockBajo ? 'celda-alerta' : ''}>
                    {formatearCantidad(p.stock, p.unidad)}
                  </td>
                  <td>
                    {p.controla_stock === 1 ? (
                      formatearCantidad(p.stock_minimo, p.unidad)
                    ) : (
                      <span title="No controla stock">—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {p.activo === 1 ? (
                      confirmandoDesactivar === p.id ? (
                        <span className="productos__confirmar">
                          <button
                            className="boton boton--chico"
                            onClick={() => setConfirmandoDesactivar(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            className="boton boton--chico boton--peligro"
                            onClick={() => alternarActivo(p)}
                          >
                            Confirmar
                          </button>
                        </span>
                      ) : (
                        <button
                          className="boton boton--chico"
                          onClick={() => setConfirmandoDesactivar(p.id)}
                        >
                          Desactivar
                        </button>
                      )
                    ) : confirmandoBorrar === p.id ? (
                      <span className="productos__confirmar">
                        <button className="boton boton--chico" onClick={() => setConfirmandoBorrar(null)}>
                          Cancelar
                        </button>
                        <button
                          className="boton boton--chico boton--peligro"
                          onClick={() => borrarProducto(p)}
                        >
                          Confirmar borrado
                        </button>
                      </span>
                    ) : (
                      <span className="productos__confirmar">
                        <button className="boton boton--chico" onClick={() => alternarActivo(p)}>
                          Activar
                        </button>
                        <button
                          className="boton boton--chico"
                          onClick={() => setConfirmandoBorrar(p.id)}
                        >
                          Borrar
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}

            {!cargando && productosFiltrados.length === 0 && (
              <tr>
                <td colSpan={10} className="productos__vacio">
                  {productos.length > 0
                    ? 'Ningún producto coincide con los filtros.'
                    : 'No hay productos para mostrar.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.abierto && (
        <ModalProducto
          producto={modal.producto}
          codigoInicial={modal.codigoInicial}
          nombreInicial={modal.nombreInicial}
          categorias={categorias}
          proveedores={proveedores}
          onProveedorCreado={(nuevo) =>
            setProveedores((actual) => [...actual, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
          }
          onGuardar={guardarProducto}
          onCancelar={() => setModal({ abierto: false })}
        />
      )}

      {importando && (
        <ModalImportar
          onCancelar={() => setImportando(false)}
          onImportado={async (cantidad) => {
            setImportando(false)
            setAvisoImportacion(
              `Se importaron ${cantidad} producto${cantidad === 1 ? '' : 's'}.`
            )
            setTimeout(() => setAvisoImportacion(null), 6000)
            // Las categorías y proveedores nuevos que creó la importación
            // tienen que aparecer en los filtros y en el alta.
            window.api.categorias.listar().then(setCategorias)
            window.api.proveedores.listar().then(setProveedores)
            await recargarProductos(busqueda)
          }}
        />
      )}
    </div>
  )
}
