"""Servidor Flask principal para la plataforma educativa de Ciencias Básicas."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from jinja2 import TemplateNotFound
from werkzeug.exceptions import RequestEntityTooLarge

from ai_tutor import auditar_resolucion, generar_ejercicio_dinamico

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
SKILLS_DB_PATH = BASE_DIR / "data" / "skills_db.json"

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # Límite de 10 MB por solicitud
app.json.ensure_ascii = False

CORS(app)


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(_error: RequestEntityTooLarge):
    """Devuelve un JSON claro cuando la imagen supera el tamaño permitido."""
    return (
        jsonify(
            {
                "error": "Archivo demasiado grande",
                "detalle": "La imagen supera el límite máximo permitido de 10 MB.",
            }
        ),
        413,
    )


@app.get("/")
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


@app.get("/api/skills")
def get_skills():
    """Devuelve el árbol de rutas, diagnósticos y skills en formato JSON."""
    try:
        with SKILLS_DB_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return jsonify(data), 200
    except FileNotFoundError:
        return (
            jsonify(
                {
                    "error": "Base de habilidades no encontrada",
                    "detalle": "No se encontró el archivo data/skills_db.json.",
                }
            ),
            404,
        )
    except json.JSONDecodeError as exc:
        return (
            jsonify(
                {
                    "error": "Error de formato en skills_db.json",
                    "detalle": f"JSON inválido en data/skills_db.json: {exc}",
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


def _decodificar_lista_json(valor: Any) -> Any:
    """Si valor es un string que representa una lista JSON, lo decodifica sin fallar ante texto plano."""
    if isinstance(valor, str) and valor.strip().startswith("["):
        try:
            return json.loads(valor)
        except json.JSONDecodeError:
            return valor
    return valor


@app.post("/api/evaluar")
def evaluar_resolucion():
    """Recibe desarrollo escrito y/o foto de hoja para auditoría socrática con IA."""
    try:
        datos: dict[str, Any]
        if request.is_json:
            json_body = request.get_json(silent=True)
            if not isinstance(json_body, dict):
                return (
                    jsonify(
                        {
                            "error": "Cuerpo JSON inválido",
                            "detalle": "Envía un objeto JSON válido o multipart/form-data.",
                        }
                    ),
                    400,
                )
            datos = json_body
        else:
            datos = request.form

        enunciado = str(datos.get("enunciado") or "").strip()
        prerrequisito = str(datos.get("prerrequisito") or "").strip()
        prerrequisito_id = str(datos.get("prerrequisito_id") or "").strip()
        texto_usuario = str(datos.get("texto_usuario") or "").strip()
        historial_errores = _decodificar_lista_json(datos.get("historial_errores"))
        intentos_previos_ejercicio = _decodificar_lista_json(
            datos.get("intentos_previos_ejercicio")
        )

        imagen_bytes: bytes | None = None
        mime_type: str | None = None

        archivo_foto = request.files.get("foto")
        if archivo_foto is not None and (archivo_foto.filename or "").strip():
            mime_subido = (archivo_foto.mimetype or "").split(";")[0].strip().lower()
            if mime_subido and not (
                mime_subido.startswith("image/")
                or mime_subido == "application/octet-stream"
            ):
                return (
                    jsonify(
                        {
                            "error": "Formato de archivo no permitido",
                            "detalle": "El archivo 'foto' debe ser una imagen válida (JPG, PNG o WEBP).",
                        }
                    ),
                    400,
                )

            imagen_bytes = archivo_foto.read()
            if not imagen_bytes:
                return (
                    jsonify(
                        {
                            "error": "Imagen vacía",
                            "detalle": "El archivo 'foto' adjunto no contiene datos.",
                        }
                    ),
                    400,
                )
            mime_type = mime_subido or None

        if not enunciado:
            return (
                jsonify(
                    {
                        "error": "Datos incompletos",
                        "detalle": "El campo 'enunciado' es obligatorio.",
                    }
                ),
                400,
            )

        if not texto_usuario and imagen_bytes is None:
            return (
                jsonify(
                    {
                        "error": "Evidencia faltante",
                        "detalle": "Debes escribir tu procedimiento en 'texto_usuario' o adjuntar una imagen en 'foto'.",
                    }
                ),
                400,
            )

        resultado = auditar_resolucion(
            enunciado=enunciado,
            prerrequisito=prerrequisito,
            texto_usuario=texto_usuario,
            imagen_bytes=imagen_bytes,
            mime_type=mime_type,
            historial_errores=historial_errores,
            intentos_previos_ejercicio=intentos_previos_ejercicio,
            prerrequisito_id=prerrequisito_id,
        )
        return jsonify(resultado), 200

    except ValueError as exc:
        return (
            jsonify(
                {
                    "error": "Solicitud inválida",
                    "detalle": str(exc),
                }
            ),
            400,
        )
    except RuntimeError as exc:
        return (
            jsonify(
                {
                    "error": "Error en el servicio de tutoría IA",
                    "detalle": str(exc),
                }
            ),
            502,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error interno inesperado al evaluar la resolución",
                    "detalle": str(exc),
                }
            ),
            500,
        )


@app.post("/api/generar-ejercicio")
def api_generar_ejercicio():
    """Genera un ejercicio dinámico de 3 pasos con Gemini para el tema solicitado."""
    try:
        datos: dict[str, Any]
        if request.is_json:
            json_body = request.get_json(silent=True)
            if not isinstance(json_body, dict):
                return (
                    jsonify(
                        {
                            "error": "Cuerpo JSON inválido",
                            "detalle": "Envía un objeto JSON válido con 'materia' y 'tema'.",
                        }
                    ),
                    400,
                )
            datos = json_body
        else:
            datos = request.form

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        historial_errores = datos.get("historial_errores")

        if isinstance(historial_errores, str) and historial_errores.strip().startswith("["):
            try:
                historial_errores = json.loads(historial_errores)
            except json.JSONDecodeError:
                pass

        if not materia or not tema:
            return (
                jsonify(
                    {
                        "error": "Datos incompletos",
                        "detalle": "Los campos 'materia' y 'tema' son obligatorios.",
                    }
                ),
                400,
            )

        ejercicio = generar_ejercicio_dinamico(
            materia=materia,
            tema=tema,
            historial_errores=historial_errores,
        )
        return jsonify(ejercicio), 200

    except ValueError as exc:
        return (
            jsonify(
                {
                    "error": "Solicitud inválida",
                    "detalle": str(exc),
                }
            ),
            400,
        )
    except RuntimeError as exc:
        return (
            jsonify(
                {
                    "error": "Error al generar ejercicio dinámico con IA",
                    "detalle": str(exc),
                }
            ),
            502,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error interno inesperado al generar el ejercicio",
                    "detalle": str(exc),
                }
            ),
            500,
        )


if __name__ == "__main__":
    puerto = int(os.getenv("PORT", "5000"))
    modo_debug = os.getenv("FLASK_DEBUG", "false").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    app.run(host="0.0.0.0", port=puerto, debug=modo_debug, threaded=True)
