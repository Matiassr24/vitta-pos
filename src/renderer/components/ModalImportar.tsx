import { useState } from 'react'
import type { FilaImportada, ResumenImportacion } from '../../shared/types'
import { formatearPesos } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { ModalFondo } from './ModalFondo'
import './Modal.css'
import './ModalImportar.css'

interface Props {
  onImportado: (cantidad: number) => void
  onCancelar: () => void
}

export function ModalImportar({ onImportado, onCancelar }: Props) {
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function descargarPlantilla(): Promise<void> {
    setError(null)
    try {
      const ruta = await window.api.importar.descargarPlantilla()
      if (ruta) setAviso(`Plantilla guardada en ${ruta}`)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la plantilla.'))
    }
  }

  async function elegirArchivo(): Promise<void> {
    setError(null)
    setAviso(null)
    setOcupado(true)
    try {
      const resultado = await window.api.importar.elegirArchivo()
      if (resultado) {
        setResumen(resultado.resumen)
        setNombreArchivo(resultado.ruta.split(/[\\/]/).pop() ?? resultado.ruta)
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo leer el archivo.'))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(): Promise<void> {
    if (!resumen) return
    setError(null)
    setOcupado(true)
    try {
      const cantidad = await window.api.importar.confirmar(resumen.filas)
      onImportado(cantidad)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo importar.'))
      setOcupado(false)
    }
  }

  const conError: FilaImportada[] = resumen?.filas.filter((f) => f.errores.length > 0) ?? []

  return (
    <ModalFondo onCancelar={onCancelar}>
      <div className="modal modal-importar">
        <h2>Importar productos desde Excel</h2>

        {!resumen && (
          <>
            <ol className="modal-importar__pasos">
              <li>
                Descargá la plantilla y completala con los productos.
                <button className="boton boton--chico" onClick={descargarPlantilla}>
                  Descargar plantilla
                </button>
              </li>
              <li>
                Cuando esté lista, elegí el archivo para revisarlo.
                <button className="boton boton--chico" disabled={ocupado} onClick={elegirArchivo}>
                  {ocupado ? 'Leyendo...' : 'Elegir archivo'}
                </button>
              </li>
            </ol>
            <p className="modal-importar__nota">
              Nada se guarda hasta que revises el resumen y confirmes.
            </p>
          </>
        )}

        {resumen && (
          <div className="modal-importar__resumen">
            <p className="modal-importar__archivo">{nombreArchivo}</p>

            <div className="modal-importar__contadores">
              <span className="modal-importar__ok">{resumen.validas} para importar</span>
              {resumen.conError > 0 && (
                <span className="modal-importar__mal">{resumen.conError} con problemas</span>
              )}
            </div>

            {(resumen.categoriasNuevas.length > 0 || resumen.proveedoresNuevos.length > 0) && (
              <div className="modal-importar__nuevos">
                {resumen.categoriasNuevas.length > 0 && (
                  <p>
                    <strong>Se van a crear estas categorías:</strong>{' '}
                    {resumen.categoriasNuevas.join(', ')}
                  </p>
                )}
                {resumen.proveedoresNuevos.length > 0 && (
                  <p>
                    <strong>Se van a crear estos proveedores:</strong>{' '}
                    {resumen.proveedoresNuevos.join(', ')}
                  </p>
                )}
                <small>Si alguno está mal escrito, corregilo en el Excel y volvé a elegir el archivo.</small>
              </div>
            )}

            {conError.length > 0 && (
              <div className="modal-importar__errores">
                <p className="modal-importar__errores-titulo">
                  Estas filas se van a saltear:
                </p>
                <ul>
                  {conError.slice(0, 12).map((f) => (
                    <li key={f.fila}>
                      <span className="modal-importar__fila">Fila {f.fila}</span>
                      <span className="modal-importar__fila-nombre">{f.nombre || '(sin nombre)'}</span>
                      <span>{f.errores.join('. ')}</span>
                    </li>
                  ))}
                </ul>
                {conError.length > 12 && (
                  <small>y {conError.length - 12} más.</small>
                )}
              </div>
            )}

            {resumen.validas > 0 && (
              <div className="modal-importar__tabla-contenedor">
                <table className="modal-importar__tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Costo</th>
                      <th>Venta</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.filas
                      .filter((f) => f.errores.length === 0)
                      .map((f) => (
                        <tr key={f.fila}>
                          <td>{f.nombre}</td>
                          <td>{f.categoria || '—'}</td>
                          <td>{formatearPesos(f.precio_costo)}</td>
                          <td>{formatearPesos(f.precio_venta)}</td>
                          <td>{f.stock}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {aviso && <div className="modal-importar__aviso">{aviso}</div>}
        {error && <div className="modal-importar__error">{error}</div>}

        <div className="modal__acciones">
          <button type="button" className="boton" onClick={onCancelar}>
            {resumen ? 'Cancelar' : 'Cerrar'}
          </button>
          {resumen && (
            <button
              type="button"
              className="boton boton--primario"
              disabled={ocupado || resumen.validas === 0}
              onClick={confirmar}
            >
              {ocupado ? 'Importando...' : `Importar ${resumen.validas} productos`}
            </button>
          )}
        </div>
      </div>
    </ModalFondo>
  )
}
