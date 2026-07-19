import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import type { Usuario } from '../../models/usuario';
import type { RolUsuario } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

@Component({
  selector: 'app-usuarios',
  templateUrl: './usuarios.page.html',
  styleUrls: ['./usuarios.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonInput,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
  ],
})
export class UsuariosPage {
  private readonly api = inject(BusinessApi);

  usuarios: Usuario[] = [];
  formularioVisible = false;
  mensaje = '';
  esError = false;
  nuevoUsuario: { nombre: string; correo: string; password: string; rol: RolUsuario } = {
    nombre: '',
    correo: '',
    password: '',
    rol: 'cajera',
  };

  constructor() { void this.cargarUsuarios(); }

  get usuariosActivos(): number {
    return this.usuarios.filter((usuario) => usuario.activo).length;
  }

  alternarFormulario(): void {
    this.formularioVisible = !this.formularioVisible;
    this.mensaje = '';
  }

  async guardarUsuario(): Promise<void> {
    const { nombre, correo, password, rol } = this.nuevoUsuario;
    this.esError = true;

    if (!nombre.trim() || !correo.trim() || !password) {
      this.mensaje = 'Completa todos los campos.';
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      this.mensaje = 'Escribe un correo válido.';
      return;
    }

    if (password.length < 8) {
      this.mensaje = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }

    try {
      const rolApi: Record<RolUsuario, string> = { administrador: 'Administrador', gerente: 'Gerente', cajera: 'Cajera' };
      await this.api.post('users', { nombre, correo, password, rol: rolApi[rol] });
      await this.cargarUsuarios();
      this.nuevoUsuario = { nombre: '', correo: '', password: '', rol: 'cajera' };
      this.esError = false;
      this.mensaje = 'Usuario creado correctamente. Ya puede iniciar sesión.';
    } catch (error) {
      this.mensaje = error instanceof Error ? error.message : 'No fue posible crear el usuario.';
    }
  }

  async cambiarEstado(usuario: Usuario): Promise<void> {
    try {
      await this.api.patch(`users/${usuario.id}/status`, { activo: !usuario.activo });
      await this.cargarUsuarios();
      this.esError = false;
      this.mensaje = `Usuario ${usuario.activo ? 'desactivado' : 'activado'} correctamente.`;
    } catch (error) {
      this.esError = true;
      this.mensaje = error instanceof Error ? error.message : 'No fue posible actualizar el usuario.';
    }
  }

  etiquetaRol(rol: RolUsuario): string {
    const etiquetas: Record<RolUsuario, string> = {
      administrador: 'Administrador',
      gerente: 'Gerente',
      cajera: 'Cajero/a',
    };
    return etiquetas[rol];
  }

  private async cargarUsuarios(): Promise<void> {
    try { const datos = await this.api.get<Array<{ id: number; nombre: string; correo: string; rol: string; activo: boolean }>>('users'); this.usuarios = datos.map((u) => ({ ...u, password: '', rol: u.rol.toLowerCase() as RolUsuario })); }
    catch { this.esError = true; this.mensaje = 'No fue posible consultar usuarios en MySQL.'; }
  }
}
