"""Cliente HTTPS para la tabla `usuarios` en Supabase con respaldo local seguro."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

REQUEST_TIMEOUT_SEC = 10
FALLBACK_DB_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "usuarios_fallback.json"
)
_FALLBACK_LOCK = threading.Lock()


def _supabase_credentials() -> tuple[str, str]:
    """Obtiene SUPABASE_URL y SUPABASE_KEY desde el entorno."""
    load_dotenv(override=False)
    url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_KEY") or "").strip()
    return url, key


def _endpoint_usuarios() -> str:
    """Construye la URL REST base para la tabla `usuarios` de Supabase."""
    url, _key = _supabase_credentials()
    return f"{url}/rest/v1/usuarios"


def _build_headers(key: Optional[str] = None) -> dict[str, str]:
    """Construye los headers HTTPS para Supabase respetando claves `sb_secret_`."""
    resolved_key = (key if key is not None else _supabase_credentials()[1]).strip()
    headers = {
        "apikey": resolved_key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if resolved_key and not resolved_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {resolved_key}"
    return headers


def _normalizar_registro_usuario(raw: dict[str, Any]) -> dict[str, Any]:
    """Normaliza la estructura devuelta por Supabase o por el respaldo local."""
    estado = raw.get("estado_json")
    if isinstance(estado, str):
        try:
            estado = json.loads(estado)
        except json.JSONDecodeError:
            estado = {}
    if not isinstance(estado, dict):
        estado = {}

    etapa_raw = str(raw.get("etapa") or "pre_u").strip()
    etapa = etapa_raw if etapa_raw in {"pre_u", "facultad"} else "pre_u"

    return {
        "username": str(raw.get("username") or "").strip().lower(),
        "password_hash": str(raw.get("password_hash") or ""),
        "nombre": str(raw.get("nombre") or "Estudiante").strip(),
        "etapa": etapa,
        "estado_json": estado,
    }


def _leer_fallback_db() -> dict[str, dict[str, Any]]:
    """Lee el archivo JSON de respaldo local cuando Supabase no está configurado."""
    if not FALLBACK_DB_PATH.exists():
        return {}
    try:
        contenido = json.loads(FALLBACK_DB_PATH.read_text(encoding="utf-8"))
        return contenido if isinstance(contenido, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _escribir_fallback_db(data: dict[str, dict[str, Any]]) -> None:
    """Persiste el diccionario de usuarios en `data/usuarios_fallback.json`."""
    FALLBACK_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    FALLBACK_DB_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _extraer_detalle_error_http(resp: requests.Response) -> str:
    """Extrae el mensaje de error legible devuelto por PostgREST/Supabase."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            return str(
                body.get("message")
                or body.get("hint")
                or body.get("details")
                or resp.text
            )
    except ValueError:
        pass
    return resp.text.strip() or f"HTTP {resp.status_code}"


def is_cloud_enabled() -> bool:
    """Indica si SUPABASE_URL y SUPABASE_KEY están configurados en `.env`."""
    url, key = _supabase_credentials()
    return bool(url and key)


def get_storage_status() -> dict[str, Any]:
    """Devuelve el estado actual de almacenamiento (Supabase o respaldo JSON local)."""
    cloud_active = is_cloud_enabled()
    return {
        "cloud_enabled": cloud_active,
        "mode": "supabase" if cloud_active else "local_fallback",
        "provider": "supabase_rest" if cloud_active else "json_fallback",
        "message": (
            "Persistencia en la nube activa con Supabase."
            if cloud_active
            else "Variables Supabase ausentes: usando respaldo local data/usuarios_fallback.json."
        ),
    }


def obtener_usuario(username: str) -> Optional[dict[str, Any]]:
    """Busca un usuario por username en Supabase o en el respaldo local."""
    clean_username = (username or "").strip().lower()
    if not clean_username:
        raise ValueError("El campo 'username' es obligatorio.")

    if not is_cloud_enabled():
        with _FALLBACK_LOCK:
            db = _leer_fallback_db()
            encontrado = db.get(clean_username)
            return _normalizar_registro_usuario(encontrado) if encontrado else None

    url, key = _supabase_credentials()
    endpoint = f"{url}/rest/v1/usuarios"
    try:
        resp = requests.get(
            endpoint,
            headers=_build_headers(key),
            params={"username": f"eq.{clean_username}"},
            timeout=REQUEST_TIMEOUT_SEC,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Error de conexión con Supabase al consultar usuario: {exc}") from exc

    if not resp.ok:
        detalle = _extraer_detalle_error_http(resp)
        raise RuntimeError(f"Supabase rechazó la consulta ({resp.status_code}): {detalle}")

    try:
        filas = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"Respuesta inválida de Supabase al consultar usuario: {exc}") from exc

    if not isinstance(filas, list) or len(filas) == 0:
        return None
    return _normalizar_registro_usuario(filas[0])


def crear_usuario(
    username: str,
    password_hash: str,
    nombre: str,
    etapa: str,
    estado_inicial: dict[str, Any],
) -> dict[str, Any]:
    """Inserta un usuario nuevo en Supabase (o respaldo local) y devuelve el registro creado."""
    clean_username = (username or "").strip().lower()
    clean_nombre = (nombre or "").strip()
    clean_etapa = etapa if etapa in {"pre_u", "facultad"} else "pre_u"
    estado_limpio = estado_inicial if isinstance(estado_inicial, dict) else {}

    if not clean_username or not password_hash or not clean_nombre:
        raise ValueError("Faltan datos obligatorios para crear el usuario.")

    nuevo_registro = {
        "username": clean_username,
        "password_hash": password_hash,
        "nombre": clean_nombre,
        "etapa": clean_etapa,
        "estado_json": estado_limpio,
    }

    if not is_cloud_enabled():
        with _FALLBACK_LOCK:
            db = _leer_fallback_db()
            if clean_username in db:
                raise ValueError("El nombre de usuario ya está registrado.")
            db[clean_username] = nuevo_registro
            _escribir_fallback_db(db)
            return _normalizar_registro_usuario(nuevo_registro)

    url, key = _supabase_credentials()
    endpoint = f"{url}/rest/v1/usuarios"
    try:
        resp = requests.post(
            endpoint,
            headers=_build_headers(key),
            json=nuevo_registro,
            timeout=REQUEST_TIMEOUT_SEC,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Error de conexión con Supabase al crear usuario: {exc}") from exc

    if resp.status_code == 409:
        raise ValueError("El nombre de usuario ya está registrado.")

    if not resp.ok:
        detalle = _extraer_detalle_error_http(resp)
        if "duplicate" in detalle.lower() or "23505" in detalle:
            raise ValueError("El nombre de usuario ya está registrado.")
        raise RuntimeError(f"Supabase rechazó el registro ({resp.status_code}): {detalle}")

    try:
        filas = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"Respuesta inválida de Supabase tras crear usuario: {exc}") from exc

    if isinstance(filas, list) and filas:
        return _normalizar_registro_usuario(filas[0])
    if isinstance(filas, dict):
        return _normalizar_registro_usuario(filas)
    return _normalizar_registro_usuario(nuevo_registro)


def actualizar_estado(
    username: str,
    estado_json: dict[str, Any],
    etapa: Optional[str] = None,
) -> dict[str, Any]:
    """Actualiza estado_json (y etapa si se especifica) mediante PATCH sobre Supabase."""
    clean_username = (username or "").strip().lower()
    if not clean_username:
        raise ValueError("El campo 'username' es obligatorio para actualizar el progreso.")
    if not isinstance(estado_json, dict):
        raise ValueError("El campo 'estado_json' debe ser un objeto JSON válido.")

    patch_payload: dict[str, Any] = {"estado_json": estado_json}
    if etapa in {"pre_u", "facultad"}:
        patch_payload["etapa"] = etapa

    if not is_cloud_enabled():
        with _FALLBACK_LOCK:
            db = _leer_fallback_db()
            usuario = db.get(clean_username)
            if not usuario:
                raise ValueError("Usuario no encontrado en el respaldo local.")
            usuario["estado_json"] = estado_json
            if "etapa" in patch_payload:
                usuario["etapa"] = patch_payload["etapa"]
            db[clean_username] = usuario
            _escribir_fallback_db(db)
            return _normalizar_registro_usuario(usuario)

    url, key = _supabase_credentials()
    endpoint = f"{url}/rest/v1/usuarios"
    try:
        resp = requests.patch(
            endpoint,
            headers=_build_headers(key),
            params={"username": f"eq.{clean_username}"},
            json=patch_payload,
            timeout=REQUEST_TIMEOUT_SEC,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Error de conexión con Supabase al guardar progreso: {exc}") from exc

    if not resp.ok:
        detalle = _extraer_detalle_error_http(resp)
        raise RuntimeError(f"Supabase rechazó la actualización ({resp.status_code}): {detalle}")

    try:
        filas = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"Respuesta inválida de Supabase al actualizar progreso: {exc}") from exc

    if not isinstance(filas, list) or len(filas) == 0:
        raise ValueError("Usuario no encontrado en Supabase para actualizar.")
    return _normalizar_registro_usuario(filas[0])
