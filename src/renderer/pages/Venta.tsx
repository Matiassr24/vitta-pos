import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Tag } from 'lucide-react'
import type {
  CajaSesion,
  Categoria,
  Cliente,
  MedioPago,
  Producto,
  Promocion,
  Proveedor,
  UnidadProducto,
  VentaItemInput,
  VentaResumen
} from '../../shared/types'
import { useEscaner } from '../lib/useEscaner'
import { beepError, beepOk } from '../lib/sonido'
import { formatearCantidadVenta, formatearPesos } from '../lib/formato'
import {
  CANTIDAD_INICIAL_PESABLE,
  aCantidadChica,
  aCantidadGuardada,
  esPesable,
  unidadChica
} from '../lib/unidades'
import { mensajeDeError } from '../lib/errores'
import { aNumero, aTexto, pareceCodigoBarras, seleccionarTodoAlEnfocar } from '../lib/inputs'
import { distribuirPrecioPromo } from '../lib/promociones'
import { ModalProducto } from '../components/ModalProducto'
import { ModalCobro } from '../components/ModalCobro'
import { TicketImpresion } from '../components/TicketImpresion'
import type { DatosTicket } from '../components/TicketImpresion'
import './Venta.css'

// Lo que hace falta para poder retomar la operación bloqueada una vez
// que se corrige el stock: el producto, cuánto haría falta para que
// esa operación pase, y qué hacer al confirmar (agregar al ticket o
// actualizar la cantidad de una línea, según de dónde vino el freno).
interface AvisoSinStock {
  producto: Producto
  disponible: number
  cantidadNecesaria: number
  reintentar: (productoActualizado: Producto) => void
}

// Una pestaña es una venta en armado, independiente de las demás —
// atender a alguien mientras otra queda a medio cargar (2026-09-22, a
// pedido del usuario: "no hace falta que estén las 2 en pantalla a la
// vez, pero que se pueda navegar como en pestañas"). Solo el ticket
// vive por pestaña: la caja, los medios de pago, el catálogo y las
// ventas de hoy son un solo negocio, no cambian según la pestaña.
interface Pestaña {
  // Identidad interna, estable, nunca se reutiliza — para el `key` de
  // React y para saber a qué pestaña apunta una operación en curso (ver
  // agregarAlTicket). NO es lo que se muestra en pantalla: ahí se numera
  // por posición (1, 2, 3...), que es lo que el usuario quiere ver
  // ("cuántas ventas hay abiertas"), no un id que persista.
  id: number
  ticket: LineaTicket[]
}

interface LineaTicket extends VentaItemInput {
  producto: Producto
  // Cuántas veces se agregó esta promo al ticket. Todas las líneas de
  // una misma promo comparten el valor, y sirve para mostrarla agrupada
  // como una sola fila ("Fernet + Coca x2") sin tener que deducirlo
  // desde los precios ya repartidos. null si la línea no es de promo.
  promocion_veces: number | null
  // Lo que el input de cantidad muestra mientras se tipea. Separado del
  // `cantidad` numérico ya confirmado para que estados intermedios como
  // "0" o "0," al escribir "0,5" no se pisen solos si la pantalla vuelve
  // a renderizar por cualquier otro motivo mientras se está tipeando.
  cantidadTexto: string
}

// Cuántas promos entran como píldora antes de mandar el resto atrás de
// "Ver más promos" — con pocas promos (el caso de hoy) da lo mismo que
// mostrarlas todas; el límite importa recién cuando el catálogo de
// promos crezca.
const MAX_PILDORAS_PROMO = 4

// El campo de cantidad de un pesable se teclea en gramos/ml, pero la
// línea guarda kilos/litros: este es el único lugar donde se arma ese
// texto, para que entrada y salida usen siempre la misma conversión.
function textoCantidad(cantidad: number, unidad: UnidadProducto): string {
  return aTexto(aCantidadChica(cantidad, unidad))
}

// "del sistema" no es un detalle de redacción: es el punto entero del
// aviso. El número que sabe la app puede estar mal (se vendió sin
// descontar, llegó una compra sin registrar), y la verdad es lo que hay
// en el estante — por eso se avisa en vez de bloquear la venta.
function leyendaStock(producto: Producto): string {
  if (producto.stock <= 0) return 'sin stock en el sistema'
  const enUnidadChica = aCantidadChica(producto.stock, producto.unidad)
  const verbo = enUnidadChica === 1 ? 'queda' : 'quedan'
  return `${verbo} ${formatearCantidadVenta(producto.stock, producto.unidad)} en stock del sistema`
}

// Una promo se vive en el mostrador como UNA cosa ("llevo el Fernet con
// la Coca"), no como dos productos con precios raros de $16.800 y
// $4.200 — esos números son un reparto interno para que el stock y el
// costo de cada producto queden bien, pero al cliente lo confunden.
// Por eso, tanto en la tabla de la pantalla como en el comprobante
// impreso, las líneas de una misma promo se muestran juntas en una sola
// fila con el nombre y el precio de la promo.
// El ticket "de verdad" (lo que se manda a registrar) sigue teniendo una
// línea por producto: esto es solo la vista.
interface FilaPromo {
  tipo: 'promo'
  promocion_id: number
  nombre: string
  veces: number
  precio_unitario: number
  subtotal: number
  lineas: LineaTicket[]
}

interface FilaProducto {
  tipo: 'producto'
  linea: LineaTicket
}

type FilaVisible = FilaPromo | FilaProducto

function agruparParaPantalla(ticket: LineaTicket[]): FilaVisible[] {
  const filas: FilaVisible[] = []
  const promosYaAgregadas = new Set<number>()

  for (const linea of ticket) {
    if (linea.promocion_id == null) {
      filas.push({ tipo: 'producto', linea })
      continue
    }
    if (promosYaAgregadas.has(linea.promocion_id)) continue
    promosYaAgregadas.add(linea.promocion_id)

    const lineas = ticket.filter((l) => l.promocion_id === linea.promocion_id)
    const subtotal = lineas.reduce((acc, l) => acc + l.subtotal, 0)
    const veces = linea.promocion_veces ?? 1
    filas.push({
      tipo: 'promo',
      promocion_id: linea.promocion_id,
      nombre: linea.promocion_nombre ?? 'Promoción',
      veces,
      // Se divide el total del grupo en vez de guardar el precio de la
      // promo: así el unitario que se muestra siempre multiplica exacto
      // por la cantidad y da el subtotal que se cobra.
      precio_unitario: Math.round(subtotal / veces),
      subtotal,
      lineas
    })
  }

  return filas
}

function agruparParaTicket(ticket: LineaTicket[]): DatosTicket['items'] {
  return agruparParaPantalla(ticket).map((fila) =>
    fila.tipo === 'promo'
      ? {
          nombre: fila.nombre,
          cantidad: fila.veces,
          // La promo se cobra como una sola cosa, no por peso, aunque
          // adentro tenga fiambre: en el ticket es "1 x $21.000".
          unidad: 'UNIDAD' as const,
          precio_unitario: fila.precio_unitario,
          subtotal: fila.subtotal
        }
      : {
          nombre: fila.linea.nombre,
          cantidad: fila.linea.cantidad,
          unidad: fila.linea.producto.unidad,
          precio_unitario: fila.linea.precio_unitario,
          subtotal: fila.linea.subtotal
        }
  )
}

interface Props {
  onIrACaja: () => void
}

export function VentaPage({ onIrACaja }: Props) {
  // undefined = todavía no sabemos; null = no hay caja abierta
  const [caja, setCaja] = useState<CajaSesion | null | undefined>(undefined)

  // Siempre queda al menos una pestaña — nunca "sin venta en armado".
  const [pestañas, setPestañas] = useState<Pestaña[]>([{ id: 1, ticket: [] }])
  const [pestañaActivaId, setPestañaActivaId] = useState(1)
  const proximoIdPestaña = useRef(2)
  // Cerrar una pestaña con productos cargados pide confirmación (mismo
  // patrón de dos clicks que "Desactivar"/"Borrar" en Productos): el
  // primer click en la "×" marca cuál está pidiendo confirmación, el
  // segundo click ahí mismo la cierra de verdad.
  const [pestañaCerrando, setPestañaCerrando] = useState<number | null>(null)

  const ticket = pestañas.find((p) => p.id === pestañaActivaId)?.ticket ?? []

  const actualizarTicket = useCallback(
    (idPestaña: number, fn: (actual: LineaTicket[]) => LineaTicket[]) => {
      setPestañas((actual) => actual.map((p) => (p.id === idPestaña ? { ...p, ticket: fn(p.ticket) } : p)))
    },
    []
  )

  // Cambiar de pestaña no arrastra nada que fuera "de la otra venta":
  // el buscador y sus resultados, y el panel de corregir stock (que
  // apunta a una línea puntual) se limpian solos.
  function cambiarPestañaActiva(id: number): void {
    setPestañaActivaId(id)
    setBusqueda('')
    setResultados([])
    setSinStock(null)
    setStockCorregido('')
    setErrorStockCorregido(null)
    setPestañaCerrando(null)
  }

  function nuevaPestaña(): void {
    const id = proximoIdPestaña.current++
    setPestañas((actual) => [...actual, { id, ticket: [] }])
    cambiarPestañaActiva(id)
  }

  function cerrarPestaña(id: number): void {
    const pestaña = pestañas.find((p) => p.id === id)
    if (!pestaña) return
    if (pestaña.ticket.length > 0 && pestañaCerrando !== id) {
      setPestañaCerrando(id)
      return
    }
    setPestañaCerrando(null)

    const restantes = pestañas.filter((p) => p.id !== id)
    if (restantes.length === 0) {
      // Nunca queda sin ninguna pestaña: si se cierra la última, se abre
      // una nueva vacía en su lugar.
      const nuevoId = proximoIdPestaña.current++
      setPestañas([{ id: nuevoId, ticket: [] }])
      setPestañaActivaId(nuevoId)
    } else {
      setPestañas(restantes)
      if (pestañaActivaId === id) {
        cambiarPestañaActiva(restantes[restantes.length - 1].id)
      }
    }
  }

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [promociones, setPromociones] = useState<Promocion[]>([])
  // Con pocas promos, todas entran como píldoras. Si hay más de las que
  // caben cómodas en una fila, se muestran solo las primeras y el resto
  // queda atrás de "Ver más promos", con su propio buscador por nombre
  // — mismo patrón que el buscador de productos, para no sumar una
  // interacción nueva.
  const [buscadorPromosAbierto, setBuscadorPromosAbierto] = useState(false)
  const [busquedaPromo, setBusquedaPromo] = useState('')
  const [modalAlta, setModalAlta] = useState<{
    codigoInicial: string | null
    nombreInicial: string | null
  } | null>(null)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const [ventasRecientes, setVentasRecientes] = useState<VentaResumen[]>([])
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [sinStock, setSinStock] = useState<AvisoSinStock | null>(null)
  const [stockCorregido, setStockCorregido] = useState('')
  const [errorStockCorregido, setErrorStockCorregido] = useState<string | null>(null)
  const [guardandoStock, setGuardandoStock] = useState(false)
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([])
  // Se tilda al toque, cuando un cliente pide el ticket — no es una
  // configuración global, cualquiera que esté vendiendo lo puede marcar.
  const [imprimirTicket, setImprimirTicket] = useState(false)
  const [ultimaVenta, setUltimaVenta] = useState<DatosTicket | null>(null)
  const [anulando, setAnulando] = useState<number | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  // Producto pesable (KG/LITRO) recién agregado: dispara el efecto que
  // salta el foco a su campo de cantidad para tipear el peso de la
  // balanza al toque, en vez de dejar "1" (kilo entero) sin querer.
  const [pesableRecienAgregado, setPesableRecienAgregado] = useState<number | null>(null)

  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.caja.obtenerAbierta().then((abierta) => setCaja(abierta ?? null))
    window.api.categorias.listar().then(setCategorias)
    window.api.proveedores.listar().then(setProveedores)
    window.api.clientes.listar().then(setClientes)
    window.api.mediosPago.listar().then(setMediosPago)
    window.api.promociones.listar().then(setPromociones)
  }, [])

  const cargarVentasRecientes = useCallback(async (cajaSesionId: number) => {
    setVentasRecientes(await window.api.ventas.listarRecientes(cajaSesionId))
  }, [])

  useEffect(() => {
    if (caja) cargarVentasRecientes(caja.id)
  }, [caja, cargarVentasRecientes])

  // Buscador por nombre, con un pequeño debounce.
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

  // Corrección opcional, no bloqueante: si el sistema dice que no hay
  // stock pero se está escaneando igual, es porque el producto sí está
  // en el mostrador (se vendió de más sin cargarlo, o llegó de una
  // compra que todavía no se registró). La venta sigue sin frenarse;
  // esto solo ofrece arreglar el número ahí mismo si se quiere.
  const pedirNuevoStock = useCallback(
    (producto: Producto, cantidadNecesaria: number, reintentar: (actualizado: Producto) => void) => {
      setStockCorregido('')
      setErrorStockCorregido(null)
      setSinStock({ producto, disponible: producto.stock, cantidadNecesaria, reintentar })
    },
    []
  )

  async function confirmarNuevoStock(): Promise<void> {
    if (!sinStock) return
    setErrorStockCorregido(null)

    // Este campo también se teclea en la unidad chica (gramos/ml), igual
    // que el de cantidad de la tabla, para no mezclar dos formas de
    // escribir un peso en la misma pantalla.
    const nuevo = aCantidadGuardada(aNumero(stockCorregido), sinStock.producto.unidad)
    if (!(nuevo > 0)) {
      setErrorStockCorregido('Ingresá una cantidad.')
      return
    }
    if (nuevo < sinStock.cantidadNecesaria) {
      setErrorStockCorregido(
        `Necesitás cargar al menos ${formatearCantidadVenta(sinStock.cantidadNecesaria, sinStock.producto.unidad)}.`
      )
      return
    }

    setGuardandoStock(true)
    try {
      const actualizado = await window.api.productos.ajustarStockRapido(
        sinStock.producto.id,
        nuevo,
        'Ajuste rápido desde Venta (stock insuficiente)'
      )
      const reintentar = sinStock.reintentar
      setSinStock(null)
      setStockCorregido('')
      reintentar(actualizado)
    } catch (err) {
      setErrorStockCorregido(mensajeDeError(err, 'No se pudo actualizar el stock.'))
    } finally {
      setGuardandoStock(false)
    }
  }

  // Si el producto ya está en el ticket, escanear/agregarlo de nuevo
  // suma la cantidad en la misma línea ("Yogur x3", no tres líneas).
  // No se frena si excede el stock que figura en el sistema: si lo
  // están escaneando es porque efectivamente está en el mostrador (se
  // vendió más de lo que se cargó, o recién llegó de una compra que
  // todavía no se registró) — bloquear ahí sería peor que dejar
  // vender. La tabla avisa la diferencia con una etiqueta por línea.
  // idPestaña se recibe como parámetro (no se lee pestañaActivaId acá
  // adentro) porque quien llama puede venir de un flujo asincrónico
  // (buscar por código, guardar el alta rápida): captura a qué pestaña
  // apuntaba en el momento del click, así si mientras tanto se cambia
  // de pestaña el producto igual cae en la venta correcta.
  const agregarAlTicket = useCallback(
    (producto: Producto, idPestaña: number, cantidadPedida?: number) => {
      // Un pesable arranca en 100 g / 100 ml, no en 1 (que sería un kilo
      // entero de queso). El campo queda seleccionado para tipear encima
      // lo que marca la balanza.
      const cantidad =
        cantidadPedida ?? (esPesable(producto.unidad) ? CANTIDAD_INICIAL_PESABLE : 1)
      actualizarTicket(idPestaña, (actual) => {
        // promocion_id == null: esta línea es SIEMPRE precio de lista. Si
        // el mismo producto ya está en el ticket pero como parte de una
        // promo (precio distinto), tienen que quedar en líneas separadas.
        const linea = actual.find((l) => l.producto_id === producto.id && l.promocion_id == null)
        if (linea) {
          const nuevaCantidad = linea.cantidad + cantidad
          return actual.map((l) =>
            l.producto_id === producto.id && l.promocion_id == null
              ? {
                  ...l,
                  cantidad: nuevaCantidad,
                  cantidadTexto: textoCantidad(nuevaCantidad, producto.unidad),
                  subtotal: Math.round(nuevaCantidad * l.precio_unitario)
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
            cantidadTexto: textoCantidad(cantidad, producto.unidad),
            precio_unitario: producto.precio_venta,
            costo_unitario: producto.precio_costo,
            subtotal: Math.round(cantidad * producto.precio_venta),
            promocion_id: null,
            promocion_nombre: null,
            promocion_veces: null
          }
        ]
      })

      // Pan, fiambre, snacks a granel: lo que importa es lo que marca la
      // balanza, no el valor con el que arranca la línea.
      if (esPesable(producto.unidad)) {
        setPesableRecienAgregado(producto.id)
      }
    },
    [actualizarTicket]
  )

  // Agregar una promo suma TODOS sus componentes de una — Fernet y Coca
  // entran juntos, con el precio ya repartido entre los dos para que
  // sumen exacto el precio de la promo (ver distribuirPrecioPromo). Van
  // marcados con promocion_id, así nunca se mezclan con una línea del
  // mismo producto vendido suelto a precio de lista.
  // idPestaña se captura en el momento del click (ver el comentario de
  // agregarAlTicket): esta función espera un ida y vuelta al proceso
  // principal antes de tocar el ticket, y en ese lapso se podría llegar
  // a cambiar de pestaña.
  async function agregarPromoAlTicket(promo: Promocion, idPestaña: number): Promise<void> {
    const productos = await Promise.all(
      promo.items.map((it) => window.api.productos.obtenerPorId(it.producto_id))
    )
    const componentes = promo.items
      .map((it, i) => ({ item: it, producto: productos[i] }))
      .filter((c): c is { item: (typeof promo.items)[number]; producto: Producto } => c.producto != null)

    if (componentes.length === 0) return

    const distribuido = distribuirPrecioPromo(
      componentes.map((c) => ({ ...c, precio_venta: c.producto.precio_venta, cantidad: c.item.cantidad })),
      promo.precio_promocional
    )

    actualizarTicket(idPestaña, (actual) => {
      let nuevo = actual
      for (const { producto, cantidad, precio_unitario, subtotal } of distribuido) {
        const existente = nuevo.find((l) => l.producto_id === producto.id && l.promocion_id === promo.id)
        if (existente) {
          const nuevaCantidad = existente.cantidad + cantidad
          nuevo = nuevo.map((l) =>
            l === existente
              ? {
                  ...l,
                  cantidad: nuevaCantidad,
                  cantidadTexto: textoCantidad(nuevaCantidad, producto.unidad),
                  subtotal: Math.round(nuevaCantidad * l.precio_unitario),
                  promocion_veces: (l.promocion_veces ?? 1) + 1
                }
              : l
          )
        } else {
          nuevo = [
            ...nuevo,
            {
              producto,
              producto_id: producto.id,
              nombre: producto.nombre,
              cantidad,
              cantidadTexto: textoCantidad(cantidad, producto.unidad),
              precio_unitario,
              costo_unitario: producto.precio_costo,
              subtotal,
              promocion_id: promo.id,
              promocion_nombre: promo.nombre,
              promocion_veces: 1
            }
          ]
        }
      }
      return nuevo
    })
  }

  useEffect(() => {
    if (pesableRecienAgregado == null) return
    const input = document.querySelector<HTMLInputElement>(
      `input[data-cantidad-id="${pesableRecienAgregado}"]`
    )
    input?.focus()
    input?.select()
    setPesableRecienAgregado(null)
  }, [pesableRecienAgregado])

  // Sin lector físico, escribir el código a mano en el buscador y
  // apretar Enter tiene que funcionar igual que un escaneo: si no hay
  // ningún producto con ese nombre, se prueba como código exacto, y si
  // tampoco existe así, se abre el alta rápida.
  async function manejarEnterBusqueda(): Promise<void> {
    const texto = busqueda.trim()
    if (!texto) return
    // Se captura acá, antes del ida y vuelta a la base, por la misma
    // razón que en agregarPromoAlTicket.
    const idPestaña = pestañaActivaId

    const encontrados = await window.api.productos.buscar(texto)
    if (encontrados.length === 1) {
      agregarAlTicket(encontrados[0], idPestaña)
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
      agregarAlTicket(producto, idPestaña)
      setBusqueda('')
      setResultados([])
    } else {
      // Lo tipeado va al campo que corresponda del alta rápida: código
      // si son puros números, nombre si tiene letras.
      beepError()
      setModalAlta(
        pareceCodigoBarras(texto)
          ? { codigoInicial: texto, nombreInicial: null }
          : { codigoInicial: null, nombreInicial: texto }
      )
    }
  }

  const manejarEscaneo = useCallback(
    async (codigo: string) => {
      // Igual que en manejarEnterBusqueda: la pestaña de destino se
      // captura antes del ida y vuelta a la base.
      const idPestaña = pestañaActivaId
      const producto = await window.api.productos.buscarPorCodigo(codigo)
      if (producto) {
        beepOk()
        agregarAlTicket(producto, idPestaña)
        setBusqueda('')
        setResultados([])
      } else {
        // Código desconocido: no frena la venta, abre el alta rápida.
        // Lo que viene del lector siempre es un código, no un nombre.
        beepError()
        setModalAlta({ codigoInicial: codigo, nombreInicial: null })
      }
    },
    [agregarAlTicket, pestañaActivaId]
  )

  useEscaner({
    onEscaneo: manejarEscaneo,
    activo: caja != null && !modalAlta && !cobroAbierto
    // useEscaner ignora solo cualquier input/textarea enfocado (buscador,
    // cantidad del ticket, corrección de stock): no hace falta pasarle
    // el ref de cada uno.
  })

  // Teclado antes que mouse: F2 buscar, F4 cobrar, Esc vacía el ticket.
  useEffect(() => {
    function manejarTecla(evento: KeyboardEvent): void {
      if (modalAlta || cobroAbierto) return
      if (evento.key === 'F2') {
        evento.preventDefault()
        inputBusquedaRef.current?.focus()
      } else if (evento.key === 'F4') {
        evento.preventDefault()
        if (ticket.length > 0) setCobroAbierto(true)
      } else if (evento.key === 'Escape') {
        actualizarTicket(pestañaActivaId, () => [])
        setBusqueda('')
      }
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [modalAlta, cobroAbierto, ticket.length, actualizarTicket, pestañaActivaId])

  // Quita solo la línea a precio de lista: si el mismo producto está
  // además dentro de una promo, esa parte no se toca.
  function quitarProducto(productoId: number): void {
    actualizarTicket(pestañaActivaId, (actual) =>
      actual.filter((l) => !(l.producto_id === productoId && l.promocion_id == null))
    )
  }

  // Una promo se quita ENTERA, con todos sus productos juntos: no tiene
  // sentido vender "media promo".
  function quitarPromo(promocionId: number): void {
    actualizarTicket(pestañaActivaId, (actual) => actual.filter((l) => l.promocion_id !== promocionId))
  }

  // El texto se actualiza SIEMPRE con lo que se tipeó, aunque todavía no
  // sea un número válido ("0", "0,", etc.) — así la pantalla nunca
  // "pelea" con lo que la persona está escribiendo. La cantidad y el
  // subtotal (lo que realmente se cobra) solo se actualizan cuando el
  // texto ya es un número mayor a cero.
  // En un pesable lo tipeado viene en gramos/ml y se guarda en
  // kilos/litros, que es la unidad en la que está el precio; en un
  // producto por unidad se descartan los caracteres que no sean dígitos,
  // porque media lata de tomate no existe.
  function cambiarCantidadTexto(productoId: number, textoTipeado: string): void {
    actualizarTicket(pestañaActivaId, (actual) =>
      actual.map((l) => {
        if (l.producto_id !== productoId || l.promocion_id != null) return l

        // En un producto por unidad se corta en el primer separador
        // decimal en vez de sacarle los símbolos: si alguien tipea "2,5",
        // quedarse con "2" es lo esperable, mientras que limpiar los no
        // dígitos daría "25" — veinticinco latas por un error de tipeo.
        const texto = esPesable(l.producto.unidad)
          ? textoTipeado
          : textoTipeado.split(/[.,]/)[0].replace(/\D/g, '')
        const tecleado = aNumero(texto)

        if (texto.trim() === '' || !(tecleado > 0)) {
          return { ...l, cantidadTexto: texto }
        }
        const cantidad = aCantidadGuardada(tecleado, l.producto.unidad)
        return {
          ...l,
          cantidadTexto: texto,
          cantidad,
          subtotal: Math.round(cantidad * l.precio_unitario)
        }
      })
    )
  }

  // Si se deja el campo en un estado inválido (vacío, "0", "0,") al
  // salir del campo, vuelve a mostrar el último valor que sí se cobró
  // — nunca se manda a cobrar una cantidad en cero.
  function confirmarCantidadTexto(productoId: number): void {
    actualizarTicket(pestañaActivaId, (actual) =>
      actual.map((l) =>
        l.producto_id === productoId && l.promocion_id == null
          ? { ...l, cantidadTexto: textoCantidad(l.cantidad, l.producto.unidad) }
          : l
      )
    )
  }

  const total = ticket.reduce((acc, l) => acc + l.subtotal, 0)
  const filasVisibles = agruparParaPantalla(ticket)

  async function confirmarCobro(
    pagos: { medio_pago_id: number; monto: number }[],
    clienteId: number | null
  ): Promise<void> {
    const venta = await window.api.ventas.registrar({
      // producto / cantidadTexto / promocion_veces son de la pantalla, no
      // de la venta: se descartan antes de mandar. Los ítems que se
      // guardan siguen siendo uno por producto, también en las promos,
      // para que el stock y el costo de cada uno queden bien.
      items: ticket.map(
        ({
          producto: _producto,
          cantidadTexto: _cantidadTexto,
          promocion_veces: _promocionVeces,
          ...item
        }) => item
      ),
      pagos,
      cliente_id: clienteId
    })

    if (imprimirTicket) {
      setUltimaVenta({
        id: venta.numero_caja,
        fecha: new Date().toISOString(),
        items: agruparParaTicket(ticket),
        pagos: pagos.map((p) => ({
          nombre: mediosPago.find((m) => m.id === p.medio_pago_id)?.nombre ?? 'Otro',
          monto: p.monto
        })),
        total
      })
    }

    actualizarTicket(pestañaActivaId, () => [])
    setCobroAbierto(false)
    setMensaje('Venta registrada.')
    setTimeout(() => setMensaje(null), 2500)
    if (caja) cargarVentasRecientes(caja.id)
    if (clienteId) window.api.clientes.listar().then(setClientes)
  }

  async function confirmarAnulacion(id: number): Promise<void> {
    if (!motivoAnulacion.trim()) return
    await window.api.ventas.anular(id, motivoAnulacion.trim())
    setAnulando(null)
    setMotivoAnulacion('')
    if (caja) cargarVentasRecientes(caja.id)
  }

  if (caja === undefined) {
    return <div className="venta venta--cargando">Cargando...</div>
  }

  if (caja === null) {
    return (
      <div className="venta venta--apertura">
        <div className="apertura-caja">
          <h2>No hay caja abierta</h2>
          <p>Antes de vender hay que abrir la caja con el monto que arranca el cajón.</p>
          <button className="boton boton--primario" onClick={onIrACaja}>
            Ir a Caja
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="venta">
      <div className="venta__principal">
        <div className="venta__pestañas">
          {pestañas.map((p, indice) => {
            const totalPestaña = p.ticket.reduce((acc, l) => acc + l.subtotal, 0)
            const pidiendoConfirmacion = pestañaCerrando === p.id
            return (
              <div
                key={p.id}
                className={`venta__pestaña ${p.id === pestañaActivaId ? 'venta__pestaña--activa' : ''}`}
              >
                <button
                  type="button"
                  className="venta__pestaña-boton"
                  onClick={() => cambiarPestañaActiva(p.id)}
                >
                  {/* Se numera por posición (1, 2, 3...), no por el "id"
                      interno: es para saber cuántas ventas hay abiertas
                      ahora, no un número de venta que tenga que persistir
                      — si se cierra la 2 de 4, la 3 pasa a llamarse 2. */}
                  Venta {indice + 1}
                  {p.ticket.length > 0 && (
                    <span className="venta__pestaña-total">{formatearPesos(totalPestaña)}</span>
                  )}
                </button>
                {/* Siempre queda al menos una pestaña: si es la única, no
                    tiene sentido ofrecer cerrarla (Esc ya vacía el ticket). */}
                {pestañas.length > 1 && (
                  <button
                    type="button"
                    className={`venta__pestaña-cerrar ${pidiendoConfirmacion ? 'venta__pestaña-cerrar--confirmar' : ''}`}
                    title={
                      pidiendoConfirmacion
                        ? 'Tiene productos cargados: tocá de nuevo para cerrar igual'
                        : 'Cerrar esta venta'
                    }
                    onClick={() => cerrarPestaña(p.id)}
                  >
                    {pidiendoConfirmacion ? '¿Cerrar?' : '×'}
                  </button>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="venta__pestaña-nueva"
            title="Nueva venta"
            onClick={nuevaPestaña}
          >
            +
          </button>
        </div>

        <div className="venta__buscador-contenedor">
          <input
            ref={inputBusquedaRef}
            className="venta__buscador"
            type="text"
            placeholder="Buscar por nombre... (F2) o escaneá"
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
            <ul className="venta__resultados">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      agregarAlTicket(p, pestañaActivaId)
                      setBusqueda('')
                      setResultados([])
                      inputBusquedaRef.current?.focus()
                    }}
                  >
                    <span>{p.nombre}</span>
                    <span>{formatearPesos(p.precio_venta)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {promociones.length > 0 && (
          <div className="venta__promos">
            {promociones.slice(0, MAX_PILDORAS_PROMO).map((promo) => (
              <button
                key={promo.id}
                className="venta__promo-boton"
                onClick={() => agregarPromoAlTicket(promo, pestañaActivaId)}
              >
                {promo.nombre} · {formatearPesos(promo.precio_promocional)}
              </button>
            ))}
            {promociones.length > MAX_PILDORAS_PROMO && (
              <div className="venta__promos-mas-contenedor">
                <button
                  className="venta__promo-boton venta__promo-boton--mas"
                  onClick={() => setBuscadorPromosAbierto((v) => !v)}
                >
                  <Tag size={14} />
                  Ver más promos ({promociones.length - MAX_PILDORAS_PROMO})
                </button>
                {buscadorPromosAbierto && (
                  <div className="venta__promos-buscador">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Buscar promoción..."
                      value={busquedaPromo}
                      onChange={(e) => setBusquedaPromo(e.target.value)}
                    />
                    <ul>
                      {promociones
                        .filter((p) => p.nombre.toLowerCase().includes(busquedaPromo.trim().toLowerCase()))
                        .map((promo) => (
                          <li key={promo.id}>
                            <button
                              onClick={() => {
                                agregarPromoAlTicket(promo, pestañaActivaId)
                                setBusquedaPromo('')
                                setBuscadorPromosAbierto(false)
                              }}
                            >
                              <span>{promo.nombre}</span>
                              <span>{formatearPesos(promo.precio_promocional)}</span>
                            </button>
                          </li>
                        ))}
                      {promociones.filter((p) =>
                        p.nombre.toLowerCase().includes(busquedaPromo.trim().toLowerCase())
                      ).length === 0 && <li className="venta__promos-buscador-vacio">Sin resultados.</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="venta__tabla-contenedor">
          <table className="venta__ticket">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((fila) => {
                // Una promo ocupa UNA fila con su nombre y su precio: los
                // productos que la componen se listan abajo en chiquito,
                // sin precio propio, porque el reparto interno
                // ($16.800 + $4.200) no le dice nada a nadie.
                if (fila.tipo === 'promo') {
                  const faltantes = fila.lineas.filter(
                    (l) => l.producto.controla_stock === 1 && l.cantidad > l.producto.stock
                  )
                  return (
                    <tr key={`promo-${fila.promocion_id}`}>
                      <td>
                        <span className="venta__promo-titulo">{fila.nombre}</span>
                        <span className="venta__etiqueta-promo">Promo</span>
                        <span className="venta__promo-detalle">
                          {fila.lineas
                            .map(
                              (l) =>
                                `${l.nombre} (${formatearCantidadVenta(l.cantidad, l.producto.unidad)})`
                            )
                            .join(' + ')}
                        </span>
                        {faltantes.map((l) => (
                          <span key={l.producto_id} className="venta__aviso-stock">
                            {`${l.nombre}: ${leyendaStock(l.producto)}`}
                            <button
                              type="button"
                              className="venta__corregir-stock"
                              onClick={() =>
                                pedirNuevoStock(l.producto, l.cantidad, (actualizado) =>
                                  actualizarTicket(pestañaActivaId, (actual) =>
                                    actual.map((x) =>
                                      x.producto_id === l.producto_id &&
                                      x.promocion_id === fila.promocion_id
                                        ? { ...x, producto: actualizado }
                                        : x
                                    )
                                  )
                                )
                              }
                            >
                              Corregir stock
                            </button>
                          </span>
                        ))}
                      </td>
                      <td>{fila.veces}</td>
                      <td>{formatearPesos(fila.precio_unitario)}</td>
                      <td>{formatearPesos(fila.subtotal)}</td>
                      <td>
                        <button
                          className="boton boton--chico"
                          onClick={() => quitarPromo(fila.promocion_id)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  )
                }

                const linea = fila.linea
                const stockInsuficiente =
                  linea.producto.controla_stock === 1 && linea.cantidad > linea.producto.stock
                return (
                  <tr key={`producto-${linea.producto_id}`}>
                    <td>
                      {linea.nombre}
                      {stockInsuficiente && (
                        <span className="venta__aviso-stock">
                          {leyendaStock(linea.producto)}
                          <button
                            type="button"
                            className="venta__corregir-stock"
                            onClick={() =>
                              pedirNuevoStock(linea.producto, linea.cantidad, (actualizado) =>
                                actualizarTicket(pestañaActivaId, (actual) =>
                                  actual.map((l) =>
                                    l.producto_id === linea.producto_id && l.promocion_id == linea.promocion_id
                                      ? { ...l, producto: actualizado }
                                      : l
                                  )
                                )
                              )
                            }
                          >
                            Corregir stock
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      {/* Campo libre siempre, también para productos por
                          unidad: antes era un <select> con tantas opciones
                          como stock hubiera, y eso impedía justo el caso
                          real —tengo 1 cargado en el sistema y necesito
                          vender 2 porque el segundo está en el mostrador—
                          sin más salida que volver a escanear. */}
                      <input
                        className="venta__input-cantidad"
                        type="text"
                        inputMode={esPesable(linea.producto.unidad) ? 'decimal' : 'numeric'}
                        value={linea.cantidadTexto}
                        onChange={(e) => cambiarCantidadTexto(linea.producto_id, e.target.value)}
                        onFocus={seleccionarTodoAlEnfocar}
                        onBlur={() => confirmarCantidadTexto(linea.producto_id)}
                        data-cantidad-id={linea.producto_id}
                      />
                      {esPesable(linea.producto.unidad) && (
                        <span className="venta__unidad-cantidad">
                          {unidadChica(linea.producto.unidad)}
                        </span>
                      )}
                    </td>
                    <td>{formatearPesos(linea.precio_unitario)}</td>
                    <td>{formatearPesos(linea.subtotal)}</td>
                    <td>
                      <button
                        className="boton boton--chico"
                        onClick={() => quitarProducto(linea.producto_id)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
              {ticket.length === 0 && (
                <tr>
                  <td colSpan={5} className="venta__vacio">
                    El ticket está vacío. Escaneá o buscá un producto (F2).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sinStock && (
          <div className="venta__sin-stock">
            <p className="venta__sin-stock-texto">
              {sinStock.disponible <= 0
                ? `"${sinStock.producto.nombre}" figura sin stock.`
                : `De "${sinStock.producto.nombre}" quedan ${formatearCantidadVenta(sinStock.disponible, sinStock.producto.unidad)}, necesitás ${formatearCantidadVenta(sinStock.cantidadNecesaria, sinStock.producto.unidad)}.`}{' '}
              Si lo tenés en el estante, cargá la cantidad real
              {esPesable(sinStock.producto.unidad)
                ? ` (en ${unidadChica(sinStock.producto.unidad)})`
                : ''}
              :
            </p>
            <div className="venta__sin-stock-form">
              <input
                type="text"
                inputMode="decimal"
                placeholder={
                  esPesable(sinStock.producto.unidad)
                    ? `Stock real en ${unidadChica(sinStock.producto.unidad)}`
                    : 'Stock real'
                }
                value={stockCorregido}
                onChange={(e) => setStockCorregido(e.target.value)}
                onFocus={seleccionarTodoAlEnfocar}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmarNuevoStock()
                  }
                }}
                autoFocus
              />
              <button
                className="boton boton--chico boton--primario"
                disabled={guardandoStock}
                onClick={confirmarNuevoStock}
              >
                {guardandoStock ? 'Guardando...' : 'Actualizar stock'}
              </button>
              <button
                className="boton boton--chico"
                onClick={() => {
                  setSinStock(null)
                  setStockCorregido('')
                }}
              >
                Cancelar
              </button>
            </div>
            {errorStockCorregido && (
              <p className="venta__sin-stock-error">{errorStockCorregido}</p>
            )}
          </div>
        )}

        {(mensaje || ultimaVenta) && (
          <div className="venta__mensaje">
            <span>{mensaje || `Última venta: #${ultimaVenta?.id}`}</span>
            {ultimaVenta && (
              <button className="boton boton--chico" onClick={() => window.print()}>
                Imprimir ticket
              </button>
            )}
          </div>
        )}

        <div className="venta__barra-total">
          <span className="venta__total">{formatearPesos(total)}</span>
          <label className="venta__check-ticket">
            <input
              type="checkbox"
              checked={imprimirTicket}
              onChange={(e) => setImprimirTicket(e.target.checked)}
            />
            Imprimir ticket al cobrar
          </label>
          <button
            className="boton boton--primario boton--grande"
            disabled={ticket.length === 0}
            onClick={() => setCobroAbierto(true)}
          >
            Cobrar (F4)
          </button>
        </div>
      </div>

      <aside className="venta__lateral">
        <h3>Ventas de hoy</h3>
        <ul className="venta__recientes">
          {ventasRecientes.map((v) => (
            <li key={v.id} className={v.estado === 'ANULADA' ? 'venta__reciente--anulada' : ''}>
              {anulando === v.id ? (
                <div className="venta__anular-form">
                  <input
                    type="text"
                    placeholder="Motivo de la anulación"
                    value={motivoAnulacion}
                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                    autoFocus
                  />
                  <div className="venta__anular-botones">
                    <button className="boton boton--chico" onClick={() => setAnulando(null)}>
                      Cancelar
                    </button>
                    <button
                      className="boton boton--chico boton--primario"
                      disabled={!motivoAnulacion.trim()}
                      onClick={() => confirmarAnulacion(v.id)}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="venta__reciente-id">#{v.numero_caja}</span>
                  <span className="venta__reciente-total">{formatearPesos(v.total)}</span>
                  {v.estado === 'COMPLETADA' ? (
                    <button className="boton boton--chico" onClick={() => setAnulando(v.id)}>
                      Anular
                    </button>
                  ) : (
                    <span className="venta__estado-anulada">Anulada</span>
                  )}
                </>
              )}
            </li>
          ))}
          {ventasRecientes.length === 0 && <li className="venta__vacio">Todavía no hay ventas.</li>}
        </ul>
      </aside>

      {modalAlta && (
        <ModalProducto
          producto={null}
          codigoInicial={modalAlta.codigoInicial}
          nombreInicial={modalAlta.nombreInicial}
          categorias={categorias}
          proveedores={proveedores}
          onProveedorCreado={(nuevo) =>
            setProveedores((actual) => [...actual, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
          }
          onGuardar={async (datos) => {
            const nuevo = await window.api.productos.crear(datos)
            agregarAlTicket(nuevo, pestañaActivaId)
            setModalAlta(null)
          }}
          onCancelar={() => setModalAlta(null)}
        />
      )}

      {cobroAbierto && (
        <ModalCobro
          total={total}
          clientes={clientes}
          onClienteCreado={(nuevo) => setClientes((actual) => [...actual, nuevo])}
          onConfirmar={confirmarCobro}
          onCancelar={() => setCobroAbierto(false)}
        />
      )}

      <TicketImpresion venta={ultimaVenta} />
    </div>
  )
}
