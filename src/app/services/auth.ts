import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Usuario } from '../models/usuario';
import { OfflineStorage } from './offline-storage';

export type RolUsuario = 'administrador' | 'gerente' | 'cajera';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly offline = inject(OfflineStorage);
  private readonly claveRol = 'rol';
  private readonly claveSesion = 'sesionActiva';
  private readonly claveUsuario = 'usuario';
  private readonly claveUsuarios = 'usuarios';

  private readonly usuariosIniciales: Usuario[] = [
    { id: 1, nombre: 'Administrador', correo: 'admin@pedernal.com', password: '123456', rol: 'administrador', activo: true },
    { id: 2, nombre: 'Gerente', correo: 'gerente@pedernal.com', password: '123456', rol: 'gerente', activo: true },
    { id: 3, nombre: 'Cajera', correo: 'cajera@pedernal.com', password: '123456', rol: 'cajera', activo: true },
  ];

  iniciarSesion(correo: string, password: string): RolUsuario | null {
    const usuario = this.obtenerUsuarios().find(
      (item) => item.activo && item.correo === correo.trim().toLowerCase() && item.password === password,
    );

    if (!usuario) {
      return null;
    }

    const rolVisible: Record<RolUsuario, string> = {
      administrador: 'Administrador',
      gerente: 'Gerente',
      cajera: 'Cajera',
    };
    localStorage.setItem(this.claveSesion, 'true');
    localStorage.setItem(this.claveRol, rolVisible[usuario.rol]);
    localStorage.setItem(this.claveUsuario, usuario.nombre);
    return usuario.rol;
  }

  async iniciarSesionApi(correo: string, password: string): Promise<RolUsuario> {
    if (!this.http) throw new Error('El cliente HTTP no está disponible.');
    const respuesta = await firstValueFrom(this.http.post<{ token: string; usuario: { nombre: string; rol: string } }>(`${environment.apiUrl}/auth/login`, { correo, password }));
    const rol = respuesta.usuario.rol.toLowerCase() as RolUsuario;
    if (!['administrador', 'gerente', 'cajera'].includes(rol)) throw new Error('El rol recibido no es válido.');
    localStorage.setItem('token', respuesta.token);
    localStorage.setItem(this.claveSesion, 'true');
    localStorage.setItem(this.claveRol, respuesta.usuario.rol);
    localStorage.setItem(this.claveUsuario, respuesta.usuario.nombre);
    localStorage.removeItem('sesionOffline');
    await this.offline.saveOfflineCredential(correo, password, respuesta.usuario.nombre, respuesta.usuario.rol);
    return rol;
  }

  async iniciarSesionOffline(correo: string, password: string): Promise<RolUsuario | null> {
    const usuario = await this.offline.verifyOfflineCredential(correo, password);
    if (!usuario) return null;
    const rol = usuario.rol.toLowerCase() as RolUsuario;
    if (!['administrador', 'gerente', 'cajera'].includes(rol)) return null;
    localStorage.setItem(this.claveSesion, 'true');
    localStorage.setItem(this.claveRol, usuario.rol);
    localStorage.setItem(this.claveUsuario, usuario.nombre);
    localStorage.setItem('sesionOffline', 'true');
    return rol;
  }

  cerrarSesion(): void {
    localStorage.removeItem(this.claveSesion);
    localStorage.removeItem(this.claveRol);
    localStorage.removeItem(this.claveUsuario);
    localStorage.removeItem('token');
    localStorage.removeItem('sesionOffline');
  }

  obtenerRol(): RolUsuario | null {
    const rol = localStorage.getItem(this.claveRol)?.toLowerCase();
    return rol === 'administrador' || rol === 'gerente' || rol === 'cajera' ? rol : null;
  }

  estaAutenticado(): boolean {
    return localStorage.getItem(this.claveSesion) === 'true' && this.obtenerRol() !== null;
  }

  validarPasswordActual(password: string): boolean {
    const nombre = localStorage.getItem(this.claveUsuario);
    const rol = this.obtenerRol();
    return this.obtenerUsuarios().some(
      (usuario) => usuario.activo && usuario.nombre === nombre && usuario.rol === rol && usuario.password === password,
    );
  }

  rutaInicial(rol: RolUsuario): string {
    return `/dashboard-${rol === 'administrador' ? 'admin' : rol}`;
  }

  obtenerUsuarios(): Usuario[] {
    const guardados = localStorage.getItem(this.claveUsuarios);

    if (!guardados) {
      this.guardarUsuarios(this.usuariosIniciales);
      return this.usuariosIniciales.map((usuario) => ({ ...usuario }));
    }

    try {
      const usuarios = JSON.parse(guardados) as Usuario[];
      return Array.isArray(usuarios) ? usuarios : [];
    } catch {
      this.guardarUsuarios(this.usuariosIniciales);
      return this.usuariosIniciales.map((usuario) => ({ ...usuario }));
    }
  }

  agregarUsuario(datos: Omit<Usuario, 'id' | 'activo'>): Usuario {
    const usuarios = this.obtenerUsuarios();
    const correo = datos.correo.trim().toLowerCase();

    if (usuarios.some((usuario) => usuario.correo === correo)) {
      throw new Error('Ya existe un usuario con ese correo.');
    }

    const usuario: Usuario = {
      ...datos,
      id: usuarios.length ? Math.max(...usuarios.map((item) => item.id)) + 1 : 1,
      nombre: datos.nombre.trim(),
      correo,
      activo: true,
    };

    this.guardarUsuarios([...usuarios, usuario]);
    return usuario;
  }

  cambiarEstadoUsuario(id: number): void {
    const usuarios = this.obtenerUsuarios();
    const objetivo = usuarios.find((usuario) => usuario.id === id);

    if (!objetivo) {
      return;
    }

    const administradoresActivos = usuarios.filter(
      (usuario) => usuario.rol === 'administrador' && usuario.activo,
    ).length;

    if (objetivo.rol === 'administrador' && objetivo.activo && administradoresActivos === 1) {
      throw new Error('Debe permanecer al menos un administrador activo.');
    }

    this.guardarUsuarios(
      usuarios.map((usuario) => usuario.id === id ? { ...usuario, activo: !usuario.activo } : usuario),
    );
  }

  private guardarUsuarios(usuarios: Usuario[]): void {
    localStorage.setItem(this.claveUsuarios, JSON.stringify(usuarios));
  }
}
