import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  direccion: string;
  estado: 'Activo' | 'Inactivo';
  adeudo: number;
}

@Component({
  selector: 'app-clientes',
  templateUrl: './clientes.page.html',
  styleUrls: ['./clientes.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonInput,
    IonItem,
    IonLabel,
    IonSearchbar,
  ],
})
export class ClientesPage implements OnInit {
  private readonly api = inject(BusinessApi);
  busqueda = '';
  formularioVisible = false;
  mensajeFormulario = '';
  nuevoCliente = { nombre: '', telefono: '', direccion: '' };

  clientes: Cliente[] = [];

  async ngOnInit(): Promise<void> { await this.cargarClientes(); }

  get clientesFiltrados() {
    const termino = this.busqueda.trim().toLowerCase();

    return this.clientes.filter(cliente =>
      `${cliente.nombre} ${cliente.telefono} ${cliente.direccion}`.toLowerCase().includes(termino)
    );
  }

  get clientesActivos() {
    return this.clientes.filter(cliente => cliente.estado === 'Activo').length;
  }

  get clientesConAdeudo() {
    return this.clientes.filter(cliente => cliente.adeudo > 0).length;
  }

  alternarFormulario(): void {
    this.formularioVisible = !this.formularioVisible;
    this.mensajeFormulario = '';
  }

  async guardarCliente(): Promise<void> {
    const { nombre, telefono, direccion } = this.nuevoCliente;

    if (!nombre.trim()) {
      this.mensajeFormulario = 'Escribe el nombre o una referencia para identificar al cliente.';
      return;
    }

    try {
      await this.api.post('clients', { nombre, telefono, direccion });
      await this.cargarClientes();
      this.nuevoCliente = { nombre: '', telefono: '', direccion: '' };
      this.mensajeFormulario = 'Cliente registrado correctamente en MySQL.';
    } catch { this.mensajeFormulario = 'No fue posible guardar el cliente. Revisa la API.'; }
  }

  prepararGenerico(): void {
    this.nuevoCliente = { nombre: `Cliente genérico ${this.clientes.length + 1}`, telefono: '', direccion: '' };
    this.formularioVisible = true;
    this.mensajeFormulario = 'Puedes cambiar el nombre de referencia; teléfono y dirección son opcionales.';
  }

  private async cargarClientes(): Promise<void> {
    try {
      const datos = await this.api.get<Array<{ id: number; nombre: string; telefono: string; direccion: string | null; activo: boolean; adeudo: number }>>('clients');
      this.clientes = datos.map((c) => ({ ...c, direccion: c.direccion ?? '', estado: c.activo ? 'Activo' : 'Inactivo', adeudo: Number(c.adeudo) }));
    } catch { this.mensajeFormulario = 'No fue posible consultar clientes en MySQL.'; }
  }
}
