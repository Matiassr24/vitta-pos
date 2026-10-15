import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import './InputMonto.css'

// Campo de plata: el "$" va dentro del recuadro, contra el borde
// izquierdo. Deja claro que lo que se escribe son pesos sin gastar una
// etiqueta aparte, y evita la duda de si un "1500" en un campo suelto
// son pesos, unidades o un porcentaje.
//
// El signo no recibe clicks (`pointer-events: none` en la CSS), así que
// tocarlo enfoca el input igual que tocar cualquier otra parte del
// campo, y tampoco se selecciona al arrastrar sobre el número.
export const InputMonto = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputMonto({ className = '', ...props }, ref) {
    return (
      <span className="input-monto">
        <span className="input-monto__signo" aria-hidden="true">
          $
        </span>
        <input ref={ref} className={`input-monto__campo ${className}`.trim()} {...props} />
      </span>
    )
  }
)
