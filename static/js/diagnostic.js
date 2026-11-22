/**
 * Motor de Examen Reutilizable:
 * - Modo 1 ("placement"): Examen de Ubicación por materia (4-6 preguntas de básico a avanzado).
 * - Modo 2 ("skip"): Examen de Salto de Nivel ("⚡ Saltar aquí", 3-4 preguntas de nodos anteriores, aprueba con >= 75%).
 * - Modo 3 ("simulacro"): Simulacro de Parcial con temporizador global (05:00) y nota sobre 100 (>= 51 aprueba).
 */

import { fetchSkillsDB } from "./api.js";
import {
  OPTION_LETTERS,
  STORAGE_KEY,
  appContext,
  dom,
  escapeHtml,
  findMateriaById,
  findSkillGlobal,
  getActiveMateria,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getMateriaUnidades,
  incrementMedallaCounter,
  launchConfetti,
  renderMath,
  renderSkillsLoadError,
  resetState,
  saveState,
  showView,
  state,
  updateGreetingUI,
  updateTopbar,
} from "./state.js";

const SIMULACRO_DURATION_SECONDS = 300;

const examSession = {
  mode: "placement", // "placement" | "skip" | "simulacro"
  materia: null,
  stageKey: null,
  targetSkill: null,
  targetUnit: null,
  targetIdx: -1,
  evaluatedSkills: [],
  questions: [],
  currentIndex: 0,
  selectedOption: null,
  confirmed: false,
  answers: [],
  timerId: null,
  secondsLeft: 0,
  totalSeconds: 45,
  isGlobalTimer: false,
};

async function ensureSkillsLoaded() {
  if (appContext.skillsDB) return true;
  try {
    appContext.skillsDB = await fetchSkillsDB();
    appContext.skillsLoadFailed = false;
    return true;
  } catch (error) {
    console.error(error);
    renderSkillsLoadError(error.message);
    return false;
  }
}

function buildPlacementQuestionsForMateria(materia) {
  const skills = getMateriaSkills(materia);
  const bank = Array.isArray(materia?.preguntas_examen) ? materia.preguntas_examen : [];

  if (bank.length >= 4) {
    let selectedBank = bank;
    if (bank.length > 6) {
      // Seleccionar 6 preguntas espaciadas uniformemente desde el inicio hasta la última unidad
      const indices = new Set();
      for (let k = 0; k < 6; k += 1) {
        const idx = Math.round((k * (bank.length - 1)) / 5);
        indices.add(idx);
      }
      selectedBank = Array.from(indices)
        .sort((a, b) => a - b)
        .map((i) => bank[i]);
    }

    return selectedBank.map((q, idx) => ({
      id: q.id || `placement_${materia.id}_${idx + 1}`,
      skill_id: q.skill_id || skills[Math.min(idx, skills.length - 1)]?.id || "",
      nivel_nodo: Number(q.nivel_nodo || idx + 1),
      tema: q.tema || skills[Math.min(idx, skills.length - 1)]?.nombre || materia.nombre,
      area: q.area || skills[Math.min(idx, skills.length - 1)]?.area || materia.nombre,
      tiempo_segundos: Number(q.tiempo_segundos) || 45,
      enunciado_latex: q.enunciado_latex || "",
      opciones: Array.isArray(q.opciones) ? q.opciones : [],
      respuesta_correcta: q.respuesta_correcta || "",
      explicacion_breve: q.explicacion_breve || "",
    }));
  }

  return skills.map((s, idx) => {
    const p1 = s.paso1_concepto || {};
    return {
      id: `placement_fallback_${s.id}`,
      skill_id: s.id,
      nivel_nodo: idx + 1,
      tema: s.nombre,
      area: s.area || materia.nombre,
      tiempo_segundos: 45,
      enunciado_latex: p1.enunciado_latex || "",
      opciones: Array.isArray(p1.opciones) ? p1.opciones : [],
      respuesta_correcta: p1.respuesta_correcta || "",
      explicacion_breve: p1.explicacion || "",
    };
  });
}

function buildSkipQuestionsForTarget(materia, targetIdx, requiredBaseIds = []) {
  const skills = getMateriaSkills(materia);
  const ownSkillIds = new Set(skills.map((s) => s.id));
  const previousAll = skills.slice(0, Math.max(1, targetIdx));
  const requiredSet = new Set(
    (Array.isArray(requiredBaseIds) ? requiredBaseIds : []).filter((id) =>
      ownSkillIds.has(id)
    )
  );

  const prioritizedSkills = [
    ...previousAll.filter((s) => requiredSet.has(s.id)),
    ...previousAll.filter((s) => !requiredSet.has(s.id)),
  ];

  const activeIdx = skills.findIndex((s) => {
    const st = state.nodos_estado[s.id];
    return st === "active" || st === "blocker";
  });

  const startIdx = activeIdx >= 0 && activeIdx < targetIdx ? activeIdx : 0;
  let priorSkills = skills.slice(startIdx, targetIdx);
  if (priorSkills.length === 0) {
    priorSkills = previousAll;
  }

  const priorIds = new Set(priorSkills.map((s) => s.id));
  const bank = Array.isArray(materia?.preguntas_examen) ? materia.preguntas_examen : [];
  const selected = [];
  const usedPrompts = new Set();

  // 1. Preguntas del banco asociadas primero a bases requeridas o nodos previos
  bank.forEach((q) => {
    if (selected.length >= 4) return;
    if (
      (requiredSet.has(q.skill_id) || priorIds.has(q.skill_id)) &&
      q.enunciado_latex &&
      !usedPrompts.has(q.enunciado_latex)
    ) {
      usedPrompts.add(q.enunciado_latex);
      selected.push({
        id: q.id || `skip_bank_${selected.length + 1}`,
        skill_id: q.skill_id,
        tema: q.tema || materia.nombre,
        area: q.area || materia.nombre,
        tiempo_segundos: Number(q.tiempo_segundos) || 45,
        enunciado_latex: q.enunciado_latex,
        opciones: Array.isArray(q.opciones) ? q.opciones : [],
        respuesta_correcta: q.respuesta_correcta,
        explicacion_breve: q.explicacion_breve || "",
      });
    }
  });

  // 2. Completar hasta 4 preguntas usando paso1_concepto de bases requeridas y nodos previos
  prioritizedSkills.forEach((s) => {
    if (selected.length >= 4) return;
    const p1 = s.paso1_concepto;
    if (p1 && p1.enunciado_latex && !usedPrompts.has(p1.enunciado_latex)) {
      usedPrompts.add(p1.enunciado_latex);
      selected.push({
        id: `skip_p1_${s.id}`,
        skill_id: s.id,
        tema: s.nombre,
        area: s.area || materia.nombre,
        tiempo_segundos: 45,
        enunciado_latex: p1.enunciado_latex,
        opciones: Array.isArray(p1.opciones) ? p1.opciones : [],
        respuesta_correcta: p1.respuesta_correcta,
        explicacion_breve: p1.explicacion || "",
      });
    }
  });

  // 3. Fallback con cualquier pregunta restante de unidades anteriores si aún hay menos de 3
  if (selected.length < 3) {
    bank.forEach((q) => {
      if (selected.length >= 4) return;
      if (
        previousAll.some((s) => s.id === q.skill_id) &&
        q.enunciado_latex &&
        !usedPrompts.has(q.enunciado_latex)
      ) {
        usedPrompts.add(q.enunciado_latex);
        selected.push({
          id: q.id || `skip_extra_${selected.length + 1}`,
          skill_id: q.skill_id,
          tema: q.tema || materia.nombre,
          area: q.area || materia.nombre,
          tiempo_segundos: Number(q.tiempo_segundos) || 45,
          enunciado_latex: q.enunciado_latex,
          opciones: Array.isArray(q.opciones) ? q.opciones : [],
          respuesta_correcta: q.respuesta_correcta,
          explicacion_breve: q.explicacion_breve || "",
        });
      }
    });
  }

  return {
    questions: selected.slice(0, 4),
    evaluatedSkills: priorSkills,
  };
}

export async function startPlacementExam(materiaId = state.materia_activa) {
  if (!(await ensureSkillsLoaded())) return;

  const found =
    findMateriaById(materiaId) ||
    (() => {
      const active = getActiveMateria();
      return active ? { materia: active, stageKey: state.etapa || "pre_u" } : null;
    })();

  if (!found || !found.materia) return;

  const { materia, stageKey } = found;
  const questions = buildPlacementQuestionsForMateria(materia);
  if (questions.length === 0) return;

  stopDiagnosticTimer();
  state.etapa = stageKey;
  state.materia_activa = materia.id;
  saveState();

  Object.assign(examSession, {
    mode: "placement",
    materia,
    stageKey,
    targetSkill: null,
    targetIdx: -1,
    evaluatedSkills: getMateriaSkills(materia),
    questions,
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: 0,
    totalSeconds: 45,
    isGlobalTimer: false,
  });

  if (dom["diag-mode-kicker"]) {
    dom["diag-mode-kicker"].textContent = `🎯 EXAMEN DE UBICACIÓN · ${materia.codigo || materia.nombre.toUpperCase()}`;
  }
  if (dom["diag-exam-title"]) {
    dom["diag-exam-title"].textContent = `Ubicación en ${materia.nombre}`;
  }
  if (dom["diag-footer-hint"]) {
    dom["diag-footer-hint"].innerHTML =
      `<i class="bi bi-lightning-charge-fill text-warning me-1"></i>Responde de básico a avanzado para desbloquear en verde los temas que ya dominas.`;
  }

  dom["diagnostic-quiz-panel"]?.classList.remove("d-none");
  dom["diagnostic-results-panel"]?.classList.add("d-none");

  updateGreetingUI();
  updateTopbar();
  showView("diagnostic");
  renderExamQuestion();
}

export async function startSkipExam(targetSkillId) {
  if (!(await ensureSkillsLoaded())) return;

  const found = findSkillGlobal(targetSkillId);
  if (!found) return;

  const { skill: targetSkill, materia, stageKey } = found;
  const skills = getMateriaSkills(materia);
  const targetIdx = skills.findIndex((s) => s.id === targetSkill.id);
  if (targetIdx < 1) return;

  const { questions, evaluatedSkills } = buildSkipQuestionsForTarget(materia, targetIdx);
  if (questions.length === 0) return;

  stopDiagnosticTimer();
  state.etapa = stageKey;
  state.materia_activa = materia.id;
  saveState();

  Object.assign(examSession, {
    mode: "skip",
    materia,
    stageKey,
    targetSkill,
    targetUnit: null,
    targetIdx,
    evaluatedSkills,
    questions,
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: 0,
    totalSeconds: 45,
    isGlobalTimer: false,
  });

  if (dom["diag-mode-kicker"]) {
    dom["diag-mode-kicker"].textContent = `⚡ SALTO DE NIVEL · NODO #${targetSkill.ranking_criticidad}`;
  }
  if (dom["diag-exam-title"]) {
    dom["diag-exam-title"].textContent = `Saltar a: ${targetSkill.nombre}`;
  }
  if (dom["diag-footer-hint"]) {
    dom["diag-footer-hint"].innerHTML =
      `<i class="bi bi-shield-fill-check text-primary me-1"></i>Aprueba con <strong>&ge; 75%</strong> para desbloquear los temas anteriores y activar este nodo.`;
  }

  dom["diagnostic-quiz-panel"]?.classList.remove("d-none");
  dom["diagnostic-results-panel"]?.classList.add("d-none");

  updateGreetingUI();
  updateTopbar();
  showView("diagnostic");
  renderExamQuestion();
}

export async function startSkipUnitExam(materiaId, unitId) {
  if (!(await ensureSkillsLoaded())) return;

  const found = findMateriaById(materiaId);
  if (!found || !found.materia) return;

  const { materia, stageKey } = found;
  const unidades = getMateriaUnidades(materia);
  const unit = unidades.find((u) => u.id === unitId);
  if (!unit || !Array.isArray(unit.nodos_ids) || unit.nodos_ids.length === 0) return;

  const skills = getMateriaSkills(materia);
  const firstNodeId = unit.nodos_ids[0];
  const targetIdx = skills.findIndex((s) => s.id === firstNodeId);
  const targetSkill = targetIdx >= 0 ? skills[targetIdx] : null;
  if (!targetSkill || targetIdx < 1) return;

  const requiredBaseIds = (unit.bases_requeridas || []).map((b) => b.id);
  const { questions, evaluatedSkills } = buildSkipQuestionsForTarget(
    materia,
    targetIdx,
    requiredBaseIds
  );
  if (questions.length === 0) return;

  stopDiagnosticTimer();
  state.etapa = stageKey;
  state.materia_activa = materia.id;
  saveState();

  Object.assign(examSession, {
    mode: "skip",
    materia,
    stageKey,
    targetSkill,
    targetUnit: unit,
    targetIdx,
    evaluatedSkills,
    questions,
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: 0,
    totalSeconds: 45,
    isGlobalTimer: false,
  });

  if (dom["diag-mode-kicker"]) {
    dom["diag-mode-kicker"].textContent = `⚡ VALIDAR BASES · ${materia.nombre.toUpperCase()}`;
  }
  if (dom["diag-exam-title"]) {
    dom["diag-exam-title"].textContent = `Adelantar a: ${unit.titulo}`;
  }
  if (dom["diag-footer-hint"]) {
    dom["diag-footer-hint"].innerHTML =
      `<i class="bi bi-shield-fill-check text-primary me-1"></i>Aprueba con <strong>&ge; 75%</strong> para desbloquear las unidades anteriores en verde y activar <strong>${escapeHtml(unit.titulo)}</strong>.`;
  }

  dom["diagnostic-quiz-panel"]?.classList.remove("d-none");
  dom["diagnostic-results-panel"]?.classList.add("d-none");

  updateGreetingUI();
  updateTopbar();
  showView("diagnostic");
  renderExamQuestion();
}

export async function startDiagnosticForStage(stageKey = state.etapa || "pre_u") {
  if (!(await ensureSkillsLoaded())) return;
  state.etapa = stageKey;
  const mat = getActiveMateria();
  if (mat) {
    await startPlacementExam(mat.id);
  }
}

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildSimulacroQuestionsForMateria(materia) {
  const skills = getMateriaSkills(materia);
  const bank = Array.isArray(materia?.preguntas_examen) ? materia.preguntas_examen : [];
  const candidates = [];
  const seenPrompts = new Set();

  bank.forEach((q, idx) => {
    const prompt = String(q.enunciado_latex || "").trim();
    if (!prompt || seenPrompts.has(prompt)) return;
    seenPrompts.add(prompt);
    const linkedSkill =
      skills.find((s) => s.id === q.skill_id) ||
      skills[Math.min(idx, Math.max(0, skills.length - 1))];
    candidates.push({
      id: q.id || `sim_bank_${materia.id}_${idx + 1}`,
      skill_id: q.skill_id || linkedSkill?.id || "",
      tema: q.tema || linkedSkill?.nombre || materia.nombre,
      area: q.area || linkedSkill?.area || materia.nombre,
      tiempo_segundos: SIMULACRO_DURATION_SECONDS,
      enunciado_latex: prompt,
      opciones: Array.isArray(q.opciones) ? q.opciones : [],
      respuesta_correcta: q.respuesta_correcta || "",
      explicacion_breve: q.explicacion_breve || "",
    });
  });

  skills.forEach((s) => {
    const p1 = s.paso1_concepto || {};
    const prompt = String(p1.enunciado_latex || p1.pregunta_latex || "").trim();
    if (!prompt || seenPrompts.has(prompt)) return;
    seenPrompts.add(prompt);
    candidates.push({
      id: `sim_p1_${s.id}`,
      skill_id: s.id,
      tema: s.nombre,
      area: s.area || materia.nombre,
      tiempo_segundos: SIMULACRO_DURATION_SECONDS,
      enunciado_latex: prompt,
      opciones: Array.isArray(p1.opciones) ? p1.opciones : [],
      respuesta_correcta: p1.respuesta_correcta || "",
      explicacion_breve: p1.explicacion || "",
    });
  });

  // Priorizar variedad de temas mezclando candidatos
  const picked = [];
  const usedSkills = new Set();
  const shuffled = shuffleArray(candidates);

  shuffled.forEach((q) => {
    if (picked.length >= 5) return;
    if (q.skill_id && !usedSkills.has(q.skill_id)) {
      usedSkills.add(q.skill_id);
      picked.push(q);
    }
  });

  shuffled.forEach((q) => {
    if (picked.length >= 5) return;
    if (!picked.some((item) => item.id === q.id)) {
      picked.push(q);
    }
  });

  return picked.slice(0, Math.min(5, Math.max(4, picked.length)));
}

export async function startSimulacroExam(materiaId = state.materia_activa) {
  if (!(await ensureSkillsLoaded())) return;

  const found =
    findMateriaById(materiaId) ||
    (() => {
      const active = getActiveMateria();
      return active ? { materia: active, stageKey: state.etapa || "pre_u" } : null;
    })();

  if (!found || !found.materia) return;

  const { materia, stageKey } = found;
  const questions = buildSimulacroQuestionsForMateria(materia);
  if (questions.length === 0) return;

  stopDiagnosticTimer();
  state.etapa = stageKey;
  state.materia_activa = materia.id;
  saveState();

  Object.assign(examSession, {
    mode: "simulacro",
    materia,
    stageKey,
    targetSkill: null,
    targetIdx: -1,
    evaluatedSkills: getMateriaSkills(materia),
    questions,
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: SIMULACRO_DURATION_SECONDS,
    totalSeconds: SIMULACRO_DURATION_SECONDS,
    isGlobalTimer: true,
  });

  if (dom["diag-mode-kicker"]) {
    dom["diag-mode-kicker"].textContent = `🏆 SIMULACRO DE PARCIAL · ${materia.codigo || materia.nombre.toUpperCase()}`;
  }
  if (dom["diag-exam-title"]) {
    dom["diag-exam-title"].textContent = `Simulacro de Parcial: ${materia.nombre}`;
  }
  if (dom["diag-footer-hint"]) {
    dom["diag-footer-hint"].innerHTML =
      `<i class="bi bi-trophy-fill text-warning me-1"></i>Nota mínima de aprobación: <strong>51 / 100</strong> (+100 XP al aprobar).`;
  }

  dom["diagnostic-quiz-panel"]?.classList.remove("d-none");
  dom["diagnostic-results-panel"]?.classList.add("d-none");

  updateGreetingUI();
  updateTopbar();
  showView("diagnostic");
  startGlobalSimulacroTimer(SIMULACRO_DURATION_SECONDS);
  renderExamQuestion();
}

function renderExamQuestion() {
  const questions = examSession.questions;
  const idx = examSession.currentIndex;
  const q = questions[idx];
  if (!q) return;

  examSession.selectedOption = null;
  examSession.confirmed = false;

  if (dom["diag-current-num"]) dom["diag-current-num"].textContent = String(idx + 1);
  if (dom["diag-total-num"]) dom["diag-total-num"].textContent = String(questions.length);
  if (dom["diag-area-badge"]) {
    dom["diag-area-badge"].textContent = q.tema || q.area || "General";
  }

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
        if (examSession.confirmed) return;
        examSession.selectedOption = optionText;
        Array.from(optionsContainer.children).forEach((el) => {
          el.classList.toggle("selected", el === btn);
        });
        if (dom["btn-diag-next"]) dom["btn-diag-next"].disabled = false;
      });

      optionsContainer.appendChild(btn);
    });

    renderMath(optionsContainer);
  }

  if (!examSession.isGlobalTimer) {
    startQuestionTimer(Number(q.tiempo_segundos) || 45);
  }
}

function renderDiagnosticDots() {
  const container = dom["diag-step-dots"];
  if (!container) return;
  container.innerHTML = "";

  examSession.questions.forEach((_q, i) => {
    const dot = document.createElement("span");
    dot.className = "diag-dot";
    const prevAnswer = examSession.answers[i];
    if (prevAnswer) {
      dot.classList.add(prevAnswer.isCorrect ? "is-correct" : "is-wrong");
    } else if (i === examSession.currentIndex) {
      dot.classList.add("is-current");
    }
    container.appendChild(dot);
  });
}

function startQuestionTimer(seconds) {
  stopDiagnosticTimer();
  examSession.isGlobalTimer = false;
  examSession.totalSeconds = seconds;
  examSession.secondsLeft = seconds;
  updateTimerUI();

  examSession.timerId = window.setInterval(() => {
    examSession.secondsLeft = Math.max(0, examSession.secondsLeft - 1);
    updateTimerUI();
    if (examSession.secondsLeft <= 0) {
      stopDiagnosticTimer();
      if (!examSession.confirmed) {
        evaluateCurrentExamQuestion(true);
      }
    }
  }, 1000);
}

function startGlobalSimulacroTimer(totalSeconds = SIMULACRO_DURATION_SECONDS) {
  stopDiagnosticTimer();
  examSession.isGlobalTimer = true;
  examSession.totalSeconds = totalSeconds;
  examSession.secondsLeft = totalSeconds;
  updateTimerUI();

  examSession.timerId = window.setInterval(() => {
    examSession.secondsLeft = Math.max(0, examSession.secondsLeft - 1);
    updateTimerUI();
    if (examSession.secondsLeft <= 0) {
      stopDiagnosticTimer();
      autoSubmitSimulacroOnTimeout();
    }
  }, 1000);
}

function formatCountdownClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function stopDiagnosticTimer() {
  if (examSession.timerId !== null) {
    window.clearInterval(examSession.timerId);
    examSession.timerId = null;
  }
}

function updateTimerUI() {
  const left = examSession.secondsLeft;
  const total = Math.max(1, examSession.totalSeconds);
  const pct = Math.max(0, Math.min(100, Math.round((left / total) * 100)));

  if (dom["diag-timer-text"]) {
    dom["diag-timer-text"].textContent = examSession.isGlobalTimer
      ? formatCountdownClock(left)
      : `${left}s`;
  }
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

export function handleDiagnosticNext() {
  if (!examSession.confirmed) {
    if (examSession.selectedOption === null) return;
    evaluateCurrentExamQuestion(false);
    return;
  }

  if (examSession.currentIndex + 1 < examSession.questions.length) {
    examSession.currentIndex += 1;
    renderExamQuestion();
  } else if (examSession.mode === "skip") {
    finishSkipExam();
  } else if (examSession.mode === "simulacro") {
    finishSimulacroExam(false);
  } else {
    finishPlacementExam();
  }
}

function evaluateCurrentExamQuestion(timedOut) {
  if (!examSession.isGlobalTimer) {
    stopDiagnosticTimer();
  }
  examSession.confirmed = true;

  const q = examSession.questions[examSession.currentIndex];
  const selected = timedOut ? null : examSession.selectedOption;
  const isCorrect = Boolean(selected && selected === q.respuesta_correcta);

  examSession.answers[examSession.currentIndex] = {
    id: q.id,
    skill_id: q.skill_id,
    tema: q.tema,
    area: q.area,
    isCorrect,
    timedOut,
  };

  if (isCorrect && examSession.mode !== "simulacro") {
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
        ? examSession.mode === "simulacro"
          ? "✅ ¡Correcto! "
          : "✅ ¡Correcto! (+15 XP) "
        : "❌ Respuesta incorrecta. ";
    feedbackBox.innerHTML = `<strong>${escapeHtml(prefix)}</strong>${escapeHtml(q.explicacion_breve || "")}`;
    renderMath(feedbackBox);
  }

  renderDiagnosticDots();

  if (dom["btn-diag-next"]) {
    const isLast = examSession.currentIndex + 1 >= examSession.questions.length;
    dom["btn-diag-next"].disabled = false;
    dom["btn-diag-next"].innerHTML = isLast
      ? 'Ver Resultados <i class="bi bi-award-fill ms-1"></i>'
      : 'Siguiente Pregunta <i class="bi bi-arrow-right ms-1"></i>';
  }
}

function computeUpdatedStageAreaScores() {
  const diagAreas = getDiagnosticAreasForStage(state.etapa);
  const stageSkills = getAllStageSkills(state.etapa);
  const prevScores = state.diagnostico_resultados?.areaScores || {};
  const areaScores = {};

  diagAreas.forEach((area) => {
    const areaSkills = stageSkills.filter((s) => s.area === area);
    const unlockedCount = areaSkills.filter(
      (s) => state.nodos_estado[s.id] === "unlocked"
    ).length;
    const unlockedPct =
      areaSkills.length > 0 ? Math.round((unlockedCount / areaSkills.length) * 100) : 0;
    areaScores[area] = Math.max(Number(prevScores[area] || 0), unlockedPct);
  });

  return { diagAreas, areaScores };
}

function finishPlacementExam() {
  stopDiagnosticTimer();

  const materia = examSession.materia || getActiveMateria();
  const skills = getMateriaSkills(materia);
  const totalCount = examSession.questions.length || 1;
  const correctCount = examSession.answers.filter((a) => a?.isCorrect).length;
  const overallPercent = Math.round((correctCount / totalCount) * 100);

  // Evalúa aciertos consecutivos desde el nodo 1 o porcentaje global logrado
  const skillPassMap = {};
  skills.forEach((s) => {
    const related = examSession.answers.filter((a) => a && a.skill_id === s.id);
    if (related.length > 0) {
      skillPassMap[s.id] = related.every((a) => a.isCorrect);
    }
  });

  let consecutiveUnlocked = 0;
  for (const s of skills) {
    if (skillPassMap[s.id]) {
      consecutiveUnlocked += 1;
    } else {
      break;
    }
  }

  const proportionalUnlocked =
    overallPercent >= 60 ? Math.floor((correctCount / totalCount) * skills.length) : 0;
  const unlockedCount =
    overallPercent === 100
      ? skills.length
      : Math.min(skills.length, Math.max(consecutiveUnlocked, proportionalUnlocked));

  skills.forEach((skill, idx) => {
    if (idx < unlockedCount) {
      state.nodos_estado[skill.id] = "unlocked";
      state.xp_otorgado_nodos[skill.id] = true;
      state.nodos_pasos[skill.id] = 3;
    } else if (idx === unlockedCount) {
      state.nodos_estado[skill.id] = "active";
      state.nodos_pasos[skill.id] = 0;
    } else {
      state.nodos_estado[skill.id] = "locked";
      state.nodos_pasos[skill.id] = 0;
    }
  });

  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }
  state.materias_iniciadas[materia.id] = true;
  state.diagnostico_completado = true;

  const bonusXp = unlockedCount * 25;
  state.xp += bonusXp;
  state.racha = Math.max(1, state.racha);

  const { diagAreas, areaScores } = computeUpdatedStageAreaScores();
  state.diagnostico_resultados = {
    overallPercent,
    areaScores,
    correctCount,
    totalCount,
  };

  saveState();
  updateTopbar();

  renderPlacementResults({
    materia,
    skills,
    unlockedCount,
    overallPercent,
    correctCount,
    totalCount,
    bonusXp,
    diagAreas,
    areaScores,
  });
}

function renderPlacementResults({
  materia,
  skills,
  unlockedCount,
  overallPercent,
  correctCount,
  totalCount,
  bonusXp,
  diagAreas,
  areaScores,
}) {
  dom["diagnostic-quiz-panel"]?.classList.add("d-none");
  dom["diagnostic-results-panel"]?.classList.remove("d-none");

  if (dom["diag-result-pill"]) {
    dom["diag-result-pill"].textContent = `🎯 UBICACIÓN COMPLETADA · ${materia.nombre.toUpperCase()}`;
  }
  if (dom["diag-result-title"]) {
    dom["diag-result-title"].textContent = `Tu Punto de Partida en ${materia.nombre}`;
  }
  if (dom["diag-overall-score"]) {
    dom["diag-overall-score"].textContent =
      `${overallPercent}% (${correctCount}/${totalCount} aciertos) · ${unlockedCount}/${skills.length} temas desbloqueados (+${bonusXp} XP)`;
  }
  if (dom["diag-breakdown-heading"]) {
    dom["diag-breakdown-heading"].textContent = `Estado de Nodos en ${materia.nombre}`;
  }

  dom["diag-radar-col"]?.classList.remove("d-none");

  const summaryEl = dom["diag-area-summary"];
  if (summaryEl) {
    summaryEl.innerHTML = "";
    skills.forEach((skill) => {
      const st = state.nodos_estado[skill.id];
      const badgeClass =
        st === "unlocked"
          ? "text-bg-success"
          : st === "active"
            ? "text-bg-warning"
            : "text-bg-secondary";
      const badgeLabel =
        st === "unlocked"
          ? "🟢 Dominado"
          : st === "active"
            ? "🟡 Activo ahora"
            : "🔒 Pendiente";

      const row = document.createElement("div");
      row.className = "area-score-row d-flex justify-content-between align-items-center";
      row.innerHTML = `
        <div>
          <div class="fw-bold small">#${escapeHtml(skill.ranking_criticidad)} ${escapeHtml(skill.nombre)}</div>
          <div class="text-secondary" style="font-size: 0.75rem;">${escapeHtml(skill.area || materia.nombre)}</div>
        </div>
        <span class="badge rounded-pill ${badgeClass}">${badgeLabel}</span>
      `;
      summaryEl.appendChild(row);
    });
  }

  if (dom["diag-recommendation-text"]) {
    const activeSkill = skills.find((s) => state.nodos_estado[s.id] === "active");
    if (!activeSkill) {
      dom["diag-recommendation-text"].innerHTML =
        `<strong>¡Dominio total!</strong> Desbloqueaste todos los nodos de <strong>${escapeHtml(materia.nombre)}</strong> en verde.`;
    } else if (unlockedCount > 0) {
      dom["diag-recommendation-text"].innerHTML =
        `<strong>¡Buen avance!</strong> Saltaste ${unlockedCount} tema(s) base y tu camino comienza directamente en <strong>#${escapeHtml(activeSkill.ranking_criticidad)} ${escapeHtml(activeSkill.nombre)}</strong>.`;
    } else {
      dom["diag-recommendation-text"].innerHTML =
        `<strong>Ruta paso a paso activada:</strong> Empezarás desde el <strong>Nodo #1 (${escapeHtml(activeSkill.nombre)})</strong> para construir una base sólida.`;
    }
  }

  if (dom["btn-go-to-path"]) {
    dom["btn-go-to-path"].innerHTML =
      `<i class="bi bi-signpost-split-fill me-2"></i>Ir al Camino de ${escapeHtml(materia.nombre)}`;
  }

  appContext.diagRadarChartInstance = renderRadarOnCanvas(
    dom["diagnostic-radar-chart"],
    appContext.diagRadarChartInstance,
    diagAreas,
    areaScores
  );
}

function finishSkipExam() {
  stopDiagnosticTimer();

  const materia = examSession.materia || getActiveMateria();
  const targetSkill = examSession.targetSkill;
  const targetUnit = examSession.targetUnit;
  const skills = getMateriaSkills(materia);
  const targetIdx =
    examSession.targetIdx >= 0
      ? examSession.targetIdx
      : skills.findIndex((s) => s.id === targetSkill?.id);

  const totalCount = examSession.questions.length || 1;
  const correctCount = examSession.answers.filter((a) => a?.isCorrect).length;
  const overallPercent = Math.round((correctCount / totalCount) * 100);
  const passed = overallPercent >= 75;

  if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
    state.materias_iniciadas = {};
  }
  state.materias_iniciadas[materia.id] = true;

  if (passed && targetIdx > 0 && targetSkill) {
    if (!state.nodos_pasos || typeof state.nodos_pasos !== "object") {
      state.nodos_pasos = {};
    }
    skills.forEach((s, idx) => {
      if (idx < targetIdx) {
        state.nodos_estado[s.id] = "unlocked";
        state.xp_otorgado_nodos[s.id] = true;
        state.nodos_pasos[s.id] = 3;
      } else if (idx === targetIdx) {
        if (state.nodos_estado[s.id] !== "unlocked") {
          state.nodos_estado[s.id] = "active";
          state.nodos_pasos[s.id] = 0;
        }
      }
    });
    state.xp += 60;
    state.racha += 1;
    state.diagnostico_completado = true;
    incrementMedallaCounter("salto_nivel", 1);
  }

  const { diagAreas, areaScores } = computeUpdatedStageAreaScores();
  state.diagnostico_resultados = {
    overallPercent,
    areaScores,
    correctCount,
    totalCount,
  };

  saveState();
  updateTopbar();

  renderSkipResults({
    passed,
    materia,
    targetSkill,
    targetUnit,
    overallPercent,
    correctCount,
    totalCount,
    diagAreas,
    areaScores,
  });
}

function autoSubmitSimulacroOnTimeout() {
  if (examSession.mode !== "simulacro") return;

  const currentIdx = examSession.currentIndex;
  const total = examSession.questions.length;
  for (let i = 0; i < total; i += 1) {
    if (!examSession.answers[i]) {
      const q = examSession.questions[i];
      const selected = i === currentIdx && !examSession.confirmed ? examSession.selectedOption : null;
      const isCorrect = Boolean(selected && q && selected === q.respuesta_correcta);
      examSession.answers[i] = {
        id: q?.id || `sim_${i}`,
        skill_id: q?.skill_id || "",
        tema: q?.tema || "General",
        area: q?.area || "General",
        isCorrect,
        timedOut: true,
      };
    }
  }
  finishSimulacroExam(true);
}

function finishSimulacroExam(timedOutGlobal = false) {
  stopDiagnosticTimer();
  examSession.isGlobalTimer = false;

  const materia = examSession.materia || getActiveMateria();
  const totalCount = examSession.questions.length || 1;
  const correctCount = examSession.answers.filter((a) => a?.isCorrect).length;
  const score100 = Math.round((correctCount / totalCount) * 100);
  const passed = score100 >= 51;

  if (!state.simulacros_mejor_nota || typeof state.simulacros_mejor_nota !== "object") {
    state.simulacros_mejor_nota = {};
  }
  const prevBest = Number(state.simulacros_mejor_nota[materia.id] || 0);
  state.simulacros_mejor_nota[materia.id] = Math.max(prevBest, score100);

  let xpAdded = 0;
  if (passed) {
    xpAdded = 100;
    state.xp += xpAdded;
    state.racha += 1;
    incrementMedallaCounter("simulacros_aprobados", 1);
  }

  const { diagAreas, areaScores } = computeUpdatedStageAreaScores();
  saveState();
  updateTopbar();

  renderSimulacroResults({
    passed,
    timedOutGlobal,
    materia,
    score100,
    correctCount,
    totalCount,
    xpAdded,
    diagAreas,
    areaScores,
  });

  if (passed) {
    launchConfetti();
  }
}

function renderSimulacroResults({
  passed,
  timedOutGlobal,
  materia,
  score100,
  correctCount,
  totalCount,
  xpAdded,
  diagAreas,
  areaScores,
}) {
  dom["diagnostic-quiz-panel"]?.classList.add("d-none");
  dom["diagnostic-results-panel"]?.classList.remove("d-none");

  if (dom["diag-result-pill"]) {
    dom["diag-result-pill"].textContent = passed
      ? `🏆 ¡SIMULACRO APROBADO! · ${materia.nombre.toUpperCase()}`
      : `📝 SIMULACRO FINALIZADO · ${materia.nombre.toUpperCase()}`;
  }
  if (dom["diag-result-title"]) {
    dom["diag-result-title"].textContent = passed
      ? "¡Simulacro Aprobado!"
      : "Sigue reforzando para tu parcial";
  }
  if (dom["diag-overall-score"]) {
    const timeNote = timedOutGlobal ? " (entrega automática por tiempo)" : "";
    const xpNote = passed ? ` · +${xpAdded} XP` : " · Mínimo aprobado: 51 / 100";
    dom["diag-overall-score"].textContent =
      `${score100} / 100 (${correctCount}/${totalCount} aciertos${xpNote})${timeNote}`;
  }
  if (dom["diag-breakdown-heading"]) {
    dom["diag-breakdown-heading"].textContent = "Temas del Simulacro";
  }

  dom["diag-radar-col"]?.classList.remove("d-none");

  const summaryEl = dom["diag-area-summary"];
  const passedTopics = [];
  const failedTopics = [];

  if (summaryEl) {
    summaryEl.innerHTML = "";
    examSession.answers.forEach((ans, idx) => {
      if (!ans) return;
      if (ans.isCorrect) {
        if (ans.tema && !passedTopics.includes(ans.tema)) passedTopics.push(ans.tema);
      } else if (ans.tema && !failedTopics.includes(ans.tema)) {
        failedTopics.push(ans.tema);
      }

      const row = document.createElement("div");
      row.className = "area-score-row d-flex justify-content-between align-items-center";
      row.innerHTML = `
        <div>
          <div class="fw-bold small">Pregunta #${idx + 1}: ${escapeHtml(ans.tema || materia.nombre)}</div>
          <div class="text-secondary" style="font-size: 0.75rem;">${
            ans.isCorrect ? "Tema acertado en el simulacro" : "Conviene repasar este nodo"
          }</div>
        </div>
        <span class="badge rounded-pill ${ans.isCorrect ? "text-bg-success" : "text-bg-danger"}">
          ${ans.isCorrect ? "✅ Acertado" : "❌ Repasar"}
        </span>
      `;
      summaryEl.appendChild(row);
    });
  }

  if (dom["diag-recommendation-text"]) {
    const acertadosTxt = passedTopics.length > 0 ? passedTopics.join(", ") : "ninguno aún";
    const repasarTxt = failedTopics.length > 0 ? failedTopics.join(", ") : "ninguno";

    if (passed) {
      dom["diag-recommendation-text"].innerHTML =
        `<strong>¡Listo para el parcial!</strong> Acertaste: <strong>${escapeHtml(acertadosTxt)}</strong>.${
          failedTopics.length > 0
            ? ` Repasa brevemente: <strong>${escapeHtml(repasarTxt)}</strong>.`
            : " Dominio sólido en todos los temas evaluados."
        }`;
    } else {
      dom["diag-recommendation-text"].innerHTML =
        `<strong>Nodos recomendados para reforzar:</strong> ${escapeHtml(repasarTxt)}.${
          passedTopics.length > 0
            ? ` Acertaste: <strong>${escapeHtml(acertadosTxt)}</strong>.`
            : ""
        }`;
    }
  }

  if (dom["btn-go-to-path"]) {
    dom["btn-go-to-path"].innerHTML =
      `<i class="bi bi-signpost-split-fill me-2"></i>Volver al Camino de ${escapeHtml(materia.nombre)}`;
  }

  appContext.diagRadarChartInstance = renderRadarOnCanvas(
    dom["diagnostic-radar-chart"],
    appContext.diagRadarChartInstance,
    diagAreas,
    areaScores
  );
}

function renderSkipResults({
  passed,
  materia,
  targetSkill,
  targetUnit = null,
  overallPercent,
  correctCount,
  totalCount,
  diagAreas,
  areaScores,
}) {
  dom["diagnostic-quiz-panel"]?.classList.add("d-none");
  dom["diagnostic-results-panel"]?.classList.remove("d-none");

  if (dom["diag-result-pill"]) {
    dom["diag-result-pill"].textContent = passed
      ? "⚡ ¡UNIDAD DESBLOQUEADA!"
      : "🔒 SALTO NO ALCANZADO (MÍNIMO 75%)";
  }
  if (dom["diag-result-title"]) {
    const destLabel = targetUnit
      ? targetUnit.titulo
      : `#${targetSkill?.ranking_criticidad} ${targetSkill?.nombre}`;
    dom["diag-result-title"].textContent = passed
      ? `¡Salto exitoso a ${destLabel}!`
      : `Aún debes reforzar bases previas antes de saltar`;
  }
  if (dom["diag-overall-score"]) {
    dom["diag-overall-score"].textContent = passed
      ? `${overallPercent}% (${correctCount}/${totalCount} aciertos · Bono +60 XP)`
      : `${overallPercent}% (${correctCount}/${totalCount} aciertos · Se requiere ≥ 75%)`;
  }
  if (dom["diag-breakdown-heading"]) {
    dom["diag-breakdown-heading"].textContent = "Bases y Temas Previos Evaluados";
  }

  dom["diag-radar-col"]?.classList.remove("d-none");

  const summaryEl = dom["diag-area-summary"];
  const failedTopics = [];
  if (summaryEl) {
    summaryEl.innerHTML = "";
    examSession.answers.forEach((ans, idx) => {
      if (!ans) return;
      if (!ans.isCorrect && ans.tema && !failedTopics.includes(ans.tema)) {
        failedTopics.push(ans.tema);
      }
      const row = document.createElement("div");
      row.className = "area-score-row d-flex justify-content-between align-items-center";
      row.innerHTML = `
        <div>
          <div class="fw-bold small">Pregunta #${idx + 1}: ${escapeHtml(ans.tema || materia.nombre)}</div>
          <div class="text-secondary" style="font-size: 0.75rem;">${
            ans.isCorrect ? "Concepto validado correctamente" : "Requiere repaso de este módulo"
          }</div>
        </div>
        <span class="badge rounded-pill ${ans.isCorrect ? "text-bg-success" : "text-bg-danger"}">
          ${ans.isCorrect ? "✅ Correcto" : "❌ Falló"}
        </span>
      `;
      summaryEl.appendChild(row);
    });
  }

  if (dom["diag-recommendation-text"]) {
    if (passed) {
      const destHtml = targetUnit
        ? `la unidad <strong>${escapeHtml(targetUnit.titulo)}</strong>`
        : `<strong>#${escapeHtml(targetSkill?.ranking_criticidad)} ${escapeHtml(targetSkill?.nombre)}</strong>`;
      dom["diag-recommendation-text"].innerHTML =
        `<strong>¡Bases validadas!</strong> Todos los nodos anteriores quedaron marcados en verde y ya puedes comenzar ${destHtml} desde su primer tema activo en amarillo.`;
    } else {
      const topicsText =
        failedTopics.length > 0 ? failedTopics.join(", ") : "los módulos anteriores";
      dom["diag-recommendation-text"].innerHTML =
        `<strong>Temas a reforzar:</strong> Repasa <strong>${escapeHtml(topicsText)}</strong> (o entra desde Práctica Libre bajo aviso) antes de volver a intentar validar bases.`;
    }
  }

  if (dom["btn-go-to-path"]) {
    dom["btn-go-to-path"].innerHTML = passed
      ? `<i class="bi bi-lightning-charge-fill me-2"></i>Continuar en #${escapeHtml(targetSkill?.ranking_criticidad)} ${escapeHtml(targetSkill?.nombre)}`
      : '<i class="bi bi-arrow-left-circle-fill me-2"></i>Volver al Camino';
  }

  appContext.diagRadarChartInstance = renderRadarOnCanvas(
    dom["diagnostic-radar-chart"],
    appContext.diagRadarChartInstance,
    diagAreas,
    areaScores
  );
}

export function renderRadarOnCanvas(
  canvas,
  previousInstance,
  labels,
  scoreMap,
  options = {}
) {
  if (!canvas || typeof window.Chart !== "function") return null;
  if (previousInstance && typeof previousInstance.destroy === "function") {
    previousInstance.destroy();
  }
  const existingChart = window.Chart.getChart?.(canvas);
  if (existingChart && existingChart !== previousInstance) {
    existingChart.destroy();
  }

  const values = labels.map((label) => Number(scoreMap[label] || 0));
  const fullLabels =
    options && options.fullLabels && typeof options.fullLabels === "object"
      ? options.fullLabels
      : null;
  const labelFontSize = labels.length >= 8 ? 10 : 11;

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
            font: { size: 10, weight: "600" },
          },
          grid: { color: "#cbd5e1" },
          angleLines: { color: "#cbd5e1" },
          pointLabels: {
            color: "#0f172a",
            padding: 6,
            font: { family: "Nunito, sans-serif", size: labelFontSize, weight: "800" },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items?.[0]?.label || "";
              return fullLabels && fullLabels[raw] ? fullLabels[raw] : raw;
            },
            label: (ctx) => ` ${ctx.parsed.r}% de progreso real`,
          },
        },
      },
    },
  });
}

export function handleResetDiagnostic() {
  const activeMat = getActiveMateria();
  if (activeMat) {
    startPlacementExam(activeMat.id);
  }
}

export function handleFullProgressReset() {
  const confirmed = window.confirm(
    "¿Reiniciar todo tu progreso académico en todas las materias? Se limpiará tu avance actual."
  );
  if (!confirmed) return false;

  stopDiagnosticTimer();
  if (appContext.diagRadarChartInstance) {
    appContext.diagRadarChartInstance.destroy();
    appContext.diagRadarChartInstance = null;
  }
  if (appContext.skillsRadarChartInstance) {
    appContext.skillsRadarChartInstance.destroy();
    appContext.skillsRadarChartInstance = null;
  }

  if (appContext.currentUser) {
    const wasTester = Boolean(
      state.is_tester || appContext.currentUser.username === "tester"
    );
    const preservedName = appContext.currentUser.nombre || state.nombre || "";
    const preservedStage = state.etapa || appContext.currentUser.etapa || "pre_u";
    resetState(preservedName);
    state.etapa = preservedStage;
    state.is_tester = wasTester;
    saveState();
    updateGreetingUI();
    updateTopbar();
    return true;
  }

  resetState("");
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // Ignora fallo de limpieza
  }

  updateGreetingUI();
  updateTopbar();
  showView("stage-selector");
  return false;
}
