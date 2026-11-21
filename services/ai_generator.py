"""Servicio de generación de ejercicios dinámicos en LaTeX con Gemini."""

from __future__ import annotations

import re
from typing import Any, Optional, Union

from google.genai import types

from services.ai_client import _formatear_historial, _invocar_gemini_json

DYNAMIC_EXERCISE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "paso1_concepto": {
            "type": "OBJECT",
            "properties": {
                "titulo": {"type": "STRING"},
                "enunciado_latex": {"type": "STRING"},
                "opciones": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                },
                "respuesta_correcta": {"type": "STRING"},
                "explicacion": {"type": "STRING"},
            },
            "required": [
                "titulo",
                "enunciado_latex",
                "opciones",
                "respuesta_correcta",
                "explicacion",
            ],
        },
        "paso2_practica": {
            "type": "OBJECT",
            "properties": {
                "titulo": {"type": "STRING"},
                "enunciado_latex": {"type": "STRING"},
                "respuesta_correcta": {"type": "STRING"},
                "respuestas_aceptadas": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                },
                "pista": {"type": "STRING"},
            },
            "required": [
                "titulo",
                "enunciado_latex",
                "respuesta_correcta",
                "respuestas_aceptadas",
                "pista",
            ],
        },
        "paso3_reto_foto": {
            "type": "OBJECT",
            "properties": {
                "titulo": {"type": "STRING"},
                "enunciado_latex": {"type": "STRING"},
                "prerrequisito_evaluado": {"type": "STRING"},
                "instrucciones": {"type": "STRING"},
            },
            "required": [
                "titulo",
                "enunciado_latex",
                "prerrequisito_evaluado",
                "instrucciones",
            ],
        },
    },
    "required": ["paso1_concepto", "paso2_practica", "paso3_reto_foto"],
}

EXERCISE_GEN_SYSTEM_INSTRUCTION = """Eres un docente universitario de Ciencias Básicas de Ingeniería (FNI) creando retos inéditos en español.

REGLAS ESTRICTAS DE GENERACIÓN:
1. Genera un ejercicio completamente nuevo y distinto a los ejemplos estándar, adaptado exactamente a la materia y tema solicitados, reforzando las fallas del historial de errores si existen.
2. Usa formato LaTeX válido compatible con KaTeX encerrando TODA fórmula entre `$ ... $` (inline) o `$$ ... $$` (display). Nunca dejes comandos LaTeX sueltos sin signos `$`.
3. `paso1_concepto`: pregunta conceptual rápida con exactamente 4 `opciones` distintas y verosímiles. La cadena `respuesta_correcta` debe ser EXACTAMENTE idéntica carácter por carácter a una de las 4 entradas de `opciones`.
4. `paso2_practica`: ejercicio corto de respuesta única numérica o fracción simple (ej. "8", "-3", "1/2", "5"). Incluye en `respuestas_aceptadas` la respuesta exacta y variantes equivalentes (ej. ["1/2", "0.5", "0,5"]).
5. `paso3_reto_foto`: problema tipo examen universitario desafiante y bien planteado (con solución algebraica/física limpia, sin datos contradictorios) para que el estudiante lo resuelva paso a paso en una hoja de papel y suba la foto.
6. Devuelve estrictamente JSON válido según el esquema."""


def _normalizar_ejercicio_dinamico(payload: dict[str, Any]) -> dict[str, Any]:
    """Valida y normaliza los 3 pasos generados por IA antes de enviarlos al cliente."""
    p1_raw = payload.get("paso1_concepto")
    p2_raw = payload.get("paso2_practica")
    p3_raw = payload.get("paso3_reto_foto")

    if (
        not isinstance(p1_raw, dict)
        or not isinstance(p2_raw, dict)
        or not isinstance(p3_raw, dict)
    ):
        raise RuntimeError("El ejercicio generado no incluye los 3 pasos completos.")

    opciones = [
        str(opt).strip() for opt in (p1_raw.get("opciones") or []) if str(opt).strip()
    ]
    if len(opciones) < 2:
        raise RuntimeError("El paso 1 generado no contiene suficientes opciones.")
    opciones = opciones[:4]

    resp1 = str(p1_raw.get("respuesta_correcta") or "").strip()
    if resp1 not in opciones:
        compact = lambda s: re.sub(r"\s+", "", s)
        match = next((o for o in opciones if compact(o) == compact(resp1)), None)
        if match is None:
            raise RuntimeError(
                "La respuesta correcta del paso 1 no coincide con ninguna opción."
            )
        resp1 = match

    enun1 = str(p1_raw.get("enunciado_latex") or "").strip()
    enun2 = str(p2_raw.get("enunciado_latex") or "").strip()
    resp2 = str(p2_raw.get("respuesta_correcta") or "").strip()
    enun3 = str(p3_raw.get("enunciado_latex") or "").strip()

    if not enun1 or not enun2 or not resp2 or not enun3:
        raise RuntimeError(
            "El ejercicio generado contiene enunciados o respuestas vacías."
        )

    aceptadas = [
        str(val).strip()
        for val in (p2_raw.get("respuestas_aceptadas") or [])
        if str(val).strip()
    ]
    if resp2 not in aceptadas:
        aceptadas.insert(0, resp2)

    return {
        "paso1_concepto": {
            "titulo": str(p1_raw.get("titulo") or "Concepto clave (IA)").strip(),
            "enunciado_latex": enun1,
            "opciones": opciones,
            "respuesta_correcta": resp1,
            "explicacion": str(
                p1_raw.get("explicacion")
                or "Aplica directamente la propiedad fundamental del tema."
            ).strip(),
        },
        "paso2_practica": {
            "titulo": str(p2_raw.get("titulo") or "Práctica rápida (IA)").strip(),
            "enunciado_latex": enun2,
            "respuesta_correcta": resp2,
            "respuestas_aceptadas": aceptadas,
            "pista": str(
                p2_raw.get("pista")
                or "Descompón el problema paso a paso antes de operar."
            ).strip(),
        },
        "paso3_reto_foto": {
            "titulo": str(
                p3_raw.get("titulo") or "Reto de examen en papel (IA)"
            ).strip(),
            "enunciado_latex": enun3,
            "prerrequisito_evaluado": str(
                p3_raw.get("prerrequisito_evaluado")
                or "Dominio operativo y conceptual del tema."
            ).strip(),
            "instrucciones": str(
                p3_raw.get("instrucciones")
                or "Desarrolla todos los pasos en una hoja de papel con letra legible y sube la foto para auditoría socrática."
            ).strip(),
        },
    }


def generar_ejercicio_dinamico(
    materia: str,
    tema: str,
    historial_errores: Optional[Union[str, list]] = None,
) -> dict[str, Any]:
    """Genera un ejercicio inédito de 3 pasos en LaTeX para la materia y tema dados."""
    materia_limpia = (materia or "").strip()
    tema_limpio = (tema or "").strip()

    if not materia_limpia or not tema_limpio:
        raise ValueError(
            "Los campos 'materia' y 'tema' son obligatorios para generar un ejercicio."
        )

    historial_texto = _formatear_historial(historial_errores)
    prompt_generacion = (
        "Genera un ejercicio universitario completamente nuevo y original de 3 sub-pasos.\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_limpio}\n"
        f"ERRORES RECIENTES DEL ESTUDIANTE (BAÚL DE ERRORES):\n{historial_texto}\n\n"
        "Diseña el Paso 1 (concepto con 4 opciones), el Paso 2 (práctica corta numérica/fraccionaria) "
        "y el Paso 3 (reto completo en papel con LaTeX) enfocado en reforzar este tema sin repetir ejercicios triviales."
    )

    config = types.GenerateContentConfig(
        system_instruction=EXERCISE_GEN_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=DYNAMIC_EXERCISE_SCHEMA,
        temperature=0.8,
    )
    payload = _invocar_gemini_json([prompt_generacion], config)
    return _normalizar_ejercicio_dinamico(payload)
