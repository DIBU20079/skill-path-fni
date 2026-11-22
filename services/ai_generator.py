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

EXERCISE_GEN_SYSTEM_INSTRUCTION = """Eres un docente universitario de Ciencias Básicas de Ingeniería creando retos inéditos en español.

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
    dificultad: str = "base",
) -> dict[str, Any]:
    """Genera un ejercicio inédito de 3 pasos en LaTeX para la materia, tema y dificultad dados."""
    materia_limpia = (materia or "").strip()
    tema_limpio = (tema or "").strip()

    if not materia_limpia or not tema_limpio:
        raise ValueError(
            "Los campos 'materia' y 'tema' son obligatorios para generar un ejercicio."
        )

    raw_diff = str(dificultad or "base").strip().lower()
    dificultad_limpia = "parcial_fni" if raw_diff == "parcial_fni" else "base"

    bloque_dificultad = (
        "NIVEL DE DIFICULTAD: EXAMEN PARCIAL UNIVERSITARIO DE INGENIERÍA. "
        "Eleva la exigencia técnica respecto al nivel base: combina propiedades o pasos intermedios "
        "(por ejemplo, racionalización + factorización, regla de la cadena + producto, plano inclinado con fricción + descomposición o casos límite con trampa típica de parcial universitario), "
        "manteniendo un enunciado perfectamente resoluble a mano en una hoja."
        if dificultad_limpia == "parcial_fni"
        else "NIVEL DE DIFICULTAD: NIVEL BASE (base). Refuerza el fundamento operativo directo del tema."
    )

    historial_texto = _formatear_historial(historial_errores)
    prompt_generacion = (
        "Genera un ejercicio universitario completamente nuevo y original de 3 sub-pasos.\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_limpio}\n"
        f"{bloque_dificultad}\n"
        f"ERRORES RECIENTES DEL ESTUDIANTE (BAÚL DE ERRORES):\n{historial_texto}\n\n"
        "Diseña el Paso 1 (concepto con 4 opciones), el Paso 2 (práctica corta numérica/fraccionaria) "
        "y el Paso 3 (reto completo en papel con LaTeX) enfocado en reforzar este tema sin repetir ejercicios triviales."
    )

    config = types.GenerateContentConfig(
        system_instruction=EXERCISE_GEN_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=DYNAMIC_EXERCISE_SCHEMA,
        temperature=0.82 if dificultad_limpia == "parcial_fni" else 0.78,
    )
    payload = _invocar_gemini_json([prompt_generacion], config)
    resultado = _normalizar_ejercicio_dinamico(payload)
    resultado["dificultad"] = dificultad_limpia
    return resultado


generar_ejercicio = generar_ejercicio_dinamico


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

ANALOGOUS_EXAMPLE_SYSTEM_INSTRUCTION = """Eres un docente universitario de Ciencias Básicas de Ingeniería creando un ejemplo de andamiaje pedagógico en español.

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

ERROR_DRILL_SYSTEM_INSTRUCTION = """Eres un tutor socrático de Ciencias Básicas de Ingeniería diseñando micro-retos correctivos en español.

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
    materia_limpia = (materia or "").strip() or "Ciencias Básicas"
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


STEP_EXPLAIN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "aclaracion": {"type": "STRING"},
    },
    "required": ["aclaracion"],
}

STEP_EXPLAIN_SYSTEM_INSTRUCTION = """Eres un auxiliar de docencia universitario de Ciencias Básicas muy claro y directo.

REGLAS ESTRICTAS:
1. Explica en 2 a 3 líneas muy concretas exactamente qué transformación matemática o física ocurrió entre `paso_anterior` y `paso_actual`.
2. Incluye las fórmulas o propiedades clave con LaTeX válido compatible con KaTeX delimitado por `$ ... $` (o `$$ ... $$`). Nunca dejes comandos LaTeX sueltos sin `$`.
3. Evita saludos largos o relleno; responde directo al punto que generó duda.
4. Devuelve estrictamente JSON válido según el esquema."""

GUIDED_EXAMPLE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "enunciado": {"type": "STRING"},
        "pasos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "titulo": {"type": "STRING"},
                    "expresion": {"type": "STRING"},
                    "explicacion": {"type": "STRING"},
                },
                "required": ["titulo", "expresion", "explicacion"],
            },
        },
        "resultado_final": {"type": "STRING"},
    },
    "required": ["enunciado", "pasos", "resultado_final"],
}

GUIDED_EXAMPLE_SYSTEM_INSTRUCTION = """Eres un docente universitario de Ciencias Básicas de Ingeniería creando ejemplos guiados paso a paso en español.

REGLAS ESTRICTAS:
1. Genera un ejemplo modelo universitario COMPLETAMENTE NUEVO para la materia y tema solicitados (distinto al `enunciado_previo` si se proporciona).
2. Descompón la resolución en 3 a 4 pasos didácticos claros. Cada paso incluye `titulo` ("Paso N: ..."), `expresion` (en bloque `$$...$$`) y `explicacion` (1-2 líneas del porqué del movimiento).
3. Toda expresión matemática debe usar LaTeX válido compatible con KaTeX delimitado por `$ ... $` o `$$ ... $$`.
4. Devuelve estrictamente JSON válido según el esquema."""


def _normalizar_explicacion_paso(payload: dict[str, Any]) -> dict[str, str]:
    """Valida la aclaración corta de un paso del ejemplo guiado."""
    if not isinstance(payload, dict):
        raise RuntimeError("La aclaración del paso devuelta por IA no es válida.")
    aclaracion = str(payload.get("aclaracion") or "").strip()
    if not aclaracion:
        raise RuntimeError("La IA devolvió una aclaración vacía.")
    return {"aclaracion": aclaracion}


def _normalizar_ejemplo_guiado(payload: dict[str, Any]) -> dict[str, Any]:
    """Valida y normaliza un ejemplo guiado con pasos estructurados."""
    if not isinstance(payload, dict):
        raise RuntimeError("El ejemplo guiado devuelto por IA no tiene formato JSON válido.")

    enunciado = str(payload.get("enunciado") or "").strip()
    resultado_final = str(payload.get("resultado_final") or "").strip()
    pasos_raw = payload.get("pasos") or []

    pasos_norm: list[dict[str, str]] = []
    for idx, step in enumerate(pasos_raw):
        if not isinstance(step, dict):
            continue
        titulo = str(step.get("titulo") or f"Paso {idx + 1}").strip()
        expresion = str(step.get("expresion") or "").strip()
        explicacion = str(step.get("explicacion") or "").strip()
        if expresion and explicacion:
            if not titulo.lower().startswith("paso "):
                titulo = f"Paso {idx + 1}: {titulo}"
            pasos_norm.append(
                {
                    "titulo": titulo,
                    "expresion": expresion,
                    "explicacion": explicacion,
                }
            )

    if not enunciado or not pasos_norm or not resultado_final:
        raise RuntimeError("El ejemplo guiado generado está incompleto.")

    return {
        "enunciado": enunciado,
        "pasos": pasos_norm,
        "resultado_final": resultado_final,
    }


def explicar_paso_algebraico(
    materia: str,
    tema: str,
    paso_anterior: str,
    paso_actual: str,
    explicacion_actual: str = "",
) -> dict[str, str]:
    """Explica en 2-3 líneas qué transformación ocurrió entre paso_anterior y paso_actual."""
    materia_limpia = (materia or "").strip() or "Ciencias Básicas"
    tema_limpio = (tema or "").strip() or "Resolución guiada"
    anterior_limpio = (paso_anterior or "").strip() or "Enunciado inicial del problema"
    actual_limpio = (paso_actual or "").strip()
    explicacion_limpia = (explicacion_actual or "").strip()

    if not actual_limpio:
        raise ValueError("El campo 'paso_actual' es obligatorio.")

    prompt = (
        "Un estudiante está leyendo un ejemplo guiado y pregunta: '¿Por qué pasó esto?'.\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_limpio}\n"
        f"ESTADO ANTERIOR:\n{anterior_limpio}\n\n"
        f"PASO ACTUAL:\n{actual_limpio}\n\n"
        f"EXPLICACIÓN BREVE ORIGINAL:\n{explicacion_limpia or 'Sin nota adicional'}\n\n"
        "Aclara en 2 a 3 líneas exactas qué regla, identidad o despeje conectó el estado anterior con el paso actual."
    )

    config = types.GenerateContentConfig(
        system_instruction=STEP_EXPLAIN_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=STEP_EXPLAIN_SCHEMA,
        temperature=0.35,
    )
    payload = _invocar_gemini_json([prompt], config)
    return _normalizar_explicacion_paso(payload)


def generar_ejemplo_guiado(
    materia: str,
    tema: str,
    enunciado_previo: str = "",
) -> dict[str, Any]:
    """Genera un nuevo ejemplo guiado paso a paso con estructura de `guia_aprendizaje`."""
    materia_limpia = (materia or "").strip()
    tema_limpio = (tema or "").strip()
    previo_limpio = (enunciado_previo or "").strip()

    if not materia_limpia or not tema_limpio:
        raise ValueError("Los campos 'materia' y 'tema' son obligatorios.")

    nota_previo = (
        f"EJEMPLO ANTERIOR (OBLIGATORIO HACER UNO DISTINTO):\n{previo_limpio}\n\n"
        if previo_limpio
        else ""
    )

    prompt = (
        "Genera un ejemplo guiado paso a paso de nivel universitario de ingeniería.\n\n"
        f"MATERIA: {materia_limpia}\n"
        f"TEMA: {tema_limpio}\n"
        f"{nota_previo}"
        "Incluye enunciado claro, 3 a 4 pasos con título/expresión/explicación en LaTeX y resultado_final."
    )

    config = types.GenerateContentConfig(
        system_instruction=GUIDED_EXAMPLE_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=GUIDED_EXAMPLE_SCHEMA,
        temperature=0.75,
    )
    payload = _invocar_gemini_json([prompt], config)
    return _normalizar_ejemplo_guiado(payload)
