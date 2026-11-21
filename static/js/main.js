/**
 * Punto de entrada ES Module: inicialización, navegación de secciones, perfil y nota parcial.
 */

import {
  apiDemoLogin,
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  fetchSkillsDB,
} from "./api.js";
import {
  checkStep1,
  checkStep2,
  configureChallengeHandlers,
  goToModalStep,
  handleAuditWithAI,
  handleGenerateDynamicExercise,
  handleReinforcePrerequisiteClick,
  handleReturnToOriginalNodeClick,
  modalSession,
  openNodeModal,
  resetStep3ForCorrection,
  revokePreviewUrl,
  setupPhotoDropzoneEvents,
} from "./challenge.js";
import {
  handleDiagnosticNext,
  handleResetDiagnostic,
  startDiagnosticForStage,
  stopDiagnosticTimer,
} from "./diagnostic.js";
import {
  configureSkilltreeHandlers,
  handleStartRescueClick,
  renderCaminoSection,
  renderErrorVault,
  renderMateriasSection,
  renderSkillsSection,
} from "./skilltree.js";
import {
  appContext,
  cacheDom,
  clearSessionLocalState,
  dom,
  ensureConsistentNodeStatesForStage,
  getActiveMateria,
  getActiveMateriaSkills,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  hideBootstrapModal,
  hydrateStateFromUser,
  renderMath,
  renderSkillsLoadError,
  saveState,
  showView,
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
  const target = validSections.includes(sectionName) ? sectionName : "camino";
  appContext.activeSection = target;

  if (!state.etapa || !appContext.skillsDB?.[state.etapa]) {
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
    enterAppSection(appContext.activeSection);
  } else {
    updateTopbar();
  }
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

  if (state.diagnostico_completado && appContext.skillsDB?.[state.etapa]) {
    enterAppSection("camino");
  } else {
    await startDiagnosticForStage(state.etapa || "pre_u");
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
  dom["rescue-alert-banner"]?.classList.add("d-none");
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

  dom["btn-nav-logout"]?.addEventListener("click", handleLogoutClick);
  dom["btn-sidebar-logout"]?.addEventListener("click", handleLogoutClick);

  const goHome = (event) => {
    event.preventDefault();
    if (appContext.currentUser) {
      enterAppSection("camino");
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

async function init() {
  cacheDom();
  configureSkilltreeHandlers({
    onOpenNode: openNodeModal,
    onEnterSection: enterAppSection,
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
