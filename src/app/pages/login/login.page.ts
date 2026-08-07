import { Component, inject } from '@angular/core';

import {
  IonContent,
  IonButton,
  IonItem,
  IonInput
} from '@ionic/angular/standalone';

import { FormsModule } from '@angular/forms';

import { Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { HttpErrorResponse } from '@angular/common/http';
import { BusinessApi } from '../../services/business-api';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,

  imports: [
    IonContent,
    IonButton,
    IonItem,
    IonInput,
    FormsModule
  ],
})

export class LoginPage {

  correo: string = '';
  password: string = '';
  mostrarPassword = false;

  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly api = inject(BusinessApi);

  cargando = false;

  async login(): Promise<void> {
    this.cargando = true;
    try {
      const rol = await this.auth.iniciarSesionApi(this.correo, this.password);
      await Promise.allSettled([
        this.api.get('products'),
        this.api.get('clients'),
        this.api.get('cash/current'),
      ]);
      void this.router.navigateByUrl(this.auth.rutaInicial(rol));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const apiMessage = error instanceof HttpErrorResponse ? String(error.error?.error ?? '') : '';
      if (status === 401) alert('Correo o contraseña incorrectos.');
      else if (status === 429) alert(apiMessage || 'Demasiados intentos. Espera unos minutos.');
      else if (status === 0) {
        const rol = await this.auth.iniciarSesionOffline(this.correo, this.password);
        if (rol) {
          alert('Ingresaste en modo sin conexión. Las ventas se guardarán en esta tablet y se sincronizarán cuando regrese internet.');
          void this.router.navigateByUrl(this.auth.rutaInicial(rol));
        } else {
          alert('No hay conexión y este usuario aún no fue validado en la tablet. Conéctate una vez para habilitar el acceso sin conexión.');
        }
      }
      else alert(apiMessage || 'Ocurrió un error al iniciar sesión. Intenta nuevamente.');
    } finally {
      this.cargando = false;
    }
  }

}
