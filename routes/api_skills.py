"""Endpoints de lectura y combinación del currículo multi-materia por etapa."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Blueprint, jsonify

api_skills_bp = Blueprint("api_skills", __name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PRE_U_PATH = DATA_DIR / "pre_u.json"
FACULTAD_PATH = DATA_DIR / "facultad.json"


def _leer_json(ruta: Path) -> dict[str, Any]:
    """Lee un archivo JSON en UTF-8 garantizando que el elemento raíz sea un objeto."""
    with ruta.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"El archivo {ruta.name} no contiene un objeto JSON en la raíz.")
    return data


def _construir_banco_etapa(materias: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reúne las preguntas de examen de las materias de la etapa para compatibilidad de /api/skills."""
    preguntas: list[dict[str, Any]] = []
    for mat in materias:
        for q in mat.get("preguntas_examen") or []:
            if isinstance(q, dict):
                preguntas.append(q)
    return preguntas


def _normalizar_unidades(mat: dict[str, Any], skills_norm: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def _normalizar_materias(materias: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Asegura campos opcionales de unidad, unidades y guia_aprendizaje sin alterar existentes."""
    normalizadas: list[dict[str, Any]] = []
    for mat in materias:
        if not isinstance(mat, dict):
            continue
        mat_copy = dict(mat)
        skills_norm: list[dict[str, Any]] = []
        for skill in mat.get("skills") or []:
            if not isinstance(skill, dict):
                continue
            skill_copy = dict(skill)
            if not str(skill_copy.get("unidad") or "").strip():
                skill_copy["unidad"] = "Unidad 1: Fundamentos"
            if not isinstance(skill_copy.get("guia_aprendizaje"), dict):
                skill_copy["guia_aprendizaje"] = {}
            skills_norm.append(skill_copy)
        mat_copy["skills"] = skills_norm
        mat_copy["unidades"] = _normalizar_unidades(mat_copy, skills_norm)
        normalizadas.append(mat_copy)
    return normalizadas


def cargar_skills_combinados() -> dict[str, Any]:
    """Lee pre_u.json y facultad.json manteniendo la estructura esperada por el frontend."""
    etapas_archivos = (
        ("pre_u", PRE_U_PATH, 270),
        ("facultad", FACULTAD_PATH, 360),
    )

    combinado: dict[str, Any] = {}
    for stage_key, stage_path, default_time in etapas_archivos:
        stage_info = _leer_json(stage_path)
        materias = _normalizar_materias(stage_info["materias"])
        combinado[stage_key] = {
            "id": stage_info["id"],
            "nombre": stage_info["nombre"],
            "descripcion": stage_info["descripcion"],
            "tiempo_diagnostico_seg": default_time,
            "diagnostico": _construir_banco_etapa(materias),
            "materias": materias,
        }

    return combinado


@api_skills_bp.get("/api/skills")
def get_skills():
    """Devuelve el árbol de rutas, preguntas de examen por materia y skills en JSON."""
    try:
        data = cargar_skills_combinados()
        return jsonify(data), 200
    except FileNotFoundError as exc:
        return (
            jsonify(
                {
                    "error": "Base de habilidades no encontrada",
                    "detalle": f"Falta un archivo de datos requerido en data/: {exc.filename or exc}",
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
                    "error": "Error al cargar las habilidades",
                    "detalle": str(exc),
                }
            ),
            500,
        )
