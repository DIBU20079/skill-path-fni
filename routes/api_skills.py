"""Endpoints de lectura dinámica del currículo unificado (5 materias) y Red de Conocimientos."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Blueprint, jsonify

api_skills_bp = Blueprint("api_skills", __name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MATERIAS_DIR = DATA_DIR / "materias"
RED_PATH = DATA_DIR / "red_conocimientos.json"


def _leer_json(ruta: Path) -> dict[str, Any]:
    """Lee un archivo JSON en UTF-8 garantizando que el elemento raíz sea un objeto."""
    with ruta.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"El archivo {ruta.name} no contiene un objeto JSON en la raíz.")
    return data


def _construir_banco_etapa(materias: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reúne las preguntas de examen de un conjunto de materias."""
    preguntas: list[dict[str, Any]] = []
    for mat in materias:
        for q in mat.get("preguntas_examen") or []:
            if isinstance(q, dict):
                preguntas.append(q)
    return preguntas


def _normalizar_unidades(
    mat: dict[str, Any],
    skills_norm: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Preserva el arreglo `unidades` o lo deriva de los skills manteniendo orden e integridad."""
    skill_ids_validos = {s["id"] for s in skills_norm if s.get("id")}
    raw_unidades = mat.get("unidades")
    unidades_norm: list[dict[str, Any]] = []

    if isinstance(raw_unidades, list) and len(raw_unidades) > 0:
        for idx, unit in enumerate(raw_unidades, start=1):
            if not isinstance(unit, dict):
                continue
            unit_id = str(unit.get("id") or f"{mat.get('id', 'mat')}_u{idx}").strip()
            titulo = str(unit.get("titulo") or f"Unidad {idx}").strip()
            descripcion = str(unit.get("descripcion") or "").strip()
            nodos_ids = [
                str(nid).strip()
                for nid in (unit.get("nodos_ids") or [])
                if str(nid).strip() in skill_ids_validos
            ]
            bases_norm: list[dict[str, str]] = []
            for base in unit.get("bases_requeridas") or []:
                if isinstance(base, dict) and str(base.get("id") or "").strip():
                    bases_norm.append(
                        {
                            "id": str(base["id"]).strip(),
                            "nombre": str(base.get("nombre") or base["id"]).strip(),
                        }
                    )
            if nodos_ids:
                unidades_norm.append(
                    {
                        "id": unit_id,
                        "titulo": titulo,
                        "descripcion": descripcion,
                        "bases_requeridas": bases_norm,
                        "nodos_ids": nodos_ids,
                    }
                )

    if not unidades_norm:
        por_titulo: dict[str, list[str]] = {}
        for s in skills_norm:
            titulo = str(s.get("unidad") or "Unidad 1: Fundamentos").strip()
            por_titulo.setdefault(titulo, []).append(s["id"])
        for idx, (titulo, nodos_ids) in enumerate(por_titulo.items(), start=1):
            unidades_norm.append(
                {
                    "id": f"{mat.get('id', 'mat')}_u{idx}",
                    "titulo": titulo,
                    "descripcion": "",
                    "bases_requeridas": [],
                    "nodos_ids": nodos_ids,
                }
            )

    return unidades_norm


def _normalizar_materia(mat: dict[str, Any]) -> dict[str, Any]:
    """Normaliza una materia individual y asegura todos sus campos obligatorios."""
    mat_copy = dict(mat)
    nivel = int(mat_copy.get("nivel", 1 if mat_copy.get("etapa") == "facultad" else 0))
    mat_copy["nivel"] = nivel
    if not str(mat_copy.get("etapa") or "").strip():
        mat_copy["etapa"] = "pre_u" if nivel == 0 else "facultad"
    if not str(mat_copy.get("area") or "").strip():
        mat_copy["area"] = "matematicas"

    skills_norm: list[dict[str, Any]] = []
    for skill in mat.get("skills") or []:
        if not isinstance(skill, dict):
            continue
        skill_copy = dict(skill)
        if not str(skill_copy.get("unidad") or "").strip():
            skill_copy["unidad"] = "Unidad 1: Fundamentos"
        if not isinstance(skill_copy.get("guia_aprendizaje"), dict):
            skill_copy["guia_aprendizaje"] = {}
        if not str(skill_copy.get("prioridad") or "").strip():
            freq_digits = "".join(
                ch for ch in str(skill_copy.get("frecuencia_examen") or "85") if ch.isdigit()
            )
            freq_num = int(freq_digits) if freq_digits else 85
            skill_copy["prioridad"] = (
                "🔥 Fijo en Parcial"
                if freq_num >= 94
                else "⭐ Muy frecuente"
                if freq_num >= 90
                else "📌 Base clave"
            )
        skills_norm.append(skill_copy)

    mat_copy["skills"] = skills_norm
    mat_copy["unidades"] = _normalizar_unidades(mat_copy, skills_norm)
    return mat_copy


def _cargar_catalogo_materias(red_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Carga dinámicamente todos los archivos JSON en `data/materias/` siguiendo el orden de la red."""
    if not MATERIAS_DIR.exists():
        raise FileNotFoundError(f"No existe el directorio {MATERIAS_DIR}")

    por_id: dict[str, dict[str, Any]] = {}
    orden_preferido: list[str] = []

    for entry in red_data.get("materias") or []:
        if not isinstance(entry, dict):
            continue
        archivo = str(entry.get("archivo") or f"{entry.get('id', '')}.json").strip()
        ruta = MATERIAS_DIR / archivo
        if ruta.exists():
            mat_norm = _normalizar_materia(_leer_json(ruta))
            mat_id = str(mat_norm.get("id") or entry.get("id") or "").strip()
            if mat_id:
                mat_norm["id"] = mat_id
                por_id[mat_id] = mat_norm
                orden_preferido.append(mat_id)

    for ruta in sorted(MATERIAS_DIR.glob("*.json")):
        mat_norm = _normalizar_materia(_leer_json(ruta))
        mat_id = str(mat_norm.get("id") or ruta.stem).strip()
        if mat_id and mat_id not in por_id:
            mat_norm["id"] = mat_id
            por_id[mat_id] = mat_norm
            orden_preferido.append(mat_id)

    materias = [por_id[mid] for mid in orden_preferido if mid in por_id]
    materias.sort(key=lambda m: (int(m.get("nivel", 0)), orden_preferido.index(m["id"])))
    return materias


def cargar_skills_combinados() -> dict[str, Any]:
    """Lee `data/red_conocimientos.json` y `data/materias/*.json` devolviendo el catálogo unificado."""
    red_raw = _leer_json(RED_PATH)
    materias = _cargar_catalogo_materias(red_raw)
    mat_ids_activos = {m["id"] for m in materias}

    red_materias = [
        {
            "id": m["id"],
            "nombre": m["nombre"],
            "codigo": m.get("codigo", ""),
            "nivel": m["nivel"],
            "etapa": m["etapa"],
            "area": m.get("area", "matematicas"),
            "descripcion": m.get("descripcion", ""),
        }
        for m in materias
    ]

    conexiones_norm: list[dict[str, Any]] = []
    for conn in red_raw.get("conexiones") or []:
        if not isinstance(conn, dict):
            continue
        origen = str(conn.get("origen") or "").strip()
        destino = str(conn.get("destino") or "").strip()
        if origen in mat_ids_activos and destino in mat_ids_activos:
            conexiones_norm.append(dict(conn))

    pre_u_materias = [m for m in materias if int(m.get("nivel", 0)) == 0]
    facultad_materias = [m for m in materias if int(m.get("nivel", 0)) >= 1]

    return {
        "materias": materias,
        "red_conocimientos": {
            "materias": red_materias,
            "conexiones": conexiones_norm,
        },
        "pre_u": {
            "id": "pre_u",
            "nombre": "Nivel 0 · Fundamentos",
            "descripcion": "Álgebra de Supervivencia, Trigonometría Aplicada y Geometría Analítica.",
            "tiempo_diagnostico_seg": 270,
            "diagnostico": _construir_banco_etapa(pre_u_materias),
            "materias": pre_u_materias,
        },
        "facultad": {
            "id": "facultad",
            "nombre": "Nivel 1 · Ciencias Básicas I",
            "descripcion": "Cálculo I (MAT 1101) y Física I (FIS 1100) conectadas con Nivel 0.",
            "tiempo_diagnostico_seg": 360,
            "diagnostico": _construir_banco_etapa(facultad_materias),
            "materias": facultad_materias,
        },
    }


@api_skills_bp.get("/api/skills")
def get_skills():
    """Devuelve el catálogo unificado de materias, la red de conocimientos y los niveles compatibles."""
    try:
        data = cargar_skills_combinados()
        return jsonify(data), 200
    except FileNotFoundError as exc:
        return (
            jsonify(
                {
                    "error": "Base curricular no encontrada",
                    "detalle": f"Falta un archivo requerido en data/: {exc.filename or exc}",
                }
            ),
            404,
        )
    except json.JSONDecodeError as exc:
        return (
            jsonify(
                {
                    "error": "Error de formato en los datos JSON",
                    "detalle": f"JSON inválido en data/: {exc}",
                }
            ),
            500,
        )
    except (KeyError, ValueError) as exc:
        return (
            jsonify(
                {
                    "error": "Estructura inválida en archivos de currículo",
                    "detalle": str(exc),
                }
            ),
            500,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error inesperado al cargar materias y red de conocimientos",
                    "detalle": str(exc),
                }
            ),
            500,
        )
