"""Cliente compartido y utilidades de invocación Gemini para Skill-Path FNI."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Optional, Union

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

MODEL_NAME = "gemini-2.5-flash"
FALLBACK_MODELS = (
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
)
REQUEST_TIMEOUT_MS = 15000


def _get_client() -> genai.Client:
    """Inicializa el cliente de Google GenAI leyendo GEMINI_API_KEY desde .env."""
    load_dotenv(override=False)
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "Falta GEMINI_API_KEY. Configura tu clave de API en el archivo .env antes de evaluar."
        )
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
    )


def _extraer_items_texto(entrada: Optional[Union[str, list]]) -> list[str]:
    """Convierte listas o JSON strings de errores/intentos en líneas de texto limpias."""
    if not entrada:
        return []

    items: Any = entrada
    if isinstance(entrada, str):
        texto = entrada.strip()
        if not texto:
            return []
        if texto.startswith("["):
            try:
                items = json.loads(texto)
            except json.JSONDecodeError:
                return [texto]
        else:
            return [texto]

    if isinstance(items, list):
        lineas: list[str] = []
        for item in items:
            if isinstance(item, dict):
                partes = [
                    str(item.get(campo) or "").strip()
                    for campo in (
                        "ubicacion_error",
                        "explicacion_error",
                        "resumen_baul",
                        "resumen",
                    )
                    if str(item.get(campo) or "").strip()
                ]
                texto_item = (
                    " | ".join(partes)
                    if partes
                    else json.dumps(item, ensure_ascii=False)
                )
            else:
                texto_item = str(item).strip()
            if texto_item:
                lineas.append(texto_item)
        return lineas

    texto_unico = str(items).strip()
    return [texto_unico] if texto_unico else []


def _formatear_historial(historial_errores: Optional[Union[str, list]]) -> str:
    """Normaliza el historial de errores del Baúl de Errores para memoria longitudinal."""
    limpios = _extraer_items_texto(historial_errores)
    if not limpios:
        return "Sin errores previos registrados en el Baúl de Errores."
    return "\n".join(f"- {entrada}" for entrada in limpios[-10:])


def _extraer_json(texto_respuesta: str) -> dict[str, Any]:
    """Parsea el JSON devuelto por el modelo limpiando cercas Markdown si existieran."""
    limpio = (texto_respuesta or "").strip()
    if limpio.startswith("```"):
        limpio = re.sub(r"^```(?:json)?\s*", "", limpio, flags=re.IGNORECASE)
        limpio = re.sub(r"\s*```$", "", limpio)
    data = json.loads(limpio)
    if not isinstance(data, dict):
        raise ValueError("La respuesta del modelo no es un objeto JSON.")
    return data


def _obtener_modelos_candidatos() -> list[str]:
    """Construye la lista ordenada de modelos iniciando por GEMINI_MODEL o MODEL_NAME."""
    load_dotenv(override=False)
    primario = (os.getenv("GEMINI_MODEL") or MODEL_NAME).strip() or MODEL_NAME
    candidatos = [primario]
    for fallback in FALLBACK_MODELS:
        if fallback not in candidatos:
            candidatos.append(fallback)
    return candidatos


def _es_error_recuperable_modelo(exc: Exception) -> bool:
    """Detecta errores transitorios o de disponibilidad de modelo para probar fallback."""
    msg = str(exc).upper()
    indicadores = (
        "404",
        "NOT_FOUND",
        "503",
        "UNAVAILABLE",
        "429",
        "RESOURCE_EXHAUSTED",
        "TIMED OUT",
        "TIMEOUT",
        "DEADLINE_EXCEEDED",
    )
    return any(ind in msg for ind in indicadores)


def _invocar_gemini_json(
    contents: list[Any],
    config: types.GenerateContentConfig,
) -> dict[str, Any]:
    """Ejecuta generate_content con fallback controlado y devuelve el dict JSON."""
    client = _get_client()
    modelos = _obtener_modelos_candidatos()
    response = None
    ultimo_error: Optional[Exception] = None
    modelo_usado = modelos[0]

    for idx, modelo in enumerate(modelos):
        modelo_usado = modelo
        try:
            response = client.models.generate_content(
                model=modelo,
                contents=contents,
                config=config,
            )
            break
        except Exception as exc:
            ultimo_error = exc
            quedan_modelos = idx + 1 < len(modelos)
            if quedan_modelos and _es_error_recuperable_modelo(exc):
                continue
            raise RuntimeError(
                f"Error al consultar el modelo {modelo_usado}: {exc}"
            ) from exc

    if response is None:
        raise RuntimeError(
            f"Error al consultar el modelo {modelo_usado}: {ultimo_error}"
        )

    respuesta_texto = getattr(response, "text", None)
    if not respuesta_texto:
        raise RuntimeError(
            "El tutor de IA devolvió una respuesta vacía. Intenta nuevamente."
        )

    try:
        return _extraer_json(respuesta_texto)
    except Exception as exc:
        raise RuntimeError(
            f"La respuesta del tutor de IA no tuvo formato JSON válido: {exc}"
        ) from exc
