"""Rutas de autenticación por sesión Flask y sincronización en nube con Supabase."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from routes.api_skills import cargar_skills_combinados
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
TESTER_USERNAME = "tester"
TESTER_PASSWORD = "1234"


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
        "is_tester": False,
        "materia_activa": None,
        "materias_iniciadas": {},
        "xp": 0,
        "racha": 0,
        "nodos_estado": {},
        "nodos_pasos": {},
        "metricas_ia_materia": {},
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
        "is_tester": False,
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
            "fac_cal_01b_funciones_dominios": "unlocked",
            "fac_cal_02_limites_alg": "unlocked",
            "fac_cal_03_limites_trig": "active",
            "fac_cal_03b_continuidad": "locked",
            "fac_cal_04_derivadas": "locked",
            "fac_cal_04b_deriv_implicita_log": "locked",
            "fac_cal_05_optimizacion": "locked",
            "fac_cal_06_integrales_basicas": "locked",
            "fac_fis_01_vectores": "locked",
            "fac_fis_01b_cinematica_1d": "locked",
            "fac_fis_02_cinematica": "locked",
            "fac_fis_03_dinamica": "locked",
            "fac_fis_03b_poleas_circular": "locked",
            "fac_fis_04_energia": "locked",
        },
        "nodos_pasos": {
            "fac_cal_01_inecuaciones_func": 3,
            "fac_cal_01b_funciones_dominios": 3,
            "fac_cal_02_limites_alg": 3,
            "fac_cal_03_limites_trig": 1,
        },
        "metricas_ia_materia": {
            "fac_calculo1": {
                "intentos_ia": 4,
                "aprobados_ia": 3,
            },
        },
        "xp_otorgado_nodos": {
            "fac_cal_01_inecuaciones_func": True,
            "fac_cal_01b_funciones_dominios": True,
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
                "materia_id": "fac_calculo1",
                "tipo_error": "fallo_prerrequisito",
                "fecha": hoy,
                "superado": False,
            },
            {
                "id": "err_demo_2",
                "resumen": "Error de signo al multiplicar por conjugado",
                "tema": "Límites Algebraicos",
                "materia": "Cálculo I",
                "materia_id": "fac_calculo1",
                "tipo_error": "error_operativo",
                "fecha": hoy,
                "superado": False,
            },
        ],
    }


def construir_estado_tester(etapa_actual: str = "facultad") -> dict[str, Any]:
    """Construye dinámicamente el estado del usuario Tester leyendo `pre_u.json` y `facultad.json`."""
    etapa_limpia = etapa_actual if etapa_actual in VALID_STAGES else "facultad"
    combinado = cargar_skills_combinados()

    materias_iniciadas: dict[str, bool] = {}
    nodos_estado: dict[str, str] = {}
    nodos_pasos: dict[str, int] = {}
    xp_otorgado_nodos: dict[str, bool] = {}
    metricas_ia_materia: dict[str, dict[str, int]] = {}
    simulacros_mejor_nota: dict[str, int] = {}

    metricas_seed = {
        "fac_calculo1": {"intentos_ia": 6, "aprobados_ia": 5},
        "fac_fisica1": {"intentos_ia": 4, "aprobados_ia": 3},
        "pre_algebra": {"intentos_ia": 5, "aprobados_ia": 4},
        "pre_trigonometria": {"intentos_ia": 3, "aprobados_ia": 2},
    }

    primera_materia_por_etapa: dict[str, str | None] = {
        "pre_u": None,
        "facultad": None,
    }
    primer_blocker_id: str | None = None
    retorno_calculo_id: str | None = None

    for stage_key in ("pre_u", "facultad"):
        stage_materias = combinado.get(stage_key, {}).get("materias") or []
        for mat_idx, mat in enumerate(stage_materias):
            mat_id = str(mat.get("id") or "").strip()
            if not mat_id:
                continue

            if primera_materia_por_etapa[stage_key] is None:
                primera_materia_por_etapa[stage_key] = mat_id

            materias_iniciadas[mat_id] = True
            metricas_ia_materia[mat_id] = metricas_seed.get(
                mat_id, {"intentos_ia": 2, "aprobados_ia": 2}
            )
            simulacros_mejor_nota[mat_id] = 78 if mat_idx == 0 else 68

            skills = sorted(
                mat.get("skills") or [],
                key=lambda s: int(s.get("ranking_criticidad") or 0),
            )
            is_primary_fac = stage_key == "facultad" and mat_idx == 0

            for idx, skill in enumerate(skills):
                skill_id = str(skill.get("id") or "").strip()
                if not skill_id:
                    continue

                if is_primary_fac:
                    if idx == 0:
                        nodos_estado[skill_id] = "unlocked"
                        nodos_pasos[skill_id] = 3
                        xp_otorgado_nodos[skill_id] = True
                    elif idx == 1:
                        nodos_estado[skill_id] = "blocker"
                        nodos_pasos[skill_id] = 0
                        primer_blocker_id = skill_id
                    elif idx == 2:
                        nodos_estado[skill_id] = "unlocked"
                        nodos_pasos[skill_id] = 3
                        xp_otorgado_nodos[skill_id] = True
                    elif idx == 3:
                        nodos_estado[skill_id] = "active"
                        nodos_pasos[skill_id] = 1
                        retorno_calculo_id = skill_id
                    else:
                        nodos_estado[skill_id] = "active"
                        nodos_pasos[skill_id] = 0
                else:
                    if idx < 2:
                        nodos_estado[skill_id] = "unlocked"
                        nodos_pasos[skill_id] = 3
                        xp_otorgado_nodos[skill_id] = True
                    elif idx == 2:
                        nodos_estado[skill_id] = "active"
                        nodos_pasos[skill_id] = 1
                    else:
                        nodos_estado[skill_id] = "active"
                        nodos_pasos[skill_id] = 0

    materia_activa = (
        primera_materia_por_etapa.get(etapa_limpia)
        or primera_materia_por_etapa.get("facultad")
        or primera_materia_por_etapa.get("pre_u")
    )

    hoy = date.today().strftime("%d/%m")
    historial_errores = [
        {
            "id": "err_tester_1",
            "resumen": "Olvidó restringir argumento positivo en dominio logarítmico",
            "tema": "Funciones, Composición y Dominios",
            "materia": "Cálculo I",
            "materia_id": "fac_calculo1",
            "tipo_error": "fallo_prerrequisito",
            "fecha": hoy,
            "superado": False,
        },
        {
            "id": "err_tester_2",
            "resumen": "Signo invertido en componente tangencial del plano inclinado",
            "tema": "Leyes de Newton y Plano Inclinado",
            "materia": "Física I",
            "materia_id": "fac_fisica1",
            "tipo_error": "error_operativo",
            "fecha": hoy,
            "superado": False,
        },
    ]

    return {
        "nombre": "Tester FNI",
        "etapa": etapa_limpia,
        "is_tester": True,
        "materia_activa": materia_activa,
        "materias_iniciadas": materias_iniciadas,
        "xp": 1500,
        "racha": 7,
        "nodos_estado": nodos_estado,
        "nodos_pasos": nodos_pasos,
        "metricas_ia_materia": metricas_ia_materia,
        "historial_errores": historial_errores,
        "diagnostico_completado": True,
        "diagnostico_resultados": {
            "overallPercent": 83,
            "areaScores": {
                "Álgebra y Trig.": 90,
                "Cálculo I": 78,
                "Física I": 82,
            },
            "correctCount": 5,
            "totalCount": 6,
        },
        "xp_otorgado_nodos": xp_otorgado_nodos,
        "nodo_retorno": retorno_calculo_id if primer_blocker_id else None,
        "contadores_medallas": {
            "resiliencia": 2,
            "rescate_critico": 1,
            "salto_nivel": 1,
            "errores_superados": 1,
            "simulacros_aprobados": 1,
        },
        "simulacros_mejor_nota": simulacros_mejor_nota,
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
    """Autentica un usuario existente (o auto-provisiona `tester`) e inicia su sesión."""
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

        if usuario is None and username == TESTER_USERNAME:
            if password != TESTER_PASSWORD:
                return (
                    jsonify(
                        {
                            "error": "Credenciales incorrectas",
                            "detalle": "El usuario o la contraseña no coinciden.",
                        }
                    ),
                    401,
                )
            usuario = crear_usuario(
                username=TESTER_USERNAME,
                password_hash=generate_password_hash(TESTER_PASSWORD),
                nombre="Tester FNI",
                etapa="facultad",
                estado_inicial=construir_estado_tester("facultad"),
            )
            _iniciar_sesion(TESTER_USERNAME)
            return jsonify(_serializar_usuario_publico(usuario)), 200

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

        if username == TESTER_USERNAME:
            estado_actual = dict(usuario.get("estado_json") or {})
            if not estado_actual.get("is_tester"):
                estado_actual["is_tester"] = True
                actualizar_estado(username=TESTER_USERNAME, estado_json=estado_actual)
            usuario = {**usuario, "estado_json": estado_actual}

        _iniciar_sesion(usuario["username"])
        return jsonify(_serializar_usuario_publico(usuario)), 200

    except ValueError as exc:
        return jsonify({"error": "Solicitud inválida", "detalle": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": "Error en base de datos Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado en login", "detalle": str(exc)}), 500


@api_auth_bp.post("/api/tester/sync")
def tester_sync():
    """Resincroniza el sandbox del modo tester leyendo todas las materias y nodos actuales."""
    username = session.get("username")
    if not username:
        return jsonify({"error": "No autenticado", "detalle": "Inicia sesión para sincronizar."}), 401

    try:
        usuario = obtener_usuario(str(username))
        if not usuario:
            session.clear()
            return jsonify({"error": "Sesión inválida", "detalle": "Cuenta no encontrada."}), 401

        estado_actual = usuario.get("estado_json") or {}
        is_tester = str(username).lower() == TESTER_USERNAME or bool(estado_actual.get("is_tester"))
        if not is_tester:
            return jsonify({"error": "Acceso denegado", "detalle": "Solo disponible en Modo Tester."}), 403

        datos = request.get_json(silent=True) or {}
        etapa_req = str(datos.get("etapa") or "").strip() if isinstance(datos, dict) else ""
        etapa_final = etapa_req if etapa_req in VALID_STAGES else str(usuario.get("etapa") or "facultad")
        if etapa_final not in VALID_STAGES:
            etapa_final = "facultad"

        nuevo_estado = construir_estado_tester(etapa_actual=etapa_final)
        nombre_usuario = str(usuario.get("nombre") or "Tester FNI").strip() or "Tester FNI"
        nuevo_estado["nombre"] = nombre_usuario

        actualizar_estado(
            username=str(username),
            estado_json=nuevo_estado,
            etapa=etapa_final,
        )
        usuario_actualizado = {
            **usuario,
            "etapa": etapa_final,
            "estado_json": nuevo_estado,
        }
        return jsonify(_serializar_usuario_publico(usuario_actualizado)), 200

    except RuntimeError as exc:
        return jsonify({"error": "Error al sincronizar con Supabase", "detalle": str(exc)}), 502
    except Exception as exc:
        return jsonify({"error": "Error inesperado en sincronización tester", "detalle": str(exc)}), 500


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
