import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonInput, IonItem, IonLabel } from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

@Component({ selector:'app-perfil', templateUrl:'./perfil.page.html', styleUrls:['./perfil.page.scss'], standalone:true,
  imports:[CommonModule,FormsModule,IonContent,IonCard,IonCardHeader,IonCardTitle,IonCardContent,IonItem,IonLabel,IonInput,IonButton] })
export class PerfilPage {
  private readonly api=inject(BusinessApi);
  actual=''; nueva=''; confirmar=''; mensaje=''; error=''; guardando=false;
  async cambiar():Promise<void>{
    this.mensaje='';this.error='';
    if(this.nueva!==this.confirmar){this.error='Las contraseñas nuevas no coinciden.';return;}
    this.guardando=true;
    try{await this.api.post('auth/change-password',{passwordActual:this.actual,passwordNueva:this.nueva});this.actual='';this.nueva='';this.confirmar='';this.mensaje='Contraseña actualizada correctamente.';}
    catch(e:unknown){const x=e as {error?:{error?:{error?:string}}};this.error=x.error?.error?.error??'No fue posible cambiar la contraseña.';}finally{this.guardando=false;}
  }
}
