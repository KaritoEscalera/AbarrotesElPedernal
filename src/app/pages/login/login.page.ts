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

  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  cargando = false;

  async login(): Promise<void> {
    this.cargando = true;
    try {
      const rol = await this.auth.iniciarSesionApi(this.correo, this.password);
      void this.router.navigateByUrl(this.auth.rutaInicial(rol));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const apiMessage = error instanceof HttpErrorResponse ? String(error.error?.error ?? '') : '';
      if (status === 401) alert('Correo o contraseña incorrectos.');
      else if (status === 429) alert(apiMessage || 'Demasiados intentos. Espera unos minutos.');
      else if (status === 0) alert('No hay conexión con el servidor. Verifica que la API esté encendida.');
      else alert(apiMessage || 'Ocurrió un error al iniciar sesión. Intenta nuevamente.');
    } finally {
      this.cargando = false;
    }
  }

}
