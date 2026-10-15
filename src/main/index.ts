import { app, BrowserWindow, Menu, screen, shell } from 'electron'
import { join } from 'path'
import { cerrarDb, hacerBackup, initDb } from './db'
import { registrarIpcProductos } from './ipc/productos'
import { registrarIpcCategorias } from './ipc/categorias'
import { registrarIpcCaja } from './ipc/caja'
import { registrarIpcMediosPago } from './ipc/mediosPago'
import { registrarIpcVentas } from './ipc/ventas'
import { registrarIpcProveedores } from './ipc/proveedores'
import { registrarIpcCompras } from './ipc/compras'
import { registrarIpcClientes } from './ipc/clientes'
import { registrarIpcReportes } from './ipc/reportes'
import { registrarIpcUsuarios } from './ipc/usuarios'
import { registrarIpcBackup } from './ipc/backup'
import { registrarIpcImportar } from './ipc/importar'
import { registrarIpcPromociones } from './ipc/promociones'

// Define el nombre de la app ANTES de whenReady: de esto depende que
// app.getPath('userData') apunte a %APPDATA%\Vitta y no a %APPDATA%\Electron.
app.setName('Vitta')

// Zoom manual: el atajo de zoom-in del menú por defecto de Electron
// (Ctrl+Plus) es poco confiable según el teclado (Windows suele mandar
// Ctrl+Shift+= en vez de un "+" literal), así que Ctrl+"-" funcionaba
// pero Ctrl+"+" no volvía a agrandar la letra. Se maneja a mano acá,
// escuchando la tecla real en vez de depender del acelerador del menú.
const PASO_ZOOM = 0.5
const ZOOM_MIN = -4
const ZOOM_MAX = 4

// Notebooks chicas (poca altura de pantalla, no ancho) muestran todo
// más grande de lo que entra cómodo: la modal de "Nuevo producto" en
// particular obligaba a scrollear todo el tiempo. Con Ctrl+"-" ya se
// arregla a mano, pero no hay por qué pedirle eso a la dueña — se
// calcula un factor de zoom de arranque según el alto real de la
// pantalla. Conservador a propósito (nunca baja de 90%): la letra
// grande de Reportes se pensó para gente mayor, y no tendría sentido
// que el arranque se la achique de nuevo sin que nadie lo pida.
// Con el alto típico de una notebook barata (1366x768, deja ~728px de
// área de trabajo) ya no hace falta ni este empujón: la modal de
// productos entra justa con el reacomodo de espacios de su CSS. Esto
// es la red de contención para pantallas todavía más chicas.
function factorZoomInicial(altoAreaDeTrabajo: number): number {
  return altoAreaDeTrabajo <= 700 ? 0.9 : 1
}

function crearVentana(): void {
  // 1280x800 fijo se pasaba de largo en pantallas más chicas que esa
  // (una notebook con 1366x768, por ejemplo): la ventana quedaba más
  // alta que el espacio visible y la barra de título con minimizar/
  // cerrar terminaba fuera de la vista. Se limita al área de trabajo
  // real de la pantalla principal (lo que excluye la barra de tareas).
  const areaDeTrabajo = screen.getPrimaryDisplay().workAreaSize
  const ancho = Math.min(1280, areaDeTrabajo.width)
  const alto = Math.min(800, areaDeTrabajo.height)

  const ventana = new BrowserWindow({
    width: ancho,
    height: alto,
    minWidth: Math.min(1024, areaDeTrabajo.width),
    minHeight: Math.min(700, areaDeTrabajo.height),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  ventana.on('ready-to-show', () => {
    ventana.show()
  })

  // setZoomFactor antes de cargar el contenido: así arranca ya en su
  // tamaño final, sin un parpadeo de "grande" y después "achicado".
  ventana.webContents.setZoomFactor(factorZoomInicial(areaDeTrabajo.height))
  // Ctrl+"0" vuelve a ESTE nivel (el pensado para la pantalla), no a
  // 100% a secas — en una pantalla chica, 100% es el mismo problema que
  // se estaba arreglando.
  const nivelZoomBase = ventana.webContents.getZoomLevel()

  // Con varios monitores, Electron a veces calcula mal el tamaño al
  // maximizar (usa las dimensiones de otro monitor, no el real donde
  // está la ventana) y termina más ancha que la pantalla, cortando el
  // botón de cerrar. Se guarda en qué monitor está mientras la ventana
  // está en tamaño normal, y al maximizar se fuerza ese tamaño real en
  // vez de confiar en el cálculo automático.
  let pantallaActual = screen.getDisplayMatching(ventana.getBounds())

  ventana.on('move', () => {
    if (!ventana.isMaximized()) {
      pantallaActual = screen.getDisplayMatching(ventana.getBounds())
    }
  })

  ventana.on('maximize', () => {
    ventana.setBounds(pantallaActual.workArea)
  })

  ventana.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ventana.webContents.on('before-input-event', (_evento, input) => {
    if (input.type !== 'keyDown' || !input.control) return

    if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') {
      const nivel = ventana.webContents.getZoomLevel()
      ventana.webContents.setZoomLevel(Math.min(ZOOM_MAX, nivel + PASO_ZOOM))
    } else if (input.key === '-' || input.code === 'NumpadSubtract') {
      const nivel = ventana.webContents.getZoomLevel()
      ventana.webContents.setZoomLevel(Math.max(ZOOM_MIN, nivel - PASO_ZOOM))
    } else if (input.key === '0') {
      ventana.webContents.setZoomLevel(nivelZoomBase)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    ventana.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    ventana.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // No se usa ningún menú propio, y el de Electron por defecto es el
  // que traía el atajo de zoom que fallaba — se saca del todo.
  Menu.setApplicationMenu(null)
  initDb()
  registrarIpcProductos()
  registrarIpcCategorias()
  registrarIpcCaja()
  registrarIpcMediosPago()
  registrarIpcVentas()
  registrarIpcProveedores()
  registrarIpcCompras()
  registrarIpcClientes()
  registrarIpcReportes()
  registrarIpcUsuarios()
  registrarIpcBackup()
  registrarIpcImportar()
  registrarIpcPromociones()
  crearVentana()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  hacerBackup()
  cerrarDb()
})
