import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import {
  IonApp,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  MenuController,
} from '@ionic/angular/standalone';
import { filter } from 'rxjs';
import { Auth, RolUsuario } from './services/auth';
import { AlertasProveedores } from './services/alertas-proveedores';
import { ModoTema, TemaService } from './services/tema';

interface OpcionMenu {
  etiqueta: string;
  ruta: string;
  roles: RolUsuario[];
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [CommonModule, RouterOutlet, IonApp, IonButton, IonContent, IonItem, IonLabel, IonList, IonListHeader, IonMenu],
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly menu = inject(MenuController);
  private readonly destroyRef = inject(DestroyRef);
  readonly alertasService = inject(AlertasProveedores);
  readonly tema = inject(TemaService);

  mostrarMenu = false;
  rol: RolUsuario | null = null;
  usuario = '';
  mostrarAlertas = false;
  mensajeNotificaciones = '';
  private temporizadorInactividad?: number;

  private readonly opciones: OpcionMenu[] = [
    { etiqueta: 'Mi cuenta', ruta: '/perfil', roles: ['administrador', 'gerente', 'cajera'] },
    { etiqueta: 'Caja', ruta: '/caja', roles: ['administrador', 'gerente', 'cajera'] },
    { etiqueta: 'Productos', ruta: '/productos', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Inventario', ruta: '/inventario', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Proveedores', ruta: '/proveedores', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Compras', ruta: '/compras', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Promociones', ruta: '/promociones', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Clientes', ruta: '/clientes', roles: ['administrador', 'gerente', 'cajera'] },
    { etiqueta: 'Fiados', ruta: '/fiados', roles: ['administrador', 'gerente', 'cajera'] },
    { etiqueta: 'Estadísticas', ruta: '/estadisticas', roles: ['administrador', 'gerente'] },
    { etiqueta: 'Reportes', ruta: '/reportes', roles: ['administrador'] },
    { etiqueta: 'Usuarios', ruta: '/usuarios', roles: ['administrador'] },
    { etiqueta: 'Bitácora', ruta: '/bitacora', roles: ['administrador'] },
    { etiqueta: 'Respaldos', ruta: '/respaldos', roles: ['administrador'] },
    { etiqueta: 'SAT y Contabilidad', ruta: '/sat', roles: ['administrador'] },
  ];

  constructor() {
    this.router.events.pipe(filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((evento) => this.actualizarSesion(evento.urlAfterRedirects));
    this.actualizarSesion(this.router.url);
    const revisionAlertas = window.setInterval(() => {
      if (this.auth.estaAutenticado()) void this.alertasService.actualizar(true);
    }, 30 * 60 * 1000);
    this.destroyRef.onDestroy(() => window.clearInterval(revisionAlertas));
    const actividad=()=>this.reiniciarInactividad();
    ['pointerdown','keydown','touchstart'].forEach(evento=>window.addEventListener(evento,actividad,{passive:true}));
    this.destroyRef.onDestroy(()=>['pointerdown','keydown','touchstart'].forEach(evento=>window.removeEventListener(evento,actividad)));
    this.reiniciarInactividad();
  }

  get opcionesVisibles(): OpcionMenu[] {
    return this.rol ? this.opciones.filter((opcion) => opcion.roles.includes(this.rol as RolUsuario)) : [];
  }

  get rutaDashboard(): string {
    return this.rol ? this.auth.rutaInicial(this.rol) : '/login';
  }

  async abrirMenu(): Promise<void> {
    await this.menu.open('menu-principal');
  }

  async navegar(ruta: string): Promise<void> {
    await this.menu.close('menu-principal');
    if (this.router.url !== ruta) {
      await this.router.navigateByUrl(ruta);
    }
  }

  rutaActiva(ruta: string): boolean {
    return this.router.url === ruta;
  }

  async cerrarSesion(): Promise<void> {
    await this.menu.close('menu-principal');
    this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }

  async alternarAlertas(): Promise<void> {
    this.mostrarAlertas = !this.mostrarAlertas;
    if (this.mostrarAlertas) await this.alertasService.actualizar(false);
  }

  async activarNotificaciones(): Promise<void> {
    const resultado = await this.alertasService.solicitarPermiso();
    this.mensajeNotificaciones = resultado === 'granted' ? 'Notificaciones y sonido activados.' : resultado === 'denied' ? 'Android no autorizó las notificaciones. Puedes habilitarlas en Ajustes.' : 'Este navegador no admite notificaciones.';
  }

  seleccionarTema(modo: ModoTema): void { this.tema.seleccionar(modo); }

  etiquetaRol(): string {
    const etiquetas: Record<RolUsuario, string> = { administrador: 'Administrador', gerente: 'Gerente', cajera: 'Cajera' };
    return this.rol ? etiquetas[this.rol] : '';
  }

  private actualizarSesion(url: string): void {
    this.rol = this.auth.obtenerRol();
    this.usuario = localStorage.getItem('usuario') ?? '';
    this.mostrarMenu = !url.startsWith('/login') && this.auth.estaAutenticado();
    if (this.mostrarMenu) void this.alertasService.actualizar(true);
  }

  private reiniciarInactividad():void{if(this.temporizadorInactividad)window.clearTimeout(this.temporizadorInactividad);if(!this.auth.estaAutenticado())return;this.temporizadorInactividad=window.setTimeout(()=>{this.auth.cerrarSesion();void this.router.navigateByUrl('/login');},30*60*1000);}
}
