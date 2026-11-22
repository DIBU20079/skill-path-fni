/**
 * Estado global, persistencia híbrida (localStorage + Supabase), caché DOM y helpers compartidos.
 */

import { apiGuardarProgreso } from "./api.js";

export const STORAGE_KEY = "skillpath_fni_progress_v1";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OPTION_LETTERS = ["A", "B", "C", "D"];

let cloudSyncTimerId = null;

const SHORT_SKILL_LABELS = {
  // Nivel 0: Álgebra de Supervivencia
  alg_01_potencias_raices: "Exp. y Raíces",
  alg_02_signos_jerarquia: "Signos/Jerarquía",
  alg_03_factorizacion_notables: "Factorización",
  alg_04_fracciones_racionalizacion: "Frac./Racionaliz.",
  alg_05_despejes_formulas: "Despejes",
  alg_06_inecuaciones_validez: "Inecuac./Validez",
  // Nivel 0: Trigonometría Aplicada
  trig_01_razones_circulo: "Razones/Círculo",
  trig_02_ley_senos_cosenos: "Senos/Cosenos",
  trig_03_identidades_pitagoricas: "Identidades",
  trig_04_angulo_doble_compuesto: "Áng. Comp./Doble",
  trig_05_ecuaciones_trig: "Ec. Trig.",
  // Nivel 0: Geometría Analítica
  geo_01_plano_distancias: "Dist./Pto Medio",
  geo_02_rectas_pendientes: "Rectas/Pend.",
  geo_03_circunferencia: "Circunferencia",
  geo_04_parabola: "Parábola",
  geo_05_elipse_hiperbola: "Elipse/Hipérbola",
  // Nivel 1: Cálculo I
  fac_cal_01_inecuaciones_func: "Inecuaciones",
  fac_cal_01b_funciones_dominios: "Dominios/Func.",
  fac_cal_02_limites_alg: "Lím. Alg.",
  fac_cal_03_limites_trig: "Lím. Trig.",
  fac_cal_03b_continuidad: "Continuidad",
  fac_cal_04_derivadas: "Derivadas",
  fac_cal_04b_deriv_implicita_log: "Der. Implícita",
  fac_cal_05_optimizacion: "Optimización",
  fac_cal_06_integrales_basicas: "Integrales",
  // Nivel 1: Física I
  fac_fis_01_vectores: "Vectores",
  fac_fis_01b_cinematica_1d: "Cinemática 1D",
  fac_fis_02_cinematica: "Tiro Paraból.",
  fac_fis_03_dinamica: "Newton",
  fac_fis_03b_poleas_circular: "Poleas/Circ.",
  fac_fis_04_energia: "Energía",
  // Aliases heredados
  pre_alg_01_factorizacion: "Factorización",
  pre_alg_02_fracciones: "Fracciones Alg.",
  pre_alg_02b_ecuaciones_log: "Exp. y Log.",
  pre_alg_03_inecuaciones: "Inecuaciones",
  pre_alg_04_funciones: "Funciones",
  pre_alg_05_limites_alg: "Límites Alg.",
  pre_trig_01_razones: "Razones Trig.",
  pre_trig_02_identidades: "Identidades",
  pre_trig_03_angulo_doble: "Áng. Doble",
  pre_trig_03b_ley_senos_cosenos: "Senos/Cosenos",
  pre_trig_04_ecuaciones: "Ec. y Límites",
};

function createDefaultMedalCounters() {
  return {
    resiliencia: 0,
    rescate_critico: 0,
    salto_nivel: 0,
    errores_superados: 0,
    simulacros_aprobados: 0,
  };
}

export function createDefaultState() {
  return {
    nombre: "",
    etapa: null,
    is_tester: false,
    onboarding_completado: false,
    materia_activa: null,
    materias_iniciadas: {},
    xp: 0,
    racha: 0,
    nodos_estado: {},
    nodos_pasos: {},
    metricas_ia_materia: {},
    historial_errores: [],
    diagnostico_completado: false,
    diagnostico_resultados: null,
    xp_otorgado_nodos: {},
    nodo_retorno: null,
    contadores_medallas: createDefaultMedalCounters(),
    simulacros_mejor_nota: {},
  };
}

function normalizeErrorEntry(entry, idx = 0) {
  if (typeof entry === "string") {
    const resumen = entry.trim();
    if (!resumen) return null;
    return {
      id: `err_legacy_${idx}`,
      resumen,
      tema: "Refuerzo General",
      materia: "",
      materia_id: "",
      tipo_error: "error_operativo",
      fecha: "",
      superado: false,
    };
  }
  if (!entry || typeof entry !== "object") return null;
  const resumen = String(entry.resumen || "").trim();
  if (!resumen) return null;

  const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
  return {
    id: rawId || `err_legacy_${idx}`,
    resumen,
    tema: String(entry.tema || "Refuerzo General").trim(),
    materia: String(entry.materia || "").trim(),
    materia_id: resolveCanonicalMateriaId(entry.materia_id),
    tipo_error: String(entry.tipo_error || "error_operativo").trim(),
    fecha: String(entry.fecha || "").trim(),
    superado: Boolean(entry.superado),
  };
}

function normalizeStateObject(parsed) {
  const defaults = createDefaultState();
  if (!parsed || typeof parsed !== "object") return defaults;

  const rawCounters =
    parsed.contadores_medallas && typeof parsed.contadores_medallas === "object"
      ? parsed.contadores_medallas
      : {};
  const defaultCounters = createDefaultMedalCounters();
  const cleanCounters = {
    resiliencia: Number(rawCounters.resiliencia) || 0,
    rescate_critico: Number(rawCounters.rescate_critico) || 0,
    salto_nivel: Number(rawCounters.salto_nivel) || 0,
    errores_superados: Number(rawCounters.errores_superados) || 0,
    simulacros_aprobados: Number(rawCounters.simulacros_aprobados) || 0,
  };

  const rawHistory = Array.isArray(parsed.historial_errores)
    ? parsed.historial_errores
    : [];
  const cleanHistory = rawHistory
    .map((entry, idx) => normalizeErrorEntry(entry, idx))
    .filter(Boolean);

  const rawSimScores =
    parsed.simulacros_mejor_nota && typeof parsed.simulacros_mejor_nota === "object"
      ? parsed.simulacros_mejor_nota
      : {};
  const cleanSimScores = {};
  Object.entries(rawSimScores).forEach(([matId, score]) => {
    const canonId = resolveCanonicalMateriaId(matId);
    const num = Number(score);
    if (canonId && Number.isFinite(num) && num >= 0) {
      cleanSimScores[canonId] = Math.max(
        cleanSimScores[canonId] || 0,
        Math.min(100, Math.round(num))
      );
    }
  });

  const rawNodeSteps =
    parsed.nodos_pasos && typeof parsed.nodos_pasos === "object" ? parsed.nodos_pasos : {};
  const cleanNodeSteps = {};
  Object.entries(rawNodeSteps).forEach(([skillId, stepsVal]) => {
    const n = Math.round(Number(stepsVal));
    if (Number.isFinite(n) && n >= 0) {
      cleanNodeSteps[skillId] = Math.min(3, Math.max(0, n));
    }
  });

  const rawAiMetrics =
    parsed.metricas_ia_materia && typeof parsed.metricas_ia_materia === "object"
      ? parsed.metricas_ia_materia
      : {};
  const cleanAiMetrics = {};
  Object.entries(rawAiMetrics).forEach(([matId, mObj]) => {
    if (!mObj || typeof mObj !== "object") return;
    const canonId = resolveCanonicalMateriaId(matId);
    if (!canonId) return;
    const intentos = Math.max(0, Math.round(Number(mObj.intentos_ia || 0)) || 0);
    const aprobados = Math.max(
      0,
      Math.min(intentos, Math.round(Number(mObj.aprobados_ia || 0)) || 0)
    );
    const prev = cleanAiMetrics[canonId] || { intentos_ia: 0, aprobados_ia: 0 };
    cleanAiMetrics[canonId] = {
      intentos_ia: prev.intentos_ia + intentos,
      aprobados_ia: prev.aprobados_ia + aprobados,
    };
  });

  const cleanInitiated = {};
  if (parsed.materias_iniciadas && typeof parsed.materias_iniciadas === "object") {
    Object.entries(parsed.materias_iniciadas).forEach(([matId, flag]) => {
      const canonId = resolveCanonicalMateriaId(matId);
      if (canonId && flag) cleanInitiated[canonId] = true;
    });
  }

  const canonicalMateriaActiva =
    typeof parsed.materia_activa === "string" && parsed.materia_activa.trim()
      ? resolveCanonicalMateriaId(parsed.materia_activa)
      : null;

  const cleanState = {
    ...defaults,
    ...parsed,
    nombre: typeof parsed.nombre === "string" ? parsed.nombre.trim() : "",
    is_tester: Boolean(parsed.is_tester),
    onboarding_completado: Boolean(parsed.onboarding_completado),
    materia_activa: canonicalMateriaActiva,
    materias_iniciadas: cleanInitiated,
    xp: Math.max(0, Number.isFinite(Number(parsed.xp)) ? Number(parsed.xp) : 0),
    racha: Math.max(0, Number.isFinite(Number(parsed.racha)) ? Number(parsed.racha) : 0),
    nodos_estado:
      parsed.nodos_estado && typeof parsed.nodos_estado === "object"
        ? { ...parsed.nodos_estado }
        : {},
    nodos_pasos: cleanNodeSteps,
    metricas_ia_materia: cleanAiMetrics,
    historial_errores: cleanHistory,
    xp_otorgado_nodos:
      parsed.xp_otorgado_nodos && typeof parsed.xp_otorgado_nodos === "object"
        ? { ...parsed.xp_otorgado_nodos }
        : {},
    diagnostico_completado: Boolean(
      parsed.diagnostico_completado ?? parsed.diagnostico_hecho
    ),
    nodo_retorno:
      typeof parsed.nodo_retorno === "string" && parsed.nodo_retorno.trim()
        ? parsed.nodo_retorno.trim()
        : null,
    contadores_medallas: { ...defaultCounters, ...cleanCounters },
    simulacros_mejor_nota: cleanSimScores,
  };

  delete cleanState.nota_parcial;
  delete cleanState.notas_parciales;
  delete cleanState.alerta_rescate;
  return cleanState;
}

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeStateObject(JSON.parse(raw));
  } catch (_error) {
    return createDefaultState();
  }
}

export const state = loadState();
export const dom = {};
export const LEGACY_MATERIA_ALIASES = Object.freeze({
  pre_algebra: "algebra_base",
  pre_trigonometria: "trigonometria",
  fac_calculo1: "calculo_1",
  fac_fisica1: "fisica_1",
});

export function resolveCanonicalMateriaId(materiaId) {
  const clean = String(materiaId || "").trim();
  if (!clean) return "";
  return LEGACY_MATERIA_ALIASES[clean] || clean;
}

export const appContext = {
  skillsDB: null,
  activeSection: "materias",
  materiasViewMode: "levels", // "levels" | "network"
  networkSelectedType: null, // "node" | "edge" | null
  networkSelectedId: null,
  skillsSelectedMateriaId: null,
  vaultFilterScope: "subject", // "subject" | "all"
  diagRadarChartInstance: null,
  skillsRadarChartInstance: null,
  skillsLoadFailed: false,
  currentUser: null,
  suppressCloudSync: false,
};

function persistLocalOnly() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    // Ignora fallos de almacenamiento local
  }
}

function scheduleCloudSync(immediate = false) {
  if (!appContext.currentUser || appContext.suppressCloudSync) return;

  if (cloudSyncTimerId !== null) {
    window.clearTimeout(cloudSyncTimerId);
    cloudSyncTimerId = null;
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  const stageSnapshot = state.etapa || appContext.currentUser.etapa || null;

  if (immediate) {
    return apiGuardarProgreso(snapshot, stageSnapshot).catch((err) => {
      console.warn("Sincronización inmediata pendiente:", err?.message || err);
    });
  }

  cloudSyncTimerId = window.setTimeout(() => {
    cloudSyncTimerId = null;
    if (!appContext.currentUser || appContext.suppressCloudSync) return;
    apiGuardarProgreso(snapshot, stageSnapshot).catch((err) => {
      console.warn("Sincronización en segundo plano pendiente:", err?.message || err);
    });
  }, 300);
}

export function saveState(options = {}) {
  persistLocalOnly();
  return scheduleCloudSync(Boolean(options?.immediate));
}

export function shouldShowOnboarding() {
  const username = String(appContext.currentUser?.username || "").trim().toLowerCase();
  if (!username) return false;
  if (state.is_tester || username === "tester" || username === "jurado_demo") {
    return false;
  }
  if (state.onboarding_completado === true) return false;
  const hasInitiated =
    state.materias_iniciadas &&
    typeof state.materias_iniciadas === "object" &&
    Object.values(state.materias_iniciadas).some(Boolean);
  if (hasInitiated) return false;
  return true;
}

export function resetState(preservedName = "") {
  Object.assign(state, createDefaultState(), { nombre: preservedName });
}

export function inferInitiatedMateriasFromNodes() {
  if (!appContext.skillsDB) return;
  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }

  for (const mat of getAllMaterias()) {
    const skills = getMateriaSkills(mat);
    const hasProgress = skills.some((s) => {
      const st = state.nodos_estado[s.id];
      return st === "unlocked" || st === "blocker" || state.xp_otorgado_nodos[s.id];
    });
    if (hasProgress) {
      state.materias_iniciadas[mat.id] = true;
    }
  }
}

export function hydrateStateFromUser(userData) {
  if (!userData || typeof userData !== "object") return;

  appContext.suppressCloudSync = true;
  if (cloudSyncTimerId !== null) {
    window.clearTimeout(cloudSyncTimerId);
    cloudSyncTimerId = null;
  }

  try {
    appContext.currentUser = {
      username: String(userData.username || "").trim().toLowerCase(),
      nombre: String(userData.nombre || "").trim(),
      etapa: userData.etapa === "facultad" ? "facultad" : "pre_u",
    };

    const hydrated = normalizeStateObject(userData.estado_json);
    if (!hydrated.nombre && appContext.currentUser.nombre) {
      hydrated.nombre = appContext.currentUser.nombre;
    }
    if (!hydrated.etapa) {
      hydrated.etapa = appContext.currentUser.etapa;
    }
    if (appContext.currentUser.username === "tester") {
      hydrated.is_tester = true;
    }

    Object.assign(state, hydrated);
    appContext.skillsSelectedMateriaId = state.materia_activa || null;
    inferInitiatedMateriasFromNodes();
    persistLocalOnly();
  } finally {
    appContext.suppressCloudSync = false;
  }
}

export function clearSessionLocalState() {
  if (cloudSyncTimerId !== null) {
    window.clearTimeout(cloudSyncTimerId);
    cloudSyncTimerId = null;
  }
  appContext.currentUser = null;
  appContext.skillsSelectedMateriaId = null;
  appContext.vaultFilterScope = "subject";
  resetState("");
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // Ignora fallos de limpieza local
  }
}

export function getHistorialResumenes() {
  const entries = Array.isArray(state.historial_errores)
    ? state.historial_errores
    : [];
  const pending = entries
    .filter((item) => item && !item.superado)
    .map((item) => (typeof item === "string" ? item : item.resumen || ""))
    .filter(Boolean);
  if (pending.length > 0) return pending;
  return entries
    .map((item) => (typeof item === "string" ? item : item.resumen || ""))
    .filter(Boolean);
}

export function incrementMedallaCounter(counterKey, delta = 1) {
  if (!counterKey) return;
  if (!state.contadores_medallas || typeof state.contadores_medallas !== "object") {
    state.contadores_medallas = createDefaultMedalCounters();
  }
  const current = Number(state.contadores_medallas[counterKey] || 0);
  state.contadores_medallas[counterKey] = Math.max(0, current + Number(delta || 1));
}

export function addErrorToVault({
  resumen,
  tema = "Refuerzo General",
  materia = "",
  materia_id = "",
  tipo_error = "error_operativo",
} = {}) {
  const cleanResumen = String(resumen || "Revisar aplicación de regla").trim();
  const fechaHoy = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
  const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (!Array.isArray(state.historial_errores)) {
    state.historial_errores = [];
  }

  const entry = {
    id,
    resumen: cleanResumen,
    tema: String(tema || "Refuerzo General").trim(),
    materia: String(materia || "").trim(),
    materia_id: String(materia_id || "").trim(),
    tipo_error: String(tipo_error || "error_operativo").trim(),
    fecha: fechaHoy,
    superado: false,
  };
  state.historial_errores.push(entry);
  return entry;
}

export function obtenerPrioridadTema(skill) {
  if (skill && typeof skill.prioridad === "string" && skill.prioridad.trim()) {
    return { label: skill.prioridad.trim(), badgeClass: "priority-custom" };
  }
  const rawFreq = parseInt(String(skill?.frecuencia_examen || "85"), 10);
  const freq = Number.isFinite(rawFreq) ? rawFreq : 85;
  if (freq >= 94) {
    return { label: "🔥 Fijo en Parcial", badgeClass: "priority-fijo" };
  }
  if (freq >= 90) {
    return { label: "⭐ Muy frecuente", badgeClass: "priority-frecuente" };
  }
  return { label: "📌 Base clave", badgeClass: "priority-base" };
}

export function obtenerProgresoNodo(skillId, estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const status = est.nodos_estado?.[skillId] || "locked";
  const stepsRaw = Number(est.nodos_pasos?.[skillId] || 0);
  const steps = Math.max(0, Math.min(3, Number.isFinite(stepsRaw) ? Math.round(stepsRaw) : 0));

  if (status === "unlocked") {
    return {
      status: "unlocked",
      steps: 3,
      percent: 100,
      barWidth: 100,
      barClass: "is-unlocked",
      label: "100%",
      badgeText: "Dominado",
      badgeClass: "text-bg-success",
    };
  }

  if (status === "active") {
    const pct = steps >= 3 ? 100 : steps === 2 ? 66 : steps === 1 ? 33 : 0;
    return {
      status: "active",
      steps,
      percent: pct,
      barWidth: pct,
      barClass: "is-active",
      label: `${pct}%`,
      badgeText: "Activo",
      badgeClass: "text-bg-warning text-dark",
    };
  }

  if (status === "blocker") {
    const pct = steps === 2 ? 66 : steps === 1 ? 33 : 0;
    return {
      status: "blocker",
      steps,
      percent: pct,
      barWidth: Math.max(30, pct),
      barClass: "is-blocker",
      label: "Refuerzo pendiente",
      badgeText: "Crítico",
      badgeClass: "text-bg-danger",
    };
  }

  return {
    status: "locked",
    steps: 0,
    percent: 0,
    barWidth: 0,
    barClass: "is-locked",
    label: "0%",
    badgeText: "Pendiente",
    badgeClass: "text-bg-secondary",
  };
}

export function registrarPasoNodo(skillId, pasoNum) {
  if (!skillId) return;
  if (!state.nodos_pasos || typeof state.nodos_pasos !== "object") {
    state.nodos_pasos = {};
  }
  const prev = Number(state.nodos_pasos[skillId] || 0);
  const target = Math.max(prev, Math.min(3, Math.round(Number(pasoNum) || 0)));
  if (target !== prev || state.nodos_pasos[skillId] === undefined) {
    state.nodos_pasos[skillId] = target;
    saveState();
  }
}

export function registrarIntentoIA(materiaId, aprobado) {
  if (!materiaId) return;
  if (!state.metricas_ia_materia || typeof state.metricas_ia_materia !== "object") {
    state.metricas_ia_materia = {};
  }
  const prev =
    state.metricas_ia_materia[materiaId] &&
    typeof state.metricas_ia_materia[materiaId] === "object"
      ? state.metricas_ia_materia[materiaId]
      : { intentos_ia: 0, aprobados_ia: 0 };

  const intentos = Math.max(0, Number(prev.intentos_ia || 0)) + 1;
  const aprobados = Math.max(0, Number(prev.aprobados_ia || 0)) + (aprobado ? 1 : 0);
  state.metricas_ia_materia[materiaId] = {
    intentos_ia: intentos,
    aprobados_ia: Math.min(intentos, aprobados),
  };
}

export function obtenerMetricasIAMateria(materiaId, estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const mObj = est.metricas_ia_materia?.[materiaId];
  const intentos = Math.max(0, Number(mObj?.intentos_ia || 0));
  const aprobados = Math.max(0, Math.min(intentos, Number(mObj?.aprobados_ia || 0)));
  const precisionPct =
    intentos > 0 ? Math.round((aprobados / intentos) * 100) : null;
  return { intentos, aprobados, precisionPct };
}

export function calcularDominioMateria(materia, estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const matObj =
    typeof materia === "string" ? findMateriaById(materia)?.materia : materia;
  const skills = getMateriaSkills(matObj);
  if (!skills.length) return 0;

  const totalPct = skills.reduce(
    (acc, skill) => acc + obtenerProgresoNodo(skill.id, est).percent,
    0
  );
  return Math.max(0, Math.min(100, Math.round(totalPct / skills.length)));
}

function normalizeLabelCompare(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function errorMatchesMateria(entry, materia) {
  if (!entry || !materia) return false;
  if (entry.materia_id && entry.materia_id === materia.id) return true;

  const matNameNorm = normalizeLabelCompare(materia.nombre);
  const entryMatNorm = normalizeLabelCompare(entry.materia);
  if (entryMatNorm && matNameNorm && entryMatNorm === matNameNorm) {
    return true;
  }

  const entryTemaNorm = normalizeLabelCompare(entry.tema);
  if (entryTemaNorm) {
    const skills = getMateriaSkills(materia);
    if (
      skills.some((s) => {
        const sNorm = normalizeLabelCompare(s.nombre);
        return sNorm === entryTemaNorm || sNorm.includes(entryTemaNorm) || entryTemaNorm.includes(sNorm);
      })
    ) {
      return true;
    }
  }
  return false;
}

export function getShortSkillLabel(skill) {
  if (!skill) return "Tema";
  if (SHORT_SKILL_LABELS[skill.id]) return SHORT_SKILL_LABELS[skill.id];

  const base = String(skill.nombre || "Tema")
    .replace(/\([^)]*\)/g, "")
    .split(" y ")[0]
    .trim();
  if (base.length <= 15) return base;
  return `${base.slice(0, 14).trim()}…`;
}

export function obtenerRangoFNI(xp = state.xp) {
  const xpActual = Math.max(0, Math.round(Number(xp) || 0));
  const tiers = [
    { min: 0, max: 199, nivel: 1, titulo: "Postulante", next: 200 },
    { min: 200, max: 499, nivel: 2, titulo: "Ingresante", next: 500 },
    { min: 500, max: 999, nivel: 3, titulo: "Estudiante Nivelado", next: 1000 },
    { min: 1000, max: 1999, nivel: 4, titulo: "Aspirante a Auxiliar", next: 2000 },
    { min: 2000, max: Infinity, nivel: 5, titulo: "Auxiliar de Ciencias Básicas", next: null },
  ];

  const tier = tiers.find((t) => xpActual >= t.min && xpActual <= t.max) || tiers[0];
  let progresoPct = 100;
  if (tier.next !== null) {
    const span = Math.max(1, tier.next - tier.min);
    progresoPct = Math.max(0, Math.min(100, Math.round(((xpActual - tier.min) / span) * 100)));
  }

  return {
    titulo: tier.titulo,
    nivel: tier.nivel,
    xpActual,
    xpSiguiente: tier.next,
    progresoPct,
  };
}

export function obtenerMedallas(estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const c =
    est.contadores_medallas && typeof est.contadores_medallas === "object"
      ? est.contadores_medallas
      : {};
  const historial = Array.isArray(est.historial_errores) ? est.historial_errores : [];
  const simScores =
    est.simulacros_mejor_nota && typeof est.simulacros_mejor_nota === "object"
      ? est.simulacros_mejor_nota
      : {};

  const hasResolvedError =
    Number(c.errores_superados || 0) >= 1 || historial.some((e) => Boolean(e && e.superado));
  const hasSimPassed =
    Number(c.simulacros_aprobados || 0) >= 1 ||
    Object.values(simScores).some((score) => Number(score) >= 51);

  return [
    {
      id: "resiliencia",
      icono: "💪",
      nombre: "Resiliencia",
      descripcion: "Corrige un fallo de la IA y aprueba en un siguiente intento.",
      desbloqueada: Number(c.resiliencia || 0) >= 1,
    },
    {
      id: "rescate_critico",
      icono: "🛟",
      nombre: "Rescate Crítico",
      descripcion: "Recupera un módulo marcado en alerta roja (blocker).",
      desbloqueada: Number(c.rescate_critico || 0) >= 1,
    },
    {
      id: "salto_nivel",
      icono: "⚡",
      nombre: "Salto de Nivel",
      descripcion: "Aprueba un examen de '⚡ Saltar aquí' con ≥ 75%.",
      desbloqueada: Number(c.salto_nivel || 0) >= 1,
    },
    {
      id: "error_superado",
      icono: "🎯",
      nombre: "Error Superado",
      descripcion: "Supera un fallo guardado desde el Baúl de Errores Activo.",
      desbloqueada: hasResolvedError,
    },
    {
      id: "simulacro_aprobado",
      icono: "🏆",
      nombre: "Simulacro Aprobado",
      descripcion: "Aprueba un Simulacro de Parcial con nota ≥ 51/100.",
      desbloqueada: hasSimPassed,
    },
    {
      id: "constancia",
      icono: "🔥",
      nombre: "Constancia",
      descripcion: "Mantén una racha de 3+ días resolviendo retos.",
      desbloqueada: Number(est.racha || 0) >= 3,
    },
  ];
}

export function calcularPreparacionExamen(materia, estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const matObj =
    typeof materia === "string" ? findMateriaById(materia)?.materia : materia;
  const skills = getMateriaSkills(matObj);
  if (!skills.length) return 0;

  const nodosEstado =
    est.nodos_estado && typeof est.nodos_estado === "object" ? est.nodos_estado : {};

  let totalWeight = 0;
  let unlockedWeight = 0;

  skills.forEach((skill) => {
    const rawFreq = parseInt(String(skill.frecuencia_examen || "80"), 10);
    const weight = Number.isFinite(rawFreq) && rawFreq > 0 ? rawFreq : 80;
    totalWeight += weight;
    if (nodosEstado[skill.id] === "unlocked") {
      unlockedWeight += weight;
    }
  });

  if (totalWeight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((unlockedWeight / totalWeight) * 100)));
}

export function obtenerFallosRepetitivos(estado = state, materiaFilter = null) {
  const est = estado && typeof estado === "object" ? estado : state;
  const history = Array.isArray(est.historial_errores) ? est.historial_errores : [];
  if (history.length === 0) return [];

  const groups = new Map();

  history.forEach((rawEntry, index) => {
    const entry = normalizeErrorEntry(rawEntry, index);
    if (!entry) return;
    if (materiaFilter && !errorMatchesMateria(entry, materiaFilter)) return;

    const key = `${entry.tema.toLowerCase()}||${entry.tipo_error.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        tema: entry.tema,
        tipo_error: entry.tipo_error,
        resumen: entry.resumen,
        count: 0,
        pendientes: 0,
        lastIndex: index,
      });
    }
    const g = groups.get(key);
    g.count += 1;
    if (!entry.superado) {
      g.pendientes += 1;
      g.resumen = entry.resumen;
    } else if (g.pendientes === 0) {
      g.resumen = entry.resumen;
    }
    g.lastIndex = index;
  });

  return Array.from(groups.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.pendientes !== a.pendientes) return b.pendientes - a.pendientes;
      return b.lastIndex - a.lastIndex;
    })
    .slice(0, 3)
    .map((g) => ({
      ...g,
      advertencia: `${g.tema}: ${g.resumen}`,
    }));
}

export function marcarErrorSuperado(errorId) {
  if (!errorId || !Array.isArray(state.historial_errores)) {
    return { ok: false, alreadySuperado: false, xpAdded: 0, entry: null };
  }

  const entry = state.historial_errores.find((item) => item && item.id === errorId);
  if (!entry) {
    return { ok: false, alreadySuperado: false, xpAdded: 0, entry: null };
  }

  if (entry.superado) {
    return { ok: true, alreadySuperado: true, xpAdded: 0, entry };
  }

  entry.superado = true;
  state.xp += 30;
  incrementMedallaCounter("errores_superados", 1);
  saveState();
  updateTopbar();

  return { ok: true, alreadySuperado: false, xpAdded: 30, entry };
}

export function launchConfetti() {
  const colors = ["#58cc02", "#1cb0f6", "#ffc800", "#ff9600", "#ff4b4b"];
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: "2050",
  });

  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement("span");
    const size = 7 + Math.floor(Math.random() * 7);
    const startX = Math.random() * 100;
    const driftX = (Math.random() - 0.5) * 160;
    const rotation = 180 + Math.random() * 540;
    const delay = Math.random() * 250;
    const duration = 1700 + Math.random() * 900;

    Object.assign(piece.style, {
      position: "absolute",
      top: "-16px",
      left: `${startX}%`,
      width: `${size}px`,
      height: `${size * 1.35}px`,
      borderRadius: "3px",
      backgroundColor: colors[i % colors.length],
      opacity: "0.95",
    });

    container.appendChild(piece);

    if (typeof piece.animate === "function") {
      piece.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)", opacity: 1 },
          {
            transform: `translate3d(${driftX}px, 102vh, 0) rotate(${rotation}deg)`,
            opacity: 0.15,
          },
        ],
        {
          duration,
          delay,
          easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
          fill: "forwards",
        }
      );
    }
  }

  document.body.appendChild(container);
  window.setTimeout(() => container.remove(), 2900);
}

/* ========================================================================
   Helpers Multi-Materia e Inicio por Asignatura
   ======================================================================== */

export function getKnowledgeNetwork() {
  if (!appContext.skillsDB || !appContext.skillsDB.red_conocimientos) {
    return { nodos: [], conexiones: [] };
  }
  return appContext.skillsDB.red_conocimientos;
}

export function getAllMaterias() {
  if (!appContext.skillsDB) return [];
  if (Array.isArray(appContext.skillsDB.materias) && appContext.skillsDB.materias.length > 0) {
    return appContext.skillsDB.materias;
  }
  const combined = [];
  for (const stageKey of ["pre_u", "facultad"]) {
    const route = appContext.skillsDB[stageKey];
    if (route && Array.isArray(route.materias)) {
      combined.push(...route.materias);
    }
  }
  return combined;
}

export function getAllCurriculumSkills() {
  return getAllMaterias().flatMap((m) => getMateriaSkills(m));
}

export function getRouteData(stageKey = state.etapa) {
  if (!appContext.skillsDB || !stageKey) return null;
  return appContext.skillsDB[stageKey] || null;
}

export function getStageMaterias(stageKey = state.etapa) {
  const all = getAllMaterias();
  if (all.length > 0 && stageKey) {
    const filtered = all.filter((m) => (m.etapa || (Number(m.nivel) === 0 ? "pre_u" : "facultad")) === stageKey);
    if (filtered.length > 0) return filtered;
  }
  const route = getRouteData(stageKey);
  return route && Array.isArray(route.materias) ? route.materias : [];
}

export function findMateriaById(materiaId) {
  const canonical = resolveCanonicalMateriaId(materiaId);
  if (!canonical || !appContext.skillsDB) return null;
  const direct = getAllMaterias().find((m) => m.id === canonical);
  if (direct) {
    const stageKey = direct.etapa || (Number(direct.nivel) === 0 ? "pre_u" : "facultad");
    return { materia: direct, stageKey };
  }
  for (const stageKey of ["pre_u", "facultad"]) {
    const found = getStageMaterias(stageKey).find((m) => m.id === canonical);
    if (found) return { materia: found, stageKey };
  }
  return null;
}

export function isMateriaIniciada(materiaId) {
  if (!materiaId) return false;
  return Boolean(state.materias_iniciadas && state.materias_iniciadas[materiaId]);
}

export function startMateriaFromScratch(materiaId) {
  const found = findMateriaById(materiaId);
  if (!found) return null;

  const { materia, stageKey } = found;
  const skills = getMateriaSkills(materia);

  state.etapa = stageKey;
  state.materia_activa = materia.id;
  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }
  if (!state.nodos_pasos || typeof state.nodos_pasos !== "object") {
    state.nodos_pasos = {};
  }
  state.materias_iniciadas[materia.id] = true;
  state.diagnostico_completado = true;

  skills.forEach((s, idx) => {
    state.nodos_estado[s.id] = idx === 0 ? "active" : "locked";
    delete state.nodos_pasos[s.id];
  });

  saveState();
  updateGreetingUI();
  updateTopbar();
  return materia;
}

export function getDiagnosticAreasForStage(stageKey = state.etapa) {
  const areas = [];
  getStageMaterias(stageKey).forEach((mat) => {
    getMateriaSkills(mat).forEach((s) => {
      if (s.area && !areas.includes(s.area)) {
        areas.push(s.area);
      }
    });
  });
  if (areas.length > 0) return areas;

  return stageKey === "facultad"
    ? ["Álgebra y Trig.", "Cálculo I", "Física I"]
    : ["Álgebra", "Trigonometría", "Cálculo/Lógica"];
}

export function getActiveMateria() {
  const allMaterias = getAllMaterias();
  const stageMaterias = getStageMaterias(state.etapa);
  const pool = allMaterias.length > 0 ? allMaterias : stageMaterias;
  if (pool.length === 0) return null;

  const canonicalActive = resolveCanonicalMateriaId(state.materia_activa);
  const found = pool.find((m) => m.id === canonicalActive);
  if (found) {
    if (state.materia_activa !== found.id) {
      state.materia_activa = found.id;
      saveState();
    }
    return found;
  }

  const stagePool = stageMaterias.length > 0 ? stageMaterias : pool;
  const initiated =
    stagePool.find((m) => isMateriaIniciada(m.id)) ||
    pool.find((m) => isMateriaIniciada(m.id));
  const chosen = initiated || stagePool[0] || pool[0];
  state.materia_activa = chosen.id;
  saveState();
  return chosen;
}

export function getMateriaSkills(materia) {
  if (!materia || !Array.isArray(materia.skills)) return [];
  return [...materia.skills].sort(
    (a, b) => Number(a.ranking_criticidad || 0) - Number(b.ranking_criticidad || 0)
  );
}

export function getMateriaUnidades(materia) {
  if (!materia) return [];
  const skills = getMateriaSkills(materia);
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const rawUnits = Array.isArray(materia.unidades) ? materia.unidades : [];
  const unidades = [];
  const assignedIds = new Set();

  rawUnits.forEach((unit, idx) => {
    if (!unit || typeof unit !== "object") return;
    const rawIds = Array.isArray(unit.nodos_ids) ? unit.nodos_ids : [];
    const validIds = rawIds.filter((id) => skillById.has(id));
    if (validIds.length === 0) return;

    validIds.forEach((id) => assignedIds.add(id));
    unidades.push({
      id: String(unit.id || `${materia.id}_u${idx + 1}`).trim(),
      titulo: String(unit.titulo || `Unidad ${idx + 1}`).trim(),
      descripcion: String(unit.descripcion || "").trim(),
      bases_requeridas: Array.isArray(unit.bases_requeridas)
        ? unit.bases_requeridas
        : [],
      nodos_ids: validIds,
    });
  });

  // Fallback o nodos sin asignar a unidad explícita
  const unassigned = skills.filter((s) => !assignedIds.has(s.id));
  if (unassigned.length > 0) {
    const groups = new Map();
    unassigned.forEach((skill) => {
      const title = String(skill.unidad || "Unidad 1: Fundamentos").trim();
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(skill.id);
    });
    let fallbackIdx = unidades.length + 1;
    groups.forEach((nodosIds, title) => {
      unidades.push({
        id: `${materia.id || "mat"}_u${fallbackIdx}`,
        titulo: title,
        descripcion: "",
        bases_requeridas: [],
        nodos_ids: nodosIds,
      });
      fallbackIdx += 1;
    });
  }

  return unidades;
}

export function getActiveMateriaSkills() {
  return getMateriaSkills(getActiveMateria());
}

export function getAllStageSkills(stageKey = state.etapa) {
  return getStageMaterias(stageKey).flatMap((m) => getMateriaSkills(m));
}

export function findSkillGlobal(skillId) {
  if (!skillId) return null;
  for (const mat of getAllMaterias()) {
    const found = getMateriaSkills(mat).find((s) => s.id === skillId);
    if (found) {
      const stageKey = mat.etapa || (Number(mat.nivel) === 0 ? "pre_u" : "facultad");
      return { skill: found, materia: mat, stageKey };
    }
  }
  return null;
}

export function ensureConsistentNodeStatesForStage(_stageKey = state.etapa) {
  const materias = getAllMaterias();
  if (materias.length === 0) return;

  let changed = false;
  materias.forEach((mat) => {
    const skills = getMateriaSkills(mat);
    skills.forEach((s) => {
      if (!state.nodos_estado[s.id]) {
        state.nodos_estado[s.id] = "locked";
        changed = true;
      }
    });

    if (isMateriaIniciada(mat.id)) {
      const hasActionable = skills.some((s) => {
        const st = state.nodos_estado[s.id];
        return st === "active" || st === "blocker";
      });
      if (!hasActionable) {
        const firstLocked = skills.find((s) => state.nodos_estado[s.id] === "locked");
        if (firstLocked) {
          state.nodos_estado[firstLocked.id] = "active";
          changed = true;
        }
      }
    }
  });

  if (changed) saveState();
}

/* ========================================================================
   Caché DOM y Utilidades de Interfaz
   ======================================================================== */

export function cacheDom() {
  const ids = [
    "app-nav",
    "sidebar-home-link",
    "sidebar-user-avatar",
    "sidebar-user-name",
    "sidebar-user-handle",
    "sidebar-user-stage",
    "top-navbar",
    "brand-home-link",
    "btn-topbar-subject",
    "nav-subject-name",
    "nav-progress-bar",
    "nav-streak-count",
    "nav-xp-count",
    "view-stage-selector",
    "view-onboarding",
    "onboarding-step-1",
    "onboarding-step-2",
    "onboarding-welcome-title",
    "btn-onboarding-continue",
    "onboarding-subjects-grid",
    "btn-onboarding-explore-all",
    "auth-global-error",
    "auth-global-error-text",
    "btn-auth-retry",
    "tab-auth-login",
    "tab-auth-register",
    "form-auth-login",
    "auth-login-username",
    "auth-login-password",
    "auth-login-error",
    "btn-auth-login",
    "btn-auth-login-label",
    "btn-auth-login-spinner",
    "form-auth-register",
    "auth-reg-nombre",
    "auth-reg-username",
    "auth-reg-password",
    "auth-reg-stage-preu",
    "auth-reg-stage-facultad",
    "auth-reg-error",
    "btn-auth-register",
    "btn-auth-register-label",
    "btn-auth-register-spinner",
    "btn-auth-demo-login",
    "btn-auth-demo-label",
    "btn-auth-demo-spinner",
    "view-diagnostic",
    "diagnostic-quiz-panel",
    "diag-mode-kicker",
    "diag-exam-title",
    "btn-diag-cancel",
    "diag-current-num",
    "diag-total-num",
    "diag-area-badge",
    "diag-timer-pill",
    "diag-timer-text",
    "diag-timer-bar",
    "diag-step-dots",
    "diag-question-latex",
    "diag-options-container",
    "diag-feedback-box",
    "diag-footer-hint",
    "btn-diag-next",
    "diagnostic-results-panel",
    "diag-result-pill",
    "diag-result-title",
    "diag-result-subtitle",
    "diag-overall-score",
    "diag-radar-col",
    "diagnostic-radar-chart",
    "diag-breakdown-col",
    "diag-breakdown-heading",
    "diag-area-summary",
    "diag-recommendation-text",
    "btn-go-to-path",
    "view-camino",
    "subject-onboarding-card",
    "onboarding-subject-code",
    "btn-onboarding-back-subjects",
    "onboarding-subject-icon",
    "onboarding-subject-title",
    "onboarding-subject-desc",
    "onboarding-topics-preview",
    "btn-start-from-scratch",
    "btn-start-placement-exam",
    "camino-main-row",
    "camino-ranking-aside",
    "path-user-greeting",
    "path-route-title",
    "path-route-desc",
    "path-readiness-badge",
    "path-readiness-bar",
    "btn-path-placement",
    "btn-go-subjects",
    "duolingo-path-container",
    "ranking-materia-code",
    "critical-ranking-list",
    "unitBasesModal",
    "unit-bases-modal-subject",
    "unit-bases-modal-title",
    "unit-bases-modal-desc",
    "unit-bases-summary-badge",
    "unit-bases-list",
    "btn-unit-validate-skip",
    "btn-unit-free-practice",
    "view-materias",
    "materias-stage-pill",
    "btn-materias-view-network",
    "btn-materias-view-levels",
    "materias-network-view",
    "materias-levels-view",
    "knowledge-network-canvas",
    "btn-net-zoom-in",
    "btn-net-zoom-out",
    "btn-net-center",
    "btn-net-fit",
    "network-inspector-card",
    "inspector-kicker",
    "inspector-title",
    "inspector-badges",
    "inspector-progress-wrap",
    "inspector-progress-text",
    "inspector-progress-bar",
    "inspector-body",
    "subjects-catalog-container",
    "view-skills",
    "skills-selected-badge",
    "skills-subject-selector",
    "skills-kpi-mastery",
    "skills-kpi-mastery-bar",
    "skills-kpi-mastery-sub",
    "skills-kpi-completed",
    "skills-kpi-completed-sub",
    "skills-kpi-ai-accuracy",
    "skills-kpi-ai-detail",
    "skills-kpi-alerts",
    "skills-kpi-alerts-sub",
    "pre-exam-warnings-badge",
    "pre-exam-warnings-empty",
    "pre-exam-warnings-list",
    "skills-radar-title",
    "skills-radar-chart",
    "skills-topics-heading",
    "skills-topics-count",
    "skills-topics-breakdown",
    "error-vault-count",
    "btn-vault-scope-subject",
    "btn-vault-scope-all",
    "error-vault-empty",
    "error-vault-empty-text",
    "error-vault-list",
    "btn-clear-vault",
    "view-perfil",
    "profile-avatar",
    "profile-stage-badge",
    "profile-rank-badge",
    "profile-tester-badge",
    "profile-display-name",
    "profile-username-handle",
    "profile-xp",
    "profile-streak",
    "profile-completed",
    "btn-profile-logout",
    "profile-tester-card",
    "btn-tester-sync-all",
    "btn-tester-sync-label",
    "btn-tester-sync-spinner",
    "btn-tester-stage-preu",
    "btn-tester-stage-facultad",
    "profile-tester-feedback",
    "profile-rank-level",
    "profile-rank-title",
    "profile-rank-xp",
    "profile-rank-next-label",
    "profile-rank-bar",
    "profile-medals-unlocked-count",
    "profile-medals-grid",
    "profile-global-summary-badge",
    "profile-subjects-progress-list",
    "profile-name-form",
    "profile-name-input",
    "profile-name-saved-msg",
    "btn-profile-stage-preu",
    "btn-profile-stage-facultad",
    "btn-profile-repeat-diag",
    "btn-load-demo-profile",
    "btn-profile-reset-all",
    "profile-demo-feedback",
    "nodeLessonModal",
    "modal-node-meta",
    "modal-node-title",
    "modal-ai-gen-badge",
    "modal-difficulty-badge",
    "btn-generate-ai-exercise",
    "btn-gen-label",
    "btn-gen-spinner",
    "modal-gen-feedback",
    "modal-reinforcement-banner",
    "modal-reinforcement-text",
    "modal-node-xp",
    "modal-mode-tabs",
    "tab-modal-learn",
    "tab-modal-practice",
    "lesson-stepper-wrap",
    "stepper-step-1",
    "stepper-step-2",
    "stepper-step-3",
    "modal-step-progress-bar",
    "modal-pane-learn",
    "learn-idea-clave",
    "learn-formulas-grid",
    "learn-receta-list",
    "learn-guided-enunciado",
    "learn-guided-steps-list",
    "learn-guided-final",
    "learn-guided-error",
    "btn-reveal-next-step",
    "btn-reveal-all-steps",
    "btn-gen-guided-example",
    "btn-guided-label",
    "btn-guided-spinner",
    "learn-traps-list",
    "btn-learn-go-practice",
    "modal-pane-practice",
    "lesson-step-1",
    "step1-title",
    "step1-question-latex",
    "step1-options-container",
    "step1-feedback",
    "btn-step1-check",
    "btn-step1-next",
    "lesson-step-2",
    "step2-title",
    "step2-enunciado-latex",
    "step2-answer-input",
    "btn-step2-hint",
    "step2-hint-box",
    "step2-hint-text",
    "step2-feedback",
    "btn-step2-check",
    "btn-step2-next",
    "lesson-step-3",
    "step3-header-badge",
    "step3-tools-bar",
    "btn-toggle-step3-formulas",
    "step3-difficulty-wrap",
    "btn-diff-base",
    "btn-diff-parcial",
    "btn-step3-generate-ai",
    "btn-step3-gen-label",
    "btn-step3-gen-spinner",
    "step3-formulas-drawer",
    "step3-formulas-list",
    "step3-title",
    "step3-instructions",
    "step3-enunciado-latex",
    "step3-attempts-history",
    "step3-attempts-count",
    "step3-attempts-list",
    "analogous-scaffold-card",
    "btn-show-analogous",
    "btn-analogous-label",
    "btn-analogous-spinner",
    "analogous-error",
    "analogous-example-body",
    "analogous-enunciado",
    "analogous-pasos-list",
    "analogous-conclusion",
    "photo-dropzone",
    "step3-photo-input",
    "photo-dropzone-empty",
    "photo-preview-wrapper",
    "step3-photo-preview",
    "step3-photo-filename",
    "btn-remove-photo",
    "step3-text-input",
    "btn-audit-ai",
    "btn-audit-label",
    "btn-audit-spinner",
    "btn-audit-spinner-text",
    "step3-api-error",
    "ai-audit-result-card",
    "ai-result-header",
    "ai-result-status-badge",
    "ai-result-type-badge",
    "ai-result-prereq-badge",
    "ai-xp-bonuses-banner",
    "ai-base-recovered-banner",
    "ai-block-progreso",
    "ai-res-progreso",
    "ai-block-ubicacion",
    "ai-block-explicacion",
    "ai-pista-label",
    "ai-res-ubicacion",
    "ai-res-explicacion",
    "ai-res-pista",
    "ai-res-tip",
    "ai-res-baul-pill",
    "ai-res-baul-text",
    "btn-upload-correction",
    "btn-reinforce-prereq",
    "btn-return-to-node",
    "btn-complete-node",
  ];

  ids.forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

export function showView(viewName) {
  const views = {
    "stage-selector": dom["view-stage-selector"],
    onboarding: dom["view-onboarding"],
    diagnostic: dom["view-diagnostic"],
    camino: dom["view-camino"],
    materias: dom["view-materias"],
    skills: dom["view-skills"],
    perfil: dom["view-perfil"],
  };

  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("d-none", key !== viewName);
  });

  const isAppShell = ["camino", "materias", "skills", "perfil"].includes(viewName);
  dom["app-nav"]?.classList.toggle("d-none", !isAppShell);
  dom["top-navbar"]?.classList.toggle(
    "d-none",
    viewName === "stage-selector" || viewName === "onboarding"
  );
  document.body.classList.toggle("has-app-nav", isAppShell);
}

export function updateGreetingUI() {
  const nombre = state.nombre || appContext.currentUser?.nombre || "Estudiante";
  const username = appContext.currentUser?.username || "estudiante";
  const inicial = nombre.charAt(0).toUpperCase() || "E";
  const etapaLabel =
    state.etapa === "facultad" ? "Nivel 1 · Ciencias Básicas" : "Nivel 0 · Fundamentos";

  if (dom["sidebar-user-name"]) {
    dom["sidebar-user-name"].textContent = nombre;
  }
  if (dom["sidebar-user-handle"]) {
    dom["sidebar-user-handle"].textContent = `@${username}`;
  }
  if (dom["sidebar-user-avatar"]) {
    dom["sidebar-user-avatar"].textContent = inicial;
  }
  if (dom["sidebar-user-stage"]) {
    dom["sidebar-user-stage"].textContent = state.etapa ? etapaLabel : "5 Materias";
  }
  if (dom["path-user-greeting"]) {
    dom["path-user-greeting"].textContent = `CAMINO DE ${nombre.toUpperCase()}`;
  }
  if (dom["profile-display-name"]) {
    dom["profile-display-name"].textContent = nombre;
  }
  if (dom["profile-username-handle"]) {
    dom["profile-username-handle"].textContent = `@${username}`;
  }
  if (dom["profile-avatar"]) {
    dom["profile-avatar"].textContent = inicial;
  }
  if (dom["profile-stage-badge"]) {
    dom["profile-stage-badge"].textContent =
      state.etapa === "facultad" ? "🚀 Nivel 1 · Ciencias Básicas" : "🎓 Nivel 0 · Fundamentos";
  }
}

export function updateTopbar() {
  const activeMat = getActiveMateria();
  const skills = getMateriaSkills(activeMat);
  const total = skills.length;
  const completed = skills.filter((s) => state.nodos_estado[s.id] === "unlocked").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (dom["nav-subject-name"]) {
    dom["nav-subject-name"].textContent = activeMat
      ? activeMat.nombre
      : state.etapa === "facultad"
        ? "Cálculo I"
        : "Álgebra Base";
  }

  if (dom["nav-progress-bar"]) {
    dom["nav-progress-bar"].style.width = `${percent}%`;
    dom["nav-progress-bar"].setAttribute("aria-valuenow", String(percent));
  }
  if (dom["nav-streak-count"]) {
    dom["nav-streak-count"].textContent = String(state.racha || 0);
  }
  if (dom["nav-xp-count"]) {
    dom["nav-xp-count"].textContent = String(state.xp || 0);
  }
}

export function renderSkillsLoadError(message) {
  appContext.skillsLoadFailed = true;
  showView("stage-selector");
  if (dom["auth-global-error"]) {
    dom["auth-global-error"].classList.remove("d-none");
  }
  if (dom["auth-global-error-text"]) {
    dom["auth-global-error-text"].textContent =
      `No se pudo conectar con /api/skills: ${message}. Reintenta cuando Flask esté activo.`;
  }
}

export function renderMath(container) {
  if (!container || typeof window.renderMathInElement !== "function") return;
  try {
    window.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
      strict: false,
    });
  } catch (error) {
    console.warn("Advertencia renderizando KaTeX:", error);
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showBootstrapModal(modalEl) {
  if (!modalEl || !window.bootstrap?.Modal) return;
  window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export function hideBootstrapModal(modalEl) {
  if (!modalEl || !window.bootstrap?.Modal) return;
  window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
}
