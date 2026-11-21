"""Rutas de autenticación por sesión Flask y sincronización en nube con Supabase."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from services.db_cloud import (
    actualizar_estado,
    crear_usuario,
    get_storage_status,
    obtener_usuario,
)

api_auth_bp = Blueprint("api_auth", __name__)

USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]{3,32}$")
VALID_STAGES = {"pre_u", "facultad"}
DEMO_USERNAME = "jurado_demo"


def _serializar_usuario_publico(usuario: dict[str, Any]) -> dict[str, Any]:
    """Expone solo campos seguros del usuario sin incluir `password_hash`."""
    return {
        "nombre": usuario.get("nombre", ""),
        "username": usuario.get("username", ""),
        "etapa": usuario.get("etapa", "pre_u"),
        "estado_json": usuario.get("estado_json") or {},
    }


def _iniciar_sesion(username: str) -> None:
    """Activa cookie de sesión permanente para el usuario autenticado."""
    session["username"] = username
    session.permanent = True


def _estado_inicial_base(nombre: str, etapa: str) -> dict[str, Any]:
    """Construye el estado inicial compatible con `localStorage` y el frontend."""
    return {
        "nombre": nombre,
        "etapa": etapa,
        "materia_activa": None,
        "materias_iniciadas": {},
        "xp": 0,
        "racha": 0,
        "nodos_estado": {},
        "historial_errores": [],
        "diagnostico_completado": False,
        "diagnostico_resultados": None,
        "xp_otorgado_nodos": {},
        "nodo_retorno": None,
        "contadores_medallas": {
            "resiliencia": 0,
            "rescate_critico": 0,
            "salto_nivel": 0,
            "errores_superados": 0,
            "simulacros_aprobados": 0,
        },
        "simulacros_mejor_nota": {},
    }


def _estado_demo_jurados() -> dict[str, Any]:
    """Estado precargado realista para el botón Acceso Rápido Demo (Jurados)."""
    hoy = date.today().strftime("%d/%m")
    return {
        "nombre": "Jurado Demo FNI",
        "etapa": "facultad",
        "materia_activa": "fac_calculo1",
        "materias_iniciadas": {
            "fac_calculo1": True,
        },
        "xp": 320,
        "racha": 4,
        "diagnostico_completado": True,
        "nodo_retorno": None,
        "diagnostico_resultados": {
            "overallPercent": 67,
            "areaScores": {
                "Álgebra y Trig.": 100,
                "Cálculo I": 50,
                "Física I": 50,
            },
            "correctCount": 4,
            "totalCount": 6,
        },
        "nodos_estado": {
            "fac_cal_01_inecuaciones_func": "unlocked",
            "fac_cal_02_limites_alg": "unlocked",
            "fac_cal_03_limites_trig": "active",
            "fac_cal_04_derivadas": "locked",
            "fac_cal_05_optimizacion": "locked",
            "fac_fis_01_vectores": "locked",
            "fac_fis_02_cinematica": "locked",
            "fac_fis_03_dinamica": "locked",
            "fac_fis_04_energia": "locked",
        },
        "xp_otorgado_nodos": {
            "fac_cal_01_inecuaciones_func": True,
            "fac_cal_02_limites_alg": True,
        },
        "contadores_medallas": {
            "resiliencia": 1,
            "rescate_critico": 0,
            "salto_nivel": 0,
            "errores_superados": 0,
            "simulacros_aprobados": 0,
        },
        "simulacros_mejor_nota": {},
        "historial_errores": [
            {
                "id": "err_demo_1",
                "resumen": "Olvidó restringir argumento positivo en logaritmo",
                "tema": "Inecuaciones y Dominios",
                "materia": "Cálculo I",
                "tipo_error": "fallo_prerrequisito",
                "fecha": hoy,
                "superado": False,
            },
            {
                "id": "err_demo_2",
                "resumen": "Error de signo al multiplicar por conjugado",
                "tema": "Límites Algebraicos",
                "materia": "Cálculo I",
                "tipo_error": "error_operativo",
                "fecha": hoy,
                "superado": False,
            },
        ],
    }


def _leer_json_dict() -> dict[str, Any]:
    """Obtiene el cuerpo JSON garantizando que sea un diccionario."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("Envía un objeto JSON válido en el cuerpo de la solicitud.")
    return body


@api_auth_bp.get("/api/auth/status")
def auth_storage_status():
    """Informa si la persistencia remota en Supabase está activa."""
    return jsonify(get_storage_status()), 200


@api_auth_bp.post("/api/register")
def register():
    """Registra una nueva cuenta de estudiante e inicia sesión en nube."""
    try:
        datos = _leer_json_dict()
        nombre = str(datos.get("nombre") or "").strip()
        raw_username = str(datos.get("username") or "").strip().lower()
        password = str(datos.get("password") or "")
        etapa = str(datos.get("etapa") or "").strip()

        if len(nombre) < 2:
            return (
                jsonify(
                    {
                        "error": "Nombre inválido",
                        "detalle": "Ingresa un nombre de al menos 2 caracteres.",
                    }
                ),
                400,
            )

        if " " in raw_username or not USERNAME_PATTERN.match(raw_username):
            return (
                jsonify(
                    {
                        "error": "Usuario inválido",
                        "detalle": "El usuario debe tener entre 3 y 32 caracteres (minúsculas, números, '.', '_' o '-') sin espacios.",
                    }
                ),
                400,
            )

        if len(password) < 4:
            return (
                jsonify(
                    {
                        "error": "Contraseña muy corta",
                        "detalle": "La contraseña debe tener al menos 4 caracteres.",
                    }
                ),
                400,
            )

        if etapa not in VALID_STAGES:
            return (
                jsonify(
                    {
                        "error": "Etapa inválida",
                        "detalle": "Selecciona 'pre_u' o 'facultad'.",
                    }
                ),
                400,
            )

        if obtener_usuario(raw_username) is not None:
            return (
                jsonify(
                    {
                        "error": "Usuario ya existente",
                        "detalle": f"El usuario '{raw_username}' ya está registrado. Elige otro o inicia sesión.",
                    }
                ),
                409,
            )

        password_hash = generate_password_hash(password)
        estado_inicial = _estado_inicial_base(nombre=nombre, etapa=etapa)
        creado = crear_usuario(
            username=raw_username,
            password_hash=password_hash,
            nombre=nombre,
            etapa=etapa,
            estado_inicial=estado_inicial,
        )
        _iniciar_sesion(creado["username"])
        return jsonify(_serializar_usuario_publico(creado)), 201

    except ValueError as exc:
        msg = str(exc)
        status = 409 if "registrado" in msg.lower() else 400
        return jsonify({"error": "Error de registro", "detalle": msg}), status
    except RuntimeError as exc:
        return jsonify({"error": "Error en base de datos Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado en registro", "detalle": str(exc)}), 500


@api_auth_bp.post("/api/login")
def login():
    """Autentica un usuario existente contra Supabase e inicia su sesión."""
    try:
        datos = _leer_json_dict()
        username = str(datos.get("username") or "").strip().lower()
        password = str(datos.get("password") or "")

        if not username or not password:
            return (
                jsonify(
                    {
                        "error": "Credenciales incompletas",
                        "detalle": "Ingresa tu usuario y contraseña.",
                    }
                ),
                400,
            )

        usuario = obtener_usuario(username)
        if not usuario or not check_password_hash(usuario.get("password_hash", ""), password):
            return (
                jsonify(
                    {
                        "error": "Credenciales incorrectas",
                        "detalle": "El usuario o la contraseña no coinciden.",
                    }
                ),
                401,
            )

        _iniciar_sesion(usuario["username"])
        return jsonify(_serializar_usuario_publico(usuario)), 200

    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": "Error en base de datos Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado en login", "detalle": str(exc)}), 500


@api_auth_bp.post("/api/demo-login")
def demo_login():
    """Inicia sesión inmediata en la cuenta `jurado_demo` creándola si no existe."""
    try:
        usuario = obtener_usuario(DEMO_USERNAME)
        if usuario is None:
            usuario = crear_usuario(
                username=DEMO_USERNAME,
                password_hash=generate_password_hash("demo_fni_2026"),
                nombre="Jurado Demo FNI",
                etapa="facultad",
                estado_inicial=_estado_demo_jurados(),
            )
        _iniciar_sesion(DEMO_USERNAME)
        return jsonify(_serializar_usuario_publico(usuario)), 200
    except RuntimeError as exc:
        return jsonify({"error": "Error en base de datos Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado en acceso demo", "detalle": str(exc)}), 500


@api_auth_bp.post("/api/logout")
def logout():
    """Cierra la sesión actual limpiando las cookies del servidor."""
    session.clear()
    return jsonify({"ok": True}), 200


@api_auth_bp.get("/api/me")
def get_me():
    """Devuelve los datos del usuario autenticado desde Supabase o 401 si no hay sesión."""
    username = session.get("username")
    if not username:
        return jsonify({"error": "No autenticado", "detalle": "Inicia sesión para continuar."}), 401

    try:
        usuario = obtener_usuario(str(username))
        if not usuario:
            session.clear()
            return jsonify({"error": "Sesión inválida", "detalle": "Cuenta no encontrada."}), 401
        return jsonify(_serializar_usuario_publico(usuario)), 200
    except RuntimeError as exc:
        return jsonify({"error": "Error al sincronizar con Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado al consultar sesión", "detalle": str(exc)}), 500


@api_auth_bp.post("/api/progreso")
def guardar_progreso():
    """Guarda en Supabase el progreso sincronizado del usuario con sesión activa."""
    username = session.get("username")
    if not username:
        return jsonify({"error": "No autenticado", "detalle": "Sesión requerida para guardar."}), 401

    try:
        datos = _leer_json_dict()
        estado_json = datos.get("estado_json")
        etapa = datos.get("etapa")

        if not isinstance(estado_json, dict):
            return (
                jsonify(
                    {
                        "error": "Datos inválidos",
                        "detalle": "El campo 'estado_json' debe ser un objeto JSON.",
                    }
                ),
                400,
            )

        etapa_limpia = str(etapa).strip() if etapa else None
        if etapa_limpia is not None and etapa_limpia not in VALID_STAGES:
            etapa_limpia = None

        actualizar_estado(
            username=str(username),
            estado_json=estado_json,
            etapa=etapa_limpia,
        )
        return jsonify({"ok": True}), 200

    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": "Error al guardar en Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado al guardar progreso", "detalle": str(exc)}), 500
