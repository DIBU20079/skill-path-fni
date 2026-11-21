/**
 * Renderizado de Camino vertical (con Inicio de Materia y "⚡ Saltar aquí"),
 * Catálogo Multi-Materia, Mis Skills (Radar/Medallas) y Baúl de Errores.
 */

import { renderRadarOnCanvas } from "./diagnostic.js";
import {
  appContext,
  calcularPreparacionExamen,
  dom,
  ensureConsistentNodeStatesForStage,
  escapeHtml,
  getActiveMateria,
  getActiveMateriaSkills,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  isMateriaIniciada,
  obtenerFallosRepetitivos,
  obtenerMedallas,
  obtenerRangoFNI,
  saveState,
  state,
} from "./state.js";

let openNodeHandler = () => {};
let enterSectionHandler = () => {};
let skipToNodeHandler = () => {};
let startSimulacroHandler = () => {};
let overcomeErrorHandler = () => {};

export function configureSkilltreeHandlers({
  onOpenNode,
  onEnterSection,
  onSkipToNode,
  onStartSimulacro,
  onOvercomeError,
} = {}) {
  if (typeof onOpenNode === "function") openNodeHandler = onOpenNode;
  if (typeof onEnterSection === "function") enterSectionHandler = onEnterSection;
  if (typeof onSkipToNode === "function") skipToNodeHandler = onSkipToNode;
  if (typeof onStartSimulacro === "function") startSimulacroHandler = onStartSimulacro;
  if (typeof onOvercomeError === "function") overcomeErrorHandler = onOvercomeError;
}

/* ========================================================================
   Sección A: Camino (Tarjeta de Inicio de Materia + Árbol Vertical)
   ======================================================================== */

function renderSubjectOnboardingCard(materia, skills) {
  if (dom["onboarding-subject-code"]) {
    dom["onboarding-subject-code"].textContent =
      `${materia.codigo || "FNI"} · ${skills.length} TEMAS CRÍTICOS`;
  }
  if (dom["onboarding-subject-title"]) {
    dom["onboarding-subject-title"].textContent = materia.nombre;
  }
  if (dom["onboarding-subject-desc"]) {
    dom["onboarding-subject-desc"].textContent =
      materia.descripcion ||
      "Elige si deseas comenzar desde el Nodo #1 o realizar un Examen de Ubicación para desbloquear lo que ya sabes.";
  }
  if (dom["onboarding-subject-icon"]) {
    const colorClass =
      materia.color === "green" ? "subject-icon-green" : "subject-icon-blue";
    dom["onboarding-subject-icon"].className =
      `subject-icon-box ${colorClass} mx-auto mb-3`;
    dom["onboarding-subject-icon"].innerHTML =
      `<i class="bi ${escapeHtml(materia.icono || "bi-book-fill")}"></i>`;
  }
  if (dom["onboarding-topics-preview"]) {
    dom["onboarding-topics-preview"].innerHTML = skills
      .map(
        (s) =>
          `<span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">#${escapeHtml(s.ranking_criticidad)} ${escapeHtml(s.nombre)}</span>`
      )
      .join("");
  }
}

export function renderCaminoSection() {
  const materia = getActiveMateria();
  const skills = getMateriaSkills(materia);
  const container = dom["duolingo-path-container"];
  if (!materia || !container) return;

  const initiated = isMateriaIniciada(materia.id);
  dom["subject-onboarding-card"]?.classList.toggle("d-none", initiated);
  dom["camino-main-row"]?.classList.toggle("d-none", !initiated);

  if (!initiated) {
    renderSubjectOnboardingCard(materia, skills);
    return;
  }

  ensureConsistentNodeStatesForStage(state.etapa);

  if (dom["path-route-title"]) {
    dom["path-route-title"].textContent = `${materia.nombre} (${materia.codigo || ""})`;
  }
  if (dom["path-route-desc"]) {
    dom["path-route-desc"].textContent =
      materia.descripcion ||
      "Supera los 3 pasos de cada nodo o usa '⚡ Saltar aquí' para adelantar niveles.";
  }
  if (dom["ranking-materia-code"]) {
    dom["ranking-materia-code"].textContent = materia.codigo || materia.nombre;
  }

  const readinessPct = calcularPreparacionExamen(materia, state);
  if (dom["path-readiness-badge"]) {
    dom["path-readiness-badge"].textContent = `Preparación para Examen: ${readinessPct}%`;
  }
  if (dom["path-readiness-bar"]) {
    dom["path-readiness-bar"].style.width = `${readinessPct}%`;
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
      btn.addEventListener("click", () => openNodeHandler(skill.id));
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

    // Nodos bloqueados a partir del Nodo 3 (idx >= 2) ofrecen "⚡ Saltar aquí"
    if (status === "locked" && idx >= 2) {
      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "btn btn-duo btn-duo-amber btn-skip-level mt-2";
      skipBtn.textContent = "⚡ Saltar aquí";
      skipBtn.setAttribute(
        "aria-label",
        `Hacer examen de salto de nivel hacia ${skill.nombre}`
      );
      skipBtn.addEventListener("click", () => skipToNodeHandler(skill.id));
      labelCard.appendChild(skipBtn);
    }

    wrapper.appendChild(labelCard);
    container.appendChild(wrapper);
  });

  renderSimulacroPathNode(container, materia, skills);
  renderCriticalRanking(skills);
}

function renderSimulacroPathNode(container, materia, skills) {
  if (!container || !materia || !skills.length) return;

  const total = skills.length;
  const unlockedCount = skills.filter((s) => state.nodos_estado[s.id] === "unlocked").length;
  const requiredCount = Math.ceil(total * 0.6);
  const unlocked = unlockedCount >= requiredCount;
  const missing = Math.max(0, requiredCount - unlockedCount);
  const bestScore = state.simulacros_mejor_nota?.[materia.id];

  const wrapper = document.createElement("div");
  wrapper.className = "path-node-wrapper path-node-simulacro";

  const connector = document.createElement("div");
  connector.className = `path-connector${unlocked ? " is-completed" : ""}`;
  wrapper.appendChild(connector);

  const ring = document.createElement("div");
  ring.className = "path-node-ring";

  if (unlocked) {
    const floatTag = document.createElement("span");
    floatTag.className = "node-floating-tag is-simulacro";
    floatTag.textContent =
      typeof bestScore === "number" ? `MEJOR: ${bestScore}/100` : "¡DESAFÍO FINAL!";
    ring.appendChild(floatTag);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `path-node-btn ${unlocked ? "node-simulacro" : "node-locked"}`;
  btn.disabled = !unlocked;
  btn.setAttribute(
    "aria-label",
    unlocked
      ? `Iniciar Simulacro de Parcial de ${materia.nombre}`
      : `Simulacro bloqueado: faltan ${missing} temas`
  );
  btn.innerHTML = unlocked
    ? '<i class="bi bi-trophy-fill"></i><span class="node-rank-badge">FINAL</span>'
    : '<i class="bi bi-lock-fill"></i><span class="node-rank-badge">60%</span>';

  if (unlocked) {
    btn.addEventListener("click", () => startSimulacroHandler(materia.id));
  }

  ring.appendChild(btn);
  wrapper.appendChild(ring);

  const labelCard = document.createElement("div");
  labelCard.className = `node-label-card${unlocked ? " node-label-simulacro" : ""}`;
  labelCard.innerHTML = `
    <div class="node-label-title">🏆 Simulacro de Parcial</div>
    <div class="node-label-meta">${
      unlocked
        ? `4-5 preguntas · 05:00 min · Apruebas con ≥ 51/100 (+100 XP)${
            typeof bestScore === "number" ? ` · Mejor nota: ${bestScore}/100` : ""
          }`
        : `Bloqueado · Te ${missing === 1 ? "falta 1 tema" : `faltan ${missing} temas`} en verde (≥ 60%)`
    }</div>
  `;

  if (unlocked) {
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn btn-duo btn-duo-amber btn-skip-level mt-2";
    startBtn.textContent = "🏆 Iniciar Simulacro (+100 XP)";
    startBtn.addEventListener("click", () => startSimulacroHandler(materia.id));
    labelCard.appendChild(startBtn);
  }

  wrapper.appendChild(labelCard);
  container.appendChild(wrapper);
}

export function renderCriticalRanking(skills = getActiveMateriaSkills()) {
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
      blocker: '<span class="badge rounded-pill text-bg-danger">Refuerzo</span>',
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

/* ========================================================================
   Sección B: Materias (Catálogo Estructurado por Etapa)
   ======================================================================== */

export function renderMateriasSection() {
  const container = dom["subjects-catalog-container"];
  if (!container || !appContext.skillsDB) return;

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
      const initiated = isMateriaIniciada(mat.id);
      const isCurrentActive =
        initiated && state.etapa === key && state.materia_activa === mat.id;

      const col = document.createElement("div");
      col.className = "col-12 col-md-6";

      const card = document.createElement("article");
      card.className = `duo-card subject-catalog-card p-4 h-100 d-flex flex-column${isCurrentActive ? " is-active-subject" : ""}`;

      const iconColorClass =
        mat.color === "green" ? "subject-icon-green" : "subject-icon-blue";

      const topicsHtml = skills
        .map((skill) => {
          const st = initiated ? state.nodos_estado[skill.id] || "locked" : "locked";
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

      const statusBadgeHtml = isCurrentActive
        ? '<span class="badge rounded-pill text-bg-primary">En curso</span>'
        : initiated
          ? '<span class="badge rounded-pill text-bg-success">Iniciada</span>'
          : '<span class="badge rounded-pill text-bg-light border text-secondary">Nueva</span>';

      const btnLabel = initiated ? "Ir al Camino" : "Comenzar Materia";
      const btnIcon = initiated ? "bi-map-fill" : "bi-rocket-takeoff-fill";

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
          ${statusBadgeHtml}
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
          <button type="button" class="btn btn-duo ${initiated ? "btn-duo-green" : "btn-duo-blue"} w-100 btn-go-subject-path">
            <i class="bi ${btnIcon} me-2"></i>${btnLabel}
          </button>
        </div>
      `;

      card.querySelector(".btn-go-subject-path")?.addEventListener("click", () => {
        state.etapa = key;
        state.materia_activa = mat.id;
        if (initiated) {
          ensureConsistentNodeStatesForStage(key);
        }
        saveState();
        enterSectionHandler("camino");
      });

      col.appendChild(card);
      row.appendChild(col);
    });

    groupDiv.appendChild(row);
    container.appendChild(groupDiv);
  });
}

/* ========================================================================
   Sección C: Mis Skills (Radar, Bronce/Plata/Oro y Baúl de Errores)
   ======================================================================== */

export function getAreaMasteryScores() {
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

export function renderRankCard(prefix) {
  const rank = obtenerRangoFNI(state.xp);
  const levelEl = dom[`${prefix}-rank-level`];
  const titleEl = dom[`${prefix}-rank-title`];
  const xpEl = dom[`${prefix}-rank-xp`];
  const nextEl = dom[`${prefix}-rank-next-label`];
  const barEl = dom[`${prefix}-rank-bar`];

  if (levelEl) levelEl.textContent = `Nivel ${rank.nivel}`;
  if (titleEl) titleEl.textContent = rank.titulo;
  if (xpEl) xpEl.textContent = `⚡ ${rank.xpActual} XP`;
  if (nextEl) {
    if (rank.xpSiguiente !== null) {
      const remaining = Math.max(0, rank.xpSiguiente - rank.xpActual);
      nextEl.textContent = `Faltan ${remaining} XP para el siguiente rango (${rank.xpSiguiente} XP)`;
    } else {
      nextEl.textContent = "¡Rango máximo de Auxiliar alcanzado!";
    }
  }
  if (barEl) {
    barEl.style.width = `${rank.progresoPct}%`;
  }
}

export function renderMedalsGrid(containerEl, countEl) {
  if (!containerEl) return;
  const medals = obtenerMedallas(state);
  const unlockedTotal = medals.filter((m) => m.desbloqueada).length;

  if (countEl) {
    countEl.textContent = `${unlockedTotal}/${medals.length}`;
  }

  containerEl.innerHTML = "";
  medals.forEach((medal) => {
    const tile = document.createElement("div");
    tile.className = `medal-tile ${medal.desbloqueada ? "is-unlocked" : "is-locked"}`;
    tile.title = medal.descripcion;
    tile.innerHTML = `
      <span class="medal-tile-icon" aria-hidden="true">${escapeHtml(medal.icono)}</span>
      <div class="medal-tile-info">
        <div class="medal-tile-name">${escapeHtml(medal.nombre)}</div>
        <div class="medal-tile-desc">${escapeHtml(medal.descripcion)}</div>
      </div>
    `;
    containerEl.appendChild(tile);
  });
}

function renderPreExamWarnings() {
  const emptyEl = dom["pre-exam-warnings-empty"];
  const listEl = dom["pre-exam-warnings-list"];
  if (!listEl) return;

  const topWarnings = obtenerFallosRepetitivos(state);
  if (topWarnings.length === 0) {
    emptyEl?.classList.remove("d-none");
    listEl.classList.add("d-none");
    listEl.innerHTML = "";
    return;
  }

  emptyEl?.classList.add("d-none");
  listEl.classList.remove("d-none");
  listEl.innerHTML = "";

  topWarnings.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "pre-exam-warning-item";
    const tipoLabel =
      item.tipo_error === "fallo_prerrequisito" ? "Base previa" : "Error operativo";
    row.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div class="fw-bold text-dark small">
          ${idx + 1}. ${escapeHtml(item.tema)}: <span class="text-danger-emphasis">${escapeHtml(item.resumen)}</span>
        </div>
        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          <span class="badge rounded-pill text-bg-light border text-secondary">${escapeHtml(tipoLabel)}</span>
          <span class="badge rounded-pill text-bg-warning text-dark">${item.count}×</span>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

export function renderSkillsSection() {
  const { areas, scores } = getAreaMasteryScores();
  const activeMat = getActiveMateria();
  const readinessPct = calcularPreparacionExamen(activeMat, state);

  renderRankCard("skills");
  renderMedalsGrid(dom["skills-medals-grid"], dom["skills-medals-unlocked-count"]);

  if (dom["skills-readiness-subject"]) {
    dom["skills-readiness-subject"].textContent = activeMat
      ? `Preparación para Examen (${activeMat.nombre})`
      : "Preparación para Examen";
  }
  if (dom["skills-readiness-pct"]) {
    dom["skills-readiness-pct"].textContent = `${readinessPct}%`;
  }
  if (dom["skills-readiness-bar"]) {
    dom["skills-readiness-bar"].style.width = `${readinessPct}%`;
  }

  renderPreExamWarnings();

  appContext.skillsRadarChartInstance = renderRadarOnCanvas(
    dom["skills-radar-chart"],
    appContext.skillsRadarChartInstance,
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

  renderErrorVault();
}

export function renderErrorVault() {
  const listEl = dom["error-vault-list"];
  const countEl = dom["error-vault-count"];
  const emptyEl = dom["error-vault-empty"];
  const clearBtn = dom["btn-clear-vault"];

  const history = Array.isArray(state.historial_errores)
    ? state.historial_errores
    : [];
  const pendingCount = history.filter((item) => !item?.superado).length;

  if (countEl) {
    countEl.textContent = pendingCount > 0 ? `${pendingCount} pend.` : String(history.length);
  }
  emptyEl?.classList.toggle("d-none", history.length > 0);
  clearBtn?.classList.toggle("d-none", history.length === 0);

  if (!listEl) return;
  listEl.innerHTML = "";

  [...history].reverse().forEach((entry) => {
    const isResolved = Boolean(entry && entry.superado);
    const resumen = typeof entry === "string" ? entry : entry.resumen || "";
    const tema = typeof entry === "object" && entry ? entry.tema : "";
    const fecha = typeof entry === "object" && entry ? entry.fecha : "";

    const li = document.createElement("li");
    li.className = `vault-item${isResolved ? " vault-item-resolved" : ""}`;

    const statusBadge = isResolved
      ? '<span class="badge rounded-pill text-bg-success flex-shrink-0">✅ Superado</span>'
      : '<span class="badge rounded-pill text-bg-warning text-dark flex-shrink-0">Pendiente</span>';

    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="fw-bold ${isResolved ? "text-success-emphasis" : "text-danger-emphasis"}">${escapeHtml(resumen)}</div>
        ${statusBadge}
      </div>
      ${
        tema || fecha
          ? `<div class="text-secondary mt-1" style="font-size: 0.75rem;">${escapeHtml(tema)}${tema && fecha ? " · " : ""}${escapeHtml(fecha)}</div>`
          : ""
      }
    `;

    if (!isResolved && typeof entry === "object" && entry) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "mt-2";
      const fixBtn = document.createElement("button");
      fixBtn.type = "button";
      fixBtn.className = "btn btn-duo btn-duo-amber btn-sm btn-overcome-error";
      fixBtn.textContent = "🔁 Superar este error";
      fixBtn.addEventListener("click", () => overcomeErrorHandler(entry));
      actionWrap.appendChild(fixBtn);
      li.appendChild(actionWrap);
    }

    listEl.appendChild(li);
  });
}
