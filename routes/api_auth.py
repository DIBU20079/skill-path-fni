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
    """Construye el estado inicial compatible con `localStorage` y el catálogo unificado."""
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
        "materia_activa": "calculo_1",
        "materias_iniciadas": {
            "algebra_base": True,
            "calculo_1": True,
        },
        "xp": 320,
        "racha": 4,
        "diagnostico_completado": True,
        "nodo_retorno": None,
        "diagnostico_resultados": {
            "overallPercent": 67,
            "areaScores": {
                "Potencias y Raíces": 100,
                "Álgebra y Trig.": 75,
                "Cálculo I": 50,
            },
            "correctCount": 4,
            "totalCount": 6,
        },
        "nodos_estado": {
            "alg_01_potencias_raices": "unlocked",
            "alg_02_signos_jerarquia": "unlocked",
            "alg_03_factorizacion_notables": "active",
            "fac_cal_01_inecuaciones_func": "unlocked",
            "fac_cal_01b_funciones_dominios": "unlocked",
            "fac_cal_02_limites_alg": "unlocked",
            "fac_cal_03_limites_trig": "active",
        },
        "nodos_pasos": {
            "alg_01_potencias_raices": 3,
            "alg_02_signos_jerarquia": 3,
            "alg_03_factorizacion_notables": 1,
            "fac_cal_01_inecuaciones_func": 3,
            "fac_cal_01b_funciones_dominios": 3,
            "fac_cal_02_limites_alg": 3,
            "fac_cal_03_limites_trig": 1,
        },
        "metricas_ia_materia": {
            "algebra_base": {
                "intentos_ia": 2,
                "aprobados_ia": 2,
            },
            "calculo_1": {
                "intentos_ia": 4,
                "aprobados_ia": 3,
            },
        },
        "xp_otorgado_nodos": {
            "alg_01_potencias_raices": True,
            "alg_02_signos_jerarquia": True,
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
                "tema": "Funciones, Composición y Dominios",
                "materia": "Cálculo I - MAT 1101",
                "materia_id": "calculo_1",
                "tipo_error": "fallo_prerrequisito",
                "fecha": hoy,
                "superado": False,
            },
            {
                "id": "err_demo_2",
                "resumen": "Error de signo al multiplicar por conjugado",
                "tema": "Límites Algebraicos e Infinitos",
                "materia": "Cálculo I - MAT 1101",
                "materia_id": "calculo_1",
                "tipo_error": "error_operativo",
                "fecha": hoy,
                "superado": False,
            },
        ],
    }


def construir_estado_tester(etapa_actual: str = "facultad") -> dict[str, Any]:
    """Construye dinámicamente el estado Tester desbloqueando todas las materias en `data/materias/*.json`."""
    etapa_limpia = etapa_actual if etapa_actual in VALID_STAGES else "facultad"
    combinado = cargar_skills_combinados()
    todas_materias = combinado.get("materias") or []

    materias_iniciadas: dict[str, bool] = {}
    nodos_estado: dict[str, str] = {}
    nodos_pasos: dict[str, int] = {}
    xp_otorgado_nodos: dict[str, bool] = {}
    metricas_ia_materia: dict[str, dict[str, int]] = {}
    simulacros_mejor_nota: dict[str, int] = {}

    metricas_seed = {
        "algebra_base": {"intentos_ia": 5, "aprobados_ia": 4},
        "trigonometria": {"intentos_ia": 3, "aprobados_ia": 2},
        "geometria_analitica": {"intentos_ia": 4, "aprobados_ia": 3},
        "calculo_1": {"intentos_ia": 6, "aprobados_ia": 5},
        "fisica_1": {"intentos_ia": 4, "aprobados_ia": 3},
    }

    primera_nivel0: str | None = None
    primera_nivel1: str | None = None
    primer_blocker_id: str | None = None
    retorno_calculo_id: str | None = None

    for mat in todas_materias:
        mat_id = str(mat.get("id") or "").strip()
        if not mat_id:
            continue

        nivel = int(mat.get("nivel", 0))
        if nivel == 0 and primera_nivel0 is None:
            primera_nivel0 = mat_id
        if nivel >= 1 and primera_nivel1 is None:
            primera_nivel1 = mat_id

        materias_iniciadas[mat_id] = True
        metricas_ia_materia[mat_id] = metricas_seed.get(
            mat_id, {"intentos_ia": 2, "aprobados_ia": 2}
        )
        simulacros_mejor_nota[mat_id] = 82 if mat_id in {"calculo_1", "algebra_base"} else 70

        skills = sorted(
            mat.get("skills") or [],
            key=lambda s: int(s.get("ranking_criticidad") or 0),
        )
        is_calculo = mat_id == "calculo_1"

        for idx, skill in enumerate(skills):
            skill_id = str(skill.get("id") or "").strip()
            if not skill_id:
                continue

            if is_calculo:
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
        primera_nivel0
        if etapa_limpia == "pre_u"
        else (primera_nivel1 or primera_nivel0)
    )

    hoy = date.today().strftime("%d/%m")
    historial_errores = [
        {
            "id": "err_tester_1",
            "resumen": "Olvidó restringir argumento positivo en dominio logarítmico",
            "tema": "Funciones, Composición y Dominios",
            "materia": "Cálculo I - MAT 1101",
            "materia_id": "calculo_1",
            "tipo_error": "fallo_prerrequisito",
            "fecha": hoy,
            "superado": False,
        },
        {
            "id": "err_tester_2",
            "resumen": "Signo invertido en componente tangencial del plano inclinado",
            "tema": "Leyes de Newton y Plano Inclinado",
            "materia": "Física I - FIS 1100",
            "materia_id": "fisica_1",
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
            "overallPercent": 85,
            "areaScores": {
                "Potencias y Raíces": 92,
                "Cálculo I": 80,
                "Física I": 84,
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


def _tester_necesita_actualizacion(estado_actual: dict[str, Any]) -> bool:
    """Detecta si una cuenta tester existente no tiene aún todas las materias/nodos actuales."""
    if not estado_actual.get("is_tester"):
        return True
    combinado = cargar_skills_combinados()
    materias = combinado.get("materias") or []
    iniciadas = estado_actual.get("materias_iniciadas") or {}
    nodos_estado = estado_actual.get("nodos_estado") or {}
    for mat in materias:
        if not iniciadas.get(mat["id"]):
            return True
        for s in mat.get("skills") or []:
            if s["id"] not in nodos_estado:
                return True
    return False


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
        etapa = str(datos.get("etapa") or "pre_u").strip()

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
            if _tester_necesita_actualizacion(estado_actual):
                etapa_actual = str(usuario.get("etapa") or estado_actual.get("etapa") or "facultad")
                estado_nuevo = construir_estado_tester(etapa_actual)
                estado_nuevo["nombre"] = str(usuario.get("nombre") or "Tester FNI").strip() or "Tester FNI"
                actualizar_estado(
                    username=TESTER_USERNAME,
                    estado_json=estado_nuevo,
                    etapa=estado_nuevo["etapa"],
                )
                usuario = {**usuario, "etapa": estado_nuevo["etapa"], "estado_json": estado_nuevo}

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
