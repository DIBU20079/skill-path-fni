/**
 * Modal de 3 sub-niveles, generación IA de ejercicios, subida de fotos y auditoría continua.
 */

import { evaluateResolution, generateDynamicExercise } from "./api.js";
import {
  MAX_IMAGE_BYTES,
  OPTION_LETTERS,
  dom,
  escapeHtml,
  findSkillGlobal,
  getHistorialResumenes,
  getMateriaSkills,
  renderMath,
  saveState,
  showBootstrapModal,
  state,
  updateTopbar,
} from "./state.js";

export const modalSession = {
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

export function openNodeModal(skillId, options = {}) {
  const found = findSkillGlobal(skillId);
  if (!found) return;
  const { skill } = found;

  revokePreviewUrl();
  const exercise = cloneExerciseFromSkill(skill);
  const isReinforcement = Boolean(state.nodo_retorno && state.nodo_retorno !== skill.id);

  Object.assign(modalSession, {
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
  });

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

export async function handleGenerateDynamicExercise() {
  if (modalSession.isGenerating || modalSession.isAuditing || !modalSession.skill) {
    return;
  }

  const skill = modalSession.skill;
  const feedbackEl = dom["modal-gen-feedback"];
  feedbackEl?.classList.add("d-none");
  setGenerateLoading(true);

  try {
    const data = await generateDynamicExercise({
      materia: skill.materia,
      tema: skill.nombre,
      historial_errores: getHistorialResumenes(),
    });

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
    const data = await evaluateResolution(formData);
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
    refreshActiveSectionHandler();
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
