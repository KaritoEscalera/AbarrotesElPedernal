import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonContent, IonInput, IonItem, IonLabel, IonSearchbar, IonSelect, IonSelectOption
} from '@ionic/angular/standalone';
import type { Proveedor } from '../../models/proveedor';
import { Auth } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

type ErroresFormulario = Partial<Record<'nombre' | 'empresa' | 'telefono' | 'correo' | 'productoPrincipal' | 'diaEntrega', string>>;

@Component({
  selector: 'app-proveedores',
  templateUrl: './proveedores.page.html',
  styleUrls: ['./proveedores.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonInput, IonItem, IonLabel, IonSearchbar, IonSelect, IonSelectOption],
})
export class ProveedoresPage implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly auth = inject(Auth);

  busqueda = '';
  filtroEstado = 'Todos';
  mostrarFormulario = false;
  proveedorEditando: Proveedor | null = null;
  errores: ErroresFormulario = {};
  mensaje = '';
  formulario: Proveedor = this.crearProveedorVacio();
  proveedores: Proveedor[] = [];

  async ngOnInit(): Promise<void> { await this.recargar(); }

  get puedeAdministrar(): boolean {
    const rol = this.auth.obtenerRol();
    return rol === 'administrador' || rol === 'gerente';
  }

  get proveedoresVisibles(): Proveedor[] {
    return this.proveedores.filter((proveedor) => !proveedor.archivado);
  }

  get proveedoresFiltrados(): Proveedor[] {
    const texto = this.busqueda.toLowerCase().trim();
    return this.proveedoresVisibles.filter((proveedor) => {
      const coincideBusqueda = `${proveedor.nombre} ${proveedor.empresa} ${proveedor.productoPrincipal} ${proveedor.telefono} ${proveedor.correo}`.toLowerCase().includes(texto);
      return coincideBusqueda && (this.filtroEstado === 'Todos' || proveedor.estado === this.filtroEstado);
    });
  }

  get proveedoresActivos(): number {
    return this.proveedoresVisibles.filter((proveedor) => proveedor.estado === 'Activo').length;
  }

  get entregasProximas(): number {
    const limite = new Date();
    limite.setHours(23, 59, 59, 999);
    limite.setDate(limite.getDate() + 7);
    return this.proveedoresVisibles.filter((proveedor) => {
      const fecha = this.fechaLocal(proveedor.proximaEntrega);
      return fecha !== null && fecha <= limite && proveedor.estadoPedido === 'Pendiente';
    }).length;
  }

  get entregasAtrasadas(): number {
    return this.proveedoresVisibles.filter((proveedor) => this.pedidoAtrasado(proveedor)).length;
  }

  crearProveedorVacio(): Proveedor {
    return { id: 0, nombre: '', empresa: '', telefono: '', correo: '', productoPrincipal: '', diaEntrega: '', estado: 'Activo', ultimaCompra: '', proximaEntrega: '', estadoPedido: 'Sin pedido', saldoPendiente: 0, archivado: false };
  }

  abrirFormulario(): void {
    this.proveedorEditando = null;
    this.formulario = this.crearProveedorVacio();
    this.errores = {};
    this.mostrarFormulario = true;
  }

  editarProveedor(proveedor: Proveedor): void {
    this.proveedorEditando = proveedor;
    this.formulario = { ...proveedor };
    this.errores = {};
    this.mostrarFormulario = true;
  }

  async guardarProveedor(): Promise<void> {
    this.errores = this.validar();
    if (Object.keys(this.errores).length) return;

    this.formulario = {
      ...this.formulario,
      nombre: this.formulario.nombre.trim(),
      empresa: this.formulario.empresa.trim(),
      telefono: this.formulario.telefono.trim(),
      correo: this.formulario.correo.trim().toLowerCase(),
    };
    try { if (this.proveedorEditando) await this.api.put(`providers/${this.formulario.id}`, this.formulario); else await this.api.post('providers', this.formulario); await this.recargar(); this.mensaje = `Proveedor ${this.proveedorEditando ? 'actualizado' : 'registrado'} en MySQL.`; this.cancelarFormulario(); } catch { this.mensaje = 'No fue posible guardar el proveedor.'; }
  }

  async cambiarEstado(proveedor: Proveedor): Promise<void> {
    proveedor.estado = proveedor.estado === 'Activo' ? 'Inactivo' : 'Activo';
    try { await this.api.put(`providers/${proveedor.id}`, proveedor); await this.recargar(); this.mensaje = 'Estado actualizado en MySQL.'; } catch { this.mensaje = 'No fue posible actualizar el estado.'; }
  }

  async archivarProveedor(proveedor: Proveedor): Promise<void> {
    if (!confirm(`¿Deseas archivar a ${proveedor.empresa}? Su historial se conservará.`)) return;
    try { await this.api.delete(`providers/${proveedor.id}`); await this.recargar(); this.mensaje = 'Proveedor archivado; su historial se conservó.'; } catch { this.mensaje = 'No fue posible archivar el proveedor.'; }
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.proveedorEditando = null;
    this.formulario = this.crearProveedorVacio();
    this.errores = {};
  }

  pedidoAtrasado(proveedor: Proveedor): boolean {
    const fecha = this.fechaLocal(proveedor.proximaEntrega);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return proveedor.estadoPedido === 'Atrasado' || (proveedor.estadoPedido === 'Pendiente' && fecha !== null && fecha < hoy);
  }

  formatearFecha(valor: string): string {
    if (!valor) return 'Sin programar';
    const [anio, mes, dia] = valor.split('-');
    return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
  }

  private validar(): ErroresFormulario {
    const errores: ErroresFormulario = {};
    if (!this.formulario.nombre.trim()) errores.nombre = 'Escribe el nombre del contacto.';
    if (!this.formulario.empresa.trim()) errores.empresa = 'Escribe el nombre de la empresa.';
    if (this.formulario.telefono.trim() && !/^\d{10}$/.test(this.formulario.telefono.trim())) errores.telefono = 'Si capturas teléfono, debe tener 10 dígitos.';
    if (this.formulario.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formulario.correo.trim())) errores.correo = 'Escribe un correo válido.';
    if (!this.formulario.productoPrincipal.trim()) errores.productoPrincipal = 'Indica qué productos suministra.';
    if (!this.formulario.diaEntrega.trim()) errores.diaEntrega = 'Indica el día habitual de entrega.';
    const duplicado = this.proveedores.some((proveedor) => proveedor.id !== this.formulario.id && (proveedor.empresa.toLowerCase() === this.formulario.empresa.trim().toLowerCase() || (!!this.formulario.correo && proveedor.correo.toLowerCase() === this.formulario.correo.trim().toLowerCase())));
    if (duplicado) errores.empresa = 'Ya existe un proveedor con esta empresa o correo.';
    return errores;
  }

  private async recargar(): Promise<void> {
    try { const datos = await this.api.get<Array<Omit<Partial<Proveedor>, 'estado'> & { estado: string }>>('providers'); this.proveedores = datos.map((p) => ({ ...this.crearProveedorVacio(), ...p, estado: p.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' } as Proveedor)); } catch { this.mensaje = 'No fue posible consultar proveedores en MySQL.'; }
  }

  private fechaLocal(valor: string): Date | null {
    if (!valor) return null;
    const fecha = new Date(`${valor}T00:00:00`);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
}
