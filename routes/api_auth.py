"""Blueprint base para futura autenticación y sincronización de progreso en nube."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.db_cloud import (
    get_storage_status,
    get_student_progress,
    save_student_progress,
)

api_auth_bp = Blueprint("api_auth", __name__, url_prefix="/api/auth")


@api_auth_bp.get("/status")
def auth_storage_status():
    """Informa si la sincronización en nube está activa o si opera en respaldo local."""
    return jsonify(get_storage_status()), 200


@api_auth_bp.get("/sync/<user_id>")
def sync_get_progress(user_id: str):
    """Obtiene el progreso remoto de un usuario o indica respaldo en localStorage."""
    try:
        resultado = get_student_progress(user_id)
        return jsonify(resultado), 200
    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": "Error al consultar progreso", "detalle": str(exc)}), 500


@api_auth_bp.post("/sync")
def sync_save_progress():
    """Recibe el progreso del estudiante para futura sincronización con Supabase."""
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return (
                jsonify(
                    {
                        "error": "Cuerpo JSON inválido",
                        "detalle": "Envía un objeto JSON con 'user_id' y 'progress'.",
                    }
                ),
                400,
            )

        user_id = str(payload.get("user_id") or "").strip()
        progress = payload.get("progress")
        resultado = save_student_progress(user_id=user_id, progress=progress)
        return jsonify(resultado), 200
    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": "Error al sincronizar progreso", "detalle": str(exc)}), 500
