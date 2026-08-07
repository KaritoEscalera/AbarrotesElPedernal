import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { descargarPdf } from '../../services/document-download';
import { BusinessApi } from '../../services/business-api';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'anio' | 'personalizado';
type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Fiado' | 'Múltiple' | 'Otro';
interface Venta { ventaId: number; fecha: string; hora: number; total: number; costo: number; metodo: MetodoPago; categoria: string; producto: string; unidades: number; }
interface ProductoAnalisis { producto: string; categoria: string; stock: number; minimo: number; vendidos: number; precio: number; costo: number|null; diasSinVenta: number; merma: number; }
type ProductoConCosto = ProductoAnalisis & { costo: number };
interface FiadoAnalisis { cliente: string; saldo: number; vencido: boolean; abonos: number; }
interface CierreCaja { id: number; responsable: string; fechaApertura: string; fechaCierre: string; esperado: number; contado: number; diferencia: number; observaciones: string | null; }
interface Recordatorio { tipo: string; titulo: string; detalle: string; nivel: 'URGENTE' | 'ATENCION'; ruta: string; }
interface BarraEstadistica { etiqueta: string; valor: number; porcentaje: number; secundario?: number; }

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class EstadisticasPage implements OnInit {
  private readonly api = inject(BusinessApi);

  periodoSeleccionado: Periodo = 'semana';
  fechaInicio = '';
  fechaFin = '';
  mensajeFechas = '';
  errorCarga = '';
  cargando = true;
  private ventas: Venta[] = [];
  private ventasActuales: Venta[] = [];
  private ventasAnteriores: Venta[] = [];
  private resumen = { operaciones: 0, operacionesAnteriores: 0, total: 0, costo: 0, totalAnterior: 0 };

  productos: ProductoAnalisis[] = [];
  fiados: FiadoAnalisis[] = [];
  cierresCaja: CierreCaja[] = [];
  recordatorios: Recordatorio[] = [];
  ventasPorDia: BarraEstadistica[] = [];
  ventasPorMetodo: BarraEstadistica[] = [];
  ventasPorCategoria: BarraEstadistica[] = [];
  ventasPorHora: BarraEstadistica[] = [];

  async ngOnInit(): Promise<void> {
    await this.cargarEstadisticas();
  }

  ionViewWillEnter():void {
    if(this.errorCarga&&!this.cargando)void this.cargarEstadisticas();
  }

  async cargarEstadisticas(): Promise<void> {
    this.cargando = true;
    this.errorCarga = '';
    try {
      const datos = await this.conTiempoLimite(this.api.get<{ sales: Venta[]; products: ProductoAnalisis[]; credits: FiadoAnalisis[]; cashClosures: CierreCaja[]; reminders: Recordatorio[] }>('analytics'), 15000);
      this.ventas = (datos.sales ?? []).map((v) => ({ ...v, hora: Number(v.hora), total: Number(v.total), costo: Number(v.costo), unidades: Number(v.unidades) }));
      this.productos = (datos.products ?? []).map((p) => ({ ...p, stock: Number(p.stock), minimo: Number(p.minimo), vendidos: Number(p.vendidos), precio: Number(p.precio), costo: p.costo===null?null:Number(p.costo), diasSinVenta: Number(p.diasSinVenta), merma: Number(p.merma) }));
      this.fiados = (datos.credits ?? []).map((f) => ({ ...f, saldo: Number(f.saldo), vencido: Boolean(f.vencido), abonos: Number(f.abonos) }));
      this.cierresCaja = (datos.cashClosures ?? []).map((c) => ({ ...c, esperado: Number(c.esperado), contado: Number(c.contado), diferencia: Number(c.diferencia) }));
      this.recordatorios = datos.reminders ?? [];
      this.recalcularPeriodo();
    } catch { this.errorCarga = 'No fue posible cargar las estadísticas desde MySQL.'; }
    finally { this.cargando = false; }
  }

  get ventasFiltradas(): Venta[] {
    return this.ventasActuales;
  }

  get ventasPeriodoAnterior(): Venta[] {
    return this.ventasAnteriores;
  }

  get operacionesFiltradas(): number { return this.resumen.operaciones; }
  get operacionesPeriodoAnterior(): number { return this.resumen.operacionesAnteriores; }
  get totalVentas(): number { return this.resumen.total; }
  get costoVentas(): number { return this.resumen.costo; }
  get utilidad(): number { return this.totalVentas - this.costoVentas; }
  get margen(): number { return this.totalVentas ? (this.utilidad / this.totalVentas) * 100 : 0; }
  get ticketPromedio(): number { return this.operacionesFiltradas ? this.totalVentas / this.operacionesFiltradas : 0; }
  get variacionVentas(): number { return this.variacion(this.totalVentas, this.resumen.totalAnterior); }
  get variacionOperaciones(): number { return this.variacion(this.operacionesFiltradas, this.operacionesPeriodoAnterior); }
  get variacionTicket(): number {
    const anterior = this.operacionesPeriodoAnterior ? this.resumen.totalAnterior / this.operacionesPeriodoAnterior : 0;
    return this.variacion(this.ticketPromedio, anterior);
  }
  get totalFiado(): number { return this.fiados.reduce((suma, item) => suma + item.saldo, 0); }
  get carteraVencida(): number { return this.fiados.filter((item) => item.vencido).reduce((suma, item) => suma + item.saldo, 0); }
  get totalAbonos(): number { return this.fiados.reduce((suma, item) => suma + item.abonos, 0); }
  get productosProblematicos(): ProductoConCosto[] { return this.productos.filter((item):item is ProductoConCosto => item.costo!==null&&(item.stock <= item.minimo || item.diasSinVenta >= 14 || item.merma >= 4)); }
  get productosMasVendidos(): ProductoConCosto[] {
    const unidades = new Map<string, number>();
    this.ventasFiltradas.forEach((v) => unidades.set(v.producto, (unidades.get(v.producto) ?? 0) + v.unidades));
    return this.productos.map((p) => ({ ...p, vendidos: unidades.get(p.producto) ?? 0 })).filter((p):p is ProductoConCosto => p.costo!==null&&p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 5);
  }
  get cierresConDiferencia(): CierreCaja[] { return this.cierresCaja.filter((c) => Math.abs(c.diferencia) >= 0.01); }
  get diferenciaAcumulada(): number { return this.cierresCaja.reduce((s, c) => s + c.diferencia, 0); }
  get sinVentasPeriodo():boolean{return !this.cargando&&!this.errorCarga&&this.ventasFiltradas.length===0;}

  cambiarPeriodo(): void {
    this.mensajeFechas = '';
    if (this.periodoSeleccionado !== 'personalizado') this.recalcularPeriodo();
  }

  aplicarFechas(): void {
    if (!this.fechaInicio || !this.fechaFin || this.fechaInicio > this.fechaFin) {
      this.mensajeFechas = 'Selecciona un rango de fechas válido.';
      return;
    }
    this.mensajeFechas = '';
    this.recalcularPeriodo();
  }

  exportarCsv(): void {
    const filas = [['Fecha', 'Hora', 'Producto', 'Categoría', 'Método', 'Venta', 'Costo'], ...this.ventasFiltradas.map((v) => [v.fecha, `${v.hora}:00`, v.producto, v.categoria, v.metodo, v.total, v.costo])];
    const csv = filas.map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(',')).join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    enlace.download = 'estadisticas-pedernal.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  async exportarPdf(): Promise<void> {
    const pdf = new jsPDF();
    pdf.setFontSize(17);
    pdf.text('Estadísticas - Abarrotes El Pedernal', 14, 18);
    pdf.setFontSize(10);
    pdf.text(`Ventas: ${this.moneda(this.totalVentas)} | Utilidad: ${this.moneda(this.utilidad)} | Margen: ${this.margen.toFixed(1)}%`, 14, 27);
    autoTable(pdf, { startY: 34, head: [['Producto', 'Categoría', 'Unidades', 'Stock', 'Margen']], body: this.productosMasVendidos.map((p) => [p.producto, p.categoria, p.vendidos, p.stock, p.costo===null?'Costo pendiente':`${(((p.precio - p.costo) / p.precio) * 100).toFixed(1)}%`]) });
    await descargarPdf(pdf, 'estadisticas-pedernal.pdf');
  }

  claseVariacion(valor: number): string { return valor >= 0 ? 'positive' : 'negative'; }
  moneda(valor: number): string { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor); }

  private recalcularVisualizaciones(): void {
    const agrupadas = new Map<string, { ventas: number; costos: number }>();
    const totalesMetodos = new Map<MetodoPago, number>();
    const totalesCategorias = new Map<string, number>();
    const totalesHoras = new Map<number, number>();
    this.ventasActuales.forEach((venta) => {
      const actual = agrupadas.get(venta.fecha) ?? { ventas: 0, costos: 0 };
      actual.ventas += venta.total; actual.costos += venta.costo; agrupadas.set(venta.fecha, actual);
      totalesMetodos.set(venta.metodo, (totalesMetodos.get(venta.metodo) ?? 0) + venta.total);
      totalesCategorias.set(venta.categoria, (totalesCategorias.get(venta.categoria) ?? 0) + venta.total);
      totalesHoras.set(venta.hora, (totalesHoras.get(venta.hora) ?? 0) + venta.total);
    });
    const metodos: MetodoPago[] = ['Efectivo', 'Tarjeta', 'Transferencia', 'Fiado', 'Múltiple', 'Otro'];
    this.ventasPorDia = this.crearBarras([...agrupadas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([etiqueta, datos]) => ({ etiqueta: this.fechaCorta(etiqueta), valor: datos.ventas, secundario: datos.costos })));
    this.ventasPorMetodo = this.crearBarras(metodos.map((etiqueta) => ({ etiqueta, valor: totalesMetodos.get(etiqueta) ?? 0 })).filter((item) => item.valor > 0));
    this.ventasPorCategoria = this.crearBarras([...totalesCategorias.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8));
    this.ventasPorHora = this.crearBarras([...totalesHoras.entries()].map(([hora, valor]) => ({ etiqueta: `${hora}:00`, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8));
  }

  private crearBarras(items: Array<Omit<BarraEstadistica, 'porcentaje'>>): BarraEstadistica[] {
    const maximo = Math.max(0, ...items.map((item) => item.valor));
    return items.map((item) => ({ ...item, porcentaje: maximo ? Math.max(3, item.valor / maximo * 100) : 0 }));
  }

  private fechaCorta(fecha: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(new Date(`${fecha}T12:00:00`));
  }

  private recalcularPeriodo(): void {
    const [inicio, fin] = this.rangoActual();
    const duracion = fin.getTime() - inicio.getTime() + 1;
    const finAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(finAnterior.getTime() - duracion + 1);
    this.ventasActuales = [];
    this.ventasAnteriores = [];
    for (const venta of this.ventas) {
      const tiempo = new Date(`${venta.fecha}T12:00:00`).getTime();
      if (tiempo >= inicio.getTime() && tiempo <= fin.getTime()) this.ventasActuales.push(venta);
      else if (tiempo >= inicioAnterior.getTime() && tiempo <= finAnterior.getTime()) this.ventasAnteriores.push(venta);
    }
    this.resumen = {
      operaciones: new Set(this.ventasActuales.map((v) => v.ventaId)).size,
      operacionesAnteriores: new Set(this.ventasAnteriores.map((v) => v.ventaId)).size,
      total: this.sumar(this.ventasActuales, 'total'),
      costo: this.sumar(this.ventasActuales, 'costo'),
      totalAnterior: this.sumar(this.ventasAnteriores, 'total'),
    };
    this.recalcularVisualizaciones();
  }

  private rangoActual(): [Date, Date] {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let inicio = new Date(hoy); let fin = new Date(hoy);
    if (this.periodoSeleccionado === 'ayer') { inicio.setDate(inicio.getDate() - 1); fin = new Date(inicio); }
    if (this.periodoSeleccionado === 'semana') inicio.setDate(inicio.getDate() - 6);
    if (this.periodoSeleccionado === 'mes') inicio.setDate(inicio.getDate() - 29);
    if (this.periodoSeleccionado === 'anio') inicio = new Date(hoy.getFullYear(), 0, 1);
    if (this.periodoSeleccionado === 'personalizado' && this.fechaInicio && this.fechaFin) { inicio = new Date(`${this.fechaInicio}T00:00:00`); fin = new Date(`${this.fechaFin}T23:59:59`); }
    fin.setHours(23, 59, 59, 999);
    return [inicio, fin];
  }

  private sumar(ventas: Venta[], campo: 'total' | 'costo'): number { return ventas.reduce((suma, venta) => suma + venta[campo], 0); }
  private variacion(actual: number, anterior: number): number { return anterior ? ((actual - anterior) / anterior) * 100 : actual ? 100 : 0; }
  private async conTiempoLimite<T>(peticion:Promise<T>,milisegundos:number):Promise<T>{
    let temporizador:number|undefined;
    try{return await Promise.race([peticion,new Promise<T>((_resolver,rechazar)=>{temporizador=window.setTimeout(()=>rechazar(new Error('Tiempo de espera agotado.')),milisegundos);})]);}
    finally{if(temporizador!==undefined)window.clearTimeout(temporizador);}
  }
}
