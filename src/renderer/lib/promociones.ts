export interface ComponentePromo {
  precio_venta: number
  cantidad: number
}

export interface ComponenteDistribuido {
  subtotal: number
  precio_unitario: number
}

// Reparte el precio de la promo entre sus componentes, proporcional al
// precio normal de cada uno — así el producto más caro se lleva más
// parte del "descuento", no un reparto parejo sin sentido. El último
// componente se lleva el resto exacto, para garantizar que la suma
// siempre da el precio de la promo, en pesos enteros (nunca "casi").
export function distribuirPrecioPromo<T extends ComponentePromo>(
  items: T[],
  precioPromocional: number
): (T & ComponenteDistribuido)[] {
  const valores = items.map((it) => it.precio_venta * it.cantidad)
  const totalNormal = valores.reduce((a, b) => a + b, 0)
  let acumulado = 0

  return items.map((it, i) => {
    let subtotal: number
    if (i === items.length - 1) {
      subtotal = precioPromocional - acumulado
    } else {
      subtotal =
        totalNormal > 0
          ? Math.round((precioPromocional * valores[i]) / totalNormal)
          : Math.round(precioPromocional / items.length)
      acumulado += subtotal
    }
    return { ...it, subtotal, precio_unitario: Math.round(subtotal / it.cantidad) }
  })
}
