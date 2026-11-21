/**
 * Modal de 3 sub-niveles, generación IA de ejercicios, subida de fotos y auditoría continua.
 */

import {
  apiEjemploAnalogo,
  apiExplicarPaso,
  apiGenerarEjemploGuiado,
  apiGenerarEjercicioError,
  evaluateResolution,
  generateDynamicExercise,
} from "./api.js";
import {
  MAX_IMAGE_BYTES,
  OPTION_LETTERS,
  addErrorToVault,
  dom,
  escapeHtml,
  findSkillGlobal,
  getActiveMateria,
  getHistorialResumenes,
  getMateriaSkills,
  getStageMaterias,
  incrementMedallaCounter,
  launchConfetti,
  marcarErrorSuperado,
  obtenerPrioridadTema,
  registrarIntentoIA,
  registrarPasoNodo,
  renderMath,
  saveState,
  showBootstrapModal,
  state,
  updateTopbar,
} from "./state.js";

export { launchConfetti };

const MAX_PHOTO_WIDTH = 1280;
const PHOTO_JPEG_QUALITY = 0.78;
const AUDIT_LOADING_MESSAGES = [
  "Leyendo tu procedimiento escrito...",
  "Revisando álgebra, signos y pasos...",
  "Preparando retroalimentación socrática...",
];

export const modalSession = {
  mode: "lesson", // "lesson" | "error_drill"
  activeTab: "learn", // "learn" | "practice"
  difficulty: "base", // "base" | "parcial_fni" (selector actual)
  activeDifficulty: "base", // dificultad del ejercicio activo actual
  skill: null,
  errorTarget: null,
  errorDrillData: null,
  wasBlockerOnOpen: false,
  activeExercise: null,
  guidedExample: null,
  revealedStepsCount: 0,
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
  isLoadingAnalogous: false,
  isLoadingGuided: false,
  attempts: [],
  failedAttemptsCount: 0,
  analogousExample: null,
  exerciseApprovedAwarded: false,
  reinforcementMode: false,
  auditMsgTimerId: null,
};

let refreshActiveSectionHandler = () => {};
let renderErrorVaultHandler = () => {};

export function configureChallengeHandlers({
  onRefreshActiveSection,
  onRenderErrorVault,
} = {}) {
  if (typeof onRefreshActiveSection === "function") {
    refreshActiveSectionHandler = onRefreshActiveSection;
  }
  if (typeof onRenderErrorVault === "function") {
    renderErrorVaultHandler = onRenderErrorVault;
  }
}

function cloneExerciseFromSkill(skill) {
  return {
    paso1_concepto: { ...(skill.paso1_concepto || {}) },
    paso2_practica: { ...(skill.paso2_practica || {}) },
    paso3_reto_foto: { ...(skill.paso3_reto_foto || {}) },
  };
}

export function switchModalTab(tabName = "learn") {
  const target =
    modalSession.mode === "error_drill"
      ? "practice"
      : tabName === "practice"
        ? "practice"
        : "learn";
  modalSession.activeTab = target;

  const isLearn = target === "learn";
  dom["tab-modal-learn"]?.classList.toggle("active", isLearn);
  dom["tab-modal-practice"]?.classList.toggle("active", !isLearn);
  dom["tab-modal-learn"]?.setAttribute("aria-selected", String(isLearn));
  dom["tab-modal-practice"]?.setAttribute("aria-selected", String(!isLearn));

  dom["modal-pane-learn"]?.classList.toggle("d-none", !isLearn);
  dom["modal-pane-practice"]?.classList.toggle("d-none", isLearn);

  if (modalSession.mode === "lesson") {
    dom["lesson-stepper-wrap"]?.classList.toggle("d-none", isLearn);
  } else {
    dom["lesson-stepper-wrap"]?.classList.add("d-none");
  }

  renderMath(isLearn ? dom["modal-pane-learn"] : dom["modal-pane-practice"]);
}

export function selectPracticeDifficulty(diff = "base") {
  const cleanDiff = diff === "parcial_fni" ? "parcial_fni" : "base";
  modalSession.difficulty = cleanDiff;
  dom["btn-diff-base"]?.classList.toggle("active", cleanDiff === "base");
  dom["btn-diff-parcial"]?.classList.toggle("active", cleanDiff === "parcial_fni");
}

function renderFormulasCardsInto(containerEl, formulas) {
  if (!containerEl) return;
  const list = Array.isArray(formulas) ? formulas : [];
  containerEl.innerHTML = "";
  if (list.length === 0) {
    containerEl.innerHTML =
      '<div class="small text-secondary">Revisa la idea clave y la receta paso a paso para este tema.</div>';
    return;
  }

  list.forEach((f) => {
    const card = document.createElement("div");
    card.className = "formula-card";
    card.innerHTML = `
      <div class="formula-card-name">${escapeHtml(f.nombre || "Regla clave")}</div>
      <div class="formula-card-math">${escapeHtml(f.latex || "")}</div>
    `;
    containerEl.appendChild(card);
  });
  renderMath(containerEl);
}

function updateGuidedStepRevealButtons() {
  const steps = modalSession.guidedExample?.pasos || [];
  const total = steps.length;
  const revealed = modalSession.revealedStepsCount;
  const nextBtn = dom["btn-reveal-next-step"];
  const allBtn = dom["btn-reveal-all-steps"];

  if (nextBtn) {
    if (total === 0 || revealed >= total) {
      nextBtn.disabled = true;
      nextBtn.textContent = "✅ Todos los pasos visibles";
    } else {
      nextBtn.disabled = false;
      nextBtn.textContent = `👁️ Ver Paso ${revealed + 1}`;
    }
  }
  if (allBtn) {
    allBtn.classList.toggle("d-none", total === 0 || revealed >= total);
  }
  if (dom["learn-guided-final"]) {
    const showFinal = total > 0 && revealed >= total;
    dom["learn-guided-final"].classList.toggle("d-none", !showFinal);
    if (showFinal) {
      renderMath(dom["learn-guided-final"]);
    }
  }
}

async function handleExplainGuidedStep(stepIdx, stepCard, whyBtn) {
  const steps = modalSession.guidedExample?.pasos || [];
  const currentStep = steps[stepIdx];
  const prevStep = stepIdx > 0 ? steps[stepIdx - 1] : null;
  if (!currentStep || !stepCard) return;

  const existingClarification = stepCard.querySelector(".step-ai-clarification");
  if (existingClarification && !existingClarification.dataset.errorState) {
    existingClarification.classList.toggle("d-none");
    renderMath(existingClarification);
    return;
  }

  if (whyBtn) {
    whyBtn.disabled = true;
    whyBtn.textContent = "Pensando...";
  }

  const box =
    existingClarification ||
    (() => {
      const div = document.createElement("div");
      div.className = "step-ai-clarification";
      stepCard.appendChild(div);
      return div;
    })();
  delete box.dataset.errorState;
  box.classList.remove("d-none");
  box.textContent = "Analizando transformación algebraica...";

  const pasoAnteriorTexto = prevStep
    ? `${prevStep.titulo}: ${prevStep.expresion}`
    : modalSession.guidedExample?.enunciado || "Enunciado inicial";
  const pasoActualTexto = `${currentStep.titulo}: ${currentStep.expresion}`;

  try {
    const data = await apiExplicarPaso({
      materia: modalSession.skill?.materia || "Ciencias Básicas FNI",
      tema: modalSession.skill?.nombre || "Tema",
      paso_anterior: pasoAnteriorTexto,
      paso_actual: pasoActualTexto,
      explicacion_actual: currentStep.explicacion || "",
    });
    box.textContent = data.aclaracion || "";
    renderMath(box);
  } catch (error) {
    box.dataset.errorState = "1";
    box.textContent = `No se pudo cargar la aclaración en este instante (${error.message || "error de red"}). Intenta nuevamente.`;
  } finally {
    if (whyBtn) {
      whyBtn.disabled = false;
      whyBtn.textContent = "❓ ¿Por qué pasó esto?";
    }
  }
}

function renderGuidedExample(exampleObj) {
  modalSession.guidedExample = exampleObj || null;
  modalSession.revealedStepsCount = 0;

  dom["learn-guided-error"]?.classList.add("d-none");
  const enunEl = dom["learn-guided-enunciado"];
  const listEl = dom["learn-guided-steps-list"];
  const finalEl = dom["learn-guided-final"];

  if (!exampleObj || !Array.isArray(exampleObj.pasos) || exampleObj.pasos.length === 0) {
    if (enunEl) enunEl.textContent = "Cargando ejemplo guiado paso a paso...";
    if (listEl) listEl.innerHTML = "";
    if (finalEl) {
      finalEl.classList.add("d-none");
      finalEl.textContent = "";
    }
    updateGuidedStepRevealButtons();
    return;
  }

  if (enunEl) {
    enunEl.textContent = exampleObj.enunciado || "";
    renderMath(enunEl);
  }

  if (finalEl) {
    finalEl.innerHTML = `<strong>Resultado final:</strong> ${escapeHtml(exampleObj.resultado_final || "")}`;
    finalEl.classList.add("d-none");
  }

  if (listEl) {
    listEl.innerHTML = "";
    exampleObj.pasos.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "guided-step-card d-none";
      card.dataset.stepIndex = String(idx);

      card.innerHTML = `
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span class="guided-step-title">${escapeHtml(step.titulo || `Paso ${idx + 1}`)}</span>
          <button type="button" class="btn btn-outline-primary btn-sm btn-why-step">
            ❓ ¿Por qué pasó esto?
          </button>
        </div>
        <div class="guided-step-expr">${escapeHtml(step.expresion || "")}</div>
        <div class="guided-step-expl">${escapeHtml(step.explicacion || "")}</div>
      `;

      const whyBtn = card.querySelector(".btn-why-step");
      whyBtn?.addEventListener("click", () => handleExplainGuidedStep(idx, card, whyBtn));
      listEl.appendChild(card);
    });
  }

  updateGuidedStepRevealButtons();
}

export function revealNextGuidedStep() {
  const listEl = dom["learn-guided-steps-list"];
  const steps = modalSession.guidedExample?.pasos || [];
  if (!listEl || modalSession.revealedStepsCount >= steps.length) return;

  const targetCard = listEl.children[modalSession.revealedStepsCount];
  if (targetCard) {
    targetCard.classList.remove("d-none");
    renderMath(targetCard);
    targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  modalSession.revealedStepsCount += 1;
  updateGuidedStepRevealButtons();
}

export function revealAllGuidedSteps() {
  const listEl = dom["learn-guided-steps-list"];
  const steps = modalSession.guidedExample?.pasos || [];
  if (!listEl || steps.length === 0) return;

  Array.from(listEl.children).forEach((card) => {
    card.classList.remove("d-none");
  });
  modalSession.revealedStepsCount = steps.length;
  renderMath(listEl);
  updateGuidedStepRevealButtons();
}

function setGuidedExampleLoading(isLoading) {
  modalSession.isLoadingGuided = isLoading;
  if (dom["btn-gen-guided-example"]) {
    dom["btn-gen-guided-example"].disabled = isLoading;
  }
  dom["btn-guided-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-guided-spinner"]?.classList.toggle("d-none", !isLoading);
}

export async function handleGenerateGuidedExample() {
  if (modalSession.isLoadingGuided || !modalSession.skill) return;

  dom["learn-guided-error"]?.classList.add("d-none");
  setGuidedExampleLoading(true);

  try {
    const prevEnun = modalSession.guidedExample?.enunciado || "";
    const data = await apiGenerarEjemploGuiado({
      materia: modalSession.skill.materia,
      tema: modalSession.skill.nombre,
      enunciado_previo: prevEnun,
    });
    renderGuidedExample(data);
  } catch (error) {
    if (dom["learn-guided-error"]) {
      dom["learn-guided-error"].textContent =
        error.message || "No se pudo generar un nuevo ejemplo guiado en este instante.";
      dom["learn-guided-error"].classList.remove("d-none");
    }
  } finally {
    setGuidedExampleLoading(false);
  }
}

function populateLearnAndFormulas(skill) {
  const guia = skill?.guia_aprendizaje || {};

  if (dom["learn-idea-clave"]) {
    dom["learn-idea-clave"].textContent =
      guia.idea_clave || skill.tip_auxiliar || "Domina las propiedades fundamentales de este tema paso a paso.";
  }

  renderFormulasCardsInto(dom["learn-formulas-grid"], guia.formulas);
  renderFormulasCardsInto(dom["step3-formulas-list"], guia.formulas);

  if (dom["learn-receta-list"]) {
    const receta = Array.isArray(guia.receta) ? guia.receta : [];
    dom["learn-receta-list"].innerHTML = "";
    receta.forEach((stepTxt) => {
      const li = document.createElement("li");
      li.textContent = stepTxt;
      dom["learn-receta-list"].appendChild(li);
    });
  }

  if (dom["learn-traps-list"]) {
    const trampas = Array.isArray(guia.trampas_examen) ? guia.trampas_examen : [];
    dom["learn-traps-list"].innerHTML = "";
    trampas.forEach((trapTxt) => {
      const li = document.createElement("li");
      li.textContent = trapTxt;
      dom["learn-traps-list"].appendChild(li);
    });
  }

  dom["step3-formulas-drawer"]?.classList.add("d-none");

  if (guia.ejemplo_guiado && Array.isArray(guia.ejemplo_guiado.pasos)) {
    renderGuidedExample(guia.ejemplo_guiado);
  } else {
    renderGuidedExample(null);
    handleGenerateGuidedExample();
  }

  renderMath(dom["modal-pane-learn"]);
}

export function toggleStep3FormulasDrawer() {
  const drawer = dom["step3-formulas-drawer"];
  if (!drawer) return;
  drawer.classList.toggle("d-none");
  if (!drawer.classList.contains("d-none")) {
    renderMath(drawer);
  }
}

function resolveCurrentAuditMateriaId() {
  if (modalSession.skill) {
    const found = findSkillGlobal(modalSession.skill.id);
    if (found?.materia?.id) return found.materia.id;
  }
  if (modalSession.errorTarget) {
    if (modalSession.errorTarget.materia_id) {
      return modalSession.errorTarget.materia_id;
    }
    const errMat = String(modalSession.errorTarget.materia || "")
      .trim()
      .toLowerCase();
    if (errMat) {
      for (const stageKey of ["pre_u", "facultad"]) {
        const match = getStageMaterias(stageKey).find(
          (m) => m.nombre.trim().toLowerCase() === errMat
        );
        if (match) return match.id;
      }
    }
  }
  return state.materia_activa || "";
}

export function openNodeModal(skillId, options = {}) {
  const found = findSkillGlobal(skillId);
  if (!found) return;

  const { skill } = found;
  cleanupModalResources();

  const exercise = cloneExerciseFromSkill(skill);
  const isReinforcement = Boolean(state.nodo_retorno && state.nodo_retorno !== skill.id);
  const nodeStatus = state.nodos_estado[skill.id] || "active";
  const wasBlocker = nodeStatus === "blocker";
  const savedSteps = Number(state.nodos_pasos?.[skill.id] || 0);
  const restoredUnlockedStep =
    nodeStatus === "unlocked"
      ? 3
      : Math.max(1, Math.min(3, savedSteps + 1));
  const openInLearn = !options.autoGenerateAI && (nodeStatus === "active" || nodeStatus === "blocker");

  Object.assign(modalSession, {
    mode: "lesson",
    activeTab: openInLearn ? "learn" : "practice",
    difficulty: "base",
    activeDifficulty: "base",
    skill,
    errorTarget: null,
    errorDrillData: null,
    wasBlockerOnOpen: wasBlocker,
    activeExercise: exercise,
    guidedExample: null,
    revealedStepsCount: 0,
    isGeneratedAI: false,
    currentStep: 1,
    maxUnlockedStep: restoredUnlockedStep,
    step1Selected: null,
    step1Passed: false,
    step2Passed: false,
    step3File: null,
    previewObjectUrl: null,
    isAuditing: false,
    isGenerating: false,
    isLoadingAnalogous: false,
    isLoadingGuided: false,
    attempts: [],
    failedAttemptsCount: 0,
    analogousExample: null,
    exerciseApprovedAwarded: false,
    reinforcementMode: isReinforcement,
    auditMsgTimerId: null,
  });

  if (dom["modal-node-meta"]) {
    const unitBadge = skill.unidad ? `${skill.unidad} · ` : "";
    const priority = obtenerPrioridadTema(skill);
    dom["modal-node-meta"].textContent =
      `#${skill.ranking_criticidad} · ${unitBadge}${skill.materia} · ${priority.label}`;
  }
  if (dom["modal-node-title"]) dom["modal-node-title"].textContent = skill.nombre;
  if (dom["modal-node-xp"]) dom["modal-node-xp"].textContent = `⚡ +${skill.xp} XP`;

  dom["modal-mode-tabs"]?.classList.remove("d-none");
  dom["btn-generate-ai-exercise"]?.classList.remove("d-none");
  dom["step3-tools-bar"]?.classList.remove("d-none");
  dom["btn-toggle-step3-formulas"]?.classList.remove("d-none");
  dom["step3-difficulty-wrap"]?.classList.remove("d-none");
  dom["modal-difficulty-badge"]?.classList.add("d-none");

  selectPracticeDifficulty("base");

  if (dom["step3-header-badge"]) {
    dom["step3-header-badge"].innerHTML =
      '<i class="bi bi-camera-fill me-1"></i>Paso 3 de 3 · Reto Tipo Examen en Papel';
  }
  if (dom["btn-complete-node"]) {
    dom["btn-complete-node"].innerHTML =
      '<i class="bi bi-check-circle-fill me-1"></i>¡Completar Tema y Ganar XP!';
  }

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
  setGuidedExampleLoading(false);
  resetAnalogousScaffold();

  populateLearnAndFormulas(skill);
  renderActiveExerciseInModal();
  switchModalTab(modalSession.activeTab);

  if (!dom["nodeLessonModal"]?.classList.contains("show")) {
    showBootstrapModal(dom["nodeLessonModal"]);
  }

  if (options.autoGenerateAI) {
    handleGenerateDynamicExercise();
  }
}

export async function abrirRetoSuperarError(errorObj) {
  if (!errorObj || typeof errorObj !== "object") return;

  cleanupModalResources();
  const activeMat = getActiveMateria();
  const materiaNombre =
    (errorObj.materia || "").trim() || activeMat?.nombre || "Ciencias Básicas FNI";
  const temaNombre = (errorObj.tema || "").trim() || "Refuerzo de Tema";
  const tipoError = (errorObj.tipo_error || "").trim() || "error_operativo";
  const detalleError = (errorObj.resumen || "").trim() || temaNombre;

  Object.assign(modalSession, {
    mode: "error_drill",
    activeTab: "practice",
    difficulty: "base",
    activeDifficulty: "base",
    skill: null,
    errorTarget: errorObj,
    errorDrillData: null,
    wasBlockerOnOpen: false,
    activeExercise: null,
    guidedExample: null,
    revealedStepsCount: 0,
    isGeneratedAI: true,
    currentStep: 3,
    maxUnlockedStep: 3,
    step1Selected: null,
    step1Passed: true,
    step2Passed: true,
    step3File: null,
    previewObjectUrl: null,
    isAuditing: false,
    isGenerating: true,
    isLoadingAnalogous: false,
    isLoadingGuided: false,
    attempts: [],
    failedAttemptsCount: 0,
    analogousExample: null,
    exerciseApprovedAwarded: false,
    reinforcementMode: false,
    auditMsgTimerId: null,
  });

  if (dom["modal-node-meta"]) {
    dom["modal-node-meta"].textContent =
      `🎯 BAÚL DE ERRORES ACTIVO · ${materiaNombre.toUpperCase()}`;
  }
  if (dom["modal-node-title"]) {
    dom["modal-node-title"].textContent = `Superar error: ${temaNombre}`;
  }
  if (dom["modal-node-xp"]) {
    dom["modal-node-xp"].textContent = "⚡ +30 XP";
  }

  dom["modal-mode-tabs"]?.classList.add("d-none");
  dom["lesson-stepper-wrap"]?.classList.add("d-none");
  dom["btn-generate-ai-exercise"]?.classList.add("d-none");
  dom["step3-tools-bar"]?.classList.add("d-none");
  dom["step3-formulas-drawer"]?.classList.add("d-none");
  dom["modal-difficulty-badge"]?.classList.add("d-none");
  dom["modal-ai-gen-badge"]?.classList.remove("d-none");
  dom["modal-gen-feedback"]?.classList.add("d-none");

  const reinBanner = dom["modal-reinforcement-banner"];
  if (reinBanner) {
    reinBanner.classList.remove("d-none");
    if (dom["modal-reinforcement-text"]) {
      dom["modal-reinforcement-text"].textContent = `Falla a superar: "${detalleError}". Resuelve el ejercicio en tu cuaderno y súbelo para auditoría.`;
    }
  }

  if (dom["step3-header-badge"]) {
    dom["step3-header-badge"].innerHTML =
      '<i class="bi bi-arrow-repeat me-1"></i>Baúl de Errores Activo · Reto Correctivo';
  }
  if (dom["step3-title"]) {
    dom["step3-title"].textContent = "Generando reto personalizado para este error...";
  }
  if (dom["step3-instructions"]) {
    dom["step3-instructions"].textContent =
      "La IA está diseñando un ejercicio nuevo enfocado exactamente en esta dificultad.";
  }
  if (dom["step3-enunciado-latex"]) {
    dom["step3-enunciado-latex"].innerHTML =
      '<div class="d-flex align-items-center gap-2 text-secondary"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span>Creando ejercicio focalizado con Gemini...</span></div>';
  }
  if (dom["btn-complete-node"]) {
    dom["btn-complete-node"].innerHTML =
      '<i class="bi bi-check-circle-fill me-1"></i>✅ Error Superado · Volver al Baúl';
  }

  resetAnalogousScaffold();
  clearSelectedPhoto();
  if (dom["step3-text-input"]) dom["step3-text-input"].value = "";
  hideStep3Error();
  dom["ai-audit-result-card"]?.classList.add("d-none");
  dom["ai-xp-bonuses-banner"]?.classList.add("d-none");
  renderStep3AttemptsHistory();
  updateAuditButtonLabel();
  setAuditLoading(false);
  switchModalTab("practice");
  goToModalStep(3);

  if (!dom["nodeLessonModal"]?.classList.contains("show")) {
    showBootstrapModal(dom["nodeLessonModal"]);
  }

  try {
    const drill = await apiGenerarEjercicioError({
      materia: materiaNombre,
      tema: temaNombre,
      tipo_error: tipoError,
      detalle_error: detalleError,
    });

    if (
      modalSession.mode !== "error_drill" ||
      modalSession.errorTarget?.id !== errorObj.id
    ) {
      return;
    }

    modalSession.errorDrillData = drill;
    if (dom["step3-title"]) {
      dom["step3-title"].textContent = drill.objetivo || `Refuerzo en ${temaNombre}`;
    }
    if (dom["step3-instructions"]) {
      dom["step3-instructions"].textContent = `💡 Pista preventiva: ${drill.pista_inicial}`;
    }
    if (dom["step3-enunciado-latex"]) {
      dom["step3-enunciado-latex"].textContent = drill.enunciado || "";
      renderMath(dom["step3-enunciado-latex"]);
    }
    renderMath(dom["step3-instructions"]);
  } catch (_err) {
    if (
      modalSession.mode !== "error_drill" ||
      modalSession.errorTarget?.id !== errorObj.id
    ) {
      return;
    }
    const fallbackDrill = {
      enunciado: `Plantea y resuelve paso a paso en tu cuaderno un ejercicio representativo de **${temaNombre}** verificando especialmente no cometer el error: *${detalleError}*.`,
      pista_inicial: `Verifica signos, restricciones y cada paso algebraico relacionado con "${detalleError}".`,
      objetivo: `Demostrar dominio sin repetir "${detalleError}".`,
    };
    modalSession.errorDrillData = fallbackDrill;
    if (dom["step3-title"]) {
      dom["step3-title"].textContent = `Refuerzo práctico: ${temaNombre}`;
    }
    if (dom["step3-instructions"]) {
      dom["step3-instructions"].textContent = `💡 Pista preventiva: ${fallbackDrill.pista_inicial}`;
    }
    if (dom["step3-enunciado-latex"]) {
      dom["step3-enunciado-latex"].textContent = fallbackDrill.enunciado;
    }
  } finally {
    modalSession.isGenerating = false;
  }
}

function renderActiveExerciseInModal(targetStep = 1) {
  const ex = modalSession.activeExercise;
  if (!ex) return;

  modalSession.currentStep = targetStep;
  modalSession.maxUnlockedStep = Math.max(1, targetStep);
  modalSession.step1Selected = null;
  modalSession.step1Passed = targetStep > 1;
  modalSession.step2Passed = targetStep > 2;

  populateStep1(ex.paso1_concepto);
  populateStep2(ex.paso2_practica);
  populateStep3(ex.paso3_reto_foto);
  goToModalStep(targetStep);
}

function setGenerateLoading(isLoading) {
  modalSession.isGenerating = isLoading;
  if (dom["btn-generate-ai-exercise"]) {
    dom["btn-generate-ai-exercise"].disabled = isLoading;
  }
  if (dom["btn-step3-generate-ai"]) {
    dom["btn-step3-generate-ai"].disabled = isLoading;
  }
  dom["btn-gen-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-gen-spinner"]?.classList.toggle("d-none", !isLoading);
  dom["btn-step3-gen-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-step3-gen-spinner"]?.classList.toggle("d-none", !isLoading);
}

export async function handleGenerateDynamicExercise({ stayOnCurrentStep = false } = {}) {
  if (modalSession.isGenerating || modalSession.isAuditing || !modalSession.skill) {
    return;
  }

  const skill = modalSession.skill;
  const requestedDifficulty = modalSession.difficulty || "base";
  const feedbackEl = dom["modal-gen-feedback"];
  feedbackEl?.classList.add("d-none");
  setGenerateLoading(true);

  if (modalSession.activeTab !== "practice") {
    switchModalTab("practice");
  }

  try {
    const data = await generateDynamicExercise({
      materia: skill.materia,
      tema: skill.nombre,
      historial_errores: getHistorialResumenes(),
      dificultad: requestedDifficulty,
    });

    modalSession.activeExercise = data;
    modalSession.activeDifficulty = data.dificultad || requestedDifficulty;
    modalSession.isGeneratedAI = true;
    modalSession.attempts = [];
    modalSession.failedAttemptsCount = 0;
    modalSession.analogousExample = null;
    modalSession.exerciseApprovedAwarded = false;
    resetAnalogousScaffold();
    dom["modal-ai-gen-badge"]?.classList.remove("d-none");
    dom["modal-difficulty-badge"]?.classList.toggle(
      "d-none",
      modalSession.activeDifficulty !== "parcial_fni"
    );

    if (feedbackEl) {
      feedbackEl.className = "small text-success fw-semibold mb-2";
      feedbackEl.textContent =
        modalSession.activeDifficulty === "parcial_fni"
          ? "🔥 Nuevo ejercicio Nivel Parcial FNI generado (+35 XP extra al aprobar)."
          : "✨ Nuevo ejercicio inédito generado por Gemini adaptado a tu historial.";
      feedbackEl.classList.remove("d-none");
    }

    const nextStep = stayOnCurrentStep ? Math.max(1, modalSession.currentStep) : 1;
    renderActiveExerciseInModal(nextStep);
  } catch (_error) {
    if (feedbackEl) {
      feedbackEl.className = "small text-secondary mb-2";
      feedbackEl.textContent =
        "La IA está saturada en este instante; conservamos el ejercicio oficial de respaldo.";
      feedbackEl.classList.remove("d-none");
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

export function checkStep1() {
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
    if (modalSession.mode === "lesson" && modalSession.skill) {
      registrarPasoNodo(modalSession.skill.id, 1);
      refreshActiveSectionHandler();
    }
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

export function checkStep2() {
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
    if (modalSession.mode === "lesson" && modalSession.skill) {
      registrarPasoNodo(modalSession.skill.id, 2);
      refreshActiveSectionHandler();
    }
    if (dom["step2-answer-input"]) dom["step2-answer-input"].disabled = true;
    dom["btn-step2-check"]?.classList.add("d-none");
    dom["btn-step2-next"]?.classList.remove("d-none");
    updateModalStepperUI();
  }
}

function populateStep3(paso3) {
  if (!paso3) return;
  if (dom["step3-title"]) {
    dom["step3-title"].textContent = paso3.titulo || "Reto de Foto";
    renderMath(dom["step3-title"]);
  }
  if (dom["step3-instructions"]) {
    dom["step3-instructions"].textContent = paso3.instrucciones || "";
    renderMath(dom["step3-instructions"]);
  }
  if (dom["step3-enunciado-latex"]) {
    dom["step3-enunciado-latex"].textContent = paso3.enunciado_latex || "";
    renderMath(dom["step3-enunciado-latex"]);
  }

  clearSelectedPhoto();
  if (dom["step3-text-input"]) dom["step3-text-input"].value = "";
  hideStep3Error();
  resetAnalogousScaffold();
  dom["ai-audit-result-card"]?.classList.add("d-none");
  dom["ai-xp-bonuses-banner"]?.classList.add("d-none");
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

function resetAnalogousScaffold() {
  modalSession.analogousExample = null;
  dom["analogous-scaffold-card"]?.classList.add("d-none");
  dom["analogous-example-body"]?.classList.add("d-none");
  dom["analogous-error"]?.classList.add("d-none");
  if (dom["analogous-error"]) dom["analogous-error"].textContent = "";
  if (dom["analogous-enunciado"]) dom["analogous-enunciado"].textContent = "";
  if (dom["analogous-pasos-list"]) dom["analogous-pasos-list"].innerHTML = "";
  if (dom["analogous-conclusion"]) dom["analogous-conclusion"].textContent = "";
  setAnalogousLoading(false);
}

function setAnalogousLoading(isLoading) {
  modalSession.isLoadingAnalogous = isLoading;
  if (dom["btn-show-analogous"]) dom["btn-show-analogous"].disabled = isLoading;
  dom["btn-analogous-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-analogous-spinner"]?.classList.toggle("d-none", !isLoading);
}

function getCurrentPromptAndContext() {
  if (modalSession.mode === "error_drill" && modalSession.errorTarget) {
    const activeMat = getActiveMateria();
    return {
      materia:
        (modalSession.errorTarget.materia || "").trim() ||
        activeMat?.nombre ||
        "Ciencias Básicas FNI",
      tema: modalSession.errorTarget.tema || "Refuerzo de error",
      enunciado:
        modalSession.errorDrillData?.enunciado ||
        dom["step3-enunciado-latex"]?.textContent ||
        modalSession.errorTarget.resumen,
      prerrequisito: `Superar error recurrente: ${modalSession.errorTarget.resumen}`,
      prerrequisitoId: "",
      tipAuxiliar:
        modalSession.errorDrillData?.pista_inicial ||
        "Revisa cada paso algebraico antes de cerrar tu respuesta.",
    };
  }

  const skill = modalSession.skill;
  const paso3 = modalSession.activeExercise?.paso3_reto_foto || skill?.paso3_reto_foto;
  return {
    materia: skill?.materia || "Ciencias Básicas FNI",
    tema: skill?.nombre || "Tema",
    enunciado: paso3?.enunciado_latex || "",
    prerrequisito: paso3?.prerrequisito_evaluado || "",
    prerrequisitoId: skill?.prerrequisito_id || "",
    tipAuxiliar: skill?.tip_auxiliar || "-",
  };
}

export async function handleShowAnalogousExample() {
  if (modalSession.isLoadingAnalogous) return;

  if (modalSession.analogousExample) {
    dom["analogous-example-body"]?.classList.toggle("d-none");
    return;
  }

  const ctx = getCurrentPromptAndContext();
  if (!ctx.enunciado) return;

  dom["analogous-error"]?.classList.add("d-none");
  setAnalogousLoading(true);

  try {
    const example = await apiEjemploAnalogo({
      materia: ctx.materia,
      tema: ctx.tema,
      ejercicio_actual: ctx.enunciado,
    });
    modalSession.analogousExample = example;

    if (dom["analogous-enunciado"]) {
      dom["analogous-enunciado"].textContent = example.enunciado || "";
    }
    if (dom["analogous-pasos-list"]) {
      dom["analogous-pasos-list"].innerHTML = "";
      (example.pasos || []).forEach((stepText) => {
        const li = document.createElement("li");
        li.textContent = stepText;
        dom["analogous-pasos-list"].appendChild(li);
      });
    }
    if (dom["analogous-conclusion"]) {
      dom["analogous-conclusion"].textContent = example.conclusion || "";
    }

    dom["analogous-example-body"]?.classList.remove("d-none");
    renderMath(dom["analogous-example-body"]);
  } catch (error) {
    if (dom["analogous-error"]) {
      dom["analogous-error"].textContent =
        error.message || "No se pudo generar el ejemplo análogo en este instante.";
      dom["analogous-error"].classList.remove("d-none");
    }
  } finally {
    setAnalogousLoading(false);
  }
}

export function goToModalStep(stepNum) {
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
   Paso 3: Dropzone de Foto + POST /api/evaluar
   ======================================================================== */

export function setupPhotoDropzoneEvents() {
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

export function revokePreviewUrl() {
  if (modalSession.previewObjectUrl) {
    URL.revokeObjectURL(modalSession.previewObjectUrl);
    modalSession.previewObjectUrl = null;
  }
}

function stopAuditLoadingRotation() {
  if (modalSession.auditMsgTimerId !== null) {
    window.clearInterval(modalSession.auditMsgTimerId);
    modalSession.auditMsgTimerId = null;
  }
}

export function cleanupModalResources() {
  stopAuditLoadingRotation();
  revokePreviewUrl();
}

function setAuditLoading(isLoading) {
  modalSession.isAuditing = isLoading;
  if (dom["btn-audit-ai"]) dom["btn-audit-ai"].disabled = isLoading;
  dom["btn-audit-label"]?.classList.toggle("d-none", isLoading);
  dom["btn-audit-spinner"]?.classList.toggle("d-none", !isLoading);

  stopAuditLoadingRotation();
  if (isLoading) {
    let msgIdx = 0;
    if (dom["btn-audit-spinner-text"]) {
      dom["btn-audit-spinner-text"].textContent = AUDIT_LOADING_MESSAGES[0];
    }
    modalSession.auditMsgTimerId = window.setInterval(() => {
      msgIdx = (msgIdx + 1) % AUDIT_LOADING_MESSAGES.length;
      if (dom["btn-audit-spinner-text"]) {
        dom["btn-audit-spinner-text"].textContent = AUDIT_LOADING_MESSAGES[msgIdx];
      }
    }, 1800);
  }
}

function compressPhotoFile(file) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const tempUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) {
          URL.revokeObjectURL(tempUrl);
          resolve(file);
          return;
        }

        const scale = srcW > MAX_PHOTO_WIDTH ? MAX_PHOTO_WIDTH / srcW : 1;
        const targetW = Math.max(1, Math.round(srcW * scale));
        const targetH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(tempUrl);
          resolve(file);
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(tempUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanBase = String(file.name || "hoja")
              .replace(/\.[^.]+$/, "")
              .slice(0, 60);
            resolve(new File([blob], `${cleanBase}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          PHOTO_JPEG_QUALITY
        );
      } catch (_err) {
        URL.revokeObjectURL(tempUrl);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      resolve(file);
    };

    img.src = tempUrl;
  });
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

export function handleReinforcePrerequisiteClick() {
  const skill = modalSession.skill;
  const prereqId = skill?.prerrequisito_id;
  if (!prereqId) return;

  state.nodo_retorno = skill.id;
  state.nodos_estado[prereqId] = "blocker";
  saveState();
  refreshActiveSectionHandler();
  openNodeModal(prereqId, { autoGenerateAI: true });
}

export function handleReturnToOriginalNodeClick() {
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
  refreshActiveSectionHandler();
  openNodeModal(returnId);
}

export async function handleAuditWithAI() {
  if (modalSession.isAuditing) return;
  const hasTarget =
    (modalSession.mode === "lesson" && modalSession.skill) ||
    (modalSession.mode === "error_drill" && modalSession.errorTarget);
  if (!hasTarget) return;

  const ctx = getCurrentPromptAndContext();
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

  setAuditLoading(true);
  dom["ai-audit-result-card"]?.classList.add("d-none");

  try {
    const formData = new FormData();
    formData.append("enunciado", ctx.enunciado);
    formData.append("prerrequisito", ctx.prerrequisito);
    formData.append("prerrequisito_id", ctx.prerrequisitoId);
    formData.append("texto_usuario", textValue);
    formData.append("historial_errores", JSON.stringify(getHistorialResumenes()));
    formData.append("intentos_previos_ejercicio", JSON.stringify(intentosPrevios));

    if (photoFile) {
      const compressedPhoto = await compressPhotoFile(photoFile);
      formData.append("foto", compressedPhoto);
    }

    const data = await evaluateResolution(formData);
    processAuditResponse(data);
  } catch (error) {
    console.error("Error auditando con IA:", error);
    showStep3Error(
      error.message || "Ocurrió un error al comunicarse con el tutor IA."
    );
  } finally {
    setAuditLoading(false);
  }
}

function renderXpBonusesBanner(chips) {
  const banner = dom["ai-xp-bonuses-banner"];
  if (!banner) return;
  if (!chips || chips.length === 0) {
    banner.innerHTML = "";
    banner.classList.add("d-none");
    return;
  }
  banner.innerHTML = chips
    .map((label) => `<span class="xp-bonus-chip">${escapeHtml(label)}</span>`)
    .join("");
  banner.classList.remove("d-none");
}

function processAuditResponse(data) {
  const isErrorDrill = modalSession.mode === "error_drill";
  const skill = modalSession.skill;
  const ctx = getCurrentPromptAndContext();
  const approved = Boolean(data.aprobado);
  const errorType = String(
    data.tipo_error || (approved ? "ninguno" : "error_operativo")
  );
  const progreso = String(data.progreso_detectado || "").trim();
  const requiresRepeat =
    !isErrorDrill &&
    Boolean(data.requiere_repetir_modulo) &&
    Boolean(skill?.prerrequisito_id);
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
    dom["ai-res-tip"].textContent = ctx.tipAuxiliar || "-";
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

    const bonusChips = [];

    if (isErrorDrill && modalSession.errorTarget) {
      const res = marcarErrorSuperado(modalSession.errorTarget.id);
      if (res.ok && !res.alreadySuperado) {
        bonusChips.push("✅ Error Superado (+30 XP)");
        state.racha += 1;
      } else {
        bonusChips.push("✅ Error ya superado");
      }

      if (attemptNumber >= 2 && !modalSession.exerciseApprovedAwarded) {
        state.xp += 25;
        incrementMedallaCounter("resiliencia", 1);
        bonusChips.push("💪 +25 XP Bono de Resiliencia");
      }
      modalSession.exerciseApprovedAwarded = true;
      recoveredBanner?.classList.add("d-none");
      returnBtn?.classList.add("d-none");
    } else if (skill) {
      if (!state.xp_otorgado_nodos[skill.id]) {
        state.xp += Number(skill.xp || 0);
        state.racha += 1;
        state.xp_otorgado_nodos[skill.id] = true;
      }

      if (!modalSession.exerciseApprovedAwarded) {
        if (attemptNumber >= 2) {
          state.xp += 25;
          incrementMedallaCounter("resiliencia", 1);
          bonusChips.push("💪 +25 XP Bono de Resiliencia");
        }
        if (modalSession.wasBlockerOnOpen) {
          state.xp += 50;
          incrementMedallaCounter("rescate_critico", 1);
          bonusChips.push("🛟 +50 XP Bono de Rescate");
        }
        if (modalSession.activeDifficulty === "parcial_fni") {
          state.xp += 35;
          bonusChips.push("🔥 +35 XP Dominio Parcial FNI");
        }
        modalSession.exerciseApprovedAwarded = true;
      }

      state.nodos_estado[skill.id] = "unlocked";
      registrarPasoNodo(skill.id, 3);
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
    }

    registrarIntentoIA(resolveCurrentAuditMateriaId(), true);
    renderXpBonusesBanner(bonusChips);
    saveState();
    updateTopbar();
    renderErrorVaultHandler();
    refreshActiveSectionHandler();
    updateModalStepperUI();
    launchConfetti();
  } else {
    renderXpBonusesBanner([]);
    dom["ai-block-ubicacion"]?.classList.remove("d-none");
    dom["ai-block-explicacion"]?.classList.remove("d-none");
    if (dom["ai-pista-label"]) {
      dom["ai-pista-label"].textContent = "💡 Pista Socrática";
    }
    recoveredBanner?.classList.add("d-none");
    returnBtn?.classList.add("d-none");
    dom["btn-upload-correction"]?.classList.remove("d-none");
    dom["btn-complete-node"]?.classList.add("d-none");

    registrarIntentoIA(resolveCurrentAuditMateriaId(), false);
    modalSession.failedAttemptsCount += 1;
    if (modalSession.failedAttemptsCount >= 2) {
      dom["analogous-scaffold-card"]?.classList.remove("d-none");
    }

    if (!isErrorDrill && skill) {
      dom["ai-res-baul-pill"]?.classList.remove("d-none");
      const resumen = String(data.resumen_baul || "Revisar aplicación de regla").trim();
      addErrorToVault({
        resumen,
        tema: skill.nombre,
        materia: skill.materia,
        materia_id: resolveCurrentAuditMateriaId(),
        tipo_error: errorType,
      });
    } else {
      dom["ai-res-baul-pill"]?.classList.add("d-none");
    }

    if (requiresRepeat && skill) {
      const prereqId = skill.prerrequisito_id;
      const prereqFound = findSkillGlobal(prereqId);
      state.nodos_estado[prereqId] = "blocker";
      if (!state.nodos_pasos || typeof state.nodos_pasos !== "object") {
        state.nodos_pasos = {};
      }
      state.nodos_pasos[prereqId] = 0;
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
    renderErrorVaultHandler();
    refreshActiveSectionHandler();
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

export function resetStep3ForCorrection() {
  clearSelectedPhoto();
  hideStep3Error();
  dom["ai-audit-result-card"]?.classList.add("d-none");
  updateAuditButtonLabel();
  dom["photo-dropzone"]?.focus();
  dom["photo-dropzone"]?.scrollIntoView({ behavior: "smooth", block: "center" });
}
