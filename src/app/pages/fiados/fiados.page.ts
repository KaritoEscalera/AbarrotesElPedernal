import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Auth } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';

interface Fiado {
  id: number;
  clienteId:number;
  cliente: string;
  telefono: string;
  deudaOriginal: number;
  saldoPendiente: number;
  ultimoAbono: number;
  limite: number;
  fechaRegistro: string;
  fechaLimite: string;
}
interface ClienteCredito { id:number; nombre:string; telefono:string; activo:boolean; }
interface EstadoCuenta { client:{id:number;nombre:string;telefono:string;limiteCredito:number;adeudo:number;saldoFavor:number}; credits:Array<{id:number;fechaRegistro:string;fechaLimite:string;deudaOriginal:number;saldoPendiente:number;estado:string;folio:string|null}>; payments:Array<{id:number;fiadoId:number;monto:number;metodo:string;referencia:string|null;fecha:string;usuario:string}>; balances:Array<{id:number;monto:number;montoUsado:number;disponible:number;estado:string;fecha:string}>; }

@Component({
  selector: 'app-fiados',
  templateUrl: './fiados.page.html',
  styleUrls: ['./fiados.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonSearchbar,
    IonSelect,
    IonSelectOption
  ]
})
export class FiadosPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly api = inject(BusinessApi);
  private readonly route = inject(ActivatedRoute);

  busqueda = '';
  filtroEstado = 'todos';
  nuevoFiadoVisible = false;

  fiadoSeleccionado: Fiado | null = null;
  cantidadAbono: number | null = null;
  metodoAbono: 'EFECTIVO'|'TARJETA'|'TRANSFERENCIA' = 'EFECTIVO';
  referenciaAbono = '';
  mensaje = '';
  cuentaSeleccionada:EstadoCuenta|null=null;

  rolActual = this.auth.obtenerRol() ?? 'cajera';
  nuevoFiadoForm = {
    clienteId: null as number | null,
    cliente: '',
    telefono: '',
    deudaOriginal: null as number | null,
    limite: null as number | null,
    fechaLimite: '',
  };

  fiados: Fiado[] = [];
  clientes: ClienteCredito[] = [];

  async ngOnInit(): Promise<void> {
    await Promise.all([this.cargarFiados(), this.cargarClientes()]);
    const clienteId = Number(this.route.snapshot.queryParamMap.get('cliente'));
    if (Number.isInteger(clienteId) && clienteId > 0) await this.enfocarCliente(clienteId);
  }
  seleccionarCliente():void{const c=this.clientes.find(x=>x.id===Number(this.nuevoFiadoForm.clienteId));if(c){this.nuevoFiadoForm.cliente=c.nombre;this.nuevoFiadoForm.telefono=c.telefono;}}

  get fiadosFiltrados(): Fiado[] {
    const texto = this.busqueda.toLowerCase().trim();

    return this.fiados.filter((fiado) => {
      const coincideBusqueda =
        fiado.cliente.toLowerCase().includes(texto) ||
        fiado.telefono.includes(texto);

      const estado = this.obtenerEstado(fiado);

      const coincideEstado =
        this.filtroEstado === 'todos' ||
        this.filtroEstado === estado;

      return coincideBusqueda && coincideEstado;
    });
  }

  get totalPendiente(): number {
    return this.fiados.reduce(
      (total, fiado) => total + fiado.saldoPendiente,
      0
    );
  }

  get clientesConAdeudo(): number {
    return this.fiados.filter(
      fiado => fiado.saldoPendiente > 0
    ).length;
  }

  get cuentasLiquidadas(): number {
    return this.fiados.filter(
      fiado => fiado.saldoPendiente === 0
    ).length;
  }

  get puedeConfigurarLimite(): boolean {
    return this.rolActual === 'gerente' || this.rolActual === 'administrador';
  }

  abrirFormularioNuevoFiado(): void {
    this.nuevoFiadoVisible = true;
    this.mensaje = '';
  }

  cancelarNuevoFiado(): void {
    this.nuevoFiadoVisible = false;
    this.nuevoFiadoForm = {
      clienteId: null,
      cliente: '',
      telefono: '',
      deudaOriginal: null,
      limite: null,
      fechaLimite: '',
    };
    this.mensaje = '';
  }

  async guardarNuevoFiado(): Promise<void> {
    const cliente = this.nuevoFiadoForm.cliente?.trim();
    const telefono = this.nuevoFiadoForm.telefono?.trim();
    const deudaOriginal = Number(this.nuevoFiadoForm.deudaOriginal);
    const limite = Number(this.nuevoFiadoForm.limite);
    const fechaLimite = this.nuevoFiadoForm.fechaLimite?.trim();

    if (!cliente || !telefono || !deudaOriginal || !fechaLimite) {
      this.mensaje = 'Completa cliente, teléfono, deuda y fecha límite.';
      return;
    }

    if (deudaOriginal <= 0) {
      this.mensaje = 'La deuda original debe ser mayor a cero.';
      return;
    }

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (new Date(`${fechaLimite}T00:00:00`) < hoy) {
      this.mensaje = 'La fecha límite no puede estar en el pasado.';
      return;
    }

    if (this.puedeConfigurarLimite) {
      if (!limite || limite <= 0) {
        this.mensaje = 'El límite debe ser mayor a cero.';
        return;
      }
      if (deudaOriginal > limite) {
        this.mensaje = 'La deuda no puede superar el límite autorizado.';
        return;
      }
    }

    try { await this.api.post('credits', { clienteId:this.nuevoFiadoForm.clienteId, cliente, telefono, deudaOriginal, limite: this.puedeConfigurarLimite ? limite : 0, fechaLimite }); await this.cargarFiados(); this.cancelarNuevoFiado(); this.mensaje = 'Fiado registrado correctamente en MySQL.'; }
    catch (error: unknown) { const response = error as { error?: { error?: { error?: string } } }; this.mensaje = response.error?.error?.error ?? 'No fue posible registrar el fiado.'; }
  }

  obtenerEstado(fiado: Fiado): 'pendiente' | 'vencido' | 'liquidado' {
    if (fiado.saldoPendiente === 0) {
      return 'liquidado';
    }

    const fechaActual = new Date();
    const fechaLimite = new Date(`${fiado.fechaLimite}T23:59:59`);

    if (fechaLimite < fechaActual) {
      return 'vencido';
    }

    return 'pendiente';
  }

  abrirAbono(fiado: Fiado): void {
    this.fiadoSeleccionado = fiado;
    this.cantidadAbono = null;
    this.mensaje = '';
  }

  async guardarAbono(): Promise<void> {
    if (!this.fiadoSeleccionado) {
      return;
    }

    if (!this.cantidadAbono || this.cantidadAbono <= 0) {
      this.mensaje = 'Ingresa una cantidad válida.';
      return;
    }

    if (this.cantidadAbono > this.fiadoSeleccionado.saldoPendiente) {
      this.mensaje = 'El abono no puede ser mayor al saldo pendiente.';
      return;
    }
    if(this.metodoAbono!=='EFECTIVO'&&!this.referenciaAbono.trim()){this.mensaje='Captura la referencia del pago.';return;}

    const fiado={...this.fiadoSeleccionado};const monto=Number(this.cantidadAbono);const metodo=this.metodoAbono;const referencia=this.referenciaAbono.trim();
    try { const resultado=await this.api.post<{saldoPendiente:number}>(`credits/${fiado.id}/payments`, { monto, metodo, referencia:referencia||null }); await this.cargarFiados(); this.cancelarAbono(); this.mensaje = 'Abono registrado correctamente en MySQL.'; this.imprimirComprobante(fiado,monto,metodo,referencia,Number(resultado.saldoPendiente)); } catch { this.mensaje = 'No fue posible registrar el abono.'; }
  }

  cancelarAbono(): void {
    this.fiadoSeleccionado = null;
    this.cantidadAbono = null;
    this.metodoAbono = 'EFECTIVO';
    this.referenciaAbono = '';
    this.mensaje = '';
  }

  async verEstadoCuenta(fiado:Fiado):Promise<void>{await this.cargarEstadoCuenta(fiado.clienteId);}
  cerrarEstadoCuenta():void{this.cuentaSeleccionada=null;}
  recordarPorWhatsApp(fiado:Fiado):void{const telefono=fiado.telefono.replace(/\D/g,'');const texto=`Hola ${fiado.cliente}, te recordamos que tienes un saldo pendiente de $${fiado.saldoPendiente.toFixed(2)} en Abarrotes El Pedernal, con fecha límite ${fiado.fechaLimite}. Gracias.`;window.open(`https://wa.me/52${telefono}?text=${encodeURIComponent(texto)}`,'_blank','noopener');}
  imprimirEstadoCuenta():void{const cuenta=this.cuentaSeleccionada;if(!cuenta)return;const w=window.open('','_blank','width=700,height=800');if(!w){this.mensaje='Permite ventanas emergentes para imprimir.';return;}const filas=cuenta.credits.map(x=>`<tr><td>${new Date(x.fechaRegistro).toLocaleDateString('es-MX')}</td><td>${this.escapar(x.folio||`Fiado #${x.id}`)}</td><td>$${x.deudaOriginal.toFixed(2)}</td><td>$${x.saldoPendiente.toFixed(2)}</td><td>${this.escapar(x.estado)}</td></tr>`).join('');w.document.write(`<html><head><title>Estado de cuenta</title><style>body{font:14px Arial;margin:30px;color:#222}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.summary{display:flex;gap:25px}</style></head><body><h1>Abarrotes El Pedernal</h1><h2>Estado de cuenta · ${this.escapar(cuenta.client.nombre)}</h2><p>${this.escapar(cuenta.client.telefono)} · ${new Date().toLocaleString('es-MX')}</p><div class="summary"><b>Adeudo: $${cuenta.client.adeudo.toFixed(2)}</b><b>Límite de crédito: $${cuenta.client.limiteCredito.toFixed(2)}</b></div><table><thead><tr><th>Fecha</th><th>Folio</th><th>Importe</th><th>Pendiente</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
  private imprimirComprobante(fiado:Fiado,monto:number,metodo:string,referencia:string,saldo:number):void{const w=window.open('','_blank','width=400,height=650');if(!w){this.mensaje+=' Permite ventanas emergentes para imprimir el comprobante.';return;}w.document.write(`<html><head><title>Comprobante de abono</title><style>body{font:14px monospace;width:300px;margin:25px auto}h2,p{text-align:center}.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #aaa}</style></head><body><h2>Abarrotes El Pedernal</h2><p>COMPROBANTE DE ABONO<br>${new Date().toLocaleString('es-MX')}</p><div class="row"><span>Cliente</span><b>${this.escapar(fiado.cliente)}</b></div><div class="row"><span>Fiado</span><b>#${fiado.id}</b></div><div class="row"><span>Abono</span><b>$${monto.toFixed(2)}</b></div><div class="row"><span>Método</span><b>${this.escapar(metodo)}</b></div>${referencia?`<div class="row"><span>Referencia</span><b>${this.escapar(referencia)}</b></div>`:''}<div class="row"><span>Saldo restante</span><b>$${saldo.toFixed(2)}</b></div><p>Gracias por su pago</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
  private escapar(valor:unknown):string{return String(valor??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}

  private async enfocarCliente(clienteId:number):Promise<void>{
    const cliente=this.clientes.find(c=>c.id===clienteId);
    if(cliente)this.busqueda=cliente.nombre;
    await this.cargarEstadoCuenta(clienteId);
  }

  private async cargarEstadoCuenta(clienteId:number):Promise<void>{try{const cuenta=await this.api.get<EstadoCuenta>(`clients/${clienteId}/account`);this.cuentaSeleccionada={...cuenta,client:{...cuenta.client,limiteCredito:Number(cuenta.client.limiteCredito),adeudo:Number(cuenta.client.adeudo),saldoFavor:Number(cuenta.client.saldoFavor)},credits:cuenta.credits.map(x=>({...x,deudaOriginal:Number(x.deudaOriginal),saldoPendiente:Number(x.saldoPendiente)})),payments:cuenta.payments.map(x=>({...x,monto:Number(x.monto)})),balances:cuenta.balances.map(x=>({...x,monto:Number(x.monto),montoUsado:Number(x.montoUsado),disponible:Number(x.disponible)}))};}catch{this.mensaje='No fue posible consultar el estado de cuenta.';}}

  private async cargarFiados(): Promise<void> { try { const datos = await this.api.get<Fiado[]>('credits'); this.fiados = datos.map((f) => ({ ...f, deudaOriginal: Number(f.deudaOriginal), saldoPendiente: Number(f.saldoPendiente), ultimoAbono: Number(f.ultimoAbono), limite: Number(f.limite) })); } catch { this.mensaje = 'No fue posible consultar fiados en MySQL.'; } }
  private async cargarClientes():Promise<void>{try{this.clientes=(await this.api.get<ClienteCredito[]>('clients')).filter(c=>c.activo);}catch{this.clientes=[];}}
}
