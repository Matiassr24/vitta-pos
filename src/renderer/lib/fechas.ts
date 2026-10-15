// Siempre fecha LOCAL, nunca toISOString(): en Argentina (UTC-3) eso
// devuelve el día siguiente durante la noche (bug real que ya hubo en
// Reportes).
export function fechaLocalISO(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export function hoyISO(): string {
  return fechaLocalISO(new Date())
}

export function primerDiaDelMes(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

// La semana arranca el lunes, igual que en la agrupación por semana de
// los reportes (ver expresionPeriodo en services/reportes.ts).
export function lunesDeEstaSemana(): string {
  const fecha = new Date()
  const diasDesdeElLunes = (fecha.getDay() + 6) % 7
  fecha.setDate(fecha.getDate() - diasDesdeElLunes)
  return fechaLocalISO(fecha)
}
