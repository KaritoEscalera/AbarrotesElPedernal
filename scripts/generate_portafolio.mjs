import { jsPDF } from 'jspdf';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('ABARROTES_EL_PEDERNAL_PORTAFOLIO.pdf');
const logo = fs.readFileSync(path.resolve('src/assets/logo-pedernal.png')).toString('base64');
const login = fs.readFileSync(path.resolve('evidencias/informe/01-inicio-sesion.png')).toString('base64');
const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540], compress: true });

// Paleta oficial usada por la aplicación de Abarrotes El Pedernal.
const C = {
  orange:'#A9470B', peach:'#F4A259', brown:'#4A2C1D',
  beige:'#F5E6D3', cream:'#FFF8F1', tan:'#D9C2A3', gray:'#E8E3DC',
  ink:'#2E2E2E', medium:'#7A4E2D', green:'#6BBF59', red:'#D9534F',
  white:'#FFFFFF', paper:'#FFFFFF'
};
const rgb = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const fill = c => doc.setFillColor(...rgb(c));
const stroke = c => doc.setDrawColor(...rgb(c));
const color = c => doc.setTextColor(...rgb(c));
const text = (s,x,y,size=18,style='normal',c=C.ink,opts={}) => { doc.setFont('helvetica',style); doc.setFontSize(size); color(c); doc.text(s,x,y,opts); };
const lines = (s,x,y,w,size=15,leading=1.35,c=C.ink,style='normal') => { doc.setFont('helvetica',style); doc.setFontSize(size); color(c); const a=doc.splitTextToSize(s,w); doc.text(a,x,y,{lineHeightFactor:leading}); return a.length*size*leading; };
const rect = (x,y,w,h,r=0,c=C.white) => { fill(c); r ? doc.roundedRect(x,y,w,h,r,r,'F') : doc.rect(x,y,w,h,'F'); };
const chip = (label,x,y,w) => { rect(x,y,w,28,14,C.cream); text(label,x+w/2,y+19,10,'bold',C.brown,{align:'center'}); };
const header = (section,kicker,n) => { text('PEDERNAL  /  SISTEMA DE GESTIÓN',44,35,9,'bold',C.brown); text(`${String(n).padStart(2,'0')} · ${section.toUpperCase()}`,650,35,9,'bold',C.orange); text(String(n).padStart(2,'0'),914,507,10,'bold',C.brown,{align:'right'}); };
const page = (bg=C.paper) => { if(doc.getNumberOfPages()>1 || doc.internal.getCurrentPageInfo().pageNumber>1){} fill(bg); doc.rect(0,0,960,540,'F'); };
const next = (bg=C.paper) => { doc.addPage([960,540],'landscape'); page(bg); };
const title = (eyebrow,main,x=44,y=92,w=520) => { text(eyebrow.toUpperCase(),x,y,11,'bold',C.orange); lines(main,x,y+43,w,34,1.03,C.brown,'bold'); };
const card = (x,y,w,h,label,body,accent=C.orange) => { rect(x,y,w,h,16,C.white); fill(accent); doc.roundedRect(x+16,y+16,34,34,10,10,'F'); text(label,x+33,y+39,12,'bold',C.white,{align:'center'}); lines(body,x+16,y+74,w-32,13,1.3,C.ink); };
const footerRule = () => { fill(C.orange); doc.rect(44,486,100,4,'F'); };

// 1 — portada
page(C.cream); fill(C.brown); doc.rect(0,0,345,540,'F');
doc.addImage(logo,'PNG',48,54,235,150,undefined,'FAST');
text('CASO DE ESTUDIO · 2026',48,242,10,'bold',C.peach);
lines('La tienda de siempre, ahora mejor organizada.',48,288,245,35,1.04,C.white,'bold');
lines('Diseño y desarrollo de un sistema integral para ventas, inventario, caja y clientes.',48,420,238,13,1.45,C.tan);
text('ABARROTES EL PEDERNAL',402,76,11,'bold',C.orange);
lines('Tecnología al servicio de un negocio cercano.',402,128,465,38,1.06,C.brown,'bold');
lines('Una plataforma multiplataforma que centraliza la operación diaria sin perder el trato humano que distingue a la tienda.',404,290,430,16,1.45,C.ink);
text('ANGULAR · IONIC · NODE.JS · MYSQL',404,432,11,'bold',C.orange);
text('Diseñado y desarrollado por Claudia Karol Escalera Trinidad',404,472,12,'normal',C.brown);

// 2 — problema
next(); header('El punto de partida','',1); title('Problema y oportunidad','Ordenar el negocio sin volverlo complicado.');
lines('La operación dependía de libretas, tickets y archivos separados. Consultar ventas, existencias, caja o fiados exigía reconstruir información y hacer cálculos manuales.',44,196,475,16,1.5,C.ink);
card(565,100,165,156,'01','Centralizar ventas, caja e inventario en un solo lugar.');
card(748,100,165,156,'02','Conservar trazabilidad y reducir errores de captura.',C.peach);
card(565,278,165,156,'03','Agilizar la atención con flujos flexibles.',C.green);
card(748,278,165,156,'04','Convertir datos diarios en decisiones útiles.',C.brown);
footerRule(); lines('¿Cómo digitalizar una tienda familiar respetando su ritmo, sus clientes y su forma de trabajar?',44,449,475,17,1.25,C.brown,'bold');

// 3 — identidad
next(C.cream); header('Dirección visual','',2); title('Identidad','Cálida, clara y confiable.');
lines('La interfaz traduce la esencia de una tienda tradicional a un sistema contemporáneo. Crema y arena aportan cercanía; naranja dirige la acción; café comunica estabilidad.',44,192,490,15,1.45,C.ink);
const swatches=[[C.brown,'CAFÉ','#4A2C1D'],[C.orange,'NARANJA','#A9470B'],[C.peach,'DURAZNO','#F4A259'],[C.tan,'ARENA','#D9C2A3'],[C.cream,'CREMA','#FFF8F1'],[C.green,'ÉXITO','#6BBF59']];
swatches.forEach(([c,n,h],i)=>{const x=44+i*143;fill(c);doc.roundedRect(x,317,118,74,12,12,'F');text(n,x,418,10,'bold',C.brown);text(h,x,436,9,'normal',C.ink)});
['Cercana','Práctica','Responsiva','Accesible','Segura'].forEach((s,i)=>chip(s,575+(i%2)*142,120+Math.floor(i/2)*48,126));
text('TIPOGRAFÍA FUNCIONAL',575,264,10,'bold',C.orange); text('Helvetica / claridad y ritmo',575,294,18,'bold',C.brown);

// 4 — producto
next(); header('El producto','',3); title('Sistema integral','Todo lo necesario para operar mejor.',44,92,445);
const mods=['Punto de venta','Apertura y cierre de caja','Productos e inventario','Compras y proveedores','Clientes y fiados','Usuarios y permisos','Reportes y estadísticas','Respaldos y bitácora'];
mods.forEach((m,i)=>{const col=i%2,row=Math.floor(i/2); const x=526+col*196,y=105+row*84; rect(x,y,178,64,14,i%3===0?C.cream:C.white); fill(i%3===0?C.orange:C.tan);doc.circle(x+25,y+32,9,'F');lines(m,x+46,y+25,120,12,1.15,C.brown,'bold')});
lines('Ventas por pieza o a granel, pagos mixtos, alertas de stock y seguimiento de fiados: funciones pensadas para situaciones reales de mostrador.',44,265,420,17,1.5,C.ink);
footerRule();

// 5 — responsive
next(C.cream); header('Experiencia','',4); title('Multiplataforma','Diseñado para tocar, vender y consultar.',44,92,365);
lines('La aplicación se adapta a computadora, tableta y teléfono. Los controles amplios, jerarquías claras y navegación por rol mantienen la operación ágil.',44,201,360,15,1.45,C.ink);
rect(460,76,420,392,24,C.white); doc.addImage(login,'PNG',482,98,376,346,undefined,'FAST');
chip('COMPUTADORA',44,350,130); chip('TABLETA',190,350,110); chip('MÓVIL',316,350,92);
text('Una sola experiencia, distintos contextos.',44,427,17,'bold',C.brown); footerRule();

// 6 — flujo
next(); header('Recorrido principal','',5); title('Experiencia','De abrir caja a cerrar el día.');
const steps=[['1','Ingresar','Acceso seguro según rol.'],['2','Abrir caja','Fondo inicial y turno.'],['3','Registrar venta','Buscar, pesar y cobrar.'],['4','Actualizar','Stock y movimientos automáticos.'],['5','Cerrar y analizar','Corte, reportes y respaldo.']];
steps.forEach((s,i)=>{const x=44+i*180; fill(i===4?C.brown:C.orange);doc.circle(x+20,247,20,'F');text(s[0],x+20,253,13,'bold',C.white,{align:'center'});if(i<4){stroke(C.tan);doc.setLineWidth(3);doc.line(x+44,247,x+158,247)}text(s[1],x,303,14,'bold',C.brown);lines(s[2],x,330,145,12,1.35,C.ink)});
rect(44,414,872,72,16,C.cream); text('RESULTADO',64,441,10,'bold',C.orange); lines('Menos duplicidad, más visibilidad y un historial confiable para cada operación.',64,468,800,16,1.2,C.brown,'bold');

// 7 — arquitectura
next(C.cream); header('Arquitectura','',6); title('Una aplicación real','Del mostrador a la base de datos.');
const tech=[['EXPERIENCIA','Angular + Ionic','Interfaz responsiva y aplicaciones Android/iOS.'],['SERVICIO','Node.js + Express','API central para reglas de negocio y autenticación.'],['DATOS','MySQL','Información relacionada, histórica y consultable.']];
tech.forEach((t,i)=>{const x=44+i*292;rect(x,228,260,198,18,C.white);text(t[0],x+20,258,10,'bold',C.orange);text(t[1],x+20,301,22,'bold',C.brown);lines(t[2],x+20,338,220,13,1.4,C.ink); if(i<2){text('>',x+270,332,24,'bold',C.orange)}});
['Capacitor','JWT','REST','Roles','Reportes','Respaldos'].forEach((s,i)=>chip(s,44+i*142,452,126));

// 8 — seguridad
next(); header('Seguridad y control','',7); title('Confianza','Cada persona ve y hace lo que le corresponde.');
lines('La solución protege tanto el acceso como la integridad de las operaciones. La seguridad forma parte del flujo diario, no es una capa añadida al final.',44,205,430,16,1.48,C.ink);
card(530,98,178,150,'01','Autenticación mediante correo y contraseña.');
card(730,98,178,150,'02','Permisos para administración, gerencia y caja.',C.brown);
card(530,272,178,150,'03','Bitácora y trazabilidad de movimientos.',C.green);
card(730,272,178,150,'04','Respaldos periódicos de la información.',C.peach);
footerRule();

// 9 — ingeniería
next(C.cream); header('Ingeniería','',8); title('Construir y verificar','Un desarrollo iterativo con control de calidad.');
const stats=[['3','ROLES OPERATIVOS'],['15+','MÓDULOS FUNCIONALES'],['WEB + 2','PLATAFORMAS MÓVILES'],['1','FUENTE CENTRAL DE DATOS']];
stats.forEach((s,i)=>{const x=44+i*220; text(s[0],x,247,31,'bold',i===3?C.brown:C.orange); lines(s[1],x,278,170,10,1.2,C.brown,'bold')});
rect(44,341,872,116,18,C.white); const rows=[['Código','TypeScript y control de versiones','Base mantenible'],['Calidad','Pruebas y verificación de compilación','Flujos estables'],['Operación','Validaciones, roles y bitácora','Datos confiables']];
rows.forEach((r,i)=>{const y=373+i*27;text(r[0],64,y,11,'bold',C.orange);text(r[1],180,y,11,'normal',C.ink);text(r[2],705,y,11,'bold',C.brown)});

// 10 — próximos pasos
next(); header('Próximos pasos','',9); title('Evolución','Crecer con información, no con improvisación.');
const roadmap=[['AHORA','Adopción','Capacitación\nCarga inicial\nUso diario'],['SIGUIENTE','Medición','Tiempos de atención\nRotación\nDiferencias de caja'],['DESPUÉS','Optimización','Promociones\nCompras sugeridas\nIndicadores'],['FUTURO','Expansión','Más dispositivos\nNuevos servicios\nEscalabilidad']];
roadmap.forEach((r,i)=>{const x=44+i*220; text(r[0],x,211,10,'bold',C.orange); fill(i===0?C.orange:C.tan);doc.circle(x+8,242,8,'F'); if(i<3){stroke(C.tan);doc.setLineWidth(3);doc.line(x+18,242,x+206,242)} text(r[1],x,288,17,'bold',C.brown); lines(r[2],x,322,170,13,1.55,C.ink)});
rect(44,434,872,52,14,C.cream);text('La prioridad: consolidar hábitos de uso y convertir cada registro en una mejor decisión.',64,467,15,'bold',C.brown);

// 11 — cierre
next(C.brown); text('PEDERNAL  /  SISTEMA DE GESTIÓN',44,35,9,'bold',C.peach);
doc.addImage(logo,'PNG',600,55,260,164,undefined,'FAST');
lines('Más que un sistema, una forma más clara de cuidar el negocio.',44,113,470,39,1.06,C.white,'bold');
lines('Una solución funcional, responsiva y conectada a una base de datos real; creada para acompañar la operación cotidiana de Abarrotes El Pedernal.',44,292,455,16,1.5,C.tan);
text('RESULTADO',600,281,10,'bold',C.peach); lines('Ventas, inventario, caja, clientes y decisiones en un mismo lugar.',600,320,270,23,1.2,C.white,'bold');
fill(C.orange);doc.rect(44,448,100,4,'F');
text('López Mateos s/n · Carretera Calvillo km 22.5',44,481,11,'normal',C.white);
text('Jesús María, Aguascalientes · 449 437 7355',44,502,11,'normal',C.tan);
text('Diseñado y desarrollado por Claudia Karol Escalera Trinidad',600,492,10,'bold',C.peach);

doc.setProperties({ title:'Portafolio — Abarrotes El Pedernal', subject:'Caso de estudio del sistema de gestión', author:'Karito Trinidad', creator:'Codex' });
fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log(out);
