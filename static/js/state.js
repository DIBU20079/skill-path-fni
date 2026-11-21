/**
 * Estado global, persistencia híbrida (localStorage + Supabase), caché DOM y helpers compartidos.
 */

import { apiGuardarProgreso } from "./api.js";

export const STORAGE_KEY = "skillpath_fni_progress_v1";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OPTION_LETTERS = ["A", "B", "C", "D"];

let cloudSyncTimerId = null;

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
  };
}

function normalizeStateObject(parsed) {
  const defaults = createDefaultState();
  if (!parsed || typeof parsed !== "object") return defaults;

  const cleanState = {
    ...defaults,
    ...parsed,
    nombre: typeof parsed.nombre === "string" ? parsed.nombre.trim() : "",
    materias_iniciadas:
      parsed.materias_iniciadas && typeof parsed.materias_iniciadas === "object"
        ? { ...parsed.materias_iniciadas }
        : {},
    xp: Number.isFinite(Number(parsed.xp)) ? Number(parsed.xp) : 0,
    racha: Number.isFinite(Number(parsed.racha)) ? Number(parsed.racha) : 0,
    nodos_estado:
      parsed.nodos_estado && typeof parsed.nodos_estado === "object"
        ? { ...parsed.nodos_estado }
        : {},
    historial_errores: Array.isArray(parsed.historial_errores)
      ? parsed.historial_errores
      : [],
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
  return (state.historial_errores || [])
    .map((item) => (typeof item === "string" ? item : item.resumen || ""))
    .filter(Boolean);
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
    "btn-path-placement",
    "btn-go-subjects",
    "duolingo-path-container",
    "ranking-materia-code",
    "critical-ranking-list",
    "view-materias",
    "materias-stage-pill",
    "subjects-catalog-container",
    "view-skills",
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
    "btn-generate-ai-exercise",
    "btn-gen-label",
    "btn-gen-spinner",
    "modal-gen-feedback",
    "modal-reinforcement-banner",
    "modal-reinforcement-text",
    "modal-node-xp",
    "stepper-step-1",
    "stepper-step-2",
    "stepper-step-3",
    "modal-step-progress-bar",
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
    "step3-title",
    "step3-instructions",
    "step3-enunciado-latex",
    "step3-attempts-history",
    "step3-attempts-count",
    "step3-attempts-list",
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
    "step3-api-error",
    "ai-audit-result-card",
    "ai-result-header",
    "ai-result-status-badge",
    "ai-result-type-badge",
    "ai-result-prereq-badge",
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
