/**
 * Punto de entrada ES Module: inicialización, navegación de secciones, perfil y nota parcial.
 */

import { fetchSkillsDB } from "./api.js";
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
  dom,
  ensureConsistentNodeStatesForStage,
  getActiveMateria,
  getActiveMateriaSkills,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  hideBootstrapModal,
  renderMath,
  renderSkillsLoadError,
  saveState,
  showView,
  state,
  updateGreetingUI,
  updateTopbar,
  updateWelcomeResumeBanner,
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
  saveState();
  updateGreetingUI();
  dom["profile-name-saved-msg"]?.classList.remove("d-none");
}

function switchStageFromProfile(targetStage) {
  if (!appContext.skillsDB?.[targetStage]) return;
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
   Enlace de Eventos y Arranque Inicial
   ======================================================================== */

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
    if (appContext.skillsLoadFailed) {
      window.location.reload();
      return;
    }
    if (state.etapa && state.diagnostico_completado && appContext.skillsDB?.[state.etapa]) {
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

  if (state.nombre && dom["welcome-name-input"]) {
    dom["welcome-name-input"].value = state.nombre;
  }

  if (state.etapa && state.diagnostico_completado && appContext.skillsDB[state.etapa]) {
    enterAppSection("camino");
  } else {
    updateWelcomeResumeBanner();
    showView("stage-selector");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
