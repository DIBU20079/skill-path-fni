"""Endpoints de lectura y combinación del currículo multi-materia."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Blueprint, jsonify

api_skills_bp = Blueprint("api_skills", __name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DIAGNOSTICO_PATH = DATA_DIR / "diagnostico.json"
PRE_U_PATH = DATA_DIR / "pre_u.json"
FACULTAD_PATH = DATA_DIR / "facultad.json"


def _leer_json(ruta: Path) -> dict[str, Any]:
    """Lee un archivo JSON en UTF-8 garantizando que el elemento raíz sea un objeto."""
    with ruta.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"El archivo {ruta.name} no contiene un objeto JSON en la raíz.")
    return data


def cargar_skills_combinados() -> dict[str, Any]:
    """Une diagnostico.json, pre_u.json y facultad.json conservando el contrato del frontend."""
    diag_data = _leer_json(DIAGNOSTICO_PATH)
    etapas_archivos = (
        ("pre_u", PRE_U_PATH),
        ("facultad", FACULTAD_PATH),
    )

    combinado: dict[str, Any] = {}
    for stage_key, stage_path in etapas_archivos:
        stage_info = _leer_json(stage_path)
        stage_diag = diag_data[stage_key]
        combinado[stage_key] = {
            "id": stage_info["id"],
            "nombre": stage_info["nombre"],
            "descripcion": stage_info["descripcion"],
            "tiempo_diagnostico_seg": stage_diag["tiempo_diagnostico_seg"],
            "diagnostico": stage_diag["diagnostico"],
            "materias": stage_info["materias"],
        }

    return combinado


@api_skills_bp.get("/api/skills")
def get_skills():
    """Devuelve el árbol de rutas, diagnósticos y skills combinados en JSON."""
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
