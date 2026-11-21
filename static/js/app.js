(() => {
  "use strict";

  const STORAGE_KEY = "skillpath_fni_progress_v1";
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const OPTION_LETTERS = ["A", "B", "C", "D"];

  function createDefaultState() {
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

  let state = loadState();
  let skillsDB = null;
  let diagRadarChartInstance = null;
  let skillsRadarChartInstance = null;
  let activeSection = "camino";

  let diagSession = {
    questions: [],
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: 0,
    totalSeconds: 45,
  };

  let modalSession = {
    skill: null,
    activeExercise: null,
    isGeneratedAI: false,
    currentStep: 1,
    maxUnlockedStep: 1,
    step1Selected: null,
    step1Passed: false,
    step2Passed: false,
    step3File: null,
    previewObjectUrl: null,
    isAuditing: false,
    isGenerating: false,
    attempts: [],
    reinforcementMode: false,
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    updateGreetingUI();
    updateTopbar();

    try {
      await loadSkillsDB();
    } catch (error) {
      console.error("Error cargando /api/skills:", error);
      renderSkillsLoadError(error.message);
      return;
    }

    if (state.nombre && dom["welcome-name-input"]) {
      dom["welcome-name-input"].value = state.nombre;
    }

    if (state.etapa && state.diagnostico_completado && skillsDB[state.etapa]) {
      enterAppSection("camino");
    } else {
      updateWelcomeResumeBanner();
      showView("stage-selector");
    }
  }

  function cacheDom() {
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

  function bindEvents() {
    // Bienvenida: Perfil rápido + Selección de etapa
    dom["welcome-name-input"]?.addEventListener("input", () => {
      dom["welcome-name-error"]?.classList.add("d-none");
    });

    [dom["card-stage-pre-u"], dom["card-stage-facultad"]].forEach((card) => {
      if (!card) return;
      const selectStage = () => {
        const stage = card.dataset.stage;
        const nameValue = (dom["welcome-name-input"]?.value || "").trim();
        if (!nameValue) {
          dom["welcome-name-error"]?.classList.remove("d-none");
          dom["welcome-name-input"]?.focus();
          return;
        }
        dom["welcome-name-error"]?.classList.add("d-none");
        state.nombre = nameValue;
        saveState();
        updateGreetingUI();
        if (stage) startDiagnosticForStage(stage);
      };

      card.addEventListener("click", selectStage);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectStage();
        }
      });
    });

    const goHome = (event) => {
      event.preventDefault();
      stopDiagnosticTimer();
      updateWelcomeResumeBanner();
      showView("stage-selector");
    };
    dom["brand-home-link"]?.addEventListener("click", goHome);
    dom["sidebar-home-link"]?.addEventListener("click", goHome);

    dom["btn-resume-saved"]?.addEventListener("click", () => {
      if (state.etapa && state.diagnostico_completado && skillsDB?.[state.etapa]) {
        enterAppSection("camino");
      }
    });

    // Barra de navegación de 4 secciones
    document.querySelectorAll(".nav-section-btn[data-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.section;
        if (section) enterAppSection(section);
      });
    });

    dom["btn-go-subjects"]?.addEventListener("click", () => enterAppSection("materias"));

    // Diagnóstico y acciones globales
    dom["btn-reset-diagnostic"]?.addEventListener("click", handleResetDiagnostic);
    dom["btn-diag-next"]?.addEventListener("click", handleDiagnosticNext);
    dom["btn-go-to-path"]?.addEventListener("click", () => enterAppSection("camino"));

    // Rescate y Baúl
    dom["btn-start-rescue"]?.addEventListener("click", handleStartRescueClick);
    dom["btn-clear-vault"]?.addEventListener("click", () => {
      state.historial_errores = [];
      saveState();
      renderErrorVault();
    });

    // Perfil
    dom["profile-name-form"]?.addEventListener("submit", handleProfileNameSave);
    dom["btn-profile-stage-preu"]?.addEventListener("click", () => switchStageFromProfile("pre_u"));
    dom["btn-profile-stage-facultad"]?.addEventListener("click", () => switchStageFromProfile("facultad"));
    dom["btn-profile-repeat-diag"]?.addEventListener("click", () => {
      startDiagnosticForStage(state.etapa || "pre_u");
    });
    dom["btn-load-demo-profile"]?.addEventListener("click", loadDemoProfile);
    dom["btn-profile-reset-all"]?.addEventListener("click", handleResetDiagnostic);

    // Modal de 3 pasos + Generación IA
    dom["btn-generate-ai-exercise"]?.addEventListener("click", handleGenerateDynamicExercise);
    dom["stepper-step-1"]?.addEventListener("click", () => goToModalStep(1));
    dom["stepper-step-2"]?.addEventListener("click", () => {
      if (modalSession.maxUnlockedStep >= 2) goToModalStep(2);
    });
    dom["stepper-step-3"]?.addEventListener("click", () => {
      if (modalSession.maxUnlockedStep >= 3) goToModalStep(3);
    });

    dom["btn-step1-check"]?.addEventListener("click", checkStep1);
    dom["btn-step1-next"]?.addEventListener("click", () => goToModalStep(2));

    dom["btn-step2-hint"]?.addEventListener("click", () => {
      dom["step2-hint-box"]?.classList.toggle("d-none");
      renderMath(dom["step2-hint-box"]);
    });
    dom["btn-step2-check"]?.addEventListener("click", checkStep2);
    dom["step2-answer-input"]?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!dom["btn-step2-next"]?.classList.contains("d-none")) {
          goToModalStep(3);
        } else {
          checkStep2();
        }
      }
    });
    dom["btn-step2-next"]?.addEventListener("click", () => goToModalStep(3));

    setupPhotoDropzoneEvents();

    dom["btn-audit-ai"]?.addEventListener("click", handleAuditWithAI);
    dom["btn-upload-correction"]?.addEventListener("click", resetStep3ForCorrection);
    dom["btn-reinforce-prereq"]?.addEventListener("click", handleReinforcePrerequisiteClick);
    dom["btn-return-to-node"]?.addEventListener("click", handleReturnToOriginalNodeClick);
    dom["btn-complete-node"]?.addEventListener("click", () => {
      hideBootstrapModal(dom["nodeLessonModal"]);
    });

    dom["nodeLessonModal"]?.addEventListener("hidden.bs.modal", () => {
      revokePreviewUrl();
    });

    // Modal Nota Parcial
    dom["partialGradeModal"]?.addEventListener("show.bs.modal", () => {
      dom["partial-grade-error"]?.classList.add("d-none");
      if (dom["partial-grade-input"]) {
        dom["partial-grade-input"].value =
          state.nota_parcial !== null && state.nota_parcial !== undefined
            ? String(state.nota_parcial)
            : "";
      }
    });
    dom["partial-grade-form"]?.addEventListener("submit", handlePartialGradeSubmit);
  }

  /* ========================================================================
     Persistencia localStorage
     ======================================================================== */

  function loadState() {
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

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // Ignora fallos de almacenamiento
    }
  }

  /* ========================================================================
     Helpers Multi-Materia y Carga /api/skills
     ======================================================================== */

  async function loadSkillsDB() {
    const response = await fetch("/api/skills", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const msg = data?.detalle || data?.error || `HTTP ${response.status}`;
      throw new Error(`No se pudo cargar /api/skills (${msg}).`);
    }
    skillsDB = data;
    return skillsDB;
  }

  function getRouteData(stageKey = state.etapa) {
    if (!skillsDB || !stageKey) return null;
    return skillsDB[stageKey] || null;
  }

  function getStageMaterias(stageKey = state.etapa) {
    const route = getRouteData(stageKey);
    return route && Array.isArray(route.materias) ? route.materias : [];
  }

  function getDiagnosticAreasForStage(stageKey = state.etapa) {
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

  function getActiveMateria() {
    const materias = getStageMaterias(state.etapa);
    if (materias.length === 0) return null;

    const found = materias.find((m) => m.id === state.materia_activa);
    if (found) return found;

    state.materia_activa = materias[0].id;
    saveState();
    return materias[0];
  }

  function getMateriaSkills(materia) {
    if (!materia || !Array.isArray(materia.skills)) return [];
    return [...materia.skills].sort(
      (a, b) => Number(a.ranking_criticidad || 0) - Number(b.ranking_criticidad || 0)
    );
  }

  function getActiveMateriaSkills() {
    return getMateriaSkills(getActiveMateria());
  }

  function getAllStageSkills(stageKey = state.etapa) {
    return getStageMaterias(stageKey).flatMap((m) => getMateriaSkills(m));
  }

  function findSkillGlobal(skillId) {
    for (const stageKey of ["pre_u", "facultad"]) {
      for (const mat of getStageMaterias(stageKey)) {
        const found = getMateriaSkills(mat).find((s) => s.id === skillId);
        if (found) return { skill: found, materia: mat, stageKey };
      }
    }
    return null;
  }

  function ensureConsistentNodeStatesForStage(stageKey = state.etapa) {
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

  function renderSkillsLoadError(message) {
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
        dom["btn-resume-saved"].onclick = () => window.location.reload();
      }
    }
  }

  /* ========================================================================
     Vistas, Navegación Duolingo, Saludos y KaTeX
     ======================================================================== */

  function showView(viewName) {
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

  function enterAppSection(sectionName) {
    const validSections = ["camino", "materias", "skills", "perfil"];
    const target = validSections.includes(sectionName) ? sectionName : "camino";
    activeSection = target;

    if (!state.etapa || !skillsDB?.[state.etapa]) {
      showView("stage-selector");
      return;
    }

    ensureConsistentNodeStatesForStage(state.etapa);
    getActiveMateria();

    document.querySelectorAll(".nav-section-btn[data-section]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === target);
    });

    showView(target);
    updateGreetingUI();
    updateTopbar();

    if (target === "camino") {
      renderCaminoSection();
    } else if (target === "materias") {
      renderMateriasSection();
    } else if (target === "skills") {
      renderSkillsSection();
    } else if (target === "perfil") {
      renderPerfilSection();
    }
  }

  function updateGreetingUI() {
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

  function updateWelcomeResumeBanner() {
    const banner = dom["welcome-resume-banner"];
    if (!banner) return;

    const hasSaved = Boolean(state.etapa && state.diagnostico_completado && skillsDB?.[state.etapa]);
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

  function updateTopbar() {
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

  function renderMath(container) {
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ========================================================================
     Examen Diagnóstico y Calibración Multi-Materia
     ======================================================================== */

  async function startDiagnosticForStage(stageKey) {
    if (!skillsDB) {
      try {
        await loadSkillsDB();
      } catch (error) {
        console.error(error);
        renderSkillsLoadError(error.message);
        return;
      }
    }

    const route = skillsDB[stageKey];
    if (!route || !Array.isArray(route.diagnostico) || route.diagnostico.length === 0) {
      console.error("Ruta inválida o sin preguntas de diagnóstico:", stageKey);
      return;
    }

    stopDiagnosticTimer();
    const materias = getStageMaterias(stageKey);
    state.etapa = stageKey;
    state.materia_activa = materias[0]?.id || null;
    state.diagnostico_completado = false;
    state.diagnostico_resultados = null;
    state.alerta_rescate = false;
    saveState();

    diagSession = {
      questions: route.diagnostico,
      currentIndex: 0,
      selectedOption: null,
      confirmed: false,
      answers: [],
      timerId: null,
      secondsLeft: 0,
      totalSeconds: 45,
    };

    dom["diagnostic-quiz-panel"]?.classList.remove("d-none");
    dom["diagnostic-results-panel"]?.classList.add("d-none");

    updateGreetingUI();
    updateTopbar();
    showView("diagnostic");
    renderDiagnosticQuestion();
  }

  function renderDiagnosticQuestion() {
    const questions = diagSession.questions;
    const idx = diagSession.currentIndex;
    const q = questions[idx];
    if (!q) return;

    diagSession.selectedOption = null;
    diagSession.confirmed = false;

    if (dom["diag-current-num"]) dom["diag-current-num"].textContent = String(idx + 1);
    if (dom["diag-total-num"]) dom["diag-total-num"].textContent = String(questions.length);
    if (dom["diag-area-badge"]) dom["diag-area-badge"].textContent = q.area || "General";

    renderDiagnosticDots();

    if (dom["diag-question-latex"]) {
      dom["diag-question-latex"].textContent = q.enunciado_latex || "";
      renderMath(dom["diag-question-latex"]);
    }

    if (dom["diag-feedback-box"]) {
      dom["diag-feedback-box"].className = "feedback-banner d-none mb-4";
      dom["diag-feedback-box"].textContent = "";
    }

    if (dom["btn-diag-next"]) {
      dom["btn-diag-next"].disabled = true;
      dom["btn-diag-next"].innerHTML =
        'Confirmar Respuesta <i class="bi bi-check2-circle ms-1"></i>';
    }

    const optionsContainer = dom["diag-options-container"];
    if (optionsContainer) {
      optionsContainer.innerHTML = "";
      (q.opciones || []).forEach((optionText, optIdx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-card";
        btn.dataset.option = optionText;

        const keySpan = document.createElement("span");
        keySpan.className = "option-key";
        keySpan.textContent = OPTION_LETTERS[optIdx] || String(optIdx + 1);

        const textSpan = document.createElement("span");
        textSpan.className = "option-label";
        textSpan.textContent = optionText;

        btn.appendChild(keySpan);
        btn.appendChild(textSpan);

        btn.addEventListener("click", () => {
          if (diagSession.confirmed) return;
          diagSession.selectedOption = optionText;
          Array.from(optionsContainer.children).forEach((el) => {
            el.classList.toggle("selected", el === btn);
          });
          if (dom["btn-diag-next"]) dom["btn-diag-next"].disabled = false;
        });

        optionsContainer.appendChild(btn);
      });

      renderMath(optionsContainer);
    }

    startQuestionTimer(Number(q.tiempo_segundos) || 45);
  }

  function renderDiagnosticDots() {
    const container = dom["diag-step-dots"];
    if (!container) return;
    container.innerHTML = "";

    diagSession.questions.forEach((_q, i) => {
      const dot = document.createElement("span");
      dot.className = "diag-dot";
      const prevAnswer = diagSession.answers[i];
      if (prevAnswer) {
        dot.classList.add(prevAnswer.isCorrect ? "is-correct" : "is-wrong");
      } else if (i === diagSession.currentIndex) {
        dot.classList.add("is-current");
      }
      container.appendChild(dot);
    });
  }

  function startQuestionTimer(seconds) {
    stopDiagnosticTimer();
    diagSession.totalSeconds = seconds;
    diagSession.secondsLeft = seconds;
    updateTimerUI();

    diagSession.timerId = window.setInterval(() => {
      diagSession.secondsLeft = Math.max(0, diagSession.secondsLeft - 1);
      updateTimerUI();
      if (diagSession.secondsLeft <= 0) {
        stopDiagnosticTimer();
        if (!diagSession.confirmed) {
          evaluateCurrentDiagnosticQuestion(true);
        }
      }
    }, 1000);
  }

  function stopDiagnosticTimer() {
    if (diagSession.timerId !== null) {
      window.clearInterval(diagSession.timerId);
      diagSession.timerId = null;
    }
  }

  function updateTimerUI() {
    const left = diagSession.secondsLeft;
    const total = Math.max(1, diagSession.totalSeconds);
    const pct = Math.max(0, Math.min(100, Math.round((left / total) * 100)));

    if (dom["diag-timer-text"]) dom["diag-timer-text"].textContent = `${left}s`;
    if (dom["diag-timer-bar"]) {
      dom["diag-timer-bar"].style.width = `${pct}%`;
      dom["diag-timer-bar"].classList.toggle("timer-warning", pct <= 35 && pct > 15);
      dom["diag-timer-bar"].classList.toggle("timer-danger", pct <= 15);
    }
    if (dom["diag-timer-pill"]) {
      dom["diag-timer-pill"].classList.toggle("timer-warning", pct <= 35 && pct > 15);
      dom["diag-timer-pill"].classList.toggle("timer-danger", pct <= 15);
    }
  }

  function handleDiagnosticNext() {
    if (!diagSession.confirmed) {
      if (diagSession.selectedOption === null) return;
      evaluateCurrentDiagnosticQuestion(false);
      return;
    }

    if (diagSession.currentIndex + 1 < diagSession.questions.length) {
      diagSession.currentIndex += 1;
      renderDiagnosticQuestion();
    } else {
      finishDiagnostic();
    }
  }

  function evaluateCurrentDiagnosticQuestion(timedOut) {
    stopDiagnosticTimer();
    diagSession.confirmed = true;

    const q = diagSession.questions[diagSession.currentIndex];
    const selected = timedOut ? null : diagSession.selectedOption;
    const isCorrect = Boolean(selected && selected === q.respuesta_correcta);

    diagSession.answers[diagSession.currentIndex] = {
      id: q.id,
      area: q.area,
      isCorrect,
      timedOut,
    };

    if (isCorrect) {
      state.xp += 15;
      updateTopbar();
      saveState();
    }

    const optionsContainer = dom["diag-options-container"];
    if (optionsContainer) {
      Array.from(optionsContainer.children).forEach((btn) => {
        btn.disabled = true;
        const optValue = btn.dataset.option;
        if (optValue === q.respuesta_correcta) {
          btn.classList.add("is-correct");
        } else if (optValue === selected && !isCorrect) {
          btn.classList.add("is-wrong");
        }
      });
    }

    const feedbackBox = dom["diag-feedback-box"];
    if (feedbackBox) {
      feedbackBox.classList.remove("d-none", "is-success", "is-error");
      feedbackBox.classList.add(isCorrect ? "is-success" : "is-error");
      const prefix = timedOut
        ? "⏰ Tiempo agotado. "
        : isCorrect
          ? "✅ ¡Correcto! (+15 XP) "
          : "❌ Respuesta incorrecta. ";
      feedbackBox.innerHTML = `<strong>${escapeHtml(prefix)}</strong>${escapeHtml(q.explicacion_breve || "")}`;
      renderMath(feedbackBox);
    }

    renderDiagnosticDots();

    if (dom["btn-diag-next"]) {
      const isLast = diagSession.currentIndex + 1 >= diagSession.questions.length;
      dom["btn-diag-next"].disabled = false;
      dom["btn-diag-next"].innerHTML = isLast
        ? 'Ver Mapa Radar <i class="bi bi-radar ms-1"></i>'
        : 'Siguiente Pregunta <i class="bi bi-arrow-right ms-1"></i>';
    }
  }

  function finishDiagnostic() {
    stopDiagnosticTimer();

    const diagAreas = getDiagnosticAreasForStage(state.etapa);
    const areaTotals = {};
    diagAreas.forEach((area) => {
      areaTotals[area] = { correct: 0, total: 0 };
    });

    let correctCount = 0;
    diagSession.answers.forEach((ans) => {
      if (!ans) return;
      const area = ans.area || diagAreas[0];
      if (!areaTotals[area]) areaTotals[area] = { correct: 0, total: 0 };
      areaTotals[area].total += 1;
      if (ans.isCorrect) {
        areaTotals[area].correct += 1;
        correctCount += 1;
      }
    });

    const areaScores = {};
    Object.entries(areaTotals).forEach(([area, stats]) => {
      areaScores[area] =
        stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    });

    const totalCount = diagSession.questions.length || 1;
    const overallPercent = Math.round((correctCount / totalCount) * 100);

    // Calibra cada materia de la etapa: área >= 80% => unlocked; 1er pendiente => active; resto => locked
    getStageMaterias(state.etapa).forEach((mat) => {
      let firstPendingAssigned = false;
      getMateriaSkills(mat).forEach((skill) => {
        const score = Number(areaScores[skill.area] || 0);
        if (score >= 80) {
          state.nodos_estado[skill.id] = "unlocked";
        } else if (!firstPendingAssigned) {
          state.nodos_estado[skill.id] = "active";
          firstPendingAssigned = true;
        } else {
          state.nodos_estado[skill.id] = "locked";
        }
      });
    });

    state.diagnostico_completado = true;
    state.diagnostico_resultados = {
      overallPercent,
      areaScores,
      correctCount,
      totalCount,
    };
    state.racha = Math.max(1, state.racha);
    saveState();
    updateTopbar();

    renderDiagnosticResults(state.diagnostico_resultados, diagAreas);
  }

  function renderDiagnosticResults(results, diagAreas) {
    dom["diagnostic-quiz-panel"]?.classList.add("d-none");
    dom["diagnostic-results-panel"]?.classList.remove("d-none");

    if (dom["diag-overall-score"]) {
      dom["diag-overall-score"].textContent =
        `${results.overallPercent}% (${results.correctCount}/${results.totalCount})`;
    }

    const summaryEl = dom["diag-area-summary"];
    if (summaryEl) {
      summaryEl.innerHTML = "";
      diagAreas.forEach((area) => {
        const score = Number(results.areaScores[area] || 0);
        const passed = score >= 80;
        const row = document.createElement("div");
        row.className = "area-score-row d-flex justify-content-between align-items-center";
        row.innerHTML = `
          <div>
            <div class="fw-bold small">${escapeHtml(area)}</div>
            <div class="text-secondary" style="font-size: 0.76rem;">
              ${passed ? "Base sólida (nodos desbloqueados)" : "Requiere refuerzo guiado"}
            </div>
          </div>
          <span class="badge rounded-pill ${passed ? "text-bg-success" : "text-bg-warning"} fs-6">
            ${score}%
          </span>
        `;
        summaryEl.appendChild(row);
      });
    }

    if (dom["diag-recommendation-text"]) {
      const weakAreas = diagAreas.filter((area) => Number(results.areaScores[area] || 0) < 80);
      if (weakAreas.length === 0) {
        dom["diag-recommendation-text"].innerHTML =
          "<strong>¡Excelente base!</strong> Superaste el 80% en todas las áreas. Tus nodos quedaron desbloqueados en verde para entrenar retos tipo examen.";
      } else {
        dom["diag-recommendation-text"].innerHTML =
          `<strong>Foco inicial:</strong> Detectamos brechas clave en <strong>${escapeHtml(weakAreas.join(", "))}</strong>. Tu primer nodo pendiente ya está activo en amarillo.`;
      }
    }

    diagRadarChartInstance = renderRadarOnCanvas(
      dom["diagnostic-radar-chart"],
      diagRadarChartInstance,
      diagAreas,
      results.areaScores
    );
  }

  function renderRadarOnCanvas(canvas, previousInstance, labels, scoreMap) {
    if (!canvas || typeof window.Chart !== "function") return null;
    if (previousInstance) {
      previousInstance.destroy();
    }

    const values = labels.map((area) => Number(scoreMap[area] || 0));

    return new window.Chart(canvas.getContext("2d"), {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "Dominio (%)",
            data: values,
            fill: true,
            backgroundColor: "rgba(28, 176, 246, 0.22)",
            borderColor: "#1cb0f6",
            borderWidth: 3,
            pointBackgroundColor: "#58cc02",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              backdropColor: "transparent",
              color: "#64748b",
              font: { size: 11, weight: "600" },
            },
            grid: { color: "#cbd5e1" },
            angleLines: { color: "#cbd5e1" },
            pointLabels: {
              color: "#0f172a",
              font: { family: "Nunito, sans-serif", size: 12, weight: "800" },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.r}% de dominio`,
            },
          },
        },
      },
    });
  }

  function handleResetDiagnostic() {
    const confirmed = window.confirm(
      "¿Reiniciar todo tu progreso y diagnóstico? Se limpiará tu avance guardado en este navegador."
    );
    if (!confirmed) return;

    stopDiagnosticTimer();
    if (diagRadarChartInstance) {
      diagRadarChartInstance.destroy();
      diagRadarChartInstance = null;
    }
    if (skillsRadarChartInstance) {
      skillsRadarChartInstance.destroy();
      skillsRadarChartInstance = null;
    }

    state = createDefaultState();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_error) {
      // Ignora fallo de limpieza
    }

    if (dom["welcome-name-input"]) dom["welcome-name-input"].value = "";
    dom["rescue-alert-banner"]?.classList.add("d-none");
    updateGreetingUI();
    updateTopbar();
    updateWelcomeResumeBanner();
    showView("stage-selector");
  }

  /* ========================================================================
     Sección A: Camino (Árbol Vertical de la Materia Activa)
     ======================================================================== */

  function renderCaminoSection() {
    const materia = getActiveMateria();
    const skills = getMateriaSkills(materia);
    const container = dom["duolingo-path-container"];
    if (!materia || !container) return;

    if (dom["path-route-title"]) {
      dom["path-route-title"].textContent = `${materia.nombre} (${materia.codigo || ""})`;
    }
    if (dom["path-route-desc"]) {
      dom["path-route-desc"].textContent =
        materia.descripcion ||
        "Supera los 3 pasos de cada nodo para desbloquear el siguiente tema crítico.";
    }
    if (dom["ranking-materia-code"]) {
      dom["ranking-materia-code"].textContent = materia.codigo || materia.nombre;
    }

    const showRescue = Boolean(
      state.alerta_rescate &&
        state.nota_parcial !== null &&
        Number(state.nota_parcial) < 51
    );
    dom["rescue-alert-banner"]?.classList.toggle("d-none", !showRescue);
    if (dom["rescue-grade-value"] && state.nota_parcial !== null) {
      dom["rescue-grade-value"].textContent = String(state.nota_parcial);
    }

    container.innerHTML = "";

    skills.forEach((skill, idx) => {
      const status = state.nodos_estado[skill.id] || "locked";
      const wrapper = document.createElement("div");
      wrapper.className = "path-node-wrapper";

      if (idx > 0) {
        const prevSkill = skills[idx - 1];
        const prevDone = state.nodos_estado[prevSkill.id] === "unlocked";
        const connector = document.createElement("div");
        connector.className = `path-connector${prevDone ? " is-completed" : ""}`;
        wrapper.appendChild(connector);
      }

      const ring = document.createElement("div");
      ring.className = "path-node-ring";

      if (status === "active" || status === "blocker") {
        const floatTag = document.createElement("span");
        floatTag.className = `node-floating-tag${status === "blocker" ? " is-blocker" : ""}`;
        floatTag.textContent = status === "blocker" ? "¡REFUERZO!" : "¡EMPEZAR!";
        ring.appendChild(floatTag);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `path-node-btn node-${status}`;
      btn.disabled = status === "locked";
      btn.setAttribute(
        "aria-label",
        `Tema #${skill.ranking_criticidad}: ${skill.nombre} (${status})`
      );

      let iconClass = "bi-lock-fill";
      if (status === "unlocked") iconClass = "bi-check-lg";
      else if (status === "active") iconClass = "bi-star-fill";
      else if (status === "blocker") iconClass = "bi-exclamation-triangle-fill";

      btn.innerHTML = `
        <i class="bi ${iconClass}"></i>
        <span class="node-rank-badge">#${escapeHtml(skill.ranking_criticidad)}</span>
      `;

      if (status !== "locked") {
        btn.addEventListener("click", () => openNodeModal(skill.id));
      }

      ring.appendChild(btn);
      wrapper.appendChild(ring);

      const labelCard = document.createElement("div");
      labelCard.className = "node-label-card";

      const dotStates =
        status === "unlocked"
          ? ["done", "done", "done"]
          : status === "active" || status === "blocker"
            ? ["current", "", ""]
            : ["", "", ""];

      labelCard.innerHTML = `
        <div class="node-label-title">#${escapeHtml(skill.ranking_criticidad)} · ${escapeHtml(skill.nombre)}</div>
        <div class="node-label-meta">${escapeHtml(skill.area || materia.nombre)} · ${escapeHtml(skill.frecuencia_examen)} examen · +${escapeHtml(skill.xp)} XP</div>
        <div class="node-substeps-dots" aria-hidden="true">
          <span class="substep-dot ${dotStates[0]}"></span>
          <span class="substep-dot ${dotStates[1]}"></span>
          <span class="substep-dot ${dotStates[2]}"></span>
        </div>
      `;

      wrapper.appendChild(labelCard);
      container.appendChild(wrapper);
    });

    renderCriticalRanking(skills);
  }

  function renderCriticalRanking(skills = getActiveMateriaSkills()) {
    const listEl = dom["critical-ranking-list"];
    if (!listEl) return;

    if (skills.length === 0) {
      listEl.innerHTML =
        '<div class="small text-secondary">Elige una materia para ver sus temas críticos.</div>';
      return;
    }

    listEl.innerHTML = "";
    skills.forEach((skill) => {
      const status = state.nodos_estado[skill.id] || "locked";
      const freqNumber = parseInt(String(skill.frecuencia_examen || "80"), 10) || 80;
      const isBlocker = status === "blocker";

      const badgeMap = {
        unlocked: '<span class="badge rounded-pill text-bg-success">Dominado</span>',
        active: '<span class="badge rounded-pill text-bg-warning">Activo</span>',
        blocker: '<span class="badge rounded-pill text-bg-danger">Bloqueo</span>',
        locked: '<span class="badge rounded-pill text-bg-secondary">Pendiente</span>',
      };

      const item = document.createElement("div");
      item.className = `ranking-item${isBlocker ? " is-priority" : ""}`;
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="small fw-bold text-dark">
            #${escapeHtml(skill.ranking_criticidad)} ${escapeHtml(skill.nombre)}
          </div>
          ${badgeMap[status] || badgeMap.locked}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1" style="font-size: 0.76rem; color: #64748b;">
          <span>${escapeHtml(skill.area || skill.materia)}</span>
          <span class="fw-bold">${escapeHtml(skill.frecuencia_examen)} en examen</span>
        </div>
        <div class="ranking-freq-bar">
          <div class="ranking-freq-fill" style="width: ${Math.min(100, Math.max(10, freqNumber))}%;"></div>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  function handleStartRescueClick() {
    const stageSkills = getAllStageSkills(state.etapa);
    const activeSkills = getActiveMateriaSkills();
    const target =
      activeSkills.find((s) => state.nodos_estado[s.id] === "blocker") ||
      stageSkills.find((s) => state.nodos_estado[s.id] === "blocker") ||
      activeSkills.find((s) => state.nodos_estado[s.id] === "active") ||
      activeSkills.find((s) => state.nodos_estado[s.id] !== "unlocked") ||
      activeSkills[0];

    if (!target) return;

    const info = findSkillGlobal(target.id);
    if (info && info.materia.id !== state.materia_activa) {
      state.etapa = info.stageKey;
      state.materia_activa = info.materia.id;
    }
    if (state.nodos_estado[target.id] === "locked") {
      state.nodos_estado[target.id] = "blocker";
    }
    saveState();
    enterAppSection("camino");
    openNodeModal(target.id);
  }

  /* ========================================================================
     Sección B: Materias (Catálogo Estructurado por Etapa)
     ======================================================================== */

  function renderMateriasSection() {
    const container = dom["subjects-catalog-container"];
    if (!container || !skillsDB) return;

    if (dom["materias-stage-pill"]) {
      dom["materias-stage-pill"].textContent =
        state.etapa === "facultad" ? "Etapa actual: Facultad" : "Etapa actual: Pre-U";
    }

    container.innerHTML = "";

    const stageConfigs =
      state.etapa === "facultad"
        ? [
            { key: "facultad", label: "🚀 Etapa Facultad (Tus Materias Activas)" },
            { key: "pre_u", label: "🎓 Etapa Pre-U (Nivelación Disponible)" },
          ]
        : [
            { key: "pre_u", label: "🎓 Etapa Pre-U (Tus Materias Activas)" },
            { key: "facultad", label: "🚀 Etapa Facultad (Siguiente Nivel)" },
          ];

    stageConfigs.forEach(({ key, label }) => {
      const materias = getStageMaterias(key);
      if (materias.length === 0) return;

      const groupDiv = document.createElement("div");
      const heading = document.createElement("div");
      heading.className = "stage-group-heading";
      heading.textContent = label;
      groupDiv.appendChild(heading);

      const row = document.createElement("div");
      row.className = "row g-4";

      materias.forEach((mat) => {
        const skills = getMateriaSkills(mat);
        const total = skills.length;
        const done = skills.filter((s) => state.nodos_estado[s.id] === "unlocked").length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isCurrentActive = state.etapa === key && state.materia_activa === mat.id;

        const col = document.createElement("div");
        col.className = "col-12 col-md-6";

        const card = document.createElement("article");
        card.className = `duo-card subject-catalog-card p-4 h-100 d-flex flex-column${isCurrentActive ? " is-active-subject" : ""}`;

        const iconColorClass =
          mat.color === "green" ? "subject-icon-green" : "subject-icon-blue";

        const topicsHtml = skills
          .map((skill) => {
            const st = state.nodos_estado[skill.id] || "locked";
            const statusDot =
              st === "unlocked"
                ? "✅"
                : st === "blocker"
                  ? "🚨"
                  : st === "active"
                    ? "⚡"
                    : "🔒";
            return `
              <div class="subject-topic-row">
                <span class="fw-semibold text-dark text-truncate">
                  ${statusDot} #${escapeHtml(skill.ranking_criticidad)} ${escapeHtml(skill.nombre)}
                </span>
                <span class="badge rounded-pill text-bg-light border text-secondary">
                  ${escapeHtml(skill.frecuencia_examen)}
                </span>
              </div>
            `;
          })
          .join("");

        card.innerHTML = `
          <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
            <div class="d-flex align-items-center gap-3">
              <span class="subject-icon-box ${iconColorClass}">
                <i class="bi ${escapeHtml(mat.icono || "bi-book-fill")}"></i>
              </span>
              <div>
                <span class="badge rounded-pill text-bg-light border mb-1">${escapeHtml(mat.codigo || key.toUpperCase())}</span>
                <h3 class="h5 fw-black mb-0">${escapeHtml(mat.nombre)}</h3>
              </div>
            </div>
            ${
              isCurrentActive
                ? '<span class="badge rounded-pill text-bg-primary">Activa</span>'
                : ""
            }
          </div>

          <p class="small text-secondary mb-3">${escapeHtml(mat.descripcion || "")}</p>

          <div class="mb-3">
            <div class="d-flex justify-content-between small fw-bold mb-1">
              <span>Avance: ${done}/${total} temas</span>
              <span class="text-success">${pct}%</span>
            </div>
            <div class="duo-progress-track">
              <div class="duo-progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>

          <div class="subject-topics-list mb-4">${topicsHtml}</div>

          <div class="mt-auto pt-2">
            <button type="button" class="btn btn-duo ${isCurrentActive ? "btn-duo-green" : "btn-duo-blue"} w-100 btn-go-subject-path">
              <i class="bi bi-map-fill me-2"></i>Ir al Camino
            </button>
          </div>
        `;

        card.querySelector(".btn-go-subject-path")?.addEventListener("click", () => {
          state.etapa = key;
          state.materia_activa = mat.id;
          state.diagnostico_completado = true;
          ensureConsistentNodeStatesForStage(key);
          saveState();
          enterAppSection("camino");
        });

        col.appendChild(card);
        row.appendChild(col);
      });

      groupDiv.appendChild(row);
      container.appendChild(groupDiv);
    });
  }

  /* ========================================================================
     Sección C: Mis Skills (Radar, Bronce/Plata/Oro, Nota Parcial y Baúl)
     ======================================================================== */

  function getAreaMasteryScores() {
    const areas = getDiagnosticAreasForStage(state.etapa);
    const diagScores = state.diagnostico_resultados?.areaScores || {};
    const stageSkills = getAllStageSkills(state.etapa);
    const result = {};

    areas.forEach((area) => {
      const areaSkills = stageSkills.filter((s) => s.area === area);
      const unlockedCount = areaSkills.filter(
        (s) => state.nodos_estado[s.id] === "unlocked"
      ).length;
      const unlockedPct =
        areaSkills.length > 0 ? Math.round((unlockedCount / areaSkills.length) * 100) : 0;
      const diagPct = Number(diagScores[area] ?? 0);

      result[area] = unlockedCount > 0 ? Math.max(diagPct, unlockedPct) : diagPct;
    });

    return { areas, scores: result };
  }

  function renderSkillsSection() {
    const { areas, scores } = getAreaMasteryScores();

    skillsRadarChartInstance = renderRadarOnCanvas(
      dom["skills-radar-chart"],
      skillsRadarChartInstance,
      areas,
      scores
    );

    const masteryList = dom["skills-mastery-list"];
    if (masteryList) {
      masteryList.innerHTML = "";
      areas.forEach((area) => {
        const pct = Number(scores[area] || 0);
        let medalClass = "medal-bronze";
        let medalText = "🥉 Bronce";
        if (pct >= 80) {
          medalClass = "medal-gold";
          medalText = "🥇 Oro";
        } else if (pct >= 50) {
          medalClass = "medal-silver";
          medalText = "🥈 Plata";
        }

        const row = document.createElement("div");
        row.className = "mastery-row";
        row.innerHTML = `
          <div>
            <div class="fw-bold text-dark small">${escapeHtml(area)}</div>
            <div class="text-secondary" style="font-size: 0.76rem;">Dominio actual: ${pct}%</div>
          </div>
          <span class="medal-badge ${medalClass}">${medalText}</span>
        `;
        masteryList.appendChild(row);
      });
    }

    // Estado de Nota Parcial
    const hasGrade = state.nota_parcial !== null && state.nota_parcial !== undefined;
    const isRisk = Boolean(hasGrade && Number(state.nota_parcial) < 51);

    if (dom["skills-grade-card"]) {
      dom["skills-grade-card"].style.borderColor = isRisk
        ? "var(--duo-red)"
        : hasGrade
          ? "#a3e635"
          : "var(--border-soft)";
    }
    if (dom["skills-grade-badge"]) {
      dom["skills-grade-badge"].className = `badge rounded-pill fs-6 px-3 py-2 ${
        isRisk
          ? "text-bg-danger"
          : hasGrade
            ? "text-bg-success"
            : "text-bg-light border"
      }`;
      dom["skills-grade-badge"].textContent = hasGrade
        ? `${state.nota_parcial}/100`
        : "Sin nota";
    }
    if (dom["skills-grade-status"]) {
      if (!hasGrade) {
        dom["skills-grade-status"].textContent =
          "Aún no registraste ninguna nota parcial. Ingresa tu calificación (0 a 100) para activar alertas de rescate si es < 51.";
      } else if (isRisk) {
        dom["skills-grade-status"].innerHTML =
          `🚨 <strong>Alerta Roja Activa:</strong> Tu nota parcial (${state.nota_parcial}/100) está por debajo de 51. Ve al Camino para reforzar tu nodo bloqueador.`;
      } else {
        dom["skills-grade-status"].innerHTML =
          `✅ <strong>Buen ritmo:</strong> Último parcial registrado con ${state.nota_parcial}/100. Mantén tu racha completando nodos.`;
      }
    }

    renderErrorVault();
  }

  function renderErrorVault() {
    const listEl = dom["error-vault-list"];
    const countEl = dom["error-vault-count"];
    const emptyEl = dom["error-vault-empty"];
    const clearBtn = dom["btn-clear-vault"];

    const history = Array.isArray(state.historial_errores)
      ? state.historial_errores
      : [];

    if (countEl) countEl.textContent = String(history.length);
    emptyEl?.classList.toggle("d-none", history.length > 0);
    clearBtn?.classList.toggle("d-none", history.length === 0);

    if (!listEl) return;
    listEl.innerHTML = "";

    [...history].reverse().forEach((entry) => {
      const resumen = typeof entry === "string" ? entry : entry.resumen || "";
      const tema = typeof entry === "object" && entry ? entry.tema : "";
      const fecha = typeof entry === "object" && entry ? entry.fecha : "";

      const li = document.createElement("li");
      li.className = "vault-item";
      li.innerHTML = `
        <div class="fw-bold text-danger-emphasis">${escapeHtml(resumen)}</div>
        ${
          tema || fecha
            ? `<div class="text-secondary mt-1" style="font-size: 0.75rem;">${escapeHtml(tema)}${tema && fecha ? " · " : ""}${escapeHtml(fecha)}</div>`
            : ""
        }
      `;
      listEl.appendChild(li);
    });
  }

  /* ========================================================================
     Sección D: Perfil (Editar Nombre, Cambiar Etapa, Demo Profile)
     ======================================================================== */

  function renderPerfilSection() {
    updateGreetingUI();

    const stageSkills = getAllStageSkills(state.etapa);
    const doneTotal = stageSkills.filter(
      (s) => state.nodos_estado[s.id] === "unlocked"
    ).length;

    if (dom["profile-name-input"]) dom["profile-name-input"].value = state.nombre || "";
    if (dom["profile-xp"]) dom["profile-xp"].textContent = String(state.xp || 0);
    if (dom["profile-streak"]) dom["profile-streak"].textContent = String(state.racha || 0);
    if (dom["profile-completed"]) {
      dom["profile-completed"].textContent = `${doneTotal}/${stageSkills.length}`;
    }

    dom["profile-name-saved-msg"]?.classList.add("d-none");
    dom["profile-demo-feedback"]?.classList.add("d-none");

    const isFacultad = state.etapa === "facultad";
    if (dom["btn-profile-stage-preu"]) {
      dom["btn-profile-stage-preu"].className = `btn btn-duo ${
        !isFacultad ? "btn-duo-blue" : "btn-duo-outline-secondary"
      }`;
    }
    if (dom["btn-profile-stage-facultad"]) {
      dom["btn-profile-stage-facultad"].className = `btn btn-duo ${
        isFacultad ? "btn-duo-green" : "btn-duo-outline-secondary"
      }`;
    }
  }

  function handleProfileNameSave(event) {
    event.preventDefault();
    const newName = (dom["profile-name-input"]?.value || "").trim();
    if (!newName) return;

    state.nombre = newName;
    saveState();
    updateGreetingUI();
    dom["profile-name-saved-msg"]?.classList.remove("d-none");
  }

  function switchStageFromProfile(targetStage) {
    if (!skillsDB?.[targetStage]) return;
    const materias = getStageMaterias(targetStage);
    state.etapa = targetStage;
    if (!materias.some((m) => m.id === state.materia_activa)) {
      state.materia_activa = materias[0]?.id || null;
    }
    state.diagnostico_completado = true;
    ensureConsistentNodeStatesForStage(targetStage);
    saveState();

    updateGreetingUI();
    updateTopbar();
    renderPerfilSection();
  }

  function loadDemoProfile() {
    const targetStage = state.etapa || "facultad";
    const materias = getStageMaterias(targetStage);
    const primaryMat = materias[0];
    const primarySkills = getMateriaSkills(primaryMat);

    state.nombre = state.nombre || "Alex FNI";
    state.etapa = targetStage;
    state.materia_activa = primaryMat?.id || null;
    state.xp = 460;
    state.racha = 6;
    state.diagnostico_completado = true;
    state.nota_parcial = 68;
    state.alerta_rescate = false;
    state.nodo_retorno = null;
    state.notas_parciales = [{ nota: 68, fecha: "Hoy" }];

    const areas = getDiagnosticAreasForStage(targetStage);
    const areaScores = {};
    areas.forEach((area, index) => {
      areaScores[area] = index === 0 ? 85 : index === 1 ? 65 : 45;
    });

    state.diagnostico_resultados = {
      overallPercent: 65,
      areaScores,
      correctCount: 4,
      totalCount: 6,
    };

    // Limpia nodos de esta etapa y marca exactamente 2 nodos verdes + siguiente amarillo
    getAllStageSkills(targetStage).forEach((s) => {
      state.nodos_estado[s.id] = "locked";
      delete state.xp_otorgado_nodos[s.id];
    });

    materias.forEach((mat, matIdx) => {
      const mSkills = getMateriaSkills(mat);
      mSkills.forEach((s, idx) => {
        if (matIdx === 0 && idx < 2) {
          state.nodos_estado[s.id] = "unlocked";
          state.xp_otorgado_nodos[s.id] = true;
        } else if ((matIdx === 0 && idx === 2) || (matIdx > 0 && idx === 0)) {
          state.nodos_estado[s.id] = "active";
        } else {
          state.nodos_estado[s.id] = "locked";
        }
      });
    });

    const hoy = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });

    state.historial_errores =
      targetStage === "facultad"
        ? [
            {
              resumen: "Olvidó restringir argumento positivo en logaritmo",
              tema: primarySkills[0]?.nombre || "Inecuaciones y Dominios",
              fecha: hoy,
            },
            {
              resumen: "Error de signo al multiplicar por conjugado",
              tema: primarySkills[1]?.nombre || "Límites Algebraicos",
              fecha: hoy,
            },
          ]
        : [
            {
              resumen: "Error de signo al factorizar trinomio cuadrático",
              tema: primarySkills[0]?.nombre || "Factorización",
              fecha: hoy,
            },
            {
              resumen: "No excluyó raíces del denominador al simplificar",
              tema: primarySkills[1]?.nombre || "Fracciones Algebraicas",
              fecha: hoy,
            },
          ];

    saveState();
    updateGreetingUI();
    updateTopbar();
    renderPerfilSection();
    renderErrorVault();
    dom["profile-demo-feedback"]?.classList.remove("d-none");
  }

  /* ========================================================================
     Modal de 3 Pasos + Generación de Ejercicio Dinámico (POST /api/generar-ejercicio)
     ======================================================================== */

  function cloneExerciseFromSkill(skill) {
    return {
      paso1_concepto: { ...(skill.paso1_concepto || {}) },
      paso2_practica: { ...(skill.paso2_practica || {}) },
      paso3_reto_foto: { ...(skill.paso3_reto_foto || {}) },
    };
  }

  function openNodeModal(skillId, options = {}) {
    const found = findSkillGlobal(skillId);
    if (!found) return;
    const { skill } = found;

    revokePreviewUrl();
    const exercise = cloneExerciseFromSkill(skill);
    const isReinforcement = Boolean(state.nodo_retorno && state.nodo_retorno !== skill.id);

    modalSession = {
      skill,
      activeExercise: exercise,
      isGeneratedAI: false,
      currentStep: 1,
      maxUnlockedStep: 1,
      step1Selected: null,
      step1Passed: false,
      step2Passed: false,
      step3File: null,
      previewObjectUrl: null,
      isAuditing: false,
      isGenerating: false,
      attempts: [],
      reinforcementMode: isReinforcement,
    };

    if (dom["modal-node-meta"]) {
      dom["modal-node-meta"].textContent =
        `#${skill.ranking_criticidad} · ${skill.materia} · ${skill.frecuencia_examen} en examen`;
    }
    if (dom["modal-node-title"]) dom["modal-node-title"].textContent = skill.nombre;
    if (dom["modal-node-xp"]) dom["modal-node-xp"].textContent = `⚡ +${skill.xp} XP`;

    const reinBanner = dom["modal-reinforcement-banner"];
    if (reinBanner) {
      reinBanner.classList.toggle("d-none", !isReinforcement);
      if (isReinforcement && dom["modal-reinforcement-text"]) {
        const returnFound = findSkillGlobal(state.nodo_retorno);
        dom["modal-reinforcement-text"].textContent = returnFound
          ? `Reforzando base previa antes de regresar a: ${returnFound.skill.nombre}.`
          : "Reforzando módulo anterior antes de continuar tu ejercicio principal.";
      }
    }

    dom["modal-ai-gen-badge"]?.classList.add("d-none");
    dom["modal-gen-feedback"]?.classList.add("d-none");
    setGenerateLoading(false);

    renderActiveExerciseInModal();
    if (!dom["nodeLessonModal"]?.classList.contains("show")) {
      showBootstrapModal(dom["nodeLessonModal"]);
    }

    if (options.autoGenerateAI) {
      handleGenerateDynamicExercise();
    }
  }

  function renderActiveExerciseInModal() {
    const ex = modalSession.activeExercise;
    if (!ex) return;

    modalSession.currentStep = 1;
    modalSession.maxUnlockedStep = 1;
    modalSession.step1Selected = null;
    modalSession.step1Passed = false;
    modalSession.step2Passed = false;

    populateStep1(ex.paso1_concepto);
    populateStep2(ex.paso2_practica);
    populateStep3(ex.paso3_reto_foto);
    goToModalStep(1);
  }

  function setGenerateLoading(isLoading) {
    modalSession.isGenerating = isLoading;
    if (dom["btn-generate-ai-exercise"]) {
      dom["btn-generate-ai-exercise"].disabled = isLoading;
    }
    dom["btn-gen-label"]?.classList.toggle("d-none", isLoading);
    dom["btn-gen-spinner"]?.classList.toggle("d-none", !isLoading);
  }

  async function handleGenerateDynamicExercise() {
    if (modalSession.isGenerating || modalSession.isAuditing || !modalSession.skill) {
      return;
    }

    const skill = modalSession.skill;
    const feedbackEl = dom["modal-gen-feedback"];
    feedbackEl?.classList.add("d-none");
    setGenerateLoading(true);

    try {
      const response = await fetch("/api/generar-ejercicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materia: skill.materia,
          tema: skill.nombre,
          historial_errores: getHistorialResumenes(),
        }),
      });
      const data = await response.json().catch(() => null);

      if (
        !response.ok ||
        !data ||
        !data.paso1_concepto ||
        !data.paso2_practica ||
        !data.paso3_reto_foto
      ) {
        throw new Error(data?.detalle || data?.error || "Respuesta incompleta");
      }

      modalSession.activeExercise = data;
      modalSession.isGeneratedAI = true;
      modalSession.attempts = [];
      dom["modal-ai-gen-badge"]?.classList.remove("d-none");

      if (feedbackEl) {
        feedbackEl.className = "small text-success fw-semibold mb-2";
        feedbackEl.textContent =
          "✨ Nuevo ejercicio inédito generado por Gemini adaptado a tu historial.";
      }

      renderActiveExerciseInModal();
    } catch (_error) {
      // Respaldo estático garantizado si la API falla o está saturada
      if (feedbackEl) {
        feedbackEl.className = "small text-secondary mb-2";
        feedbackEl.textContent =
          "La IA está saturada en este instante; conservamos el ejercicio oficial de respaldo.";
      }
    } finally {
      setGenerateLoading(false);
    }
  }

  function populateStep1(paso1) {
    if (!paso1) return;
    if (dom["step1-title"]) dom["step1-title"].textContent = paso1.titulo || "Concepto clave";
    if (dom["step1-question-latex"]) {
      dom["step1-question-latex"].textContent =
        paso1.enunciado_latex || paso1.pregunta_latex || "";
      renderMath(dom["step1-question-latex"]);
    }

    if (dom["step1-feedback"]) {
      dom["step1-feedback"].className = "feedback-banner d-none mb-3";
      dom["step1-feedback"].textContent = "";
    }
    if (dom["btn-step1-check"]) {
      dom["btn-step1-check"].disabled = true;
      dom["btn-step1-check"].classList.remove("d-none");
    }
    dom["btn-step1-next"]?.classList.add("d-none");

    const container = dom["step1-options-container"];
    if (!container) return;
    container.innerHTML = "";

    (paso1.opciones || []).forEach((optText, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-card";
      btn.dataset.option = optText;

      const keySpan = document.createElement("span");
      keySpan.className = "option-key";
      keySpan.textContent = OPTION_LETTERS[idx] || String(idx + 1);

      const labelSpan = document.createElement("span");
      labelSpan.className = "option-label";
      labelSpan.textContent = optText;

      btn.appendChild(keySpan);
      btn.appendChild(labelSpan);

      btn.addEventListener("click", () => {
        if (modalSession.step1Passed) return;
        modalSession.step1Selected = optText;
        Array.from(container.children).forEach((el) => {
          el.classList.toggle("selected", el === btn);
        });
        if (dom["btn-step1-check"]) dom["btn-step1-check"].disabled = false;
      });

      container.appendChild(btn);
    });

    renderMath(container);
  }

  function checkStep1() {
    const paso1 = modalSession.activeExercise?.paso1_concepto;
    if (!paso1 || modalSession.step1Selected === null) return;

    const isCorrect = modalSession.step1Selected === paso1.respuesta_correcta;
    const container = dom["step1-options-container"];

    if (container) {
      Array.from(container.children).forEach((btn) => {
        const val = btn.dataset.option;
        btn.classList.remove("is-wrong", "is-correct");
        if (isCorrect) {
          btn.disabled = true;
          if (val === paso1.respuesta_correcta) btn.classList.add("is-correct");
        } else if (val === modalSession.step1Selected) {
          btn.classList.add("is-wrong");
        }
      });
    }

    const feedback = dom["step1-feedback"];
    if (feedback) {
      feedback.classList.remove("d-none", "is-success", "is-error");
      feedback.classList.add(isCorrect ? "is-success" : "is-error");
      feedback.innerHTML = isCorrect
        ? `<strong>✅ ¡Concepto dominado!</strong> ${escapeHtml(paso1.explicacion || "")}`
        : "<strong>❌ No exactamente.</strong> Revisa la propiedad fundamental e intenta con otra opción.";
      renderMath(feedback);
    }

    if (isCorrect) {
      modalSession.step1Passed = true;
      modalSession.maxUnlockedStep = Math.max(modalSession.maxUnlockedStep, 2);
      dom["btn-step1-check"]?.classList.add("d-none");
      dom["btn-step1-next"]?.classList.remove("d-none");
      updateModalStepperUI();
    }
  }

  function populateStep2(paso2) {
    if (!paso2) return;
    if (dom["step2-title"]) dom["step2-title"].textContent = paso2.titulo || "Práctica directa";
    if (dom["step2-enunciado-latex"]) {
      dom["step2-enunciado-latex"].textContent = paso2.enunciado_latex || "";
      renderMath(dom["step2-enunciado-latex"]);
    }
    if (dom["step2-answer-input"]) {
      dom["step2-answer-input"].value = "";
      dom["step2-answer-input"].disabled = false;
    }
    if (dom["step2-hint-text"]) {
      dom["step2-hint-text"].textContent = paso2.pista || "";
    }
    dom["step2-hint-box"]?.classList.add("d-none");
    if (dom["step2-feedback"]) {
      dom["step2-feedback"].className = "feedback-banner d-none mb-3";
      dom["step2-feedback"].textContent = "";
    }
    dom["btn-step2-check"]?.classList.remove("d-none");
    dom["btn-step2-next"]?.classList.add("d-none");
  }

  function normalizeShortAnswer(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/,/g, ".")
      .replace(/\s+/g, "");
  }

  function checkStep2() {
    const paso2 = modalSession.activeExercise?.paso2_practica;
    if (!paso2) return;

    const userInput = normalizeShortAnswer(dom["step2-answer-input"]?.value);
    const feedback = dom["step2-feedback"];

    if (!userInput) {
      if (feedback) {
        feedback.className = "feedback-banner is-error mb-3";
        feedback.textContent = "Escribe tu respuesta antes de verificar.";
      }
      return;
    }

    const acceptedList = [
      paso2.respuesta_correcta,
      ...(Array.isArray(paso2.respuestas_aceptadas) ? paso2.respuestas_aceptadas : []),
    ].map(normalizeShortAnswer);

    const isCorrect = acceptedList.includes(userInput);

    if (feedback) {
      feedback.classList.remove("d-none", "is-success", "is-error");
      feedback.classList.add(isCorrect ? "is-success" : "is-error");
      feedback.innerHTML = isCorrect
        ? "<strong>✅ ¡Exacto!</strong> Ya estás listo para el reto tipo examen en papel."
        : "<strong>❌ Revisa tu cálculo.</strong> Puedes pulsar <em>Pista</em> si necesitas orientación.";
    }

    if (isCorrect) {
      modalSession.step2Passed = true;
      modalSession.maxUnlockedStep = Math.max(modalSession.maxUnlockedStep, 3);
      if (dom["step2-answer-input"]) dom["step2-answer-input"].disabled = true;
      dom["btn-step2-check"]?.classList.add("d-none");
      dom["btn-step2-next"]?.classList.remove("d-none");
      updateModalStepperUI();
    }
  }

  function populateStep3(paso3) {
    if (!paso3) return;
    if (dom["step3-title"]) dom["step3-title"].textContent = paso3.titulo || "Reto de Foto";
    if (dom["step3-instructions"]) dom["step3-instructions"].textContent = paso3.instrucciones || "";
    if (dom["step3-enunciado-latex"]) {
      dom["step3-enunciado-latex"].textContent = paso3.enunciado_latex || "";
      renderMath(dom["step3-enunciado-latex"]);
    }

    clearSelectedPhoto();
    if (dom["step3-text-input"]) dom["step3-text-input"].value = "";
    hideStep3Error();
    dom["ai-audit-result-card"]?.classList.add("d-none");
    dom["ai-result-type-badge"]?.classList.add("d-none");
    dom["ai-base-recovered-banner"]?.classList.add("d-none");
    dom["ai-block-progreso"]?.classList.add("d-none");
    dom["btn-reinforce-prereq"]?.classList.add("d-none");
    dom["btn-return-to-node"]?.classList.add("d-none");
    dom["btn-complete-node"]?.classList.add("d-none");
    renderStep3AttemptsHistory();
    updateAuditButtonLabel();
    setAuditLoading(false);
  }

  function goToModalStep(stepNum) {
    modalSession.currentStep = stepNum;
    [1, 2, 3].forEach((n) => {
      dom[`lesson-step-${n}`]?.classList.toggle("d-none", n !== stepNum);
    });
    updateModalStepperUI();
  }

  function updateModalStepperUI() {
    const pctMap = { 1: "33%", 2: "66%", 3: "100%" };
    if (dom["modal-step-progress-bar"]) {
      dom["modal-step-progress-bar"].style.width = pctMap[modalSession.currentStep] || "33%";
    }

    [1, 2, 3].forEach((n) => {
      const btn = dom[`stepper-step-${n}`];
      if (!btn) return;
      btn.disabled = n > modalSession.maxUnlockedStep;
      btn.classList.toggle("active", n === modalSession.currentStep);
      const isDone =
        (n === 1 && modalSession.step1Passed) ||
        (n === 2 && modalSession.step2Passed) ||
        (n === 3 && state.nodos_estado[modalSession.skill?.id] === "unlocked");
      btn.classList.toggle("completed", isDone && n !== modalSession.currentStep);
    });
  }

  /* ========================================================================
     Paso 3: Dropzone de Foto + POST /api/evaluar (intacto)
     ======================================================================== */

  function setupPhotoDropzoneEvents() {
    const dropzone = dom["photo-dropzone"];
    const fileInput = dom["step3-photo-input"];
    const removeBtn = dom["btn-remove-photo"];
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener("click", (event) => {
      if (removeBtn && removeBtn.contains(event.target)) return;
      fileInput.click();
    });

    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleSelectedPhotoFile(file);
    });

    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
      const file = event.dataTransfer?.files?.[0];
      if (file) handleSelectedPhotoFile(file);
    });

    removeBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      clearSelectedPhoto();
    });
  }

  function handleSelectedPhotoFile(file) {
    hideStep3Error();
    if (!file.type.startsWith("image/")) {
      showStep3Error("Por favor selecciona un archivo de imagen válido (JPG, PNG o WEBP).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showStep3Error("La imagen supera el límite máximo permitido de 10 MB.");
      return;
    }

    revokePreviewUrl();
    modalSession.step3File = file;
    modalSession.previewObjectUrl = URL.createObjectURL(file);

    if (dom["step3-photo-preview"]) {
      dom["step3-photo-preview"].src = modalSession.previewObjectUrl;
    }
    if (dom["step3-photo-filename"]) {
      dom["step3-photo-filename"].textContent = file.name;
    }
    dom["photo-dropzone-empty"]?.classList.add("d-none");
    dom["photo-preview-wrapper"]?.classList.remove("d-none");
  }

  function clearSelectedPhoto() {
    revokePreviewUrl();
    modalSession.step3File = null;
    if (dom["step3-photo-input"]) dom["step3-photo-input"].value = "";
    if (dom["step3-photo-preview"]) dom["step3-photo-preview"].src = "";
    dom["photo-preview-wrapper"]?.classList.add("d-none");
    dom["photo-dropzone-empty"]?.classList.remove("d-none");
  }

  function revokePreviewUrl() {
    if (modalSession.previewObjectUrl) {
      URL.revokeObjectURL(modalSession.previewObjectUrl);
      modalSession.previewObjectUrl = null;
    }
  }

  function setAuditLoading(isLoading) {
    modalSession.isAuditing = isLoading;
    if (dom["btn-audit-ai"]) dom["btn-audit-ai"].disabled = isLoading;
    dom["btn-audit-label"]?.classList.toggle("d-none", isLoading);
    dom["btn-audit-spinner"]?.classList.toggle("d-none", !isLoading);
  }

  function showStep3Error(message) {
    if (!dom["step3-api-error"]) return;
    dom["step3-api-error"].textContent = message;
    dom["step3-api-error"].classList.remove("d-none");
  }

  function hideStep3Error() {
    if (!dom["step3-api-error"]) return;
    dom["step3-api-error"].classList.add("d-none");
    dom["step3-api-error"].textContent = "";
  }

  function getHistorialResumenes() {
    return (state.historial_errores || [])
      .map((item) => (typeof item === "string" ? item : item.resumen || ""))
      .filter(Boolean);
  }

  function updateAuditButtonLabel() {
    if (!dom["btn-audit-label"]) return;
    const nextNum = modalSession.attempts.length + 1;
    dom["btn-audit-label"].textContent =
      nextNum > 1 ? `Auditar Intento #${nextNum} con IA` : "Auditar mi Resolución con IA";
  }

  function renderStep3AttemptsHistory() {
    const box = dom["step3-attempts-history"];
    const countEl = dom["step3-attempts-count"];
    const listEl = dom["step3-attempts-list"];
    if (!box || !listEl) return;

    const attempts = modalSession.attempts || [];
    if (!attempts.length) {
      box.classList.add("d-none");
      listEl.innerHTML = "";
      if (countEl) countEl.textContent = "0";
      return;
    }

    box.classList.remove("d-none");
    if (countEl) countEl.textContent = String(attempts.length);
    listEl.innerHTML = "";

    attempts.forEach((att) => {
      const row = document.createElement("div");
      row.className = `attempt-pill-item ${att.aprobado ? "attempt-pill-ok" : "attempt-pill-fail"}`;

      const numSpan = document.createElement("span");
      numSpan.className = "attempt-pill-num";
      numSpan.textContent = `Intento #${att.numero}`;

      const descSpan = document.createElement("span");
      descSpan.className = "attempt-pill-desc";
      if (att.aprobado) {
        descSpan.textContent = att.progreso_detectado
          ? `Aprobado · ${att.progreso_detectado}`
          : "Procedimiento aprobado";
      } else {
        const tipoTxt =
          att.tipo_error === "fallo_prerrequisito" ? "Base previa" : "Operativo";
        const detalle = att.resumen_baul || att.explicacion_error || "Requiere ajuste";
        descSpan.textContent = `${tipoTxt}: ${detalle}`;
      }

      row.appendChild(numSpan);
      row.appendChild(descSpan);
      listEl.appendChild(row);
    });
  }

  function refreshActiveSectionAfterAudit() {
    if (activeSection === "camino") renderCaminoSection();
    else if (activeSection === "materias") renderMateriasSection();
    else if (activeSection === "skills") renderSkillsSection();
    else if (activeSection === "perfil") renderPerfilSection();
  }

  function handleReinforcePrerequisiteClick() {
    const skill = modalSession.skill;
    const prereqId = skill?.prerrequisito_id;
    if (!prereqId) return;

    state.nodo_retorno = skill.id;
    state.nodos_estado[prereqId] = "blocker";
    saveState();
    refreshActiveSectionAfterAudit();
    openNodeModal(prereqId, { autoGenerateAI: true });
  }

  function handleReturnToOriginalNodeClick() {
    const returnId = state.nodo_retorno;
    if (!returnId) return;

    state.nodo_retorno = null;
    if (
      state.nodos_estado[returnId] === "locked" ||
      state.nodos_estado[returnId] === "blocker"
    ) {
      state.nodos_estado[returnId] = "active";
    }
    saveState();
    refreshActiveSectionAfterAudit();
    openNodeModal(returnId);
  }

  async function handleAuditWithAI() {
    if (modalSession.isAuditing || !modalSession.skill) return;

    const skill = modalSession.skill;
    const paso3 = modalSession.activeExercise?.paso3_reto_foto || skill.paso3_reto_foto;
    const textValue = (dom["step3-text-input"]?.value || "").trim();
    const photoFile = modalSession.step3File;

    hideStep3Error();

    if (!photoFile && !textValue) {
      showStep3Error(
        "Sube una foto de tu hoja o escribe tu procedimiento en el cuadro de texto antes de auditar."
      );
      return;
    }

    const intentosPrevios = (modalSession.attempts || [])
      .filter((att) => !att.aprobado)
      .map((att) => ({
        numero: att.numero,
        ubicacion_error: att.ubicacion_error,
        explicacion_error: att.explicacion_error,
        resumen_baul: att.resumen_baul,
      }));

    const formData = new FormData();
    formData.append("enunciado", paso3?.enunciado_latex || "");
    formData.append("prerrequisito", paso3?.prerrequisito_evaluado || "");
    formData.append("prerrequisito_id", skill.prerrequisito_id || "");
    formData.append("texto_usuario", textValue);
    formData.append("historial_errores", JSON.stringify(getHistorialResumenes()));
    formData.append("intentos_previos_ejercicio", JSON.stringify(intentosPrevios));
    if (photoFile) {
      formData.append("foto", photoFile);
    }

    setAuditLoading(true);
    dom["ai-audit-result-card"]?.classList.add("d-none");

    try {
      const response = await fetch("/api/evaluar", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        const detail = data?.detalle || data?.error || `Error del servidor (${response.status})`;
        throw new Error(detail);
      }

      processAuditResponse(skill, data);
    } catch (error) {
      console.error("Error auditando con IA:", error);
      showStep3Error(
        error.message || "Ocurrió un error al comunicarse con el tutor IA."
      );
    } finally {
      setAuditLoading(false);
    }
  }

  function processAuditResponse(skill, data) {
    const approved = Boolean(data.aprobado);
    const errorType = String(
      data.tipo_error || (approved ? "ninguno" : "error_operativo")
    );
    const progreso = String(data.progreso_detectado || "").trim();
    const requiresRepeat =
      Boolean(data.requiere_repetir_modulo) && Boolean(skill.prerrequisito_id);
    const attemptNumber = (modalSession.attempts || []).length + 1;

    modalSession.attempts.push({
      numero: attemptNumber,
      aprobado: approved,
      tipo_error: errorType,
      progreso_detectado: progreso,
      ubicacion_error: String(data.ubicacion_error || "").trim(),
      explicacion_error: String(data.explicacion_error || "").trim(),
      resumen_baul: String(data.resumen_baul || "").trim(),
    });
    renderStep3AttemptsHistory();
    updateAuditButtonLabel();

    const card = dom["ai-audit-result-card"];
    if (!card) return;

    card.classList.remove("d-none", "result-approved", "result-needs-work");
    card.classList.add(approved ? "result-approved" : "result-needs-work");

    if (dom["ai-result-status-badge"]) {
      dom["ai-result-status-badge"].textContent = approved
        ? `🎉 ¡Procedimiento Aprobado (Intento #${attemptNumber})!`
        : `🔍 Intento #${attemptNumber}: Corrección Requerida`;
    }

    const typeBadge = dom["ai-result-type-badge"];
    if (typeBadge) {
      typeBadge.classList.remove(
        "d-none",
        "text-bg-success",
        "text-bg-info",
        "text-bg-danger",
        "text-bg-secondary"
      );
      if (approved) {
        typeBadge.classList.add("text-bg-success");
        typeBadge.textContent = "Validado";
      } else if (errorType === "fallo_prerrequisito") {
        typeBadge.classList.add("text-bg-danger");
        typeBadge.textContent = "Fallo de base previa";
      } else {
        typeBadge.classList.add("text-bg-info");
        typeBadge.textContent = "Error operativo";
      }
    }

    const blockProgreso = dom["ai-block-progreso"];
    if (blockProgreso && dom["ai-res-progreso"]) {
      if (progreso) {
        dom["ai-res-progreso"].textContent = progreso;
        blockProgreso.classList.remove("d-none");
      } else {
        dom["ai-res-progreso"].textContent = "";
        blockProgreso.classList.add("d-none");
      }
    }

    if (dom["ai-res-ubicacion"]) {
      dom["ai-res-ubicacion"].textContent = data.ubicacion_error || "";
    }
    if (dom["ai-res-explicacion"]) {
      dom["ai-res-explicacion"].textContent = data.explicacion_error || "";
    }
    if (dom["ai-res-pista"]) {
      dom["ai-res-pista"].textContent = data.pista_socratica || "-";
    }
    if (dom["ai-res-tip"]) {
      dom["ai-res-tip"].textContent = skill.tip_auxiliar || "-";
    }
    if (dom["ai-res-baul-text"]) {
      dom["ai-res-baul-text"].textContent = data.resumen_baul || "";
    }

    const prereqBadge = dom["ai-result-prereq-badge"];
    const reinforceBtn = dom["btn-reinforce-prereq"];
    const returnBtn = dom["btn-return-to-node"];
    const recoveredBanner = dom["ai-base-recovered-banner"];

    if (approved) {
      dom["ai-block-ubicacion"]?.classList.add("d-none");
      dom["ai-block-explicacion"]?.classList.add("d-none");
      if (dom["ai-pista-label"]) {
        dom["ai-pista-label"].textContent = "🎉 ¡Resolución Correcta!";
      }
      prereqBadge?.classList.add("d-none");
      reinforceBtn?.classList.add("d-none");
      dom["ai-res-baul-pill"]?.classList.add("d-none");
      dom["btn-upload-correction"]?.classList.add("d-none");
      dom["btn-complete-node"]?.classList.remove("d-none");

      if (!state.xp_otorgado_nodos[skill.id]) {
        state.xp += Number(skill.xp || 0);
        state.racha += 1;
        state.xp_otorgado_nodos[skill.id] = true;
      }

      state.nodos_estado[skill.id] = "unlocked";
      unlockNextSkillAfter(skill.id);

      const returnNodeId =
        state.nodo_retorno && state.nodo_retorno !== skill.id ? state.nodo_retorno : null;
      if (state.nodo_retorno === skill.id) {
        state.nodo_retorno = null;
      }

      if (returnNodeId) {
        const returnFound = findSkillGlobal(returnNodeId);
        if (
          state.nodos_estado[returnNodeId] === "locked" ||
          state.nodos_estado[returnNodeId] === "blocker"
        ) {
          state.nodos_estado[returnNodeId] = "active";
        }
        recoveredBanner?.classList.remove("d-none");
        if (returnBtn) {
          returnBtn.classList.remove("d-none");
          returnBtn.innerHTML = returnFound
            ? `<i class="bi bi-arrow-right-circle-fill me-1"></i>Volver a: ${escapeHtml(returnFound.skill.nombre)}`
            : '<i class="bi bi-arrow-right-circle-fill me-1"></i>Volver al ejercicio anterior';
        }
      } else {
        recoveredBanner?.classList.add("d-none");
        returnBtn?.classList.add("d-none");
      }

      saveState();
      updateTopbar();
      refreshActiveSectionAfterAudit();
      updateModalStepperUI();
      launchConfetti();
    } else {
      dom["ai-block-ubicacion"]?.classList.remove("d-none");
      dom["ai-block-explicacion"]?.classList.remove("d-none");
      if (dom["ai-pista-label"]) {
        dom["ai-pista-label"].textContent = "💡 Pista Socrática";
      }
      recoveredBanner?.classList.add("d-none");
      returnBtn?.classList.add("d-none");
      dom["ai-res-baul-pill"]?.classList.remove("d-none");
      dom["btn-upload-correction"]?.classList.remove("d-none");
      dom["btn-complete-node"]?.classList.add("d-none");

      const resumen = String(data.resumen_baul || "Revisar aplicación de regla").trim();
      const fechaHoy = new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
      });
      state.historial_errores.push({
        resumen,
        tema: skill.nombre,
        fecha: fechaHoy,
      });

      if (requiresRepeat) {
        const prereqId = skill.prerrequisito_id;
        const prereqFound = findSkillGlobal(prereqId);
        state.nodos_estado[prereqId] = "blocker";
        state.nodo_retorno = skill.id;

        if (prereqBadge) {
          prereqBadge.classList.remove("d-none");
          prereqBadge.innerHTML = prereqFound
            ? `<i class="bi bi-exclamation-triangle-fill me-1"></i>Refuerza primero: ${escapeHtml(prereqFound.skill.nombre)}`
            : '<i class="bi bi-exclamation-triangle-fill me-1"></i>Fallo en prerrequisito detectado';
        }
        if (reinforceBtn) {
          reinforceBtn.classList.remove("d-none");
          reinforceBtn.innerHTML = prereqFound
            ? `<i class="bi bi-arrow-counterclockwise me-1"></i>Reforzar módulo anterior: ${escapeHtml(prereqFound.skill.nombre)}`
            : '<i class="bi bi-arrow-counterclockwise me-1"></i>Reforzar módulo anterior';
        }
      } else {
        reinforceBtn?.classList.add("d-none");
        if (errorType === "fallo_prerrequisito") {
          prereqBadge?.classList.remove("d-none");
          if (prereqBadge) {
            prereqBadge.innerHTML =
              '<i class="bi bi-exclamation-triangle-fill me-1"></i>Fallo conceptual detectado';
          }
        } else {
          prereqBadge?.classList.add("d-none");
        }
      }

      saveState();
      renderErrorVault();
      refreshActiveSectionAfterAudit();
    }

    renderMath(card);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function unlockNextSkillAfter(completedSkillId) {
    const found = findSkillGlobal(completedSkillId);
    if (!found) return;
    const skills = getMateriaSkills(found.materia);
    const idx = skills.findIndex((s) => s.id === completedSkillId);
    if (idx === -1) return;

    const nextLocked =
      skills.slice(idx + 1).find((s) => state.nodos_estado[s.id] === "locked") ||
      skills.find((s) => state.nodos_estado[s.id] === "locked");

    if (nextLocked) {
      state.nodos_estado[nextLocked.id] = "active";
    }
  }

  function resetStep3ForCorrection() {
    clearSelectedPhoto();
    hideStep3Error();
    dom["ai-audit-result-card"]?.classList.add("d-none");
    updateAuditButtonLabel();
    dom["photo-dropzone"]?.focus();
    dom["photo-dropzone"]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function launchConfetti() {
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
     Mini Modal: Registrar Nota Parcial (< 51 => Alerta Roja + Blocker)
     ======================================================================== */

  function handlePartialGradeSubmit(event) {
    event.preventDefault();
    const input = dom["partial-grade-input"];
    const errorEl = dom["partial-grade-error"];
    const rawVal = (input?.value || "").trim();
    const grade = Number(rawVal);

    if (rawVal === "" || Number.isNaN(grade) || grade < 0 || grade > 100) {
      errorEl?.classList.remove("d-none");
      return;
    }

    errorEl?.classList.add("d-none");
    state.nota_parcial = Math.round(grade);
    state.notas_parciales.push({
      nota: state.nota_parcial,
      fecha: new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
      }),
    });

    const activeSkills = getActiveMateriaSkills();
    const allStageSkills = getAllStageSkills(state.etapa);

    if (state.nota_parcial < 51) {
      state.alerta_rescate = true;
      const target =
        activeSkills.find((s) => state.nodos_estado[s.id] !== "unlocked") ||
        allStageSkills.find((s) => state.nodos_estado[s.id] !== "unlocked") ||
        activeSkills[0];
      if (target) {
        state.nodos_estado[target.id] = "blocker";
      }
    } else {
      state.alerta_rescate = false;
      allStageSkills.forEach((s) => {
        if (state.nodos_estado[s.id] === "blocker") {
          state.nodos_estado[s.id] = "active";
        }
      });
    }

    saveState();
    hideBootstrapModal(dom["partialGradeModal"]);

    if (state.diagnostico_completado && state.etapa) {
      enterAppSection(activeSection);
    } else {
      updateTopbar();
    }
  }

  /* ========================================================================
     Helpers Bootstrap Modal
     ======================================================================== */

  function showBootstrapModal(modalEl) {
    if (!modalEl || !window.bootstrap?.Modal) return;
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function hideBootstrapModal(modalEl) {
    if (!modalEl || !window.bootstrap?.Modal) return;
    window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }
})();
