# Hardware, operación diaria y backups

## 1. El escáner de código de barras

**La buena noticia**: un lector USB común (los de $20.000–$40.000 en cualquier casa de insumos) funciona como un **teclado**. No hay drivers, no hay librerías, no hay que programar nada especial. Lo enchufás y "tipea" el número del código seguido de un Enter.

Implicancias para el código:
- Alcanza con un `<input>` enfocado que escuche el evento `Enter`.
- **Truco**: mantené ese input siempre con el foco en la pantalla de venta. Si el usuario hace clic en otro lado y escanea, el código se pierde. Conviene un listener global de teclado que detecte ráfagas rápidas de dígitos (un humano no tipea 13 dígitos en 100 ms).
- Configurá el lector para que agregue sufijo Enter. Se hace escaneando un código de configuración del manual del propio lector.

### Productos sin código de barras
Pan, fiambre cortado, sueltos, fotocopias. Dos soluciones combinadas:
1. **Grilla de botones favoritos** en la pantalla de venta con los 12–20 más vendidos.
2. **Código interno corto** (PLU de 3–4 dígitos) que se tipea a mano.

### Balanzas con etiquetadora
Si en algún momento suman una balanza que imprime etiquetas, esas etiquetas usan EAN-13 que **empiezan con 2** y llevan el peso o el precio codificado adentro del propio número.

Formato típico: `2 PPPPP WWWWW C` → prefijo + código de producto + peso/precio + dígito verificador.

En el código conviene dejar preparado: si el código escaneado empieza con `2` y tiene 13 dígitos, se parsea distinto. Está el campo `prefijo_balanza` en la tabla `config` justamente para eso. No lo implementes en la v1, pero dejá el gancho.

---

## 2. Flujo diario que debería soportar el sistema

```
MAÑANA
 └─ Abrir caja
     └─ Ingresar el monto con el que arranca el cajón  → caja_sesiones.monto_inicial

DURANTE EL DÍA
 ├─ Vender             → ventas + venta_items + venta_pagos
 │                       + movimientos_stock (VENTA)
 │                       + movimientos_caja (INGRESO / VENTA)
 ├─ Pagar al proveedor → compras + compra_items
 │                       + movimientos_stock (COMPRA)
 │                       + movimientos_caja (EGRESO / COMPRA_STOCK)
 ├─ Gasto suelto       → movimientos_caja (EGRESO / GASTO)
 ├─ Retirar plata      → movimientos_caja (EGRESO / RETIRO)
 └─ Fiar / cobrar      → cuenta_corriente + actualiza clientes.saldo

NOCHE
 └─ Cerrar caja
     ├─ Contar el efectivo físico       → monto_declarado
     ├─ El sistema calcula lo esperado  → vista v_arqueo_caja
     └─ Guarda la diferencia            → diferencia
```

### La cuenta que buscás
- **Efectivo esperado en el cajón** = monto inicial + ingresos en efectivo − egresos en efectivo
- **Facturación del día** = suma de `ventas.total` (todos los medios de pago)
- **Ganancia bruta** = facturación − `ventas.costo_total`
- **Ganancia neta** = ganancia bruta − gastos del día (`movimientos_caja` con concepto `GASTO`)

Ojo con una confusión clásica: **reponer stock no es un gasto, es un cambio de forma**. La plata pasa de estar en el cajón a estar en el estante. Se convierte en gasto recién cuando ese producto se vende (y ahí aparece como `costo_total`). Si restás las compras de la ganancia del día que las hiciste, los números van a dar cualquier cosa.

---

## 3. Reglas de oro al escribir el código

### Todo lo que toca plata o stock va en una transacción
```ts
const registrarVenta = db.transaction((venta) => {
  // 1. insert ventas
  // 2. insert venta_items
  // 3. insert venta_pagos
  // 4. update productos.stock  (por cada item)
  // 5. insert movimientos_stock (por cada item)
  // 6. insert movimientos_caja
});
```
Si algo falla en el paso 5, `better-sqlite3` revierte todo. Sin transacción, un corte de luz en el momento justo deja stock descontado sin venta registrada.

### Nunca borres, anulá
Una venta mal cargada se marca `estado = 'ANULADA'` y se generan movimientos inversos. Nunca un `DELETE`. Si borrás, perdés la capacidad de explicar por qué la caja no cierra.

### Validá antes de vender
- ¿Hay caja abierta? Si no, no se puede vender.
- ¿Los pagos suman el total exacto?
- ¿Stock negativo? Advertí, pero **permitilo**. En un negocio real el stock del sistema y el del estante se desincronizan; bloquear la venta por eso es peor que dejar el número en rojo.

---

## 4. Backups (esto no es opcional)

**Estrategia de tres capas:**

1. **Al cerrar la app**: copia automática a `backups/vitta-YYYY-MM-DD.db`, manteniendo los últimos 30 días.
   Usá `VACUUM INTO` en vez de copiar el archivo a mano — te da una copia consistente aunque haya algo escribiendo:
   ```sql
   VACUUM INTO 'backups/vitta-2026-08-18.db';
   ```

2. **Nube**: que la carpeta `backups/` esté dentro de Google Drive o Dropbox sincronizado. Es gratis y se soluciona una sola vez.

3. **Pendrive**: una copia manual por semana. Sonará antiguo, pero es la única que sobrevive a que roben la notebook con la sesión de Drive abierta.

**Probá la restauración una vez.** Un backup que nunca restauraste es una suposición, no un backup.

---

## 5. Compras sugeridas de hardware

| Ítem | Necesidad | Comentario |
|---|---|---|
| Lector de código de barras USB | **Esencial** | Cualquier modelo láser o CCD con cable. Los de gatillo son más cómodos para el mostrador. |
| Estabilizador / UPS chico | **Muy recomendable** | Un corte de luz en medio de una venta es el escenario que más rompe bases de datos. |
| Cajón de dinero | Opcional | Los que se abren con el ticket necesitan impresora; sin impresora, uno manual anda igual. |
| Impresora térmica 58/80mm | Opcional | Recién si piden ticket. Se maneja bien desde Electron imprimiendo un HTML. |
| Segundo monitor | Opcional | Cómodo para tener venta y stock a la vez, pero no urgente. |

---

## 6. Cómo encarar la carga inicial del catálogo

No intentes cargar todo antes de arrancar. El plan que funciona:

1. **Semana 0**: cargá a mano los 50–80 productos que más rotan (gaseosas, yerba, pan, cigarrillos, lo que sea que se vende todos los días).
2. **Arrancá a usarlo** aunque esté incompleto.
3. **Alta al vuelo**: cuando se escanee un código desconocido, que se abra un modal chico pidiendo solo nombre, costo y precio. 15 segundos y se sigue vendiendo.
4. **Semanas 1 a 4**: el catálogo se completa solo con lo que realmente rota. Lo que nunca se escaneó, probablemente tampoco valía la pena cargar.

Si conseguís listas de precios en Excel de los proveedores, el importador CSV te ahorra días. Vale la pena construirlo temprano.
