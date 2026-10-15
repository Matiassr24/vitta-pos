import { useEffect, useState } from 'react'
import { ShoppingCart, Wallet, Package, Truck, BarChart3, Users, UserCog, Tag } from 'lucide-react'
import { ProductosPage } from './pages/Productos'
import { VentaPage } from './pages/Venta'
import { CajaPage } from './pages/Caja'
import { ComprasPage } from './pages/Compras'
import { ClientesPage } from './pages/Clientes'
import { ReportesPage } from './pages/Reportes'
import { UsuariosPage } from './pages/Usuarios'
import { PromocionesPage } from './pages/Promociones'
import { PantallaLogin } from './components/PantallaLogin'
import type { Usuario } from '../shared/types'

type Pantalla =
  | 'venta'
  | 'productos'
  | 'caja'
  | 'compras'
  | 'clientes'
  | 'reportes'
  | 'usuarios'
  | 'promociones'

function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined)
  const [pantalla, setPantalla] = useState<Pantalla>('venta')

  useEffect(() => {
    window.api.usuarios.usuarioActivo().then(setUsuario)
  }, [])

  async function cerrarSesion(): Promise<void> {
    await window.api.usuarios.cerrarSesion()
    setUsuario(null)
    setPantalla('venta')
  }

  if (usuario === undefined) {
    return <div className="app-shell app-shell--cargando" />
  }

  if (usuario === null) {
    return <PantallaLogin onIngreso={setUsuario} />
  }

  const esAdmin = usuario.rol === 'ADMIN'

  return (
    <div className="app-shell">
      <nav className="app-nav">
        {/* Grupo de uso diario: lo que se toca en el mostrador. */}
        <button
          className={`app-nav__boton ${pantalla === 'venta' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('venta')}
        >
          <ShoppingCart size={16} />
          Venta
        </button>
        <button
          className={`app-nav__boton ${pantalla === 'caja' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('caja')}
        >
          <Wallet size={16} />
          Caja
        </button>
        <button
          className={`app-nav__boton ${pantalla === 'productos' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('productos')}
        >
          <Package size={16} />
          Productos
        </button>
        <button
          className={`app-nav__boton ${pantalla === 'compras' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('compras')}
        >
          <Truck size={16} />
          Compras
        </button>

        {/* Grupo ocasional: reportes y administración, no algo que se
            abra a cada rato durante una venta. */}
        <div className="app-nav__separador" />

        {esAdmin && (
          <button
            className={`app-nav__boton ${pantalla === 'reportes' ? 'app-nav__boton--activo' : ''}`}
            onClick={() => setPantalla('reportes')}
          >
            <BarChart3 size={16} />
            Reportes
          </button>
        )}
        <button
          className={`app-nav__boton ${pantalla === 'clientes' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('clientes')}
        >
          <Users size={16} />
          Clientes
        </button>
        {/* Promociones no está restringida: la cajera ya puede cargar
            productos y ponerles precio en Productos, así que negarle los
            combos sería incoherente. Además no expone nada de lo que el
            usuario quiso reservar para ADMIN (costos, ganancias,
            reportes): una promo son productos y un precio de venta. */}
        <button
          className={`app-nav__boton ${pantalla === 'promociones' ? 'app-nav__boton--activo' : ''}`}
          onClick={() => setPantalla('promociones')}
        >
          <Tag size={16} />
          Promociones
        </button>
        {esAdmin && (
          <button
            className={`app-nav__boton ${pantalla === 'usuarios' ? 'app-nav__boton--activo' : ''}`}
            onClick={() => setPantalla('usuarios')}
          >
            <UserCog size={16} />
            Usuarios
          </button>
        )}

        <div className="app-nav__usuario">
          <span className="app-nav__usuario-nombre">{usuario.nombre}</span>
          <button className="boton boton--chico boton--salir" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </nav>
      <div className="app-contenido">
        {pantalla === 'venta' && <VentaPage onIrACaja={() => setPantalla('caja')} />}
        {pantalla === 'caja' && <CajaPage esAdmin={esAdmin} />}
        {pantalla === 'compras' && <ComprasPage />}
        {pantalla === 'clientes' && <ClientesPage />}
        {pantalla === 'productos' && <ProductosPage />}
        {pantalla === 'reportes' && esAdmin && <ReportesPage />}
        {pantalla === 'usuarios' && esAdmin && <UsuariosPage />}
        {pantalla === 'promociones' && <PromocionesPage />}
      </div>
    </div>
  )
}

export default App
