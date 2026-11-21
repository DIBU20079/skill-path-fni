"""Endpoints de inteligencia artificial: auditoría socrática y generación de ejercicios."""

from __future__ import annotations

import json
from typing import Any

from flask import Blueprint, jsonify, request

from services.ai_auditor import auditar_resolucion
from services.ai_generator import (
    explicar_paso_algebraico,
    generar_ejemplo_analogo,
    generar_ejemplo_guiado,
    generar_ejercicio_dinamico,
    generar_ejercicio_error,
)

api_ai_bp = Blueprint("api_ai", __name__)


def _decodificar_lista_json(valor: Any) -> Any:
    """Si valor es un string que representa una lista JSON, lo decodifica sin fallar ante texto plano."""
    if isinstance(valor, str) and valor.strip().startswith("["):
        try:
            return json.loads(valor)
        except json.JSONDecodeError:
            return valor
    return valor


def _obtener_datos_solicitud(detalle_error: str) -> dict[str, Any]:
    """Extrae el diccionario de campos desde JSON o multipart/form-data."""
    if request.is_json:
        json_body = request.get_json(silent=True)
        if not isinstance(json_body, dict):
            raise ValueError(detalle_error)
        return json_body
    return request.form


@api_ai_bp.post("/api/evaluar")
def evaluar_resolucion():
    """Recibe desarrollo escrito y/o foto de hoja para auditoría socrática con IA."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido o multipart/form-data."
        )

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


@api_ai_bp.post("/api/generar-ejercicio")
def api_generar_ejercicio():
    """Genera un ejercicio dinámico de 3 pasos con Gemini para el tema solicitado."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido con 'materia' y 'tema'."
        )

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        dificultad = str(datos.get("dificultad") or "base").strip()
        historial_errores = _decodificar_lista_json(datos.get("historial_errores"))

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
            dificultad=dificultad,
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


@api_ai_bp.post("/api/ejemplo-analogo")
def api_ejemplo_analogo():
    """Genera un ejemplo parecido resuelto paso a paso (andamiaje gratuito)."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido con 'materia', 'tema' y 'ejercicio_actual'."
        )

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        ejercicio_actual = str(datos.get("ejercicio_actual") or "").strip()

        if not materia or not tema or not ejercicio_actual:
            return (
                jsonify(
                    {
                        "error": "Datos incompletos",
                        "detalle": "Los campos 'materia', 'tema' y 'ejercicio_actual' son obligatorios.",
                    }
                ),
                400,
            )

        ejemplo = generar_ejemplo_analogo(
            materia=materia,
            tema=tema,
            ejercicio_actual=ejercicio_actual,
        )
        return jsonify(ejemplo), 200

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
                    "error": "Error al generar ejemplo análogo con IA",
                    "detalle": str(exc),
                }
            ),
            502,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error interno inesperado al generar ejemplo análogo",
                    "detalle": str(exc),
                }
            ),
            500,
        )


@api_ai_bp.post("/api/generar-ejercicio-error")
def api_generar_ejercicio_error():
    """Genera un ejercicio focalizado para superar un error concreto del Baúl."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido con 'materia', 'tema', 'tipo_error' y 'detalle_error'."
        )

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        tipo_error = str(datos.get("tipo_error") or "").strip()
        detalle_error = str(datos.get("detalle_error") or "").strip()

        if not tema or not detalle_error:
            return (
                jsonify(
                    {
                        "error": "Datos incompletos",
                        "detalle": "Los campos 'tema' y 'detalle_error' son obligatorios.",
                    }
                ),
                400,
            )

        ejercicio = generar_ejercicio_error(
            materia=materia,
            tema=tema,
            tipo_error=tipo_error,
            detalle_error=detalle_error,
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
                    "error": "Error al generar ejercicio correctivo con IA",
                    "detalle": str(exc),
                }
            ),
            502,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Error interno inesperado al generar ejercicio correctivo",
                    "detalle": str(exc),
                }
            ),
            500,
        )


@api_ai_bp.post("/api/explicar-paso")
def api_explicar_paso():
    """Explica brevemente qué transformación ocurrió entre dos pasos de un ejemplo guiado."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido con 'materia', 'tema', 'paso_anterior' y 'paso_actual'."
        )

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        paso_anterior = str(datos.get("paso_anterior") or "").strip()
        paso_actual = str(datos.get("paso_actual") or "").strip()
        explicacion_actual = str(datos.get("explicacion_actual") or "").strip()

        if not paso_actual:
            return (
                jsonify(
                    {
                        "error": "Datos incompletos",
                        "detalle": "El campo 'paso_actual' es obligatorio.",
                    }
                ),
                400,
            )

        aclaracion = explicar_paso_algebraico(
            materia=materia,
            tema=tema,
            paso_anterior=paso_anterior,
            paso_actual=paso_actual,
            explicacion_actual=explicacion_actual,
        )
        return jsonify(aclaracion), 200

    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": "Error al explicar paso con IA", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error interno inesperado al explicar paso", "detalle": str(exc)}), 500


@api_ai_bp.post("/api/generar-ejemplo-guiado")
def api_generar_ejemplo_guiado():
    """Genera un nuevo ejemplo guiado paso a paso para estudiar un tema."""
    try:
        datos = _obtener_datos_solicitud(
            "Envía un objeto JSON válido con 'materia' y 'tema'."
        )

        materia = str(datos.get("materia") or "").strip()
        tema = str(datos.get("tema") or "").strip()
        enunciado_previo = str(datos.get("enunciado_previo") or "").strip()

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

        ejemplo = generar_ejemplo_guiado(
            materia=materia,
            tema=tema,
            enunciado_previo=enunciado_previo,
        )
        return jsonify(ejemplo), 200

    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": "Error al generar ejemplo guiado con IA", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error interno inesperado al generar ejemplo guiado", "detalle": str(exc)}), 500
