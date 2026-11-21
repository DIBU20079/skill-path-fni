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


def cargar_skills_combinados() -> dict[str, Any]:
    """Lee pre_u.json y facultad.json manteniendo la estructura esperada por el frontend."""
    etapas_archivos = (
        ("pre_u", PRE_U_PATH, 270),
        ("facultad", FACULTAD_PATH, 360),
    )

    combinado: dict[str, Any] = {}
    for stage_key, stage_path, default_time in etapas_archivos:
        stage_info = _leer_json(stage_path)
        materias = stage_info["materias"]
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
