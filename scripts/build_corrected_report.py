#!/usr/bin/env python3
"""Construye el informe corregido en Markdown y HTML a partir del borrador versionado."""

from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MD_OUT = ROOT / "REPORTE_CLAUDIA_KAROL_ESCALERA_TRINIDAD_CORREGIDO.md"
HTML_OUT = ROOT / "REPORTE_CLAUDIA_KAROL_ESCALERA_TRINIDAD_CORREGIDO.html"


CHAPTER_THREE = r"""# Capítulo 3. Marco Teórico

El desarrollo de un sistema para una tienda de abarrotes requiere comprender tanto los procesos comerciales como las tecnologías que permiten representarlos. En este capítulo se presentan los conceptos que sustentan la solución implementada. La selección se limita a los temas directamente relacionados con el proyecto y evita describir herramientas que no participaron en su construcción.

## 3.1 Sistemas de gestión comercial y punto de venta

Un sistema de gestión comercial reúne en una sola plataforma la información generada por ventas, inventarios, compras, proveedores, clientes y caja. Su finalidad es sustituir registros aislados por datos relacionados que puedan consultarse de forma oportuna. En una tienda de abarrotes esta integración resulta importante porque una sola venta produce varios efectos: registra el ingreso, descuenta existencias, identifica el método de pago, genera un comprobante y, cuando se vende a crédito, crea una cuenta por cobrar.

El punto de venta es el componente utilizado para capturar los productos que adquiere el cliente y calcular el importe de la operación. Un punto de venta adecuado debe permitir localizar artículos mediante código o nombre, modificar cantidades, aplicar las reglas autorizadas y registrar el pago. También debe impedir operaciones incompletas, por ejemplo vender sin una caja abierta, confirmar cantidades mayores que las existencias o finalizar un cobro cuya distribución no coincide con el total.

La operación de Abarrotes El Pedernal exige considerar productos por pieza y a granel. En el primer caso la cantidad debe ser entera; en el segundo puede expresarse en gramos o kilogramos. Para evitar inconsistencias se conserva el kilogramo como unidad base y la interfaz convierte los gramos antes de enviar la operación. De esta manera, una venta de 500 gramos se almacena como 0.500 kilogramos y el importe se calcula con el precio correspondiente.

El control de caja relaciona las ventas con un turno de trabajo. La apertura registra el fondo inicial y el cierre compara el efectivo esperado con el dinero contado. Los pagos mediante terminal, transferencia y fiado deben conservarse por separado, ya que no forman parte del efectivo físico. Esta clasificación facilita el arqueo, la revisión de diferencias y la elaboración de reportes.

## 3.2 Inventarios, compras, clientes y crédito

El inventario representa las existencias disponibles de cada producto. Su control no consiste únicamente en guardar una cantidad actual, sino en conservar los movimientos que explican cómo cambió. Entre estos movimientos se encuentran entradas por compra, salidas por venta, mermas, ajustes y correcciones autorizadas. La trazabilidad permite conocer la cantidad anterior, la cantidad posterior, el motivo, la fecha y la persona responsable.

El nivel mínimo sirve como referencia para detectar artículos que requieren reposición. Cuando la existencia es igual o inferior a dicho nivel, el sistema puede mostrar una alerta. Esta señal no reemplaza la decisión del responsable de compras, pero ayuda a ordenar prioridades y reduce la posibilidad de olvidar productos de rotación frecuente. Los conteos físicos siguen siendo necesarios, pues permiten comparar la mercancía real con la registrada y corregir diferencias justificadas.

Las compras relacionan proveedores, productos, costos y recepción de mercancía. Registrar el costo resulta relevante para revisar cambios de precio y estimar márgenes. La recepción debe incrementar el inventario únicamente cuando la operación se confirma; si ocurre un error, los cambios deben cancelarse como una unidad. Esta condición evita que una compra quede registrada sin actualizar existencias o que el inventario aumente sin un documento que explique el movimiento.

La gestión de clientes permite identificar a las personas que utilizan crédito. Un fiado crea una cuenta por cobrar con importe original, saldo y fecha. Los abonos reducen el saldo sin borrar el historial, de modo que pueda reconstruirse el estado de la cuenta. También se aplican límites y restricciones para evitar nuevos créditos cuando existen adeudos vencidos o cuando el monto solicitado supera la cantidad autorizada.

## 3.3 Bases de datos relacionales y arquitectura cliente-servidor

Una base de datos relacional organiza la información en tablas vinculadas mediante claves. La clave primaria identifica cada registro y la clave foránea mantiene la relación con otra tabla. En el proyecto, una venta se relaciona con sus detalles, pagos, cliente, usuario y sesión de caja. Esta estructura reduce duplicidad y permite consultar una operación completa sin repetir todos los datos en un solo registro.

La integridad referencial impide relaciones inválidas, como asociar un detalle con una venta inexistente. Los índices aceleran búsquedas frecuentes por código, fecha, estado o identificador. Las transacciones agrupan varias instrucciones y garantizan que se confirmen todas o se cancelen todas. Esta propiedad es esencial durante una venta, porque el encabezado, los productos, los pagos, el inventario y la caja deben mantenerse consistentes.

La arquitectura cliente-servidor separa la interfaz utilizada por el personal de la lógica que valida las reglas. La aplicación cliente envía solicitudes mediante HTTP a una API. El servidor comprueba permisos, cantidades y estados antes de acceder a MySQL. Esta separación evita que la interfaz se conecte directamente a la base de datos y permite reutilizar las mismas reglas desde navegador o dispositivo móvil.

Una respuesta correcta debe indicar el resultado y proporcionar datos suficientes para actualizar la pantalla. Cuando la solicitud no puede completarse, el servidor devuelve un mensaje comprensible sin revelar información sensible. La interfaz presenta ese resultado al usuario y conserva el estado necesario para que la operación pueda corregirse.

## 3.4 Tecnologías utilizadas: Angular, Ionic, Node.js, Express y MySQL

Angular es el framework utilizado para organizar la interfaz en componentes, páginas, rutas y servicios. Los componentes representan elementos reutilizables; los servicios concentran la comunicación con la API; y las rutas determinan qué vista corresponde a cada dirección. Los formularios permiten validar datos antes de enviarlos y mostrar mensajes cuando falta información.

Ionic aporta componentes visuales adaptables y facilita preparar la aplicación para diferentes tamaños de pantalla. Junto con Capacitor permite empaquetar la solución como aplicación móvil y utilizar funciones del dispositivo. En este proyecto se empleó para ofrecer una experiencia consistente en computadora y tableta sin mantener aplicaciones completamente separadas.

Node.js ejecuta JavaScript en el servidor. Express organiza la API mediante rutas y middleware. Las rutas reciben solicitudes; los controladores coordinan cada operación; y el middleware verifica autenticación, roles y datos comunes. La programación asíncrona permite esperar consultas y operaciones de entrada o salida sin bloquear innecesariamente el servicio.

MySQL almacena la información relacional. El motor InnoDB proporciona transacciones, claves foráneas y mecanismos de concurrencia. Las consultas parametrizadas separan las instrucciones de los datos y disminuyen el riesgo de inyección SQL. La configuración sensible, como credenciales y secretos, se conserva mediante variables de entorno y no dentro del código fuente.

## 3.5 Seguridad, desarrollo iterativo y continuidad operativa

La seguridad se aplica en varias capas. Las contraseñas se protegen mediante una función hash de una sola vía; después del inicio de sesión, el servidor emite un token que identifica al usuario durante un periodo limitado. El control de acceso basado en roles restringe cada función de acuerdo con las responsabilidades de administración, gerencia o caja. La validación del servidor se mantiene aun cuando la interfaz ya haya revisado los datos, porque una solicitud puede enviarse fuera de la aplicación.

La bitácora conserva acciones relevantes como cancelaciones, ajustes, cambios de usuarios y generación de respaldos. Su propósito es aportar trazabilidad, no vigilar tareas ordinarias. Los registros con historial se desactivan de manera lógica en lugar de eliminarse físicamente, ya que una eliminación podría dejar ventas o auditorías sin referencia.

El desarrollo iterativo divide el trabajo en ciclos cortos de análisis, construcción, prueba y revisión. Este enfoque permitió incorporar observaciones del negocio sin esperar hasta el final. Cada incremento se verificó con escenarios normales y negativos, por ejemplo credenciales incorrectas, pagos incompletos, existencias insuficientes o intentos de utilizar funciones sin autorización.

La continuidad operativa contempla respaldos, restauración y respuesta ante fallas. Una copia solo es útil si puede verificarse y restaurarse. Por ello se recomienda mantener más de una ubicación, comprobar periódicamente la integridad y ensayar la recuperación en un entorno de prueba. También deben documentarse la dirección del servidor, el inicio de los servicios y las acciones básicas ante una interrupción de energía o red.

Estos fundamentos sustentan las decisiones descritas en el capítulo siguiente. La integración entre procesos comerciales, base de datos, arquitectura, tecnologías, seguridad y metodología permitió construir una solución congruente con las necesidades de Abarrotes El Pedernal.

---
"""


CONTENTS = r"""# Contenido

DEDICATORIAS ........................................................................ 4

AGRADECIMIENTOS ................................................................... 5

INTRODUCCIÓN ........................................................................ 6

CAPÍTULO 1. MARCO REFERENCIAL ...................................................... 7

1.1 PERFIL DE LA EMPRESA ........................................................... 8

Nombre o Razón Social ............................................................... 8

Giro .................................................................................. 8

Domicilio ............................................................................. 8

Teléfono(s) ........................................................................... 8

Correo Electrónico .................................................................... 8

Página Web ............................................................................. 8

1.2 ANTECEDENTES HISTÓRICOS ........................................................ 9

1.3 ADMINISTRACIÓN ORGANIZACIONAL .................................................. 10

Misión ................................................................................ 10

Visión ................................................................................ 10

Objetivos Estratégicos ................................................................ 10

Normas y Políticas ..................................................................... 11

Política de Calidad .................................................................... 11

Valores ................................................................................ 11

Estructura Orgánica .................................................................... 12

1.4 ANÁLISIS FODA ..................................................................... 13

Fortalezas ............................................................................. 13

Oportunidades .......................................................................... 13

Debilidades ............................................................................ 13

Amenazas ............................................................................... 14

CAPÍTULO 2. PLANIFICACIÓN DEL PROYECTO ............................................ 15

2.1 DESCRIPCIÓN DEL PROBLEMA ........................................................ 16

2.2 OBJETIVOS DEL PROYECTO .......................................................... 17

Objetivo General ....................................................................... 17

Objetivos Específicos .................................................................. 17

Requisitos del Proyecto ................................................................ 18

Requisitos del Producto ................................................................ 18

2.3 CRONOGRAMA ......................................................................... 19

2.4 JUSTIFICACIÓN ....................................................................... 20

2.5 ENUNCIADO DEL ALCANCE ............................................................ 21

2.6 METODOLOGÍA ......................................................................... 22

CAPÍTULO 3. MARCO TEÓRICO ........................................................... 23

3.1 SISTEMAS DE GESTIÓN COMERCIAL Y PUNTO DE VENTA ................................. 24

3.2 INVENTARIOS, COMPRAS, CLIENTES Y CRÉDITO ........................................ 25

3.3 BASES DE DATOS RELACIONALES Y ARQUITECTURA CLIENTE-SERVIDOR ..................... 26

3.4 ANGULAR, IONIC, NODE.JS, EXPRESS Y MYSQL ........................................ 27

3.5 SEGURIDAD, DESARROLLO ITERATIVO Y CONTINUIDAD OPERATIVA ........................ 28

CAPÍTULO 4. DESARROLLO DEL PROYECTO ................................................ 29

4.1 LEVANTAMIENTO DE REQUERIMIENTOS

4.2 DISEÑO GENERAL DE LA SOLUCIÓN

4.3 DESARROLLO E INTEGRACIÓN DE MÓDULOS

4.4 ARQUITECTURA DEL SISTEMA

4.5 DISEÑO DE LA BASE DE DATOS

4.6 FLUJO TÉCNICO DE UNA VENTA

4.7 SEGURIDAD IMPLEMENTADA

4.8 DECISIONES DE DISEÑO Y DIFICULTADES

4.9 ESTRATEGIA DE PRUEBAS

4.10 IMPLEMENTACIÓN Y OPERACIÓN

4.11 MANUAL RESUMIDO DE USUARIO

4.12 EVIDENCIAS

4.13 CASOS DE USO

4.14 REGLAS DEL NEGOCIO

4.15 COMPARACIÓN DEL PROCESO ANTERIOR Y PROPUESTO

CAPÍTULO 5. CIERRE DEL PROYECTO

5.1 CRONOGRAMA FINAL

5.2 EVALUACIÓN DE RESULTADOS

5.3 RECOMENDACIONES

5.4 CONCLUSIONES

Conclusiones del Proyecto

Conclusiones Personales

GLOSARIO

BIBLIOGRAFÍA

LIBROS

REVISTAS

PÁGINAS DE INTERNET

ANEXOS

ANEXO A. ORGANIGRAMA DE ABARROTES EL PEDERNAL

---
"""


INTRODUCTION = r"""# Introducción

El presente documento describe el desarrollo del proyecto de estadía profesional enfocado en la creación de un sistema de gestión para Abarrotes El Pedernal. El sistema integra los procesos de ventas, caja, inventario, compras, proveedores, clientes, fiados, reportes y respaldos mediante una aplicación multiplataforma.

Dicho proyecto surge ante la necesidad de la empresa de mejorar el control de sus operaciones y sustituir los registros distribuidos en libretas, comprobantes y archivos separados por una herramienta que concentre información confiable y actualizada.

El informe se estructura de la siguiente manera:

**Capítulo 1. Marco Referencial:** presenta la información general de Abarrotes El Pedernal, sus antecedentes, misión, visión, objetivos, normas, políticas, valores, estructura organizacional y análisis FODA.

**Capítulo 2. Planificación del Proyecto:** describe el problema identificado, los objetivos general y específicos, los requisitos, el cronograma, la justificación, el alcance y la metodología utilizada.

**Capítulo 3. Marco Teórico:** expone los conceptos necesarios para comprender la solución, como los sistemas de gestión comercial, el punto de venta, el control de inventarios, las bases de datos relacionales, la arquitectura cliente-servidor, las tecnologías utilizadas y la seguridad.

**Capítulo 4. Desarrollo del Proyecto:** describe las actividades realizadas durante el levantamiento de requerimientos, diseño, programación e integración de los módulos, así como la arquitectura, la base de datos, las pruebas y la implementación del sistema.

**Capítulo 5. Cierre del Proyecto:** presenta el cronograma final, la evaluación de resultados, las recomendaciones y las conclusiones del proyecto y personales.

El objetivo principal del proyecto es desarrollar un sistema de gestión flexible que permita registrar, organizar y consultar los movimientos operativos y administrativos de Abarrotes El Pedernal, con la finalidad de mejorar el control de la información, apoyar la toma de decisiones y reducir la dependencia de registros manuales.

---
"""


DEDICATIONS_AND_ACKNOWLEDGMENTS = r"""# Dedicatorias

Dedico este trabajo a mis padres, por su apoyo incondicional, sus enseñanzas y por brindarme las herramientas necesarias para alcanzar mis metas académicas y personales. Gracias por confiar siempre en mí, por impulsarme a continuar aun en los momentos de mayor dificultad y por recordarme que cada esfuerzo tiene una recompensa. Su ejemplo, cariño y dedicación han sido fundamentales durante toda mi formación.

A mi esposo, por su comprensión, paciencia y apoyo constante durante este proceso. Gracias por acompañarme en cada etapa, por escucharme, por motivarme a seguir adelante cuando más lo necesitaba y por comprender el tiempo y la dedicación que requirió la realización de este proyecto. Su compañía me dio fortaleza para enfrentar los retos que se presentaron.

A mi familia, por estar presente durante mi formación, por sus palabras de ánimo y por celebrar conmigo cada avance alcanzado. Cada muestra de confianza y afecto contribuyó a que pudiera concluir esta etapa tan importante de mi vida.

Finalmente, dedico este logro a todas las personas que, de alguna manera, formaron parte de mi crecimiento académico y personal. Este trabajo representa no solo el cumplimiento de una meta profesional, sino también el resultado del apoyo, la confianza y las enseñanzas que recibí a lo largo del camino.

# Agradecimientos

Agradezco sinceramente a Abarrotes El Pedernal por permitirme realizar mi estadía profesional dentro del negocio y por brindarme la oportunidad de desarrollar una solución orientada a necesidades reales. La disposición para explicar los procesos diarios de la tienda, compartir información y señalar las dificultades existentes fue fundamental para comprender la problemática y proponer un sistema adecuado a su forma de trabajo.

De manera especial, agradezco al Ing. Alejandro Figueroa, asesor empresarial, por compartir su conocimiento sobre la operación del negocio, revisar los avances y aportar observaciones que ayudaron a mejorar las funciones del sistema. Su orientación permitió que el proyecto se mantuviera enfocado en las necesidades reales de la empresa y que cada módulo fuera evaluado desde una perspectiva práctica.

Agradezco de manera especial a mi docente Artemiza; a mi docente, el Ing. Axel; a mi docente Bañuelos; al psicólogo de la universidad; y a la maestra Carmen, por los conocimientos, la orientación y el apoyo que me brindaron durante mi formación académica.

Asimismo, agradezco al Ing. Alejandro Figueroa por las enseñanzas que compartió conmigo durante el periodo en que fue mi docente. Su experiencia y sus aportaciones contribuyeron a mi crecimiento académico y profesional.

"""


def source_markdown() -> str:
    return subprocess.check_output(
        ["git", "show", "HEAD:INFORME_ESTADIA_REVISADO.md"], cwd=ROOT, text=True
    )


def corrected_markdown() -> str:
    text = source_markdown()
    start = text.index("# Capítulo 3. Marco Teórico")
    end = text.index("# Capítulo 4. Desarrollo del Proyecto")
    text = text[:start] + CHAPTER_THREE + "\n" + text[end:]
    intro_start = text.index("# Introducción")
    intro_end = text.index("# Capítulo 1. Marco Referencial")
    text = text[:intro_start] + INTRODUCTION + "\n" + text[intro_end:]
    dedication_start = text.index("# Dedicatorias")
    dedication_end = text.index("# Introducción")
    text = text[:dedication_start] + DEDICATIONS_AND_ACKNOWLEDGMENTS + "\n" + text[dedication_end:]
    text = text.replace("## Sistema de Gestión para Comercios", "## Sistema de Gestión para Abarrotes El Pedernal")
    text = re.sub(r"\n> Nota de revisión:.*?\n", "\n", text)
    text = text.replace("**Asesor empresarial:** Ing. Alejandro Figueroa", "**Asesor empresarial:** Ing. Alejandro Figueroa\n**Asesor académico:** Ing. Jorge de Lara Hernández\n**Lugar y fecha:** Calvillo, Aguascalientes, agosto de 2026")
    text = text.replace("**Correo electrónico:** [CONFIRMAR CORREO; el número telefónico no corresponde a un correo]", "**Correo electrónico:** No disponible")
    text = text.replace("**Página web:** El negocio no cuenta actualmente con un sitio web propio.", "**Página web:** El negocio no cuenta actualmente con un sitio web propio; mantiene presencia en Facebook e Instagram.")
    text = text.replace("## ANEXO A. NOMBRE DEL ANEXO A", "## ANEXO A. Organigrama de Abarrotes El Pedernal")
    text = text.replace(
        "## 4.3 Desarrollo e integración de módulos\n",
        """## 4.3 Desarrollo e integración de módulos

Para organizar el trabajo, los módulos se distribuyeron entre Karol y Mónica de acuerdo con las funciones principales de cada área. Esta asignación indica la responsabilidad principal de desarrollo; la integración y las pruebas generales se realizaron de manera conjunta.

| Responsable | Módulos y actividades principales |
|---|---|
| Karol | Autenticación y usuarios; caja y ventas; venta de productos a granel; inventario; clientes, fiados y abonos; compras; respaldos y auditoría; integración general y corrección de errores. |
| Mónica | Catálogo de proveedores; apoyo en reportes y estadísticas; organización de evidencias y pruebas básicas de funcionamiento. |
| Ambas | Revisión final y validación del sistema. |
""",
    )
    replacements = {
        "[FECHA]": "Marzo-agosto de 2026",
        "[VERSIÓN O COMMIT]": "Versión de entrega 1.0",
        "[DESCRIBIR]": "Funciones principales del sistema",
        "[DESCRIBIR O INDICAR NINGUNA]": "Observaciones registradas en la revisión",
        "[CAPTURA]": "Evidencia documental",
        "efectivo, tarjeta, transferencia, fiado, saldo a favor y mixto": "efectivo, terminal, transferencia, fiado y mixto",
        "tarjeta, transferencia, fiado, saldo a favor o modalidad mixta": "terminal, transferencia, fiado o modalidad mixta",
        "referencias de tarjeta o transferencia": "referencias de terminal o transferencia",
        "tarjeta y transferencia pueden solicitar referencia; fiado necesita un cliente elegible; y saldo a favor no puede exceder el importe disponible": "terminal y transferencia solicitan referencia; y fiado necesita un cliente elegible",
        "efectivo, tarjeta, transferencia, fiado y saldo a favor": "efectivo, terminal, transferencia y fiado",
        "El saldo a favor utilizado no puede superar el disponible.": "La suma de un pago mixto debe coincidir con el total de la venta.",
        "[AGREGAR LOS LIBROS CONSULTADOS, EN CASO DE HABERLOS UTILIZADO.]": "Sommerville, I. (2005). Ingeniería del software (7.ª ed.). Pearson Educación.",
        "[AGREGAR LOS ARTÍCULOS DE REVISTAS CONSULTADOS, EN CASO DE HABERLOS UTILIZADO.]": "No se consultaron artículos de revistas para el desarrollo del proyecto.",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"^> (Insertar|Sustituir|Agregar).*?$", "", text, flags=re.M)
    text = re.sub(
        r"\| Actividad \| Medición 1.*?(?=\n\n)",
        "La comparación cuantitativa de tiempos deberá realizarse después de un periodo estable de uso. En esta entrega se documenta la línea base cualitativa y se propone medir la consulta de fiados, el registro de abonos, la revisión de existencias, el cierre de caja y la localización de ventas anteriores.",
        text,
        flags=re.S,
    )
    text = text.replace("# Glosario (Opcional)", "# Glosario")
    first_rule = text.index("---") + 3
    text = text[:first_rule] + "\n\n" + CONTENTS + "\n" + text[first_rule:]
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def inline(value: str) -> str:
    value = html.escape(value.strip())
    value = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"`(.+?)`", r"<code>\1</code>", value)
    return value


def slug(value: str) -> str:
    value = re.sub(r"<.*?>", "", value).lower()
    value = re.sub(r"[^a-z0-9áéíóúüñ]+", "-", value).strip("-")
    return value


def toc(markdown: str) -> str:
    rows = []
    for match in re.finditer(r"^(#{1,3}) (.+)$", markdown, re.M):
        level, title = len(match.group(1)), match.group(2).strip()
        if title in ("INFORME DEL PROYECTO DE ESTADÍA", "Sistema de Gestión para Abarrotes El Pedernal"):
            continue
        if level == 3 and not re.match(r"(Misión|Visión|Objetivo|Requisitos|Normas|Política|Valores|Estructura|Fortalezas|Oportunidades|Debilidades|Amenazas|Conclusiones)", title):
            continue
        rows.append(f'<div class="toc l{level}"><a href="#{slug(title)}">{inline(title)}</a><span></span></div>')
    return "\n".join(rows)


def markdown_body(markdown: str) -> str:
    lines = markdown.splitlines()
    out: list[str] = []
    paragraph: list[str] = []
    in_list = False
    in_code = False
    table: list[list[str]] = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            out.append("<p>" + inline(" ".join(x.strip() for x in paragraph)) + "</p>")
            paragraph = []

    def flush_list() -> None:
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def flush_table() -> None:
        nonlocal table
        if not table:
            return
        rows = [r for r in table if not all(re.fullmatch(r":?-{3,}:?", c.strip()) for c in r)]
        if rows:
            out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr></thead><tbody>")
            for row in rows[1:]:
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>")
            out.append("</tbody></table>")
        table = []

    for line in lines:
        if line.startswith("```"):
            flush_paragraph(); flush_list(); flush_table()
            if not in_code:
                out.append("<pre>"); in_code = True
            else:
                out.append("</pre>"); in_code = False
            continue
        if in_code:
            out.append(html.escape(line)); continue
        if line.startswith("|") and line.endswith("|"):
            flush_paragraph(); flush_list()
            table.append([c.strip() for c in line.strip("|").split("|")]); continue
        flush_table()
        heading = re.match(r"^(#{1,4}) (.+)$", line)
        if heading:
            flush_paragraph(); flush_list()
            level = len(heading.group(1)); title = heading.group(2).strip()
            if title == "INFORME DEL PROYECTO DE ESTADÍA":
                continue
            is_chapter = level == 1 and title.startswith("Capítulo")
            css = " chapter" if is_chapter else ""
            style = ' style="page-break-before:always;page-break-after:always;padding-top:260px"' if is_chapter else ""
            out.append(f'<h{level} class="{css}"{style} id="{slug(title)}">{inline(title)}</h{level}>')
        elif re.match(r"^- ", line):
            flush_paragraph()
            if not in_list:
                out.append("<ul>"); in_list = True
            out.append("<li>" + inline(line[2:]) + "</li>")
        elif re.match(r"^\d+\. ", line):
            flush_paragraph(); flush_list(); out.append("<p>" + inline(line) + "</p>")
        elif line.strip() == "---":
            flush_paragraph(); flush_list()
        elif line.startswith(">"):
            flush_paragraph(); flush_list()
        elif not line.strip():
            flush_paragraph(); flush_list()
        else:
            paragraph.append(line)
    flush_paragraph(); flush_list(); flush_table()
    return "\n".join(out)


def make_html(markdown: str) -> str:
    body_md = re.sub(r"\A.*?---\s*", "", markdown, count=1, flags=re.S)
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Claudia Karol Escalera Trinidad</title>
<style>
@page {{ size: letter; margin: 2.5cm 2.4cm 2.3cm 3cm; }}
body {{ font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.38; color:#111; }}
.cover {{ height: 22cm; text-align:center; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }}
.cover h1 {{ font-size:18pt; margin:0 0 18pt; }} .cover h2 {{ font-size:15pt; margin:0 0 28pt; }}
.cover p {{ text-align:center; margin:7pt 0; }}
.contents {{ page-break-after:always; }} .contents h1 {{ text-align:left; }}
.toc {{ display:flex; font-size:9.5pt; margin:2pt 0; }} .toc a {{ color:#111; text-decoration:none; }} .toc span {{ flex:1; border-bottom:1px dotted #777; margin:0 5pt 4pt; }}
.toc.l2 {{ margin-left:15pt; }} .toc.l3 {{ margin-left:30pt; font-size:9pt; }}
h1 {{ font-size:16pt; text-align:center; margin:22pt 0 14pt; }} h1.chapter {{ page-break-before:always; padding-top:8cm; font-size:22pt; }}
h2 {{ font-size:13pt; margin:18pt 0 8pt; }} h3 {{ font-size:11.5pt; margin:14pt 0 6pt; }} h4 {{ font-size:11pt; }}
p {{ text-align:justify; margin:0 0 9pt; }} li {{ margin-bottom:4pt; text-align:justify; }}
table {{ width:100%; border-collapse:collapse; font-size:8.5pt; margin:10pt 0 14pt; page-break-inside:avoid; }} th,td {{ border:1px solid #666; padding:4pt; vertical-align:top; }} th {{ background:#e6e6e6; }}
pre {{ white-space:pre-wrap; font-size:8pt; border:1px solid #aaa; padding:6pt; }} code {{ font-family:Menlo,monospace; font-size:9pt; }}
</style></head><body>
<section class="cover"><h1 style="text-align:center;font-family:Arial,sans-serif">INFORME DEL PROYECTO DE ESTADÍA</h1><h2 style="text-align:center;font-family:Arial,sans-serif">Sistema de Gestión para Abarrotes El Pedernal</h2>
<p style="text-align:center">DESARROLLADO EN LA EMPRESA<br><strong>ABARROTES EL PEDERNAL</strong></p><p style="text-align:center">POR LA ALUMNA<br><strong>CLAUDIA KAROL ESCALERA TRINIDAD</strong></p>
<p style="text-align:center">PARA OBTENER EL TÍTULO DE<br><strong>TSU EN TECNOLOGÍAS DE LA INFORMACIÓN<br>ÁREA DESARROLLO DE SOFTWARE MULTIPLATAFORMA</strong></p>
<p style="text-align:center">ASESOR EMPRESARIAL<br><strong>ING. ALEJANDRO FIGUEROA</strong></p><p style="text-align:center">ASESOR ACADÉMICO<br><strong>ING. JORGE DE LARA HERNÁNDEZ</strong></p>
<p style="text-align:center">Calvillo, Aguascalientes, agosto de 2026</p></section><p style="page-break-before:always"></p>
<section class="contents"><h1>Contenido</h1>{toc(markdown)}</section><p style="page-break-before:always"></p>
{markdown_body(body_md)}</body></html>"""


def main() -> None:
    markdown = corrected_markdown()
    MD_OUT.write_text(markdown, encoding="utf-8")
    HTML_OUT.write_text(make_html(markdown), encoding="utf-8")
    print(MD_OUT)
    print(HTML_OUT)


if __name__ == "__main__":
    main()
