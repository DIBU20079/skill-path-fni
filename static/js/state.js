/**
 * Estado global, persistencia híbrida (localStorage + Supabase), caché DOM y helpers compartidos.
 */

import { apiGuardarProgreso } from "./api.js";

export const STORAGE_KEY = "skillpath_fni_progress_v1";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OPTION_LETTERS = ["A", "B", "C", "D"];

let cloudSyncTimerId = null;

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
    materia_activa: null,
    materias_iniciadas: {},
    xp: 0,
    racha: 0,
    nodos_estado: {},
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
    const num = Number(score);
    if (Number.isFinite(num) && num >= 0) {
      cleanSimScores[matId] = Math.min(100, Math.round(num));
    }
  });

  const cleanState = {
    ...defaults,
    ...parsed,
    nombre: typeof parsed.nombre === "string" ? parsed.nombre.trim() : "",
    materias_iniciadas:
      parsed.materias_iniciadas && typeof parsed.materias_iniciadas === "object"
        ? { ...parsed.materias_iniciadas }
        : {},
    xp: Math.max(0, Number.isFinite(Number(parsed.xp)) ? Number(parsed.xp) : 0),
    racha: Math.max(0, Number.isFinite(Number(parsed.racha)) ? Number(parsed.racha) : 0),
    nodos_estado:
      parsed.nodos_estado && typeof parsed.nodos_estado === "object"
        ? { ...parsed.nodos_estado }
        : {},
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
export const appContext = {
  skillsDB: null,
  activeSection: "materias",
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

function scheduleCloudSync() {
  if (!appContext.currentUser || appContext.suppressCloudSync) return;

  if (cloudSyncTimerId !== null) {
    window.clearTimeout(cloudSyncTimerId);
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  const stageSnapshot = state.etapa || appContext.currentUser.etapa || null;

  cloudSyncTimerId = window.setTimeout(() => {
    cloudSyncTimerId = null;
    if (!appContext.currentUser || appContext.suppressCloudSync) return;
    apiGuardarProgreso(snapshot, stageSnapshot).catch((err) => {
      console.warn("Sincronización en segundo plano pendiente:", err?.message || err);
    });
  }, 300);
}

export function saveState() {
  persistLocalOnly();
  scheduleCloudSync();
}

export function resetState(preservedName = "") {
  Object.assign(state, createDefaultState(), { nombre: preservedName });
}

export function inferInitiatedMateriasFromNodes() {
  if (!appContext.skillsDB) return;
  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }

  for (const stageKey of ["pre_u", "facultad"]) {
    for (const mat of getStageMaterias(stageKey)) {
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

    Object.assign(state, hydrated);
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
    tipo_error: String(tipo_error || "error_operativo").trim(),
    fecha: fechaHoy,
    superado: false,
  };
  state.historial_errores.push(entry);
  return entry;
}

export function obtenerRangoFNI(xp = state.xp) {
  const xpActual = Math.max(0, Math.round(Number(xp) || 0));
  const tiers = [
    { min: 0, max: 199, nivel: 1, titulo: "Postulante", next: 200 },
    { min: 200, max: 499, nivel: 2, titulo: "Ingresante FNI", next: 500 },
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
      id: "constancia_fni",
      icono: "🔥",
      nombre: "Constancia FNI",
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

export function obtenerFallosRepetitivos(estado = state) {
  const est = estado && typeof estado === "object" ? estado : state;
  const history = Array.isArray(est.historial_errores) ? est.historial_errores : [];
  if (history.length === 0) return [];

  const groups = new Map();

  history.forEach((rawEntry, index) => {
    const entry = normalizeErrorEntry(rawEntry, index);
    if (!entry) return;
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

export function getRouteData(stageKey = state.etapa) {
  if (!appContext.skillsDB || !stageKey) return null;
  return appContext.skillsDB[stageKey] || null;
}

export function getStageMaterias(stageKey = state.etapa) {
  const route = getRouteData(stageKey);
  return route && Array.isArray(route.materias) ? route.materias : [];
}

export function findMateriaById(materiaId) {
  if (!materiaId || !appContext.skillsDB) return null;
  for (const stageKey of ["pre_u", "facultad"]) {
    const found = getStageMaterias(stageKey).find((m) => m.id === materiaId);
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
  state.materias_iniciadas[materia.id] = true;
  state.diagnostico_completado = true;

  skills.forEach((s, idx) => {
    state.nodos_estado[s.id] = idx === 0 ? "active" : "locked";
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
  const materias = getStageMaterias(state.etapa);
  if (materias.length === 0) return null;

  const found = materias.find((m) => m.id === state.materia_activa);
  if (found) return found;

  const initiated = materias.find((m) => isMateriaIniciada(m.id));
  const chosen = initiated || materias[0];
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

export function getActiveMateriaSkills() {
  return getMateriaSkills(getActiveMateria());
}

export function getAllStageSkills(stageKey = state.etapa) {
  return getStageMaterias(stageKey).flatMap((m) => getMateriaSkills(m));
}

export function findSkillGlobal(skillId) {
  for (const stageKey of ["pre_u", "facultad"]) {
    for (const mat of getStageMaterias(stageKey)) {
      const found = getMateriaSkills(mat).find((s) => s.id === skillId);
      if (found) return { skill: found, materia: mat, stageKey };
    }
  }
  return null;
}

export function ensureConsistentNodeStatesForStage(stageKey = state.etapa) {
  const materias = getStageMaterias(stageKey);
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
    "nav-user-greeting",
    "nav-subject-name",
    "nav-progress-text",
    "nav-progress-percent",
    "nav-progress-bar",
    "nav-streak-count",
    "nav-xp-count",
    "view-stage-selector",
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
    "view-materias",
    "materias-stage-pill",
    "subjects-catalog-container",
    "view-skills",
    "skills-rank-level",
    "skills-rank-title",
    "skills-rank-xp",
    "skills-rank-next-label",
    "skills-rank-bar",
    "skills-readiness-subject",
    "skills-readiness-pct",
    "skills-readiness-bar",
    "skills-medals-unlocked-count",
    "skills-medals-grid",
    "pre-exam-warnings-empty",
    "pre-exam-warnings-list",
    "skills-radar-chart",
    "skills-mastery-list",
    "error-vault-count",
    "error-vault-empty",
    "error-vault-list",
    "btn-clear-vault",
    "view-perfil",
    "profile-avatar",
    "profile-stage-badge",
    "profile-display-name",
    "profile-xp",
    "profile-streak",
    "profile-completed",
    "btn-profile-logout",
    "profile-rank-level",
    "profile-rank-title",
    "profile-rank-xp",
    "profile-rank-next-label",
    "profile-rank-bar",
    "profile-medals-unlocked-count",
    "profile-medals-grid",
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
  dom["top-navbar"]?.classList.toggle("d-none", viewName === "stage-selector");
  document.body.classList.toggle("has-app-nav", isAppShell);
}

export function updateGreetingUI() {
  const nombre = state.nombre || appContext.currentUser?.nombre || "Estudiante";
  const username = appContext.currentUser?.username || "estudiante";
  const inicial = nombre.charAt(0).toUpperCase() || "E";
  const etapaLabel = state.etapa === "facultad" ? "Facultad (FNI)" : "Pre-U (Admisión)";

  if (dom["nav-user-greeting"]) {
    dom["nav-user-greeting"].textContent = `¡Hola, ${nombre}!`;
  }
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
    dom["sidebar-user-stage"].textContent = state.etapa ? etapaLabel : "Elige etapa";
  }
  if (dom["path-user-greeting"]) {
    dom["path-user-greeting"].textContent = `CAMINO DE ${nombre.toUpperCase()}`;
  }
  if (dom["profile-display-name"]) {
    dom["profile-display-name"].textContent = nombre;
  }
  if (dom["profile-avatar"]) {
    dom["profile-avatar"].textContent = inicial;
  }
  if (dom["profile-stage-badge"]) {
    dom["profile-stage-badge"].textContent =
      state.etapa === "facultad" ? "🚀 Ruta Facultad" : "🎓 Ruta Pre-U";
  }
}

export function updateTopbar() {
  const activeMat = getActiveMateria();
  const skills = getMateriaSkills(activeMat);
  const total = skills.length;
  const completed = skills.filter((s) => state.nodos_estado[s.id] === "unlocked").length;
  const remaining = Math.max(0, total - completed);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (dom["nav-subject-name"]) {
    dom["nav-subject-name"].textContent = activeMat
      ? activeMat.nombre
      : state.etapa === "facultad"
        ? "Facultad FNI"
        : "Pre-U FNI";
  }

  if (dom["nav-progress-text"]) {
    if (total > 0 && remaining === 0) {
      dom["nav-progress-text"].innerHTML = "<strong>¡Materia completada!</strong>";
    } else if (remaining === 1) {
      dom["nav-progress-text"].innerHTML = "Falta <strong>1</strong> tema";
    } else {
      dom["nav-progress-text"].innerHTML = `Faltan <strong>${remaining}</strong> temas`;
    }
  }

  if (dom["nav-progress-percent"]) {
    dom["nav-progress-percent"].textContent = `${percent}%`;
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
