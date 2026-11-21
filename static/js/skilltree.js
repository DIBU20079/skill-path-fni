/**
 * Renderizado de Camino vertical (con Inicio de Materia, "⚡ Saltar aquí" y Temas Críticos clicables),
 * Catálogo Multi-Materia, Mis Skills (Analítica 100% por Materia) y Avance Global para Perfil.
 */

import { renderRadarOnCanvas } from "./diagnostic.js";
import {
  appContext,
  calcularDominioMateria,
  calcularPreparacionExamen,
  dom,
  ensureConsistentNodeStatesForStage,
  errorMatchesMateria,
  escapeHtml,
  findSkillGlobal,
  getActiveMateria,
  getActiveMateriaSkills,
  getMateriaSkills,
  getShortSkillLabel,
  getStageMaterias,
  isMateriaIniciada,
  obtenerFallosRepetitivos,
  obtenerMedallas,
  obtenerMetricasIAMateria,
  obtenerPrioridadTema,
  obtenerProgresoNodo,
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

export function scrollToPathNode(skillId) {
  const container = dom["duolingo-path-container"];
  if (!skillId || !container) return false;

  const wrapper = Array.from(container.querySelectorAll("[data-skill-id]")).find(
    (el) => el.dataset.skillId === skillId
  );
  if (!wrapper) return false;

  wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
  const labelCard = wrapper.querySelector(".node-label-card");
  if (labelCard) {
    labelCard.classList.remove("is-highlighted");
    void labelCard.offsetWidth;
    labelCard.classList.add("is-highlighted");
    window.setTimeout(() => labelCard.classList.remove("is-highlighted"), 1800);
  }
  return true;
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

  // Agrupar temas secuencialmente por Unidad manteniendo su índice global
  const unitGroups = [];
  const groupByName = new Map();
  skills.forEach((skill, globalIdx) => {
    const unitTitle = String(skill.unidad || "Unidad 1: Fundamentos").trim();
    if (!groupByName.has(unitTitle)) {
      const group = { title: unitTitle, entries: [] };
      groupByName.set(unitTitle, group);
      unitGroups.push(group);
    }
    groupByName.get(unitTitle).entries.push({ skill, globalIdx });
  });

  unitGroups.forEach((group, groupIdx) => {
    const totalInUnit = group.entries.length;
    const doneInUnit = group.entries.filter(
      ({ skill }) => state.nodos_estado[skill.id] === "unlocked"
    ).length;
    const unitPct =
      totalInUnit > 0 ? Math.round((doneInUnit / totalInUnit) * 100) : 0;

    const unitBanner = document.createElement("div");
    unitBanner.className = `unit-divider-banner unit-theme-${groupIdx % 4}`;
    unitBanner.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div class="unit-divider-title">${escapeHtml(group.title)}</div>
        <span class="unit-progress-pill">${doneInUnit}/${totalInUnit} dominados</span>
      </div>
      <div class="unit-divider-track mt-2" aria-hidden="true">
        <div class="unit-divider-fill" style="width: ${unitPct}%;"></div>
      </div>
    `;
    container.appendChild(unitBanner);

    const nodesGroup = document.createElement("div");
    nodesGroup.className = "unit-nodes-group";

    group.entries.forEach(({ skill, globalIdx }, idxInUnit) => {
      const prog = obtenerProgresoNodo(skill.id, state);
      const priority = obtenerPrioridadTema(skill);
      const status = prog.status;

      const wrapper = document.createElement("div");
      wrapper.className = "path-node-wrapper";
      wrapper.dataset.skillId = skill.id;

      if (idxInUnit > 0) {
        const prevSkill = group.entries[idxInUnit - 1].skill;
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
        `Tema #${skill.ranking_criticidad}: ${skill.nombre} (${prog.badgeText})`
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
          : status === "locked"
            ? ["", "", ""]
            : [
                prog.steps >= 1 ? "done" : "current",
                prog.steps >= 2 ? "done" : prog.steps === 1 ? "current" : "",
                prog.steps === 2 ? "current" : "",
              ];

      labelCard.innerHTML = `
        <div class="node-label-title">#${escapeHtml(skill.ranking_criticidad)} · ${escapeHtml(skill.nombre)}</div>
        <div class="node-label-meta">${escapeHtml(priority.label)} · +${escapeHtml(skill.xp)} XP</div>
        <div class="node-substeps-dots" aria-hidden="true">
          <span class="substep-dot ${dotStates[0]}"></span>
          <span class="substep-dot ${dotStates[1]}"></span>
          <span class="substep-dot ${dotStates[2]}"></span>
        </div>
      `;

      // Nodos bloqueados a partir del Nodo 3 de la materia (globalIdx >= 2) ofrecen "⚡ Saltar aquí"
      if (status === "locked" && globalIdx >= 2) {
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
      nodesGroup.appendChild(wrapper);
    });

    container.appendChild(nodesGroup);
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
    const prog = obtenerProgresoNodo(skill.id, state);
    const priority = obtenerPrioridadTema(skill);
    const isBlocker = prog.status === "blocker";
    const isActive = prog.status === "active";
    const isUnlocked = prog.status === "unlocked";

    const item = document.createElement("button");
    item.type = "button";
    item.className = `ranking-item-btn w-100 text-start${isBlocker ? " is-priority" : ""}`;
    item.setAttribute(
      "aria-label",
      isActive || isBlocker
        ? `Practicar tema #${skill.ranking_criticidad} ${skill.nombre} (${prog.label})`
        : `Ubicar nodo #${skill.ranking_criticidad} ${skill.nombre} en el Camino (${prog.label})`
    );

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="small fw-bold text-dark">
          #${escapeHtml(skill.ranking_criticidad)} ${escapeHtml(skill.nombre)}
        </div>
        <span class="badge rounded-pill ${prog.badgeClass} flex-shrink-0">${escapeHtml(prog.badgeText)}</span>
      </div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-1 mt-1">
        <span class="priority-pill ${priority.badgeClass}">${escapeHtml(priority.label)}</span>
        <span class="fw-bold" style="font-size: 0.76rem; color: ${
          isBlocker ? "#b91c1c" : isUnlocked ? "#3f6212" : "#475569"
        };">${escapeHtml(prog.label)}</span>
      </div>
      <div class="ranking-progress-bar" aria-hidden="true">
        <div class="ranking-progress-fill ${prog.barClass}" style="width: ${prog.barWidth}%;"></div>
      </div>
    `;

    item.addEventListener("click", () => {
      if (isActive || isBlocker) {
        openNodeHandler(skill.id);
      } else {
        scrollToPathNode(skill.id);
      }
    });

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
      const pct = calcularDominioMateria(mat, state);
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
          const priority = obtenerPrioridadTema(skill);
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
              <span class="priority-pill ${priority.badgeClass}">
                ${escapeHtml(priority.label)}
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
        appContext.skillsSelectedMateriaId = mat.id;
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
   Helpers de Rango, Medallas y Avance Global (Exclusivos de Perfil)
   ======================================================================== */

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
    const stateTag = medal.desbloqueada
      ? '<span class="badge rounded-pill text-bg-success mt-1" style="font-size: 0.65rem;">✅ Desbloqueada</span>'
      : '<span class="badge rounded-pill text-bg-light border text-secondary mt-1" style="font-size: 0.65rem;">🔒 Por desbloquear</span>';
    tile.innerHTML = `
      <span class="medal-tile-icon" aria-hidden="true">${escapeHtml(medal.icono)}</span>
      <div class="medal-tile-info">
        <div class="medal-tile-name">${escapeHtml(medal.nombre)}</div>
        <div class="medal-tile-desc">${escapeHtml(medal.descripcion)}</div>
        ${stateTag}
      </div>
    `;
    containerEl.appendChild(tile);
  });
}

export function renderGlobalSubjectsProgress(containerEl, badgeEl) {
  if (!containerEl || !appContext.skillsDB) return;

  const orderedStages =
    state.etapa === "pre_u"
      ? [
          { key: "pre_u", label: "Pre-U" },
          { key: "facultad", label: "Facultad" },
        ]
      : [
          { key: "facultad", label: "Facultad" },
          { key: "pre_u", label: "Pre-U" },
        ];

  const entries = [];
  orderedStages.forEach(({ key, label }) => {
    getStageMaterias(key).forEach((mat) => {
      const skills = getMateriaSkills(mat);
      const done = skills.filter((s) => state.nodos_estado[s.id] === "unlocked").length;
      const pct = calcularDominioMateria(mat, state);
      entries.push({ mat, stageKey: key, stageLabel: label, done, total: skills.length, pct });
    });
  });

  if (badgeEl) {
    const totalSkills = entries.reduce((acc, e) => acc + e.total, 0);
    const totalDone = entries.reduce((acc, e) => acc + e.done, 0);
    const avgPct =
      entries.length > 0
        ? Math.round(entries.reduce((acc, e) => acc + e.pct, 0) / entries.length)
        : 0;
    badgeEl.textContent = `${avgPct}% promedio · ${totalDone}/${totalSkills} temas`;
  }

  containerEl.innerHTML = "";
  entries.forEach(({ mat, stageLabel, done, total, pct }) => {
    const row = document.createElement("div");
    row.className = "profile-subject-row";
    const fillStyle =
      pct >= 75 ? "" : pct > 0 ? "background: linear-gradient(90deg, #1cb0f6 0%, #58cc02 100%);" : "";
    row.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
        <div class="d-flex align-items-center gap-2" style="min-width: 0;">
          <i class="bi ${escapeHtml(mat.icono || "bi-book-fill")} text-primary"></i>
          <span class="fw-bold small text-dark">${escapeHtml(mat.nombre)}</span>
          <span class="badge rounded-pill text-bg-light border text-secondary" style="font-size: 0.7rem;">${escapeHtml(stageLabel)}</span>
        </div>
        <div class="small fw-bold ${pct > 0 ? "text-success" : "text-secondary"}">
          ${done}/${total} temas · ${pct}%
        </div>
      </div>
      <div class="duo-progress-track duo-progress-track-slim">
        <div class="duo-progress-fill" style="width: ${pct}%; ${fillStyle}"></div>
      </div>
    `;
    containerEl.appendChild(row);
  });
}

/* ========================================================================
   Sección C: Mis Skills (Analítica 100% Específica por Materia)
   ======================================================================== */

export function getSkillsSelectedMateria() {
  const materias = getStageMaterias(state.etapa);
  if (materias.length === 0) return null;

  if (appContext.skillsSelectedMateriaId) {
    const found = materias.find((m) => m.id === appContext.skillsSelectedMateriaId);
    if (found) return found;
  }

  const activeMat = getActiveMateria();
  const chosen =
    activeMat && materias.some((m) => m.id === activeMat.id) ? activeMat : materias[0];
  appContext.skillsSelectedMateriaId = chosen?.id || null;
  return chosen || null;
}

function renderSkillsSubjectSelector(materias, selectedMat) {
  const selectorEl = dom["skills-subject-selector"];
  if (!selectorEl) return;

  selectorEl.innerHTML = "";
  materias.forEach((mat) => {
    const isSelected = selectedMat && mat.id === selectedMat.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `subject-selector-pill${isSelected ? " active" : ""}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(Boolean(isSelected)));
    btn.dataset.materiaId = mat.id;
    btn.innerHTML = `
      <i class="bi ${escapeHtml(mat.icono || "bi-book-fill")}"></i>
      <span>${escapeHtml(mat.nombre)}</span>
    `;
    btn.addEventListener("click", () => {
      if (appContext.skillsSelectedMateriaId === mat.id) return;
      appContext.skillsSelectedMateriaId = mat.id;
      renderSkillsSection();
    });
    selectorEl.appendChild(btn);
  });
}

function renderSkillsKpis(selectedMat, skills) {
  const domainPct = calcularDominioMateria(selectedMat, state);
  const completedCount = skills.filter(
    (s) => state.nodos_estado[s.id] === "unlocked"
  ).length;
  const remainingCount = Math.max(0, skills.length - completedCount);

  const aiStats = obtenerMetricasIAMateria(selectedMat.id, state);
  const history = Array.isArray(state.historial_errores) ? state.historial_errores : [];
  const pendingErrors = history.filter(
    (e) => e && !e.superado && errorMatchesMateria(e, selectedMat)
  ).length;
  const blockerNodes = skills.filter(
    (s) => state.nodos_estado[s.id] === "blocker"
  ).length;
  const alertsTotal = pendingErrors + blockerNodes;

  if (dom["skills-kpi-mastery"]) {
    dom["skills-kpi-mastery"].textContent = `${domainPct}%`;
  }
  if (dom["skills-kpi-mastery-bar"]) {
    dom["skills-kpi-mastery-bar"].style.width = `${domainPct}%`;
  }
  if (dom["skills-kpi-mastery-sub"]) {
    dom["skills-kpi-mastery-sub"].textContent = isMateriaIniciada(selectedMat.id)
      ? `Avance real en ${skills.length} temas`
      : "Materia aún sin iniciar";
  }

  if (dom["skills-kpi-completed"]) {
    dom["skills-kpi-completed"].textContent = `${completedCount}/${skills.length}`;
  }
  if (dom["skills-kpi-completed-sub"]) {
    dom["skills-kpi-completed-sub"].textContent =
      skills.length > 0 && remainingCount === 0
        ? "¡Todos dominados!"
        : remainingCount === 1
          ? "Falta 1 tema por dominar"
          : `Faltan ${remainingCount} temas`;
  }

  if (dom["skills-kpi-ai-accuracy"]) {
    if (aiStats.intentos === 0) {
      dom["skills-kpi-ai-accuracy"].textContent = "Sin intentos aún";
      dom["skills-kpi-ai-accuracy"].className =
        "skills-kpi-value skills-kpi-value-sm text-secondary";
    } else {
      dom["skills-kpi-ai-accuracy"].textContent = `${aiStats.precisionPct}%`;
      dom["skills-kpi-ai-accuracy"].className = "skills-kpi-value text-primary";
    }
  }
  if (dom["skills-kpi-ai-detail"]) {
    dom["skills-kpi-ai-detail"].textContent =
      aiStats.intentos === 0
        ? "Sube tu primera foto"
        : `${aiStats.aprobados} aprob. de ${aiStats.intentos} evaluac.`;
  }

  if (dom["skills-kpi-alerts"]) {
    dom["skills-kpi-alerts"].textContent = String(alertsTotal);
    dom["skills-kpi-alerts"].className = `skills-kpi-value ${
      alertsTotal > 0 ? "text-danger" : "text-success"
    }`;
  }
  if (dom["skills-kpi-alerts-sub"]) {
    dom["skills-kpi-alerts-sub"].textContent = `${pendingErrors} en Baúl · ${blockerNodes} críticos`;
  }
}

function renderPreExamWarnings(selectedMat) {
  const emptyEl = dom["pre-exam-warnings-empty"];
  const listEl = dom["pre-exam-warnings-list"];
  if (!listEl) return;

  if (dom["pre-exam-warnings-badge"]) {
    dom["pre-exam-warnings-badge"].textContent = selectedMat
      ? `Top 3 · ${selectedMat.nombre}`
      : "Top 3 Alertas";
  }

  const topWarnings = obtenerFallosRepetitivos(state, selectedMat);
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

function renderSkillsTopicsBreakdown(selectedMat, skills) {
  const listEl = dom["skills-topics-breakdown"];
  if (!listEl) return;

  if (dom["skills-topics-heading"]) {
    dom["skills-topics-heading"].textContent = `Desglose por Tema · ${selectedMat.nombre}`;
  }
  if (dom["skills-topics-count"]) {
    dom["skills-topics-count"].textContent = `${skills.length} temas`;
  }

  listEl.innerHTML = "";
  skills.forEach((skill) => {
    const prog = obtenerProgresoNodo(skill.id, state);
    const priority = obtenerPrioridadTema(skill);
    const prereqFound = skill.prerrequisito_id
      ? findSkillGlobal(skill.prerrequisito_id)
      : null;

    const item = document.createElement("div");
    const extraCls =
      prog.status === "blocker"
        ? " is-blocker"
        : prog.status === "active"
          ? " is-active"
          : "";
    item.className = `topic-breakdown-item${extraCls}`;

    const isPracticeAction = prog.status === "active" || prog.status === "blocker";
    const btnText = isPracticeAction ? "Practicar" : "Ver en Camino";
    const btnIcon = isPracticeAction ? "bi-play-fill" : "bi-signpost-split-fill";
    const btnStyleClass =
      prog.status === "blocker"
        ? "btn-duo-red"
        : prog.status === "active"
          ? "btn-duo-amber"
          : "btn-duo-outline-secondary";

    item.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div class="flex-grow-1" style="min-width: 0;">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="fw-bold text-dark small">#${escapeHtml(skill.ranking_criticidad)} · ${escapeHtml(skill.nombre)}</span>
            <span class="badge rounded-pill ${prog.badgeClass}">${escapeHtml(prog.badgeText)}</span>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
            <span class="priority-pill ${priority.badgeClass}">${escapeHtml(priority.label)}</span>
            ${
              prereqFound
                ? `<span class="text-secondary" style="font-size: 0.74rem;">Base: #${escapeHtml(prereqFound.skill.ranking_criticidad)} ${escapeHtml(prereqFound.skill.nombre)}</span>`
                : `<span class="text-secondary" style="font-size: 0.74rem;">Módulo inicial</span>`
            }
          </div>
        </div>
        <button type="button" class="btn btn-duo ${btnStyleClass} btn-sm flex-shrink-0 btn-topic-action">
          <i class="bi ${btnIcon} me-1"></i>${btnText}
        </button>
      </div>
      <div class="d-flex align-items-center gap-2 mt-2">
        <div class="ranking-progress-bar flex-grow-1 mt-0" aria-hidden="true">
          <div class="ranking-progress-fill ${prog.barClass}" style="width: ${prog.barWidth}%;"></div>
        </div>
        <span class="fw-bold flex-shrink-0" style="font-size: 0.76rem; color: ${
          prog.status === "blocker"
            ? "#b91c1c"
            : prog.status === "unlocked"
              ? "#3f6212"
              : "#475569"
        };">${escapeHtml(prog.label)}</span>
      </div>
    `;

    item.querySelector(".btn-topic-action")?.addEventListener("click", () => {
      state.materia_activa = selectedMat.id;
      if (!state.materias_iniciadas || typeof state.materias_iniciadas !== "object") {
        state.materias_iniciadas = {};
      }
      if (isPracticeAction) {
        state.materias_iniciadas[selectedMat.id] = true;
        saveState();
        openNodeHandler(skill.id);
      } else {
        saveState();
        enterSectionHandler("camino");
        window.requestAnimationFrame(() => scrollToPathNode(skill.id));
      }
    });

    listEl.appendChild(item);
  });
}

export function renderSkillsSection() {
  const materias = getStageMaterias(state.etapa);
  const selectedMat = getSkillsSelectedMateria();
  if (!selectedMat) return;

  const skills = getMateriaSkills(selectedMat);

  if (dom["skills-selected-badge"]) {
    dom["skills-selected-badge"].textContent = selectedMat.codigo
      ? `${selectedMat.codigo} · ${selectedMat.nombre}`
      : selectedMat.nombre;
  }

  renderSkillsSubjectSelector(materias, selectedMat);
  renderSkillsKpis(selectedMat, skills);
  renderPreExamWarnings(selectedMat);

  if (dom["skills-radar-title"]) {
    dom["skills-radar-title"].textContent = `Radar de Dominio — ${selectedMat.nombre}`;
  }

  const labels = [];
  const scoreMap = {};
  const fullLabels = {};
  skills.forEach((skill) => {
    let shortName = getShortSkillLabel(skill);
    if (Object.prototype.hasOwnProperty.call(scoreMap, shortName)) {
      shortName = `${shortName} (${skill.ranking_criticidad})`;
    }
    labels.push(shortName);
    scoreMap[shortName] = obtenerProgresoNodo(skill.id, state).percent;
    fullLabels[shortName] = `#${skill.ranking_criticidad} ${skill.nombre}`;
  });

  appContext.skillsRadarChartInstance = renderRadarOnCanvas(
    dom["skills-radar-chart"],
    appContext.skillsRadarChartInstance,
    labels,
    scoreMap,
    { fullLabels }
  );

  renderSkillsTopicsBreakdown(selectedMat, skills);
  renderErrorVault();
}

export function setVaultFilterScope(scope = "subject") {
  appContext.vaultFilterScope = scope === "all" ? "all" : "subject";
  renderErrorVault();
}

export function renderErrorVault() {
  const listEl = dom["error-vault-list"];
  const countEl = dom["error-vault-count"];
  const emptyEl = dom["error-vault-empty"];
  const emptyTextEl = dom["error-vault-empty-text"];
  const clearBtn = dom["btn-clear-vault"];
  const btnSubject = dom["btn-vault-scope-subject"];
  const btnAll = dom["btn-vault-scope-all"];

  const selectedMat = getSkillsSelectedMateria();
  const scope = appContext.vaultFilterScope === "all" ? "all" : "subject";

  if (btnSubject) {
    btnSubject.classList.toggle("active", scope === "subject");
    btnSubject.setAttribute("aria-pressed", String(scope === "subject"));
    btnSubject.textContent = selectedMat
      ? `Solo ${selectedMat.nombre}`
      : "Solo esta materia";
  }
  if (btnAll) {
    btnAll.classList.toggle("active", scope === "all");
    btnAll.setAttribute("aria-pressed", String(scope === "all"));
  }

  const history = Array.isArray(state.historial_errores)
    ? state.historial_errores
    : [];

  const reversedAll = [...history].reverse();
  const matchingSubject = selectedMat
    ? reversedAll.filter((entry) => errorMatchesMateria(entry, selectedMat))
    : reversedAll;
  const otherSubjects = selectedMat
    ? reversedAll.filter((entry) => !errorMatchesMateria(entry, selectedMat))
    : [];

  const entriesToShow =
    scope === "subject" ? matchingSubject : [...matchingSubject, ...otherSubjects];

  const pendingInView = entriesToShow.filter((item) => !item?.superado).length;

  if (countEl) {
    countEl.textContent =
      pendingInView > 0 ? `${pendingInView} pend.` : String(entriesToShow.length);
  }
  emptyEl?.classList.toggle("d-none", entriesToShow.length > 0);
  if (emptyTextEl) {
    emptyTextEl.textContent =
      scope === "subject" && selectedMat
        ? `Sin errores registrados en ${selectedMat.nombre}. Resuelve retos en el Paso 3 para activar la memoria longitudinal.`
        : "Aún no hay errores guardados. Resuelve un reto en el Paso 3 para activar la memoria longitudinal.";
  }
  clearBtn?.classList.toggle("d-none", history.length === 0);

  if (!listEl) return;
  listEl.innerHTML = "";

  entriesToShow.forEach((entry) => {
    const isResolved = Boolean(entry && entry.superado);
    const resumen = typeof entry === "string" ? entry : entry.resumen || "";
    const tema = typeof entry === "object" && entry ? entry.tema : "";
    const materiaLabel = typeof entry === "object" && entry ? entry.materia : "";
    const fecha = typeof entry === "object" && entry ? entry.fecha : "";

    const li = document.createElement("li");
    li.className = `vault-item${isResolved ? " vault-item-resolved" : ""}`;

    const statusBadge = isResolved
      ? '<span class="badge rounded-pill text-bg-success flex-shrink-0">✅ Superado</span>'
      : '<span class="badge rounded-pill text-bg-warning text-dark flex-shrink-0">Pendiente</span>';

    const metaParts = [materiaLabel, tema, fecha].filter(Boolean);

    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="fw-bold ${isResolved ? "text-success-emphasis" : "text-danger-emphasis"}">${escapeHtml(resumen)}</div>
        ${statusBadge}
      </div>
      ${
        metaParts.length > 0
          ? `<div class="text-secondary mt-1" style="font-size: 0.75rem;">${escapeHtml(metaParts.join(" · "))}</div>`
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
