/**
 * Flujo del Examen Diagnóstico, calibración multi-materia y gráfico Radar Chart.js.
 */

import { fetchSkillsDB } from "./api.js";
import {
  OPTION_LETTERS,
  STORAGE_KEY,
  appContext,
  dom,
  escapeHtml,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  renderMath,
  renderSkillsLoadError,
  resetState,
  saveState,
  showView,
  state,
  updateGreetingUI,
  updateTopbar,
  updateWelcomeResumeBanner,
} from "./state.js";

const diagSession = {
  questions: [],
  currentIndex: 0,
  selectedOption: null,
  confirmed: false,
  answers: [],
  timerId: null,
  secondsLeft: 0,
  totalSeconds: 45,
};

export async function startDiagnosticForStage(stageKey) {
  if (!appContext.skillsDB) {
    try {
      appContext.skillsDB = await fetchSkillsDB();
      appContext.skillsLoadFailed = false;
    } catch (error) {
      console.error(error);
      renderSkillsLoadError(error.message);
      return;
    }
  }

  const route = appContext.skillsDB[stageKey];
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

  Object.assign(diagSession, {
    questions: route.diagnostico,
    currentIndex: 0,
    selectedOption: null,
    confirmed: false,
    answers: [],
    timerId: null,
    secondsLeft: 0,
    totalSeconds: 45,
  });

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

export function stopDiagnosticTimer() {
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

export function handleDiagnosticNext() {
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

  appContext.diagRadarChartInstance = renderRadarOnCanvas(
    dom["diagnostic-radar-chart"],
    appContext.diagRadarChartInstance,
    diagAreas,
    results.areaScores
  );
}

export function renderRadarOnCanvas(canvas, previousInstance, labels, scoreMap) {
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

export function handleResetDiagnostic() {
  const confirmed = window.confirm(
    "¿Reiniciar todo tu progreso y diagnóstico? Se limpiará tu avance guardado en este navegador."
  );
  if (!confirmed) return;

  stopDiagnosticTimer();
  if (appContext.diagRadarChartInstance) {
    appContext.diagRadarChartInstance.destroy();
    appContext.diagRadarChartInstance = null;
  }
  if (appContext.skillsRadarChartInstance) {
    appContext.skillsRadarChartInstance.destroy();
    appContext.skillsRadarChartInstance = null;
  }

  resetState("");
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
