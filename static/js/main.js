/**
 * Punto de entrada ES Module: inicialización, autenticación, navegación de secciones y perfil.
 */

import {
  apiDemoLogin,
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  apiTesterSync,
  fetchSkillsDB,
} from "./api.js";
import {
  abrirRetoSuperarError,
  checkStep1,
  checkStep2,
  cleanupModalResources,
  configureChallengeHandlers,
  goToModalStep,
  handleAuditWithAI,
  handleGenerateDynamicExercise,
  handleGenerateGuidedExample,
  handleReinforcePrerequisiteClick,
  handleReturnToOriginalNodeClick,
  handleShowAnalogousExample,
  modalSession,
  openNodeModal,
  resetStep3ForCorrection,
  revealAllGuidedSteps,
  revealNextGuidedStep,
  selectPracticeDifficulty,
  setupPhotoDropzoneEvents,
  switchModalTab,
  toggleStep3FormulasDrawer,
} from "./challenge.js";
import {
  handleDiagnosticNext,
  handleFullProgressReset,
  startPlacementExam,
  startSimulacroExam,
  startSkipExam,
  startSkipUnitExam,
  stopDiagnosticTimer,
} from "./diagnostic.js";
import {
  configureSkilltreeHandlers,
  handleUnitFreePractice,
  handleUnitValidateAndSkip,
  renderCaminoSection,
  renderErrorVault,
  renderGlobalSubjectsProgress,
  renderMateriasSection,
  renderMedalsGrid,
  renderRankCard,
  renderSkillsSection,
  setVaultFilterScope,
} from "./skilltree.js";
import {
  appContext,
  cacheDom,
  clearSessionLocalState,
  dom,
  ensureConsistentNodeStatesForStage,
  getActiveMateria,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  hideBootstrapModal,
  hydrateStateFromUser,
  isMateriaIniciada,
  obtenerRangoFNI,
  renderMath,
  renderSkillsLoadError,
  saveState,
  showView,
  startMateriaFromScratch,
  state,
  updateGreetingUI,
  updateTopbar,
} from "./state.js";

function refreshActiveSection() {
  if (appContext.activeSection === "camino") renderCaminoSection();
  else if (appContext.activeSection === "materias") renderMateriasSection();
  else if (appContext.activeSection === "skills") renderSkillsSection();
  else if (appContext.activeSection === "perfil") renderPerfilSection();
}

export function enterAppSection(sectionName) {
  const validSections = ["camino", "materias", "skills", "perfil"];
  const target = validSections.includes(sectionName) ? sectionName : "materias";
  appContext.activeSection = target;

  if (!state.etapa || !appContext.skillsDB?.[state.etapa]) {
    showView("stage-selector");
    return;
  }

  ensureConsistentNodeStatesForStage(state.etapa);
  const activeMat = getActiveMateria();

  if (target === "skills" && activeMat) {
    appContext.skillsSelectedMateriaId = activeMat.id;
  }

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

/* ========================================================================
   Sección D: Perfil (Identidad, Rango, Medallas, Avance Global y Demo)
   ======================================================================== */

function renderPerfilSection() {
  updateGreetingUI();

  const stageSkills = getAllStageSkills(state.etapa);
  const doneTotal = stageSkills.filter(
    (s) => state.nodos_estado[s.id] === "unlocked"
  ).length;
  const rank = obtenerRangoFNI(state.xp);
  const username = appContext.currentUser?.username || "estudiante";

  if (dom["profile-name-input"]) dom["profile-name-input"].value = state.nombre || "";
  if (dom["profile-username-handle"]) {
    dom["profile-username-handle"].textContent = `@${username}`;
  }
  if (dom["profile-rank-badge"]) {
    dom["profile-rank-badge"].textContent = `🏅 ${rank.titulo}`;
  }
  if (dom["profile-xp"]) dom["profile-xp"].textContent = String(state.xp || 0);
  if (dom["profile-streak"]) dom["profile-streak"].textContent = String(state.racha || 0);
  if (dom["profile-completed"]) {
    dom["profile-completed"].textContent = `${doneTotal}/${stageSkills.length}`;
  }

  dom["profile-name-saved-msg"]?.classList.add("d-none");
  dom["profile-demo-feedback"]?.classList.add("d-none");

  const isFacultad = state.etapa === "facultad";
  const isTester = Boolean(state.is_tester);

  dom["profile-tester-badge"]?.classList.toggle("d-none", !isTester);
  dom["profile-tester-card"]?.classList.toggle("d-none", !isTester);
  dom["profile-tester-feedback"]?.classList.add("d-none");

  if (dom["btn-tester-stage-preu"]) {
    dom["btn-tester-stage-preu"].className = `btn btn-duo btn-sm ${
      !isFacultad ? "btn-duo-blue" : "btn-duo-outline-secondary"
    }`;
  }
  if (dom["btn-tester-stage-facultad"]) {
    dom["btn-tester-stage-facultad"].className = `btn btn-duo btn-sm ${
      isFacultad ? "btn-duo-green" : "btn-duo-outline-secondary"
    }`;
  }

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

  renderRankCard("profile");
  renderMedalsGrid(
    dom["profile-medals-grid"],
    dom["profile-medals-unlocked-count"]
  );
  renderGlobalSubjectsProgress(
    dom["profile-subjects-progress-list"],
    dom["profile-global-summary-badge"]
  );
}

function handleProfileNameSave(event) {
  event.preventDefault();
  const newName = (dom["profile-name-input"]?.value || "").trim();
  if (!newName) return;

  state.nombre = newName;
  if (appContext.currentUser) appContext.currentUser.nombre = newName;
  saveState();
  updateGreetingUI();
  dom["profile-name-saved-msg"]?.classList.remove("d-none");
}

function switchStageFromProfile(targetStage) {
  if (!appContext.skillsDB?.[targetStage]) return;
  const materias = getStageMaterias(targetStage);
  state.etapa = targetStage;
  if (appContext.currentUser) appContext.currentUser.etapa = targetStage;
  if (!materias.some((m) => m.id === state.materia_activa)) {
    const initiatedMat = materias.find((m) => isMateriaIniciada(m.id));
    state.materia_activa = (initiatedMat || materias[0])?.id || null;
  }
  appContext.skillsSelectedMateriaId = state.materia_activa || null;
  ensureConsistentNodeStatesForStage(targetStage);
  saveState();

  updateGreetingUI();
  updateTopbar();
  renderPerfilSection();
}

function setTesterSyncLoading(isLoading) {
  const btn = dom["btn-tester-sync-all"];
  if (btn) btn.disabled = isLoading;
  dom["btn-tester-sync-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-tester-sync-spinner"]?.classList.toggle("d-none", !isLoading);
}

async function handleTesterSyncAll() {
  if (!state.is_tester) return;
  const feedbackEl = dom["profile-tester-feedback"];
  if (feedbackEl) {
    feedbackEl.className = "alert alert-success d-none mt-3 mb-0";
    feedbackEl.textContent =
      "✅ Sandbox de Tester sincronizado y desbloqueado para todas las materias actuales.";
  }

  setTesterSyncLoading(true);
  try {
    appContext.skillsDB = await fetchSkillsDB();
    const syncedUser = await apiTesterSync(state.etapa);
    hydrateStateFromUser(syncedUser);
    updateGreetingUI();
    updateTopbar();
    renderPerfilSection();
    feedbackEl?.classList.remove("d-none");
  } catch (error) {
    console.error("Error sincronizando Modo Tester:", error);
    if (feedbackEl) {
      feedbackEl.textContent = `❌ ${error.message || "No se pudo sincronizar el sandbox."}`;
      feedbackEl.className = "alert alert-danger mt-3 mb-0";
    }
  } finally {
    setTesterSyncLoading(false);
  }
}

function loadDemoProfile() {
  const targetStage = state.etapa || "facultad";
  const materias = getStageMaterias(targetStage);
  const primaryMat = materias[0];
  const primarySkills = getMateriaSkills(primaryMat);

  state.nombre = state.nombre || "Alex FNI";
  state.etapa = targetStage;
  state.materia_activa = primaryMat?.id || null;
  appContext.skillsSelectedMateriaId = primaryMat?.id || null;
  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }
  if (primaryMat) {
    state.materias_iniciadas[primaryMat.id] = true;
  }
  state.xp = 460;
  state.racha = 6;
  state.diagnostico_completado = true;
  state.nodo_retorno = null;

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

  if (!state.nodos_pasos || typeof state.nodos_pasos !== "object") {
    state.nodos_pasos = {};
  }

  getAllStageSkills(targetStage).forEach((s) => {
    state.nodos_estado[s.id] = "locked";
    delete state.nodos_pasos[s.id];
    delete state.xp_otorgado_nodos[s.id];
  });

  materias.forEach((mat, matIdx) => {
    const mSkills = getMateriaSkills(mat);
    mSkills.forEach((s, idx) => {
      if (matIdx === 0 && idx < 2) {
        state.nodos_estado[s.id] = "unlocked";
        state.nodos_pasos[s.id] = 3;
        state.xp_otorgado_nodos[s.id] = true;
      } else if (matIdx === 0 && idx === 2) {
        state.nodos_estado[s.id] = "active";
        state.nodos_pasos[s.id] = 1;
      } else {
        state.nodos_estado[s.id] = "locked";
      }
    });
  });

  state.metricas_ia_materia = primaryMat
    ? {
        [primaryMat.id]: {
          intentos_ia: 4,
          aprobados_ia: 3,
        },
      }
    : {};

  const hoy = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });

  state.contadores_medallas = {
    resiliencia: 1,
    rescate_critico: 0,
    salto_nivel: 0,
    errores_superados: 0,
    simulacros_aprobados: 0,
  };
  state.simulacros_mejor_nota = {};

  state.historial_errores =
    targetStage === "facultad"
      ? [
          {
            id: "err_demo_fac_1",
            resumen: "Olvidó restringir argumento positivo en logaritmo",
            tema: primarySkills[0]?.nombre || "Inecuaciones y Dominios",
            materia: primaryMat?.nombre || "Cálculo I",
            materia_id: primaryMat?.id || "fac_calculo1",
            tipo_error: "fallo_prerrequisito",
            fecha: hoy,
            superado: false,
          },
          {
            id: "err_demo_fac_2",
            resumen: "Error de signo al multiplicar por conjugado",
            tema: primarySkills[1]?.nombre || "Límites Algebraicos",
            materia: primaryMat?.nombre || "Cálculo I",
            materia_id: primaryMat?.id || "fac_calculo1",
            tipo_error: "error_operativo",
            fecha: hoy,
            superado: false,
          },
        ]
      : [
          {
            id: "err_demo_preu_1",
            resumen: "Error de signo al factorizar trinomio cuadrático",
            tema: primarySkills[0]?.nombre || "Factorización",
            materia: primaryMat?.nombre || "Álgebra Pre-U",
            materia_id: primaryMat?.id || "pre_algebra",
            tipo_error: "error_operativo",
            fecha: hoy,
            superado: false,
          },
          {
            id: "err_demo_preu_2",
            resumen: "No excluyó raíces del denominador al simplificar",
            tema: primarySkills[1]?.nombre || "Fracciones Algebraicas",
            materia: primaryMat?.nombre || "Álgebra Pre-U",
            materia_id: primaryMat?.id || "pre_algebra",
            tipo_error: "fallo_prerrequisito",
            fecha: hoy,
            superado: false,
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
   Autenticación Cloud, Sesiones y Enlace de Eventos
   ======================================================================== */

function switchAuthTab(mode) {
  const isRegister = mode === "register";
  dom["tab-auth-login"]?.classList.toggle("active", !isRegister);
  dom["tab-auth-register"]?.classList.toggle("active", isRegister);
  dom["tab-auth-login"]?.setAttribute("aria-selected", String(!isRegister));
  dom["tab-auth-register"]?.setAttribute("aria-selected", String(isRegister));
  dom["form-auth-login"]?.classList.toggle("d-none", isRegister);
  dom["form-auth-register"]?.classList.toggle("d-none", !isRegister);
  dom["auth-login-error"]?.classList.add("d-none");
  dom["auth-reg-error"]?.classList.add("d-none");
}

function setAuthLoading(kind, isLoading) {
  const buttonIds = {
    login: "btn-auth-login",
    register: "btn-auth-register",
    demo: "btn-auth-demo-login",
  };
  const labelPrefix = {
    login: "btn-auth-login",
    register: "btn-auth-register",
    demo: "btn-auth-demo",
  }[kind];

  const btn = dom[buttonIds[kind]];
  if (btn) btn.disabled = isLoading;
  dom[`${labelPrefix}-label`]?.classList.toggle("d-none", isLoading);
  dom[`${labelPrefix}-spinner`]?.classList.toggle("d-none", !isLoading);
}

function showAuthBoxError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("d-none");
}

async function applyAuthenticatedUser(userData) {
  hydrateStateFromUser(userData);
  updateGreetingUI();
  updateTopbar();

  const stageMaterias = getStageMaterias(state.etapa);
  const activeInitiated =
    state.materia_activa && isMateriaIniciada(state.materia_activa);
  const anyInitiated = stageMaterias.find((m) => isMateriaIniciada(m.id));

  if (activeInitiated) {
    enterAppSection("camino");
  } else if (anyInitiated) {
    state.materia_activa = anyInitiated.id;
    saveState();
    enterAppSection("camino");
  } else {
    // Sin diagnóstico global obligatorio: lleva directo al catálogo de Materias
    enterAppSection("materias");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const errorEl = dom["auth-login-error"];
  errorEl?.classList.add("d-none");

  const username = (dom["auth-login-username"]?.value || "").trim().toLowerCase();
  const password = dom["auth-login-password"]?.value || "";

  if (!username || !password) {
    showAuthBoxError(errorEl, "Ingresa tu usuario y contraseña para continuar.");
    return;
  }

  setAuthLoading("login", true);
  try {
    const user = await apiLogin(username, password);
    if (dom["auth-login-password"]) dom["auth-login-password"].value = "";
    await applyAuthenticatedUser(user);
  } catch (error) {
    showAuthBoxError(errorEl, error.message || "No se pudo iniciar sesión.");
  } finally {
    setAuthLoading("login", false);
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const errorEl = dom["auth-reg-error"];
  errorEl?.classList.add("d-none");

  const nombre = (dom["auth-reg-nombre"]?.value || "").trim();
  const username = (dom["auth-reg-username"]?.value || "").trim().toLowerCase();
  const password = dom["auth-reg-password"]?.value || "";
  const etapa = dom["auth-reg-stage-facultad"]?.checked ? "facultad" : "pre_u";

  if (nombre.length < 2) {
    showAuthBoxError(errorEl, "Ingresa un nombre de al menos 2 caracteres.");
    dom["auth-reg-nombre"]?.focus();
    return;
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    showAuthBoxError(
      errorEl,
      "Usuario inválido: usa 3 a 32 caracteres en minúsculas, números, '.', '_' o '-' sin espacios."
    );
    dom["auth-reg-username"]?.focus();
    return;
  }
  if (password.length < 4) {
    showAuthBoxError(errorEl, "La contraseña debe tener al menos 4 caracteres.");
    dom["auth-reg-password"]?.focus();
    return;
  }

  setAuthLoading("register", true);
  try {
    const user = await apiRegister({ nombre, username, password, etapa });
    if (dom["auth-reg-password"]) dom["auth-reg-password"].value = "";
    await applyAuthenticatedUser(user);
  } catch (error) {
    showAuthBoxError(errorEl, error.message || "No se pudo crear la cuenta.");
  } finally {
    setAuthLoading("register", false);
  }
}

async function handleDemoLoginClick() {
  dom["auth-global-error"]?.classList.add("d-none");
  setAuthLoading("demo", true);
  try {
    const user = await apiDemoLogin();
    await applyAuthenticatedUser(user);
  } catch (error) {
    if (dom["auth-global-error-text"]) {
      dom["auth-global-error-text"].textContent =
        error.message || "No se pudo iniciar la sesión demo.";
    }
    dom["auth-global-error"]?.classList.remove("d-none");
  } finally {
    setAuthLoading("demo", false);
  }
}

async function handleLogoutClick() {
  try {
    await apiLogout();
  } catch (_error) {
    // Limpieza local garantizada aunque falle red
  }

  stopDiagnosticTimer();
  if (appContext.diagRadarChartInstance) {
    appContext.diagRadarChartInstance.destroy();
    appContext.diagRadarChartInstance = null;
  }
  if (appContext.skillsRadarChartInstance) {
    appContext.skillsRadarChartInstance.destroy();
    appContext.skillsRadarChartInstance = null;
  }

  clearSessionLocalState();
  dom["auth-login-error"]?.classList.add("d-none");
  dom["auth-reg-error"]?.classList.add("d-none");
  updateGreetingUI();
  updateTopbar();
  switchAuthTab("login");
  showView("stage-selector");
}

function bindEvents() {
  // Autenticación: pestañas, formularios y Demo Jurados
  dom["tab-auth-login"]?.addEventListener("click", () => switchAuthTab("login"));
  dom["tab-auth-register"]?.addEventListener("click", () => switchAuthTab("register"));
  dom["form-auth-login"]?.addEventListener("submit", handleLoginSubmit);
  dom["form-auth-register"]?.addEventListener("submit", handleRegisterSubmit);
  dom["btn-auth-demo-login"]?.addEventListener("click", handleDemoLoginClick);
  dom["btn-auth-retry"]?.addEventListener("click", () => window.location.reload());

  dom["btn-profile-logout"]?.addEventListener("click", handleLogoutClick);
  dom["btn-topbar-subject"]?.addEventListener("click", () =>
    enterAppSection("materias")
  );

  const goHome = (event) => {
    event.preventDefault();
    if (appContext.currentUser) {
      enterAppSection("materias");
    } else {
      stopDiagnosticTimer();
      showView("stage-selector");
    }
  };
  dom["brand-home-link"]?.addEventListener("click", goHome);
  dom["sidebar-home-link"]?.addEventListener("click", goHome);

  // Barra de navegación de 4 secciones
  document.querySelectorAll(".nav-section-btn[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      if (section) enterAppSection(section);
    });
  });

  dom["btn-go-subjects"]?.addEventListener("click", () => enterAppSection("materias"));
  dom["btn-onboarding-back-subjects"]?.addEventListener("click", () =>
    enterAppSection("materias")
  );

  // Inicio de materia nueva: Empezar desde cero vs Hacer Examen de Ubicación
  dom["btn-start-from-scratch"]?.addEventListener("click", () => {
    const activeMat = getActiveMateria();
    if (activeMat) {
      startMateriaFromScratch(activeMat.id);
      enterAppSection("camino");
    }
  });

  const launchActiveMateriaPlacement = () => {
    const activeMat = getActiveMateria();
    if (activeMat) {
      startPlacementExam(activeMat.id);
    }
  };
  dom["btn-start-placement-exam"]?.addEventListener("click", launchActiveMateriaPlacement);
  dom["btn-path-placement"]?.addEventListener("click", launchActiveMateriaPlacement);

  // Motor de examen reutilizable (Ubicación y Salto de nivel)
  dom["btn-diag-next"]?.addEventListener("click", handleDiagnosticNext);
  dom["btn-diag-cancel"]?.addEventListener("click", () => {
    stopDiagnosticTimer();
    enterAppSection("camino");
  });
  dom["btn-go-to-path"]?.addEventListener("click", () => enterAppSection("camino"));

  // Baúl de Errores Activo (filtros + limpieza)
  dom["btn-vault-scope-subject"]?.addEventListener("click", () =>
    setVaultFilterScope("subject")
  );
  dom["btn-vault-scope-all"]?.addEventListener("click", () =>
    setVaultFilterScope("all")
  );
  dom["btn-clear-vault"]?.addEventListener("click", () => {
    state.historial_errores = [];
    saveState();
    renderErrorVault();
    if (appContext.activeSection === "skills") {
      renderSkillsSection();
    }
  });

  // Modal Check de Bases antes de adelantar a una Unidad
  dom["btn-unit-validate-skip"]?.addEventListener("click", handleUnitValidateAndSkip);
  dom["btn-unit-free-practice"]?.addEventListener("click", handleUnitFreePractice);

  // Perfil y Panel Modo Tester
  dom["profile-name-form"]?.addEventListener("submit", handleProfileNameSave);
  dom["btn-profile-stage-preu"]?.addEventListener("click", () => switchStageFromProfile("pre_u"));
  dom["btn-profile-stage-facultad"]?.addEventListener("click", () => switchStageFromProfile("facultad"));
  dom["btn-tester-stage-preu"]?.addEventListener("click", () => switchStageFromProfile("pre_u"));
  dom["btn-tester-stage-facultad"]?.addEventListener("click", () => switchStageFromProfile("facultad"));
  dom["btn-tester-sync-all"]?.addEventListener("click", handleTesterSyncAll);
  dom["btn-profile-repeat-diag"]?.addEventListener("click", launchActiveMateriaPlacement);
  dom["btn-load-demo-profile"]?.addEventListener("click", loadDemoProfile);
  dom["btn-profile-reset-all"]?.addEventListener("click", () => {
    if (handleFullProgressReset()) {
      enterAppSection("materias");
    }
  });

  // Modal de 2 pestañas (Aprender / Practicar) + Generación IA + Baúl Activo
  dom["tab-modal-learn"]?.addEventListener("click", () => switchModalTab("learn"));
  dom["tab-modal-practice"]?.addEventListener("click", () => switchModalTab("practice"));
  dom["btn-learn-go-practice"]?.addEventListener("click", () => switchModalTab("practice"));
  dom["btn-reveal-next-step"]?.addEventListener("click", revealNextGuidedStep);
  dom["btn-reveal-all-steps"]?.addEventListener("click", revealAllGuidedSteps);
  dom["btn-gen-guided-example"]?.addEventListener("click", handleGenerateGuidedExample);

  dom["btn-generate-ai-exercise"]?.addEventListener("click", () =>
    handleGenerateDynamicExercise({ stayOnCurrentStep: false })
  );
  dom["btn-toggle-step3-formulas"]?.addEventListener("click", toggleStep3FormulasDrawer);
  dom["btn-diff-base"]?.addEventListener("click", () => selectPracticeDifficulty("base"));
  dom["btn-diff-parcial"]?.addEventListener("click", () =>
    selectPracticeDifficulty("parcial_fni")
  );
  dom["btn-step3-generate-ai"]?.addEventListener("click", () =>
    handleGenerateDynamicExercise({ stayOnCurrentStep: true })
  );

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

  dom["btn-show-analogous"]?.addEventListener("click", handleShowAnalogousExample);
  dom["btn-audit-ai"]?.addEventListener("click", handleAuditWithAI);
  dom["btn-upload-correction"]?.addEventListener("click", resetStep3ForCorrection);
  dom["btn-reinforce-prereq"]?.addEventListener("click", handleReinforcePrerequisiteClick);
  dom["btn-return-to-node"]?.addEventListener("click", handleReturnToOriginalNodeClick);
  dom["btn-complete-node"]?.addEventListener("click", () => {
    hideBootstrapModal(dom["nodeLessonModal"]);
  });

  dom["nodeLessonModal"]?.addEventListener("hidden.bs.modal", () => {
    cleanupModalResources();
  });
}

async function init() {
  cacheDom();
  configureSkilltreeHandlers({
    onOpenNode: openNodeModal,
    onEnterSection: enterAppSection,
    onSkipToNode: startSkipExam,
    onSkipToUnit: startSkipUnitExam,
    onStartSimulacro: startSimulacroExam,
    onOvercomeError: abrirRetoSuperarError,
  });
  configureChallengeHandlers({
    onRefreshActiveSection: refreshActiveSection,
    onRenderErrorVault: renderErrorVault,
  });

  bindEvents();
  updateGreetingUI();
  updateTopbar();

  try {
    appContext.skillsDB = await fetchSkillsDB();
    appContext.skillsLoadFailed = false;
  } catch (error) {
    console.error("Error cargando /api/skills:", error);
    renderSkillsLoadError(error.message);
    return;
  }

  try {
    const me = await apiMe();
    if (me) {
      await applyAuthenticatedUser(me);
      return;
    }
  } catch (error) {
    console.warn("No se pudo validar sesión activa:", error);
    if (dom["auth-global-error"] && dom["auth-global-error-text"]) {
      dom["auth-global-error-text"].textContent =
        error.message || "Error al consultar sesión en la nube.";
      dom["auth-global-error"].classList.remove("d-none");
    }
  }

  clearSessionLocalState();
  updateGreetingUI();
  updateTopbar();
  showView("stage-selector");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
