/**
 * Estado global, persistencia localStorage, caché DOM y helpers compartidos.
 */

export const STORAGE_KEY = "skillpath_fni_progress_v1";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OPTION_LETTERS = ["A", "B", "C", "D"];

export function createDefaultState() {
  return {
    nombre: "",
    etapa: null,
    materia_activa: null,
    xp: 0,
    racha: 0,
    nodos_estado: {},
    historial_errores: [],
    notas_parciales: [],
    nota_parcial: null,
    diagnostico_completado: false,
    diagnostico_resultados: null,
    alerta_rescate: false,
    xp_otorgado_nodos: {},
    nodo_retorno: null,
  };
}

export function loadState() {
  const defaults = createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;

    return {
      ...defaults,
      ...parsed,
      nombre: typeof parsed.nombre === "string" ? parsed.nombre.trim() : "",
      xp: Number.isFinite(Number(parsed.xp)) ? Number(parsed.xp) : 0,
      racha: Number.isFinite(Number(parsed.racha)) ? Number(parsed.racha) : 0,
      nodos_estado:
        parsed.nodos_estado && typeof parsed.nodos_estado === "object"
          ? parsed.nodos_estado
          : {},
      historial_errores: Array.isArray(parsed.historial_errores)
        ? parsed.historial_errores
        : [],
      notas_parciales: Array.isArray(parsed.notas_parciales)
        ? parsed.notas_parciales
        : [],
      xp_otorgado_nodos:
        parsed.xp_otorgado_nodos && typeof parsed.xp_otorgado_nodos === "object"
          ? parsed.xp_otorgado_nodos
          : {},
      diagnostico_completado: Boolean(
        parsed.diagnostico_completado ?? parsed.diagnostico_hecho
      ),
      alerta_rescate: Boolean(parsed.alerta_rescate),
      nodo_retorno:
        typeof parsed.nodo_retorno === "string" && parsed.nodo_retorno.trim()
          ? parsed.nodo_retorno.trim()
          : null,
    };
  } catch (_error) {
    return defaults;
  }
}

export const state = loadState();
export const dom = {};
export const appContext = {
  skillsDB: null,
  activeSection: "camino",
  diagRadarChartInstance: null,
  skillsRadarChartInstance: null,
  skillsLoadFailed: false,
};

export function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    // Ignora fallos de almacenamiento
  }
}

export function resetState(preservedName = "") {
  Object.assign(state, createDefaultState(), { nombre: preservedName });
}

export function getHistorialResumenes() {
  return (state.historial_errores || [])
    .map((item) => (typeof item === "string" ? item : item.resumen || ""))
    .filter(Boolean);
}

/* ========================================================================
   Helpers Multi-Materia
   ======================================================================== */

export function getRouteData(stageKey = state.etapa) {
  if (!appContext.skillsDB || !stageKey) return null;
  return appContext.skillsDB[stageKey] || null;
}

export function getStageMaterias(stageKey = state.etapa) {
  const route = getRouteData(stageKey);
  return route && Array.isArray(route.materias) ? route.materias : [];
}

export function getDiagnosticAreasForStage(stageKey = state.etapa) {
  const route = getRouteData(stageKey);
  if (route && Array.isArray(route.diagnostico) && route.diagnostico.length > 0) {
    const areas = [];
    route.diagnostico.forEach((q) => {
      if (q.area && !areas.includes(q.area)) areas.push(q.area);
    });
    if (areas.length > 0) return areas;
  }
  return stageKey === "facultad"
    ? ["Álgebra y Trig.", "Cálculo I", "Física I"]
    : ["Álgebra", "Trigonometría", "Cálculo/Lógica"];
}

export function getActiveMateria() {
  const materias = getStageMaterias(state.etapa);
  if (materias.length === 0) return null;

  const found = materias.find((m) => m.id === state.materia_activa);
  if (found) return found;

  state.materia_activa = materias[0].id;
  saveState();
  return materias[0];
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
    "sidebar-user-stage",
    "top-navbar",
    "brand-home-link",
    "nav-user-greeting",
    "nav-subject-name",
    "nav-progress-text",
    "nav-progress-percent",
    "nav-progress-bar",
    "nav-streak-count",
    "nav-xp-count",
    "btn-open-grade-modal",
    "btn-reset-diagnostic",
    "view-stage-selector",
    "welcome-resume-banner",
    "resume-banner-summary",
    "btn-resume-saved",
    "welcome-name-input",
    "welcome-name-error",
    "card-stage-pre-u",
    "card-stage-facultad",
    "view-diagnostic",
    "diagnostic-quiz-panel",
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
    "btn-diag-next",
    "diagnostic-results-panel",
    "diag-overall-score",
    "diagnostic-radar-chart",
    "diag-area-summary",
    "diag-recommendation-text",
    "btn-go-to-path",
    "view-camino",
    "rescue-alert-banner",
    "rescue-grade-value",
    "btn-start-rescue",
    "path-user-greeting",
    "path-route-title",
    "path-route-desc",
    "btn-go-subjects",
    "duolingo-path-container",
    "ranking-materia-code",
    "critical-ranking-list",
    "view-materias",
    "materias-stage-pill",
    "subjects-catalog-container",
    "view-skills",
    "btn-skills-open-grade-modal",
    "skills-grade-card",
    "skills-grade-status",
    "skills-grade-badge",
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
    "partialGradeModal",
    "partial-grade-form",
    "partial-grade-input",
    "partial-grade-error",
    "btn-save-partial-grade",
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
  const nombre = state.nombre || "Estudiante";
  const inicial = nombre.charAt(0).toUpperCase() || "E";
  const etapaLabel = state.etapa === "facultad" ? "Facultad (FNI)" : "Pre-U (Admisión)";

  if (dom["nav-user-greeting"]) {
    dom["nav-user-greeting"].textContent = `¡Hola, ${nombre}!`;
  }
  if (dom["sidebar-user-name"]) {
    dom["sidebar-user-name"].textContent = nombre;
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

export function updateWelcomeResumeBanner() {
  const banner = dom["welcome-resume-banner"];
  if (!banner) return;

  const hasSaved = Boolean(
    state.etapa && state.diagnostico_completado && appContext.skillsDB?.[state.etapa]
  );
  banner.classList.toggle("d-none", !hasSaved);

  if (hasSaved && dom["resume-banner-summary"]) {
    const stageSkills = getAllStageSkills(state.etapa);
    const unlockedCount = stageSkills.filter(
      (s) => state.nodos_estado[s.id] === "unlocked"
    ).length;
    const saludo = state.nombre ? `${state.nombre} · ` : "";
    const etapaNombre = state.etapa === "facultad" ? "Facultad" : "Pre-U";
    dom["resume-banner-summary"].textContent =
      `${saludo}${etapaNombre} · ${unlockedCount}/${stageSkills.length} temas dominados · ${state.xp} XP`;
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
  updateWelcomeResumeBanner();
  showView("stage-selector");
  if (dom["welcome-resume-banner"]) {
    dom["welcome-resume-banner"].classList.remove("d-none");
    if (dom["resume-banner-summary"]) {
      dom["resume-banner-summary"].textContent =
        `No se pudo conectar con /api/skills: ${message}. Recarga la página cuando Flask esté activo.`;
    }
    if (dom["btn-resume-saved"]) {
      dom["btn-resume-saved"].textContent = "Reintentar";
    }
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
