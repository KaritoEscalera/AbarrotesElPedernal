#!/usr/bin/env python3
"""Integra las secciones revisadas del informe Markdown en el ODT institucional."""

from __future__ import annotations

import copy
import pathlib
import re
import sys
import xml.etree.ElementTree as ET


TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
TEXT_P = f"{{{TEXT_NS}}}p"
TEXT_H = f"{{{TEXT_NS}}}h"


def visible_text(element: ET.Element) -> str:
    return "".join(element.itertext()).strip()


def set_plain_text(element: ET.Element, value: str) -> None:
    for child in list(element):
        element.remove(child)
    element.text = value


def markdown_blocks(source: str, start: str, end: str) -> list[tuple[str, str]]:
    section = source.split(start, 1)[1].split(end, 1)[0]
    blocks: list[tuple[str, str]] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            text = " ".join(line.strip() for line in paragraph)
            text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
            blocks.append(("p", text))
            paragraph.clear()

    for raw_line in section.splitlines():
        line = raw_line.strip()
        if not line:
            flush()
        elif line.startswith("## "):
            flush()
            blocks.append(("h", line[3:].strip()))
        elif line != "---":
            paragraph.append(line)
    flush()
    return blocks


def find_element(root: ET.Element, text: str, tag: str | None = None) -> ET.Element:
    for element in root.iter():
        if (tag is None or element.tag == tag) and visible_text(element) == text:
            return element
    raise ValueError(f"No se encontró el elemento: {text}")


def replace_direct_range(
    parent: ET.Element,
    first: ET.Element,
    last_exclusive: ET.Element,
    replacements: list[ET.Element],
) -> None:
    children = list(parent)
    start = children.index(first)
    end = children.index(last_exclusive)
    for element in children[start:end]:
        parent.remove(element)
    insertion = start
    for element in replacements:
        parent.insert(insertion, element)
        insertion += 1


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: update_report_odt.py CONTENT_XML INFORME_MD OUTPUT_XML")

    xml_path = pathlib.Path(sys.argv[1])
    markdown_path = pathlib.Path(sys.argv[2])
    output_path = pathlib.Path(sys.argv[3])
    markdown = markdown_path.read_text(encoding="utf-8")

    tree = ET.parse(xml_path)
    root = tree.getroot()
    parent_by_child = {child: parent for parent in root.iter() for child in parent}

    # Introducción: conserva su título y reemplaza el contenido hasta el capítulo 1.
    intro_title = find_element(root, "Introducción", TEXT_P)
    chapter_one = find_element(root, "Capítulo 1. Marco Referencial", TEXT_H)
    intro_parent = parent_by_child[intro_title]
    if intro_parent is not parent_by_child[chapter_one]:
        raise ValueError("La introducción y el capítulo 1 no comparten el mismo contenedor")
    intro_template = next(
        element for element in list(intro_parent)[list(intro_parent).index(intro_title) + 1 :]
        if element.tag == TEXT_P and visible_text(element)
    )
    intro_elements: list[ET.Element] = []
    for kind, text in markdown_blocks(markdown, "# Introducción", "---"):
        if kind != "p":
            continue
        element = copy.deepcopy(intro_template)
        set_plain_text(element, text)
        intro_elements.append(element)
    intro_children = list(intro_parent)
    intro_start = intro_children.index(intro_title) + 1
    intro_end = intro_children.index(chapter_one)
    for element in intro_children[intro_start:intro_end]:
        intro_parent.remove(element)
    for offset, element in enumerate(intro_elements):
        intro_parent.insert(intro_start + offset, element)

    # Marco teórico: conserva la portada del capítulo y sustituye el desarrollo temático.
    chapter_three = find_element(root, "Capítulo 3. Marco Teórico", TEXT_H)
    chapter_four = find_element(root, "Capítulo 4. Desarrollo del Proyecto", TEXT_H)
    chapter_parent = parent_by_child[chapter_three]
    if chapter_parent is not parent_by_child[chapter_four]:
        raise ValueError("Los capítulos 3 y 4 no comparten el mismo contenedor")
    chapter_children = list(chapter_parent)
    chapter_start = chapter_children.index(chapter_three)
    chapter_end = chapter_children.index(chapter_four)
    old_section_heading = next(
        element for element in chapter_children[chapter_start + 1 : chapter_end]
        if element.tag == TEXT_H and visible_text(element).startswith("3.1 ")
    )
    old_paragraph = next(
        element for element in chapter_children[chapter_start + 1 : chapter_end]
        if element.tag == TEXT_P and visible_text(element)
    )
    # Los párrafos vacíos anteriores a 3.1 separan la portada del contenido.
    first_section_index = chapter_children.index(old_section_heading)
    new_chapter_elements: list[ET.Element] = []
    for kind, text in markdown_blocks(markdown, "# Capítulo 3. Marco Teórico", "---"):
        template = old_section_heading if kind == "h" else old_paragraph
        element = copy.deepcopy(template)
        set_plain_text(element, text)
        new_chapter_elements.append(element)
    for element in chapter_children[first_section_index:chapter_end]:
        chapter_parent.remove(element)
    for offset, element in enumerate(new_chapter_elements):
        chapter_parent.insert(first_section_index + offset, element)

    # Alinea el desarrollo y las tablas finales con las funciones vigentes de la app.
    paragraph_replacements = {
        "Al inicio de cada ciclo se seleccionaron funciones prioritarias.": (
            "Al inicio de cada ciclo se seleccionaron funciones prioritarias. Posteriormente se "
            "desarrolló una versión funcional y se presentó al asesor empresarial. Las "
            "observaciones obtenidas se incorporaron al siguiente ciclo. Este proceso permitió "
            "detectar necesidades que no eran evidentes durante el levantamiento inicial, como "
            "la captura de gramos en ventas a granel, los pagos mixtos y las ventas suspendidas."
        ),
        "También se amplió el manejo de pagos.": (
            "También se amplió el manejo de pagos. Una venta puede cubrirse con efectivo, "
            "terminal, transferencia, fiado o una combinación de estos métodos. La validación "
            "comprueba que la suma coincida con el total y conserva las referencias necesarias "
            "para facilitar aclaraciones."
        ),
        "El cobro separa los métodos de pago y valida sus condiciones.": (
            "El cobro separa los métodos de pago y valida sus condiciones. El efectivo requiere "
            "una cantidad suficiente; los pagos mediante terminal y transferencia solicitan una "
            "referencia; y el fiado necesita un cliente elegible. En pagos mixtos se aplican "
            "simultáneamente las reglas correspondientes a cada método."
        ),
        "Una venta puede distribuirse entre efectivo, tarjeta, transferencia, fiado y saldo a favor.": (
            "Una venta puede distribuirse entre efectivo, terminal, transferencia y fiado. El "
            "servidor suma los pagos y compara el resultado con el total. Se utiliza una tolerancia "
            "de centavos para evitar diferencias derivadas de la representación decimal."
        ),
        "El módulo de Caja registra la apertura del turno": (
            "El módulo de Caja registra la apertura del turno, el fondo inicial, las ventas, los "
            "métodos de pago, el cambio y el cierre. Admite efectivo, terminal, transferencia, "
            "fiado y pagos mixtos. Esta función facilita el control del efectivo esperado y la "
            "identificación de diferencias durante el arqueo."
        ),
    }
    for element in root.iter():
        if element.tag not in (TEXT_P, TEXT_H):
            continue
        current = visible_text(element)
        for prefix, replacement in paragraph_replacements.items():
            if current.startswith(prefix):
                set_plain_text(element, replacement)
                break

    # Sustituciones breves dentro de celdas y reglas de negocio.
    short_replacements = {
        "El saldo a favor utilizado no puede superar el disponible.":
            "La suma de un pago mixto debe coincidir con el total de la venta.",
        "efectivo, tarjeta, transferencia, fiado, saldo a favor y mixto":
            "efectivo, terminal, transferencia, fiado y mixto",
    }
    for element in root.iter():
        if element.tag not in (TEXT_P, TEXT_H):
            continue
        current = visible_text(element)
        if current in short_replacements:
            set_plain_text(element, short_replacements[current])

    ET.register_namespace("text", TEXT_NS)
    tree.write(output_path, encoding="UTF-8", xml_declaration=True)


if __name__ == "__main__":
    main()
