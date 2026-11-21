"""Adaptador de persistencia en nube (Supabase) con respaldo local en navegador."""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()


def _supabase_credentials() -> tuple[str, str]:
    """Obtiene URL y clave de Supabase desde variables de entorno."""
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_KEY") or "").strip()
    return url, key


def is_cloud_enabled() -> bool:
    """Indica si el entorno cuenta con credenciales activas de Supabase."""
    url, key = _supabase_credentials()
    return bool(url and key)


def get_storage_status() -> dict[str, Any]:
    """Devuelve el estado del adaptador de almacenamiento para el cliente y monitoreo."""
    cloud_active = is_cloud_enabled()
    return {
        "cloud_enabled": cloud_active,
        "mode": "supabase" if cloud_active else "local_fallback",
        "provider": "supabase" if cloud_active else "browser_localStorage",
        "message": (
            "Sincronización en nube lista con Supabase."
            if cloud_active
            else "Modo local activo: el progreso se guarda en localStorage del navegador."
        ),
    }


def get_student_progress(user_id: str) -> dict[str, Any]:
    """Recupera el estado remoto del estudiante o retorna respaldo seguro en modo local."""
    clean_user_id = (user_id or "").strip()
    if not clean_user_id:
        raise ValueError("El identificador 'user_id' es obligatorio.")

    if not is_cloud_enabled():
        return {
            "synced": False,
            "mode": "local_fallback",
            "user_id": clean_user_id,
            "progress": None,
            "message": "Persistencia remota desactivada; conserva el estado de localStorage.",
        }

    return {
        "synced": False,
        "mode": "supabase",
        "user_id": clean_user_id,
        "progress": None,
        "message": "Credenciales detectadas; conecta el cliente oficial de Supabase en este adaptador.",
    }


def save_student_progress(user_id: str, progress: dict[str, Any]) -> dict[str, Any]:
    """Sincroniza el progreso del estudiante cuando existe nube o confirma fallback local."""
    clean_user_id = (user_id or "").strip()
    if not clean_user_id:
        raise ValueError("El identificador 'user_id' es obligatorio.")
    if not isinstance(progress, dict):
        raise ValueError("El campo 'progress' debe ser un objeto JSON válido.")

    if not is_cloud_enabled():
        return {
            "synced": False,
            "mode": "local_fallback",
            "user_id": clean_user_id,
            "keys_received": len(progress),
            "message": "Respaldo local mantenido en localStorage sin persistencia en servidor.",
        }

    return {
        "synced": False,
        "mode": "supabase",
        "user_id": clean_user_id,
        "keys_received": len(progress),
        "message": "Credenciales detectadas; inserta la operación upsert de Supabase en este punto.",
    }
