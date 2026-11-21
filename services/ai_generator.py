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


ANALOGOUS_EXAMPLE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "enunciado": {"type": "STRING"},
        "pasos": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
        },
        "conclusion": {"type": "STRING"},
    },
    "required": ["enunciado", "pasos", "conclusion"],
}

ANALOGOUS_EXAMPLE_SYSTEM_INSTRUCTION = """Eres un docente universitario de Ciencias Básicas de Ingeniería (FNI) creando un ejemplo de andamiaje pedagógico en español.

REGLAS ESTRICTAS:
1. Genera un ejercicio ANÁLOGO y DIFERENTE del `ejercicio_actual`, del mismo tema y nivel de dificultad.
2. ESTÁ TERMINANTEMENTE PROHIBIDO resolver `ejercicio_actual`, continuar el desarrollo del usuario o reutilizar sus números/coeficientes exactos. Cambia los valores numéricos o funciones conservando el mismo método de resolución.
3. Muestra la resolución completa paso a paso en `pasos` (cada elemento debe iniciar con "Paso N: ...").
4. Toda expresión matemática debe usar LaTeX válido compatible con KaTeX delimitado por `$ ... $` (inline) o `$$ ... $$` (display). Nunca dejes comandos LaTeX sueltos sin signos `$`.
5. Devuelve estrictamente JSON válido según el esquema."""

ERROR_DRILL_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "enunciado": {"type": "STRING"},
        "pista_inicial": {"type": "STRING"},
        "objetivo": {"type": "STRING"},
    },
    "required": ["enunciado", "pista_inicial", "objetivo"],
}

ERROR_DRILL_SYSTEM_INSTRUCTION = """Eres un tutor socrático de Ciencias Básicas de Ingeniería (FNI) diseñando micro-retos correctivos en español.

REGLAS ESTRICTAS:
1. Crea un ejercicio universitario breve, claro y resoluble en una hoja de papel que ataque DIRECTAMENTE el error recurrente indicado en `tipo_error` y `detalle_error`.
2. Todo cálculo o fórmula debe usar LaTeX válido compatible con KaTeX entre `$ ... $` o `$$ ... $$`.
3. `pista_inicial` debe prevenir al estudiante sobre la trampa típica sin revelar la respuesta ni los pasos completos.
4. `objetivo` debe ser una oración clara describiendo qué habilidad demuestra al resolverlo correctamente.
5. Devuelve estrictamente JSON válido según el esquema."""


def _normalizar_ejemplo_analogo(payload: dict[str, Any]) -> dict[str, Any]:
    """Valida y normaliza la estructura JSON del ejemplo análogo paso a paso."""
    if not isinstance(payload, dict):
        raise RuntimeError("El ejemplo análogo devuelto por IA no tiene formato JSON válido.")

    enunciado = str(payload.get("enunciado") or "").strip()
    pasos_raw = payload.get("pasos") or []
    pasos = [str(p).strip() for p in pasos_raw if str(p).strip()]
    conclusion = str(payload.get("conclusion") or "").strip()

    if not enunciado or not pasos or not conclusion:
        raise RuntimeError(
            "El ejemplo análogo generado está incompleto (faltan enunciado, pasos o conclusión)."
        )

    pasos_formateados = [
        p if p.lower().startswith("paso ") else f"Paso {idx + 1}: {p}"
        for idx, p in enumerate(pasos)
    ]

    return {
        "enunciado": enunciado,
        "pasos": pasos_formateados,
        "conclusion": conclusion,
    }


def _normalizar_ejercicio_error(payload: dict[str, Any]) -> dict[str, str]:
    """Valida y normaliza el reto focalizado para superar un error del Baúl."""
    if not isinstance(payload, dict):
        raise RuntimeError("El ejercicio correctivo devuelto por IA no es un objeto válido.")

    enunciado = str(payload.get("enunciado") or "").strip()
    pista_inicial = str(payload.get("pista_inicial") or "").strip()
    objetivo = str(payload.get("objetivo") or "").strip()

    if not enunciado or not pista_inicial or not objetivo:
        raise RuntimeError(
            "El ejercicio correctivo generado está incompleto."
        )

    return {
        "enunciado": enunciado,
        "pista_inicial": pista_inicial,
        "objetivo": objetivo,
    }


def generar_ejemplo_analogo(
    materia: str,
    tema: str,
    ejercicio_actual: str,
) -> dict[str, Any]:
    """Genera un ejercicio análogo diferente resuelto paso a paso en LaTeX."""
    materia_limpia = (materia or "").strip()
    tema_limpio = (tema or "").strip()
    ejercicio_limpio = (ejercicio_actual or "").strip()

    if not materia_limpia or not tema_limpio or not ejercicio_limpio:
        raise ValueError(
            "Los campos 'materia', 'tema' y 'ejercicio_actual' son obligatorios."
        )

    prompt = (
        "Crea un ejemplo análogo RESUELTO paso a paso con coeficientes y valores DISTINTOS al ejercicio del alumno.\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_limpio}\n"
        f"EJERCICIO ACTUAL DEL ESTUDIANTE (PROHIBIDO RESOLVERLO O COPIAR SUS NÚMEROS):\n{ejercicio_limpio}\n\n"
        "Muestra el enunciado del ejercicio paralelo, cada paso explicado con LaTeX y una conclusión breve."
    )

    config = types.GenerateContentConfig(
        system_instruction=ANALOGOUS_EXAMPLE_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=ANALOGOUS_EXAMPLE_SCHEMA,
        temperature=0.6,
    )
    payload = _invocar_gemini_json([prompt], config)
    return _normalizar_ejemplo_analogo(payload)


def generar_ejercicio_error(
    materia: str,
    tema: str,
    tipo_error: str,
    detalle_error: str,
) -> dict[str, str]:
    """Genera un ejercicio focalizado en superar un error específico del Baúl."""
    materia_limpia = (materia or "").strip() or "Ciencias Básicas FNI"
    tema_limpio = (tema or "").strip()
    tipo_limpio = (tipo_error or "").strip() or "error_operativo"
    detalle_limpio = (detalle_error or "").strip()

    if not tema_limpio and not detalle_limpio:
        raise ValueError(
            "Debes proporcionar al menos 'tema' o 'detalle_error' para generar el reto."
        )

    tema_final = tema_limpio or "Refuerzo específico"
    detalle_final = detalle_limpio or tema_final

    prompt = (
        "Diseña un ejercicio inédito para que el estudiante supere exactamente esta debilidad registrada en su Baúl de Errores:\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_final}\n"
        f"TIPO DE ERROR: {tipo_limpio}\n"
        f"DETALLE DEL ERROR: {detalle_final}\n\n"
        "Asegúrate de que el problema ponga a prueba exactamente ese punto crítico sin revelar la solución."
    )

    config = types.GenerateContentConfig(
        system_instruction=ERROR_DRILL_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=ERROR_DRILL_SCHEMA,
        temperature=0.75,
    )
    payload = _invocar_gemini_json([prompt], config)
    return _normalizar_ejercicio_error(payload)
