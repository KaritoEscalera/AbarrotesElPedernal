import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

Chart.register(...registerables);

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'anio' | 'personalizado';
type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Fiado';
interface Venta { fecha: string; hora: number; total: number; costo: number; metodo: MetodoPago; categoria: string; producto: string; unidades: number; }
interface ProductoAnalisis { producto: string; categoria: string; stock: number; minimo: number; vendidos: number; precio: number; costo: number; diasSinVenta: number; merma: number; }
interface FiadoAnalisis { cliente: string; saldo: number; vencido: boolean; abonos: number; }

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class EstadisticasPage implements AfterViewInit, OnDestroy {
  @ViewChild('graficaVentas') graficaVentasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaPagos') graficaPagosRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaCategorias') graficaCategoriasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficaHoras') graficaHorasRef!: ElementRef<HTMLCanvasElement>;

  periodoSeleccionado: Periodo = 'semana';
  fechaInicio = '';
  fechaFin = '';
  mensajeFechas = '';
  private graficas: Chart[] = [];
  private ventas: Venta[] = this.cargarVentas();

  productos: ProductoAnalisis[] = [
    { producto: 'Coca-Cola 600 ml', categoria: 'Bebidas', stock: 28, minimo: 10, vendidos: 184, precio: 18, costo: 12, diasSinVenta: 0, merma: 2 },
    { producto: 'Leche Lala 1 L', categoria: 'Lácteos', stock: 7, minimo: 10, vendidos: 112, precio: 30, costo: 23, diasSinVenta: 1, merma: 5 },
    { producto: 'Sabritas Original', categoria: 'Botanas', stock: 3, minimo: 8, vendidos: 146, precio: 20, costo: 14, diasSinVenta: 0, merma: 1 },
    { producto: 'Pan Blanco Bimbo', categoria: 'Panadería', stock: 14, minimo: 6, vendidos: 89, precio: 45, costo: 34, diasSinVenta: 2, merma: 4 },
    { producto: 'Frijol a granel', categoria: 'Granel', stock: 0, minimo: 5, vendidos: 12, precio: 38, costo: 25, diasSinVenta: 18, merma: 3 },
  ];

  fiados: FiadoAnalisis[] = [
    { cliente: 'Juan Pérez', saldo: 350, vencido: false, abonos: 150 },
    { cliente: 'María López', saldo: 280, vencido: true, abonos: 0 },
    { cliente: 'Ana Martínez', saldo: 190, vencido: true, abonos: 230 },
  ];

  ngAfterViewInit(): void { this.actualizarGraficas(); }

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

  get totalVentas(): number { return this.sumar(this.ventasFiltradas, 'total'); }
  get costoVentas(): number { return this.sumar(this.ventasFiltradas, 'costo'); }
  get gastos(): number { return this.totalVentas * 0.06; }
  get utilidad(): number { return this.totalVentas - this.costoVentas - this.gastos; }
  get margen(): number { return this.totalVentas ? (this.utilidad / this.totalVentas) * 100 : 0; }
  get ticketPromedio(): number { return this.ventasFiltradas.length ? this.totalVentas / this.ventasFiltradas.length : 0; }
  get variacionVentas(): number { return this.variacion(this.totalVentas, this.sumar(this.ventasPeriodoAnterior, 'total')); }
  get variacionOperaciones(): number { return this.variacion(this.ventasFiltradas.length, this.ventasPeriodoAnterior.length); }
  get variacionTicket(): number {
    const anterior = this.ventasPeriodoAnterior.length ? this.sumar(this.ventasPeriodoAnterior, 'total') / this.ventasPeriodoAnterior.length : 0;
    return this.variacion(this.ticketPromedio, anterior);
  }
  get totalFiado(): number { return this.fiados.reduce((suma, item) => suma + item.saldo, 0); }
  get carteraVencida(): number { return this.fiados.filter((item) => item.vencido).reduce((suma, item) => suma + item.saldo, 0); }
  get totalAbonos(): number { return this.fiados.reduce((suma, item) => suma + item.abonos, 0); }
  get productosProblematicos(): ProductoAnalisis[] { return this.productos.filter((item) => item.stock <= item.minimo || item.diasSinVenta >= 14 || item.merma >= 4); }
  get productosMasVendidos(): ProductoAnalisis[] { return [...this.productos].sort((a, b) => b.vendidos - a.vendidos).slice(0, 5); }

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
    this.graficas.forEach((grafica) => grafica.destroy());
    this.graficas = [];
    setTimeout(() => this.crearGraficas());
  }

  private crearGraficas(): void {
    if (!this.graficaVentasRef) return;
    const agrupadas = new Map<string, { ventas: number; costos: number }>();
    this.ventasFiltradas.forEach((venta) => {
      const actual = agrupadas.get(venta.fecha) ?? { ventas: 0, costos: 0 };
      actual.ventas += venta.total; actual.costos += venta.costo; agrupadas.set(venta.fecha, actual);
    });
    const fechas = [...agrupadas.keys()].sort();
    this.graficas.push(new Chart(this.graficaVentasRef.nativeElement, this.configLinea(fechas, fechas.map((f) => agrupadas.get(f)?.ventas ?? 0), fechas.map((f) => agrupadas.get(f)?.costos ?? 0))));

    const metodos: MetodoPago[] = ['Efectivo', 'Tarjeta', 'Transferencia', 'Fiado'];
    this.graficas.push(new Chart(this.graficaPagosRef.nativeElement, { type: 'doughnut', data: { labels: metodos, datasets: [{ data: metodos.map((m) => this.ventasFiltradas.filter((v) => v.metodo === m).reduce((s, v) => s + v.total, 0)), backgroundColor: ['#f57c1f', '#4a2c1d', '#f4a259', '#6bbf59'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));

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

  private cargarVentas(): Venta[] {
    const hoy = new Date();
    const productos = [
      ['Coca-Cola 600 ml', 'Bebidas', 18, 12], ['Sabritas Original', 'Botanas', 20, 14], ['Leche Lala 1 L', 'Lácteos', 30, 23], ['Pan Blanco Bimbo', 'Panadería', 45, 34], ['Frijol a granel', 'Granel', 38, 25],
    ] as const;
    const ventas: Venta[] = [];
    for (let dias = 0; dias < 370; dias += 1) {
      const fecha = new Date(hoy); fecha.setDate(fecha.getDate() - dias);
      const cantidad = dias < 40 ? 4 + (dias % 4) : 1;
      for (let i = 0; i < cantidad; i += 1) {
        const producto = productos[(dias + i) % productos.length];
        const unidades = 1 + ((dias + i) % 5);
        ventas.push({ fecha: this.fechaIsoLocal(fecha), hora: 8 + ((dias * 3 + i * 2) % 13), total: producto[2] * unidades, costo: producto[3] * unidades, metodo: (['Efectivo', 'Tarjeta', 'Transferencia', 'Fiado'] as MetodoPago[])[(dias + i) % 4], categoria: producto[1], producto: producto[0], unidades });
      }
    }
    try {
      const movimientos = JSON.parse(localStorage.getItem('movimientosCaja') ?? '[]') as Array<{ tipo: string; descripcion: string; monto: number; fecha: string }>;
      movimientos.filter((m) => ['Efectivo', 'Tarjeta', 'Fiado'].includes(m.tipo)).forEach((m) => ventas.push({ fecha: m.fecha, hora: 12, total: m.monto, costo: m.monto * .65, metodo: m.tipo as MetodoPago, categoria: 'Venta general', producto: m.descripcion, unidades: 1 }));
    } catch { /* Conserva los datos base si el almacenamiento está dañado. */ }
    return ventas;
  }

  private fechaIsoLocal(fecha: Date): string {
    const anio = fecha.getFullYear(); const mes = String(fecha.getMonth() + 1).padStart(2, '0'); const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  ngOnDestroy(): void { this.graficas.forEach((grafica) => grafica.destroy()); }
}
