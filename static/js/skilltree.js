/**
 * Renderizado de Camino vertical, Catálogo Multi-Materia, Mis Skills (Radar/Medallas) y Baúl de Errores.
 */

import { renderRadarOnCanvas } from "./diagnostic.js";
import {
  appContext,
  dom,
  ensureConsistentNodeStatesForStage,
  escapeHtml,
  findSkillGlobal,
  getActiveMateria,
  getActiveMateriaSkills,
  getAllStageSkills,
  getDiagnosticAreasForStage,
  getMateriaSkills,
  getStageMaterias,
  saveState,
  state,
} from "./state.js";

let openNodeHandler = () => {};
let enterSectionHandler = () => {};

export function configureSkilltreeHandlers({ onOpenNode, onEnterSection } = {}) {
  if (typeof onOpenNode === "function") openNodeHandler = onOpenNode;
  if (typeof onEnterSection === "function") enterSectionHandler = onEnterSection;
}

/* ========================================================================
   Sección A: Camino (Árbol Vertical de la Materia Activa)
   ======================================================================== */

export function renderCaminoSection() {
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

    wrapper.appendChild(labelCard);
    container.appendChild(wrapper);
  });

  renderCriticalRanking(skills);
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

export function handleStartRescueClick() {
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
  enterSectionHandler("camino");
  openNodeHandler(target.id);
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
   Sección C: Mis Skills (Radar, Bronce/Plata/Oro, Nota Parcial y Baúl)
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

export function renderSkillsSection() {
  const { areas, scores } = getAreaMasteryScores();

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

export function renderErrorVault() {
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
