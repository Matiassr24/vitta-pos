/**
 * useEscaner — captura de lector de código de barras en React
 * ============================================================
 *
 * CÓMO FUNCIONA UN LECTOR USB
 * Un lector de código de barras USB es, para la computadora, un TECLADO.
 * No hay drivers ni librerías: cuando escaneás "7790040999107", el lector
 * "tipea" esos dígitos uno por uno y después manda un Enter.
 *
 * EL PROBLEMA
 * Si simplemente ponés un <input> y esperás el Enter, el sistema se rompe
 * apenas la cajera hace clic en cualquier otro lado: el foco se pierde y
 * el escaneo se va al vacío (o peor, al medio de otro campo de texto).
 *
 * LA SOLUCIÓN
 * Escuchar el teclado a nivel de TODO el documento y distinguir al lector
 * de una persona por la VELOCIDAD. Una persona tipea a ~150-300ms por
 * tecla; el lector manda las teclas a menos de 30ms. Nadie escribe 13
 * dígitos en 200 milisegundos.
 *
 * Con esto, la cajera puede estar en cualquier parte de la pantalla y
 * escanear: siempre se registra.
 *
 * USO:
 *   useEscaner({
 *     onEscaneo: (codigo) => agregarProductoAlTicket(codigo),
 *     activo: pantallaDeVentaVisible,
 *   });
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface OpcionesEscaner {
  /** Se dispara cuando se detecta un código completo. */
  onEscaneo: (codigo: string) => void;

  /** Desactivá el escáner cuando haya un modal abierto, por ejemplo. */
  activo?: boolean;

  /**
   * Milisegundos máximos entre tecla y tecla para considerarlo escáner.
   * 30-50ms anda bien con la mayoría de los lectores. Si tu lector
   * resulta ser lento, subilo a 80.
   */
  msEntreTeclas?: number;

  /** Códigos más cortos que esto se descartan (ruido). */
  largoMinimo?: number;

  /**
   * Ya NO hace falta para inputs/textareas: el hook los ignora a todos
   * automáticamente (ver más abajo por qué). Queda solo por si algún
   * día hace falta ignorar un elemento que no es un campo de texto
   * nativo (por ejemplo un <div contentEditable> con otro manejo).
   */
  ignorarSiEnfocado?: RefObject<HTMLElement | null>;
}

export function useEscaner({
  onEscaneo,
  activo = true,
  msEntreTeclas = 50,
  largoMinimo = 4,
  ignorarSiEnfocado,
}: OpcionesEscaner) {
  // Refs y no useState: esto cambia en cada tecla y no queremos
  // re-renderizar el componente 13 veces por escaneo.
  const buffer = useRef('');
  const ultimaTecla = useRef(0);

  // Guardamos el callback en una ref para no tener que re-suscribir
  // el listener cada vez que el componente padre se re-renderiza.
  const callback = useRef(onEscaneo);
  useEffect(() => {
    callback.current = onEscaneo;
  }, [onEscaneo]);

  useEffect(() => {
    if (!activo) return;

    function manejarTecla(e: KeyboardEvent) {
      // Si el foco está en CUALQUIER campo de texto, se ignora acá: ese
      // campo ya recibe las teclas del lector como si las tipeara una
      // persona, y sin este chequeo el código se procesaría dos veces —
      // una por el campo (que tiene su propio Enter), otra por este
      // hook escuchando en todo el documento. No hace falta registrar
      // cada input a mano (`ignorarSiEnfocado` queda como excepción
      // puntual, no como la regla): un campo nuevo queda protegido solo
      // con ser un <input>/<textarea>, sin tocar este archivo.
      // Encontrado el 2026-08-21 con el buscador de Productos, que no
      // tenía el chequeo puntual y por eso procesaba un escaneo dos
      // veces si el foco quedaba ahí.
      const activo = document.activeElement;
      const esCampoDeTexto =
        activo instanceof HTMLElement &&
        (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA' || activo.isContentEditable);
      if (esCampoDeTexto || (ignorarSiEnfocado && activo === ignorarSiEnfocado.current)) {
        return;
      }

      const ahora = Date.now();
      const delta = ahora - ultimaTecla.current;
      ultimaTecla.current = ahora;

      // Si pasó mucho tiempo desde la tecla anterior, era una persona
      // tipeando. Se descarta lo acumulado y se empieza de cero.
      if (delta > msEntreTeclas) {
        buffer.current = '';
      }

      // Enter = el lector terminó de mandar el código.
      if (e.key === 'Enter') {
        const codigo = buffer.current;
        buffer.current = '';

        if (codigo.length >= largoMinimo) {
          // preventDefault evita que ese Enter además dispare el botón
          // que casualmente tenía el foco.
          e.preventDefault();
          callback.current(codigo);
        }
        return;
      }

      // Solo nos interesan caracteres imprimibles sueltos.
      // Ignoramos Shift, Tab, F5, flechas, etc.
      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    }

    document.addEventListener('keydown', manejarTecla);
    return () => document.removeEventListener('keydown', manejarTecla);
  }, [activo, msEntreTeclas, largoMinimo, ignorarSiEnfocado]);
}

/* ============================================================
 * EJEMPLO DE USO EN LA PANTALLA DE VENTA
 * ============================================================
 *
 * function PantallaVenta() {
 *   const [ticket, setTicket] = useState<ItemTicket[]>([]);
 *   const [modalAbierto, setModalAbierto] = useState(false);
 *   const [codigoDesconocido, setCodigoDesconocido] = useState<string|null>(null);
 *
 *   async function procesarCodigo(codigo: string) {
 *     const producto = await window.api.buscarPorCodigo(codigo);
 *
 *     if (!producto) {
 *       // Producto nuevo: NO frenamos la venta, abrimos el alta rápida.
 *       setCodigoDesconocido(codigo);
 *       sonido('error');
 *       return;
 *     }
 *
 *     sonido('ok');
 *     setTicket(prev => sumarAlTicket(prev, producto));
 *   }
 *
 *   useEscaner({
 *     onEscaneo: procesarCodigo,
 *     activo: !modalAbierto,   // el modal maneja su propio input
 *   });
 *
 *   return ( ... );
 * }
 *
 * ============================================================
 * DETALLES QUE HACEN LA DIFERENCIA EN EL MOSTRADOR
 * ============================================================
 *
 * 1. SONIDO. Un beep agudo cuando el producto se encontró y uno grave
 *    cuando no. La cajera no mira la pantalla mientras escanea, escucha.
 *    Se hace con un <audio> o con la Web Audio API, dos líneas.
 *
 * 2. FEEDBACK VISUAL GRANDE. Que el último producto agregado aparezca
 *    destacado, con nombre y precio en letra grande. Si escaneó dos veces
 *    sin querer, tiene que verlo al instante.
 *
 * 3. CÓDIGO DESCONOCIDO = ALTA RÁPIDA, NO ERROR. Un modal con tres
 *    campos (nombre, costo, precio autocompletado con +35%) y Enter.
 *    Quince segundos y se sigue vendiendo. Así se carga el catálogo solo.
 *
 * 4. ESCANEO REPETIDO SUMA CANTIDAD. Si escanea tres yogures iguales,
 *    debe quedar "Yogur x3" en una línea, no tres líneas.
 *
 * 5. TECLADO ANTES QUE MOUSE. F2 buscar por nombre, F4 cobrar,
 *    Esc cancelar. En el mostrador el mouse es lento.
 *
 * ============================================================
 * CÓMO PROBARLO SIN TENER TODAVÍA EL ESCÁNER
 * ============================================================
 *
 * No hace falta el lector para desarrollar. Como es un teclado, podés
 * simularlo pegando un código en un input y apretando Enter (el paste +
 * Enter llega igual de rápido que el lector), o con este snippet en la
 * consola del navegador:
 *
 *   function simularEscaneo(codigo) {
 *     [...codigo, 'Enter'].forEach(k => {
 *       document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
 *     });
 *   }
 *   simularEscaneo('7790040999107');
 *
 * ============================================================
 * QUÉ LECTOR COMPRAR
 * ============================================================
 *
 * - Interfaz: USB, "plug and play", modo HID / emulación de teclado.
 *   (Es el modo por defecto de prácticamente todos. Evitá los que solo
 *   funcionan por puerto serie o los Bluetooth con app propia.)
 * - Tipo: láser 1D alcanza y sobra para códigos de productos. Si querés
 *   leer también QR o códigos de pantallas de celular, buscá 2D / imager.
 * - Formato: de gatillo con soporte de mesa es lo más cómodo para
 *   mostrador (podés dejarlo parado y pasarle el producto por delante,
 *   o levantarlo para cosas pesadas).
 * - Marcas seguras: Honeywell, Zebra/Symbol, Datalogic. Los genéricos de
 *   Mercado Libre suelen andar bien igual; el riesgo real es la duración
 *   del cable, no la lectura.
 *
 * IMPORTANTE AL RECIBIRLO: verificá que esté configurado para agregar
 * ENTER (CR) al final de cada lectura. Viene así de fábrica casi siempre;
 * si no, se configura escaneando un código de barras que trae el manual.
 * Sin ese Enter, este hook no dispara nunca.
 *
 * TEST DE 30 SEGUNDOS AL DESEMPACARLO: abrí el Bloc de notas, escaneá
 * cualquier producto. Si aparece el número y el cursor baja de línea,
 * está todo listo. Si aparece el número pero no baja, falta configurar
 * el Enter. Si no aparece nada, es un problema de cable o de modo.
 */
