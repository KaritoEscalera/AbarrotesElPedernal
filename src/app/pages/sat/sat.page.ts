import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { BusinessApi } from '../../services/business-api';

type Periodo = 'mensual' | 'anual' | 'personalizado';
type TipoMovimiento = 'Ingreso' | 'Egreso';
type EstadoDocumento = 'Vigente' | 'Pendiente' | 'Cancelado';
interface ConfiguracionFiscal { rfc: string; nombre: string; codigoPostal: string; tipoPersona: 'Física' | 'Moral'; regimen: string; tasaIsrEstimada: number; }
interface MovimientoFiscal { id: number; fecha: string; tipo: TipoMovimiento; concepto: string; categoria: string; metodoPago: string; referencia: string; subtotal: number; iva: number; retenciones: number; total: number; origen: 'Caja' | 'Manual'; }
interface DocumentoFiscal { id: number; fecha: string; tipo: string; uuid: string; folio: string; rfcEmisor: string; emisor: string; rfcReceptor: string; subtotal: number; iva: number; retenciones: number; total: number; metodoPago: string; formaPago: string; usoCfdi: string; regimenReceptor: string; estado: EstadoDocumento; xml: string; }
interface AlertaFiscal { fecha: string; titulo: string; detalle: string; nivel: 'normal' | 'urgente'; }
interface ClienteFiscal {id:number;nombre:string;telefono:string;rfc:string|null;codigoPostalFiscal:string|null;regimenFiscal:string|null;usoCfdi:string|null;}
interface VistaFactura {tipo:string;inicio:string;fin:string;ventas:Array<{id:number;folio:string;fecha:string;total:number}>;totals:{subtotal:number;descuento:number;impuestos:number;total:number};}
interface BorradorFactura {id:number;tipo:string;fechaInicio:string;fechaFin:string;rfcReceptor:string;receptor:string;subtotal:number;descuento:number;impuestos:number;total:number;estado:string;uuid:string|null;proveedorPac:string|null;fecha:string;ventas:number;}

@Component({
  selector: 'app-sat', templateUrl: './sat.page.html', styleUrls: ['./sat.page.scss'], standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class SatPage implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly claveMovimientos = 'satMovimientos';
  private readonly claveDocumentos = 'satDocumentos';

  periodoSeleccionado: Periodo = 'mensual';
  fechaInicio = '';
  fechaFin = '';
  mostrarConfiguracion = false;
  mostrarMovimiento = false;
  mensaje = '';
  esError = false;
  configuracion: ConfiguracionFiscal = { rfc: '', nombre: '', codigoPostal: '', tipoPersona: 'Física', regimen: '626', tasaIsrEstimada: 1 };
  movimientos: MovimientoFiscal[] = [];
  documentos: DocumentoFiscal[] = this.cargarDocumentos();
  nuevoMovimiento: MovimientoFiscal = this.movimientoVacio();
  pacConfigurado=false;
  clientesFiscales:ClienteFiscal[]=[];
  clienteFiscalId:number|null=null;
  facturaTipo:'GLOBAL'|'INDIVIDUAL'='GLOBAL';
  facturaInicio=this.fechaLocal(new Date(new Date().getFullYear(),new Date().getMonth(),1));
  facturaFin=this.fechaLocal(new Date());
  facturaClienteId:number|null=null;
  periodicidad='04';
  meses=String(new Date().getMonth()+1).padStart(2,'0');
  anio=new Date().getFullYear();
  vistaFactura:VistaFactura|null=null;
  borradores:BorradorFactura[]=[];

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.api.get<{ settings: null | { rfc:string; nombre:string; codigoPostal:string; tipoPersona:'FISICA'|'MORAL'; regimen:string; tasaIsr:number }; ledger: MovimientoFiscal[]; pac:{configured:boolean;provider:string|null} }>('fiscal');
      if (data.settings) this.configuracion = { ...data.settings, tipoPersona: data.settings.tipoPersona === 'MORAL' ? 'Moral' : 'Física', tasaIsrEstimada: Number(data.settings.tasaIsr) };
      this.movimientos = data.ledger.map(m => ({ ...m, subtotal:Number(m.subtotal), iva:Number(m.iva), retenciones:Number(m.retenciones), total:Number(m.total) }));
      this.pacConfigurado=data.pac.configured;
      await this.cargarFacturacion();
      if (!data.pac.configured) this.notificar('Control fiscal conectado a MySQL. La emisión CFDI permanece bloqueada hasta configurar un PAC.', false);
    } catch { this.notificar('No fue posible cargar el control fiscal desde MySQL.', true); }
  }
  get clienteFiscalSeleccionado():ClienteFiscal|undefined{return this.clientesFiscales.find(c=>c.id===Number(this.clienteFiscalId));}
  async guardarClienteFiscal():Promise<void>{const c=this.clienteFiscalSeleccionado;if(!c)return this.notificar('Selecciona un cliente.',true);try{await this.api.put(`clients/${c.id}/fiscal`,{nombre:c.nombre,rfc:c.rfc,codigoPostalFiscal:c.codigoPostalFiscal,regimenFiscal:c.regimenFiscal,usoCfdi:c.usoCfdi});this.notificar('Datos fiscales del receptor guardados.',false);}catch(e:unknown){const x=e as{error?:{error?:{error?:string}}};this.notificar(x.error?.error?.error??'Revisa los datos fiscales del cliente.',true);}}
  async previsualizarFactura():Promise<void>{try{const cliente=this.facturaTipo==='INDIVIDUAL'?`&clienteId=${this.facturaClienteId??''}`:'';const v=await this.api.get<VistaFactura>(`invoices/preview?tipo=${this.facturaTipo}&inicio=${this.facturaInicio}&fin=${this.facturaFin}${cliente}`);this.vistaFactura={...v,ventas:v.ventas.map(x=>({...x,total:Number(x.total)})),totals:{subtotal:Number(v.totals.subtotal),descuento:Number(v.totals.descuento),impuestos:Number(v.totals.impuestos),total:Number(v.totals.total)}};this.notificar(`${v.ventas.length} ventas disponibles para facturar.`,false);}catch{this.vistaFactura=null;this.notificar('No fue posible preparar la vista previa. Revisa periodo y cliente.',true);}}
  async crearBorradorFactura():Promise<void>{if(!this.vistaFactura?.ventas.length)return this.notificar('Primero genera una vista previa con ventas disponibles.',true);try{await this.api.post('invoices',{tipo:this.facturaTipo,inicio:this.facturaInicio,fin:this.facturaFin,clienteId:this.facturaClienteId,periodicidad:this.periodicidad,meses:this.meses,anio:this.anio});this.vistaFactura=null;await this.cargarFacturacion();this.notificar('Borrador fiscal creado y ventas relacionadas.',false);}catch(e:unknown){const x=e as{error?:{error?:{error?:string}}};this.notificar(x.error?.error?.error??'No fue posible crear el borrador.',true);}}
  async timbrarBorrador(f:BorradorFactura):Promise<void>{try{await this.api.post(`invoices/${f.id}/stamp`,{});this.notificar('Documento enviado al PAC.',false);}catch(e:unknown){const x=e as{error?:{error?:{error?:string}}};this.notificar(x.error?.error?.error??'El timbrado permanece bloqueado hasta configurar el PAC.',true);}}
  private async cargarFacturacion():Promise<void>{const [clientes,borradores]=await Promise.all([this.api.get<ClienteFiscal[]>('clients'),this.api.get<BorradorFactura[]>('invoices')]);this.clientesFiscales=clientes;this.borradores=borradores.map(f=>({...f,subtotal:Number(f.subtotal),descuento:Number(f.descuento),impuestos:Number(f.impuestos),total:Number(f.total),ventas:Number(f.ventas)}));}

  get movimientosFiltrados(): MovimientoFiscal[] { const [inicio, fin] = this.rango(); return this.movimientos.filter((m) => m.fecha >= inicio && m.fecha <= fin); }
  get documentosFiltrados(): DocumentoFiscal[] { const [inicio, fin] = this.rango(); return this.documentos.filter((d) => d.fecha >= inicio && d.fecha <= fin); }
  get ingresos(): number { return this.sumarMovimientos('Ingreso', 'total'); }
  get egresos(): number { return this.sumarMovimientos('Egreso', 'total'); }
  get utilidadContable(): number { return this.ingresos - this.egresos; }
  get ivaTrasladado(): number { return this.movimientosFiltrados.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + m.iva, 0); }
  get ivaAcreditable(): number { return this.documentosFiltrados.filter((d) => d.estado === 'Vigente').reduce((s, d) => s + d.iva, 0); }
  get retenciones(): number { return this.documentosFiltrados.reduce((s, d) => s + d.retenciones, 0); }
  get ivaEstimadoCargo(): number { return Math.max(0, this.ivaTrasladado - this.ivaAcreditable - this.retenciones); }
  get isrEstimado(): number {
    const base = this.configuracion.regimen === '626' ? Math.max(0, this.movimientosFiltrados.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + m.subtotal, 0)) : Math.max(0, this.utilidadContable);
    return base * (Math.max(0, this.configuracion.tasaIsrEstimada) / 100);
  }
  get pendientes(): number { return this.documentos.filter((d) => d.estado === 'Pendiente').length; }
  get movimientosSinComprobante(): MovimientoFiscal[] { return this.movimientosFiltrados.filter((m) => m.tipo === 'Egreso' && !this.documentos.some((d) => this.coincide(m, d))); }
  get documentosSinMovimiento(): DocumentoFiscal[] { return this.documentosFiltrados.filter((d) => d.estado !== 'Cancelado' && !this.movimientos.some((m) => this.coincide(m, d))); }
  get totalPublicoGeneral(): number { return this.movimientosFiltrados.filter((m) => m.tipo === 'Ingreso' && !this.documentos.some((d) => this.coincide(m, d))).reduce((s, m) => s + m.total, 0); }
  get alertas(): AlertaFiscal[] {
    const hoy = new Date(); const anio = hoy.getFullYear(); const mes = hoy.getMonth();
    return [
      { fecha: this.fechaLocal(new Date(anio, mes + 1, 17)), titulo: 'Pago mensual estimado', detalle: 'Verifica la fecha exacta y obligaciones activas en el portal del SAT.', nivel: 'urgente' },
      { fecha: this.fechaLocal(new Date(anio, mes + 1, 3)), titulo: 'Revisar factura global', detalle: `${this.moneda(this.totalPublicoGeneral)} en operaciones sin CFDI relacionado.`, nivel: 'normal' },
      { fecha: this.fechaLocal(new Date(anio, mes + 1, 5)), titulo: 'Conciliar CFDI recibidos', detalle: `${this.movimientosSinComprobante.length + this.documentosSinMovimiento.length} diferencias por revisar.`, nivel: 'normal' },
    ];
  }

  async guardarConfiguracion(): Promise<void> {
    this.configuracion.rfc = this.configuracion.rfc.trim().toUpperCase();
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(this.configuracion.rfc) || !/^\d{5}$/.test(this.configuracion.codigoPostal) || !this.configuracion.nombre.trim() || !this.configuracion.regimen) { this.notificar('Revisa RFC, nombre, código postal y régimen fiscal.', true); return; }
    try { await this.api.put('fiscal', { ...this.configuracion, tipoPersona: this.configuracion.tipoPersona === 'Moral' ? 'MORAL' : 'FISICA', tasaIsr: this.configuracion.tasaIsrEstimada }); this.mostrarConfiguracion = false; this.notificar('Configuración fiscal guardada en MySQL.', false); }
    catch { this.notificar('No fue posible guardar la configuración fiscal.', true); }
  }

  guardarMovimiento(): void {
    const m = this.nuevoMovimiento; m.subtotal = Number(m.subtotal); m.iva = Number(m.iva); m.retenciones = Number(m.retenciones); m.total = Number(m.total || m.subtotal + m.iva - m.retenciones);
    if (!m.fecha || !m.concepto.trim() || !m.categoria.trim() || m.subtotal <= 0 || m.total <= 0) { this.notificar('Completa fecha, concepto, categoría e importes válidos.', true); return; }
    m.id = this.siguienteId(this.movimientos); this.movimientos = [{ ...m }, ...this.movimientos]; this.guardarMovimientos(); this.nuevoMovimiento = this.movimientoVacio(); this.mostrarMovimiento = false; this.registrarBitacora(`Registró movimiento fiscal ${m.referencia || m.concepto}`); this.notificar('Movimiento registrado y persistido.', false);
  }

  importarXml(evento: Event): void {
    const input = evento.target as HTMLInputElement; const archivos = Array.from(input.files ?? []);
    if (!archivos.length) return;
    Promise.all(archivos.slice(0, 20).map((archivo) => this.leerXml(archivo))).then((documentos) => {
      let agregados = 0;
      documentos.forEach((documento) => { if (!this.documentos.some((d) => d.uuid === documento.uuid && documento.uuid)) { documento.id = this.siguienteId(this.documentos); this.documentos.unshift(documento); agregados += 1; } });
      this.guardarDocumentos(); this.registrarBitacora(`Importó ${agregados} CFDI XML`); this.notificar(`${agregados} CFDI importados; ${documentos.length - agregados} duplicados omitidos.`, false); input.value = '';
    }).catch((error) => { this.notificar(error instanceof Error ? error.message : 'No fue posible importar los XML.', true); input.value = ''; });
  }

  cambiarEstado(documento: DocumentoFiscal): void { documento.estado = documento.estado === 'Pendiente' ? 'Vigente' : documento.estado === 'Vigente' ? 'Cancelado' : 'Pendiente'; this.guardarDocumentos(); this.registrarBitacora(`Cambió estado local del CFDI ${documento.uuid || documento.folio} a ${documento.estado}`); }

  exportarResumen(): void {
    const pdf = new jsPDF(); pdf.setFontSize(17); pdf.text('Control fiscal - Abarrotes El Pedernal', 14, 18); pdf.setFontSize(9); pdf.text('Documento de trabajo. No es declaración, CFDI ni acuse del SAT.', 14, 25);
    pdf.text(`RFC: ${this.configuracion.rfc || 'Sin configurar'} | Ingresos: ${this.moneda(this.ingresos)} | IVA estimado a cargo: ${this.moneda(this.ivaEstimadoCargo)}`, 14, 32);
    autoTable(pdf, { startY: 39, head: [['Fecha', 'Tipo', 'Concepto', 'Referencia', 'Total']], body: this.movimientosFiltrados.map((m) => [m.fecha, m.tipo, m.concepto, m.referencia, this.moneda(m.total)]) }); pdf.save('control-fiscal-pedernal.pdf');
  }

  exportarContabilidadXml(): void {
    const contenido = `<?xml version="1.0" encoding="UTF-8"?>\n<ControlContable sistema="AbarrotesElPedernal" rfc="${this.escapar(this.configuracion.rfc)}" periodo="${this.periodoSeleccionado}" noOficial="true">\n${this.movimientosFiltrados.map((m) => `  <Movimiento fecha="${m.fecha}" tipo="${m.tipo}" referencia="${this.escapar(m.referencia)}" total="${m.total.toFixed(2)}" />`).join('\n')}\n</ControlContable>`;
    this.descargar('control-contable-no-oficial.xml', contenido, 'application/xml'); this.notificar('XML de trabajo descargado. No corresponde al Anexo 24 ni puede enviarse directamente al SAT.', false);
  }

  private leerXml(archivo: File): Promise<DocumentoFiscal> {
    if (!archivo.name.toLowerCase().endsWith('.xml') || archivo.size > 3 * 1024 * 1024) return Promise.reject(new Error('Cada CFDI debe ser XML y medir menos de 3 MB.'));
    return archivo.text().then((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error(`XML inválido: ${archivo.name}`);
      const comprobante = doc.documentElement; if (!comprobante.localName.toLowerCase().includes('comprobante')) throw new Error(`${archivo.name} no parece ser un CFDI.`);
      const emisor = this.buscar(doc, 'Emisor'); const receptor = this.buscar(doc, 'Receptor'); const timbre = this.buscar(doc, 'TimbreFiscalDigital'); const impuestos = this.buscar(doc, 'Impuestos');
      const total = this.numeroAtributo(comprobante, 'Total'); const subtotal = this.numeroAtributo(comprobante, 'SubTotal'); const iva = this.numeroAtributo(impuestos, 'TotalImpuestosTrasladados'); const retenciones = this.numeroAtributo(impuestos, 'TotalImpuestosRetenidos');
      return { id: 0, fecha: (this.atributo(comprobante, 'Fecha') || new Date().toISOString()).slice(0, 10), tipo: this.atributo(comprobante, 'TipoDeComprobante') || 'I', uuid: this.atributo(timbre, 'UUID').toUpperCase(), folio: [this.atributo(comprobante, 'Serie'), this.atributo(comprobante, 'Folio')].filter(Boolean).join('-'), rfcEmisor: this.atributo(emisor, 'Rfc').toUpperCase(), emisor: this.atributo(emisor, 'Nombre'), rfcReceptor: this.atributo(receptor, 'Rfc').toUpperCase(), subtotal, iva, retenciones, total, metodoPago: this.atributo(comprobante, 'MetodoPago'), formaPago: this.atributo(comprobante, 'FormaPago'), usoCfdi: this.atributo(receptor, 'UsoCFDI'), regimenReceptor: this.atributo(receptor, 'RegimenFiscalReceptor'), estado: 'Pendiente' as const, xml };
    });
  }

  private cargarMovimientos(): MovimientoFiscal[] {
    let manuales: MovimientoFiscal[] = []; try { manuales = JSON.parse(localStorage.getItem(this.claveMovimientos) ?? '[]') as MovimientoFiscal[]; } catch { manuales = []; }
    let caja: Array<{ id: number; tipo: string; descripcion: string; monto: number; fecha: string }> = []; try { caja = JSON.parse(localStorage.getItem('movimientosCaja') ?? '[]') as typeof caja; } catch { caja = []; }
    const importados = caja.filter((m) => ['Efectivo', 'Tarjeta', 'Fiado'].includes(m.tipo)).map((m) => ({ id: -m.id, fecha: m.fecha, tipo: 'Ingreso' as const, concepto: m.descripcion, categoria: 'Ventas por clasificar', metodoPago: m.tipo, referencia: `CAJA-${m.id}`, subtotal: m.monto, iva: 0, retenciones: 0, total: m.monto, origen: 'Caja' as const }));
    return [...manuales, ...importados.filter((m) => !manuales.some((item) => item.referencia === m.referencia))];
  }
  private cargarDocumentos(): DocumentoFiscal[] { try { const datos = JSON.parse(localStorage.getItem(this.claveDocumentos) ?? '[]') as DocumentoFiscal[]; return Array.isArray(datos) ? datos : []; } catch { return []; } }
  private guardarMovimientos(): void { localStorage.setItem(this.claveMovimientos, JSON.stringify(this.movimientos.filter((m) => m.origen === 'Manual'))); }
  private guardarDocumentos(): void { localStorage.setItem(this.claveDocumentos, JSON.stringify(this.documentos)); }
  private movimientoVacio(): MovimientoFiscal { return { id: 0, fecha: this.fechaLocal(new Date()), tipo: 'Egreso', concepto: '', categoria: '', metodoPago: 'Transferencia', referencia: '', subtotal: 0, iva: 0, retenciones: 0, total: 0, origen: 'Manual' }; }
  private rango(): [string, string] { const hoy = new Date(); let inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1); let fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); if (this.periodoSeleccionado === 'anual') { inicio = new Date(hoy.getFullYear(), 0, 1); fin = new Date(hoy.getFullYear(), 11, 31); } if (this.periodoSeleccionado === 'personalizado' && this.fechaInicio && this.fechaFin) return [this.fechaInicio, this.fechaFin]; return [this.fechaLocal(inicio), this.fechaLocal(fin)]; }
  private sumarMovimientos(tipo: TipoMovimiento, campo: 'total'): number { return this.movimientosFiltrados.filter((m) => m.tipo === tipo).reduce((s, m) => s + m[campo], 0); }
  private coincide(m: MovimientoFiscal, d: DocumentoFiscal): boolean { const refs = [d.uuid, d.folio].filter(Boolean).map((v) => v.toLowerCase()); return refs.some((ref) => m.referencia.toLowerCase().includes(ref)) || Math.abs(m.total - d.total) < .01 && m.fecha === d.fecha; }
  private siguienteId(lista: Array<{ id: number }>): number { const positivos = lista.map((item) => item.id).filter((id) => id > 0); return positivos.length ? Math.max(...positivos) + 1 : 1; }
  private buscar(doc: Document, nombre: string): Element | null { return Array.from(doc.getElementsByTagName('*')).find((el) => el.localName === nombre) ?? null; }
  private atributo(elemento: Element | null, nombre: string): string { if (!elemento) return ''; return Array.from(elemento.attributes).find((a) => a.localName.toLowerCase() === nombre.toLowerCase())?.value ?? ''; }
  private numeroAtributo(elemento: Element | null, nombre: string): number { return Number(this.atributo(elemento, nombre)) || 0; }
  private fechaLocal(fecha: Date): string { return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`; }
  private moneda(valor: number): string { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor); }
  private escapar(valor: string): string { return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  private descargar(nombre: string, contenido: string, tipo: string): void { const url = URL.createObjectURL(new Blob([contenido], { type: tipo })); const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url); }
  private registrarBitacora(accion: string): void { let eventos: unknown[] = []; try { eventos = JSON.parse(localStorage.getItem('bitacora') ?? '[]') as unknown[]; } catch { eventos = []; } eventos.unshift({ fecha: new Date().toISOString(), usuario: localStorage.getItem('usuario'), accion, modulo: 'SAT' }); localStorage.setItem('bitacora', JSON.stringify(eventos)); }
  private notificar(mensaje: string, error: boolean): void { this.mensaje = mensaje; this.esError = error; }
}
