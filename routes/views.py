"""Rutas de vistas HTML renderizadas con Jinja2."""

from __future__ import annotations

from flask import Blueprint, jsonify, render_template
from jinja2 import TemplateNotFound

views_bp = Blueprint("views", __name__)


@views_bp.get("/")
def index():
    """Renderiza la interfaz principal de la aplicación."""
    try:
        return render_template("index.html")
    except TemplateNotFound:
        return (
            jsonify(
                {
                    "error": "Plantilla no encontrada",
                    "detalle": "Aún no existe el archivo templates/index.html.",
                }
            ),
            404,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error interno al renderizar la página principal",
                    "detalle": str(exc),
                }
            ),
            500,
        )
