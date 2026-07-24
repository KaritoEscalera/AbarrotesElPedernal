import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { BusinessApi } from '../../services/business-api';

Chart.register(...registerables);

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'anio' | 'personalizado';
type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Fiado' | 'Múltiple' | 'Otro';
interface Venta { ventaId: number; fecha: string; hora: number; total: number; costo: number; metodo: MetodoPago; categoria: string; producto: string; unidades: number; }
interface ProductoAnalisis { producto: string; categoria: string; stock: number; minimo: number; vendidos: number; precio: number; costo: number; diasSinVenta: number; merma: number; }
interface FiadoAnalisis { cliente: string; saldo: number; vencido: boolean; abonos: number; }
interface CierreCaja { id: number; responsable: string; fechaApertura: string; fechaCierre: string; esperado: number; contado: number; diferencia: number; observaciones: string | null; }
interface Recordatorio { tipo: string; titulo: string; detalle: string; nivel: 'URGENTE' | 'ATENCION'; ruta: string; }

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class EstadisticasPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(BusinessApi);
  @ViewChild('graficaVentas') graficaVentasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaPagos') graficaPagosRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaCategorias') graficaCategoriasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaHoras') graficaHorasRef!: ElementRef<HTMLCanvasElement>;

  periodoSeleccionado: Periodo = 'semana';
  fechaInicio = '';
  fechaFin = '';
  mensajeFechas = '';
  errorCarga = '';
  cargando = true;
  private graficas: Chart[] = [];
  private ventas: Venta[] = [];
  private temporizadorGraficas?: number;
  private vistaLista = false;

  productos: ProductoAnalisis[] = [];
  fiados: FiadoAnalisis[] = [];
  cierresCaja: CierreCaja[] = [];
  recordatorios: Recordatorio[] = [];

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
      this.ventas = datos.sales.map((v) => ({ ...v, hora: Number(v.hora), total: Number(v.total), costo: Number(v.costo), unidades: Number(v.unidades) }));
      this.productos = datos.products.map((p) => ({ ...p, stock: Number(p.stock), minimo: Number(p.minimo), vendidos: Number(p.vendidos), precio: Number(p.precio), costo: Number(p.costo), diasSinVenta: Number(p.diasSinVenta), merma: Number(p.merma) }));
      this.fiados = datos.credits.map((f) => ({ ...f, saldo: Number(f.saldo), vencido: Boolean(f.vencido), abonos: Number(f.abonos) }));
      this.cierresCaja = datos.cashClosures.map((c) => ({ ...c, esperado: Number(c.esperado), contado: Number(c.contado), diferencia: Number(c.diferencia) }));
      this.recordatorios = datos.reminders;
    } catch { this.errorCarga = 'No fue posible cargar las estadísticas desde MySQL.'; }
    finally { this.cargando = false; if(this.vistaLista)this.actualizarGraficas(); }
  }

  ngAfterViewInit(): void { this.vistaLista=true;if(!this.cargando)this.actualizarGraficas(); }

  get ventasFiltradas(): Venta[] {
    const [inicio, fin] = this.rangoActual();
    return this.ventas.filter((venta) => {
      const fecha = new Date(`${venta.fecha}T12:00:00`);
      return fecha >= inicio && fecha <= fin;
    });
  }

  get ventasPeriodoAnterior(): Venta[] {
    const [inicio, fin] = this.rangoActual();
    const duracion = fin.getTime() - inicio.getTime() + 86400000;
    const finAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(finAnterior.getTime() - duracion + 86400000);
    return this.ventas.filter((venta) => {
      const fecha = new Date(`${venta.fecha}T12:00:00`);
      return fecha >= inicioAnterior && fecha <= finAnterior;
    });
  }

  get operacionesFiltradas(): number { return new Set(this.ventasFiltradas.map((v) => v.ventaId)).size; }
  get operacionesPeriodoAnterior(): number { return new Set(this.ventasPeriodoAnterior.map((v) => v.ventaId)).size; }
  get totalVentas(): number { return this.sumar(this.ventasFiltradas, 'total'); }
  get costoVentas(): number { return this.sumar(this.ventasFiltradas, 'costo'); }
  get utilidad(): number { return this.totalVentas - this.costoVentas; }
  get margen(): number { return this.totalVentas ? (this.utilidad / this.totalVentas) * 100 : 0; }
  get ticketPromedio(): number { return this.operacionesFiltradas ? this.totalVentas / this.operacionesFiltradas : 0; }
  get variacionVentas(): number { return this.variacion(this.totalVentas, this.sumar(this.ventasPeriodoAnterior, 'total')); }
  get variacionOperaciones(): number { return this.variacion(this.operacionesFiltradas, this.operacionesPeriodoAnterior); }
  get variacionTicket(): number {
    const anterior = this.operacionesPeriodoAnterior ? this.sumar(this.ventasPeriodoAnterior, 'total') / this.operacionesPeriodoAnterior : 0;
    return this.variacion(this.ticketPromedio, anterior);
  }
  get totalFiado(): number { return this.fiados.reduce((suma, item) => suma + item.saldo, 0); }
  get carteraVencida(): number { return this.fiados.filter((item) => item.vencido).reduce((suma, item) => suma + item.saldo, 0); }
  get totalAbonos(): number { return this.fiados.reduce((suma, item) => suma + item.abonos, 0); }
  get productosProblematicos(): ProductoAnalisis[] { return this.productos.filter((item) => item.stock <= item.minimo || item.diasSinVenta >= 14 || item.merma >= 4); }
  get productosMasVendidos(): ProductoAnalisis[] {
    const unidades = new Map<string, number>();
    this.ventasFiltradas.forEach((v) => unidades.set(v.producto, (unidades.get(v.producto) ?? 0) + v.unidades));
    return this.productos.map((p) => ({ ...p, vendidos: unidades.get(p.producto) ?? 0 })).filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 5);
  }
  get cierresConDiferencia(): CierreCaja[] { return this.cierresCaja.filter((c) => Math.abs(c.diferencia) >= 0.01); }
  get diferenciaAcumulada(): number { return this.cierresCaja.reduce((s, c) => s + c.diferencia, 0); }
  get sinVentasPeriodo():boolean{return !this.cargando&&!this.errorCarga&&this.ventasFiltradas.length===0;}

  cambiarPeriodo(): void {
    this.mensajeFechas = '';
    if (this.periodoSeleccionado !== 'personalizado') this.actualizarGraficas();
  }

  aplicarFechas(): void {
    if (!this.fechaInicio || !this.fechaFin || this.fechaInicio > this.fechaFin) {
      this.mensajeFechas = 'Selecciona un rango de fechas válido.';
      return;
    }
    this.mensajeFechas = '';
    this.actualizarGraficas();
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

  exportarPdf(): void {
    const pdf = new jsPDF();
    pdf.setFontSize(17);
    pdf.text('Estadísticas - Abarrotes El Pedernal', 14, 18);
    pdf.setFontSize(10);
    pdf.text(`Ventas: ${this.moneda(this.totalVentas)} | Utilidad: ${this.moneda(this.utilidad)} | Margen: ${this.margen.toFixed(1)}%`, 14, 27);
    autoTable(pdf, { startY: 34, head: [['Producto', 'Categoría', 'Unidades', 'Stock', 'Margen']], body: this.productosMasVendidos.map((p) => [p.producto, p.categoria, p.vendidos, p.stock, `${(((p.precio - p.costo) / p.precio) * 100).toFixed(1)}%`]) });
    pdf.save('estadisticas-pedernal.pdf');
  }

  claseVariacion(valor: number): string { return valor >= 0 ? 'positive' : 'negative'; }
  moneda(valor: number): string { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor); }

  private actualizarGraficas(): void {
    if(this.temporizadorGraficas!==undefined)window.clearTimeout(this.temporizadorGraficas);
    this.graficas.forEach((grafica) => grafica.destroy());
    this.graficas = [];
    this.temporizadorGraficas=window.setTimeout(()=>{this.temporizadorGraficas=undefined;this.crearGraficas();});
  }

  private crearGraficas(): void {
    if (!this.graficaVentasRef||this.cargando||this.errorCarga||this.sinVentasPeriodo) return;
    const agrupadas = new Map<string, { ventas: number; costos: number }>();
    this.ventasFiltradas.forEach((venta) => {
      const actual = agrupadas.get(venta.fecha) ?? { ventas: 0, costos: 0 };
      actual.ventas += venta.total; actual.costos += venta.costo; agrupadas.set(venta.fecha, actual);
    });
    const fechas = [...agrupadas.keys()].sort();
    this.graficas.push(new Chart(this.graficaVentasRef.nativeElement, this.configLinea(fechas, fechas.map((f) => agrupadas.get(f)?.ventas ?? 0), fechas.map((f) => agrupadas.get(f)?.costos ?? 0))));

    const metodos: MetodoPago[] = ['Efectivo', 'Tarjeta', 'Transferencia', 'Fiado', 'Múltiple', 'Otro'];
    this.graficas.push(new Chart(this.graficaPagosRef.nativeElement, { type: 'doughnut', data: { labels: metodos, datasets: [{ data: metodos.map((m) => this.ventasFiltradas.filter((v) => v.metodo === m).reduce((s, v) => s + v.total, 0)), backgroundColor: ['#f57c1f', '#4a2c1d', '#f4a259', '#6bbf59', '#7b61a8', '#9a887a'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));

    const categorias = [...new Set(this.ventasFiltradas.map((v) => v.categoria))];
    this.graficas.push(new Chart(this.graficaCategoriasRef.nativeElement, { type: 'bar', data: { labels: categorias, datasets: [{ label: 'Ventas', data: categorias.map((c) => this.ventasFiltradas.filter((v) => v.categoria === c).reduce((s, v) => s + v.total, 0)), backgroundColor: '#f57c1f', borderRadius: 7 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } } }));

    const horas = Array.from({ length: 13 }, (_, i) => i + 8);
    this.graficas.push(new Chart(this.graficaHorasRef.nativeElement, { type: 'bar', data: { labels: horas.map((h) => `${h}:00`), datasets: [{ label: 'Ventas', data: horas.map((h) => this.ventasFiltradas.filter((v) => v.hora === h).reduce((s, v) => s + v.total, 0)), backgroundColor: '#4a2c1d', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
  }

  private configLinea(labels: string[], ventas: number[], costos: number[]): ChartConfiguration<'line'> {
    return { type: 'line', data: { labels, datasets: [{ label: 'Ventas', data: ventas, borderColor: '#f57c1f', backgroundColor: 'rgba(245,124,31,.15)', fill: true, tension: .3 }, { label: 'Costo vendido', data: costos, borderColor: '#4a2c1d', tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } };
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

  ngOnDestroy(): void { if(this.temporizadorGraficas!==undefined)window.clearTimeout(this.temporizadorGraficas);this.graficas.forEach((grafica) => grafica.destroy()); }
}
