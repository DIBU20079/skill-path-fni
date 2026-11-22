/**
 * Red de Conocimientos interactiva (Cytoscape.js + Dagre) y Panel Inspector de temas clave.
 */

import {
  appContext,
  calcularDominioMateria,
  dom,
  errorMatchesMateria,
  escapeHtml,
  findMateriaById,
  findSkillGlobal,
  getAllMaterias,
  getKnowledgeNetwork,
  getMateriaSkills,
  isMateriaIniciada,
  obtenerProgresoNodo,
  state,
} from "./state.js";

let cyInstance = null;
let dagrePluginRegistered = false;
let currentLayoutIsMobile = null;
let resizeListenerBound = false;
let resizeTimerId = null;

let openSubjectCaminoHandler = () => {};
let jumpToTopicHandler = () => {};

export function configureNetworkHandlers({
  onOpenSubjectCamino,
  onJumpToTopic,
} = {}) {
  if (typeof onOpenSubjectCamino === "function") {
    openSubjectCaminoHandler = onOpenSubjectCamino;
  }
  if (typeof onJumpToTopic === "function") {
    jumpToTopicHandler = onJumpToTopic;
  }
}

function registerDagreIfNeeded() {
  if (dagrePluginRegistered || typeof window.cytoscape !== "function") return;
  if (typeof window.cytoscapeDagre === "function") {
    window.cytoscape.use(window.cytoscapeDagre);
  }
  dagrePluginRegistered = true;
}

function getMateriaVisualStatus(mat) {
  const skills = getMateriaSkills(mat);
  const domainPct = calcularDominioMateria(mat, state);
  const initiated = isMateriaIniciada(mat.id);
  const history = Array.isArray(state.historial_errores) ? state.historial_errores : [];

  const hasBlocker = skills.some((s) => state.nodos_estado?.[s.id] === "blocker");
  const hasVaultAlert = history.some(
    (entry) => entry && !entry.superado && errorMatchesMateria(entry, mat)
  );

  if (hasBlocker || hasVaultAlert) {
    return { key: "alert", borderColor: "#ef4444", label: "Alerta / Refuerzo", badgeClass: "text-bg-danger", pct: domainPct };
  }
  if (skills.length > 0 && domainPct === 100) {
    return { key: "done", borderColor: "#22c55e", label: "Dominada", badgeClass: "text-bg-success", pct: 100 };
  }
  if (initiated || domainPct > 0) {
    return { key: "progress", borderColor: "#f59e0b", label: "En curso", badgeClass: "text-bg-warning text-dark", pct: domainPct };
  }
  return { key: "idle", borderColor: "#94a3b8", label: "Sin iniciar", badgeClass: "text-bg-secondary", pct: 0 };
}

function getShortNetworkTitle(mat) {
  const map = {
    algebra_base: "Álgebra de\nSupervivencia",
    trigonometria: "Trigonometría\nAplicada",
    geometria_analitica: "Geometría\nAnalítica",
    calculo_1: "Cálculo I\nMAT 1101",
    fisica_1: "Física I\nFIS 1100",
  };
  return map[mat.id] || mat.nombre;
}

function buildCytoscapeElements() {
  const materias = getAllMaterias();
  const network = getKnowledgeNetwork();
  const elements = [];

  materias.forEach((mat) => {
    const vis = getMateriaVisualStatus(mat);
    const isPhysics = mat.area === "fisica";
    elements.push({
      data: {
        id: mat.id,
        label: getShortNetworkTitle(mat),
        area: mat.area || "matematicas",
        nivel: Number(mat.nivel || 0),
        bgColor: isPhysics ? "#ffedd5" : "#e0f2fe",
        textColor: isPhysics ? "#7c2d12" : "#0c4a6e",
        borderColor: vis.borderColor,
        statusKey: vis.key,
      },
    });
  });

  (network.conexiones || []).forEach((conn, idx) => {
    elements.push({
      data: {
        id: conn.id || `edge_${idx}_${conn.origen}_${conn.destino}`,
        source: conn.origen,
        target: conn.destino,
        tipo: conn.tipo || "prerrequisito",
        etiqueta: conn.etiqueta || "",
      },
    });
  });

  return elements;
}

function getCytoscapeStylesheet() {
  return [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        width: "152px",
        height: "66px",
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "136px",
        "font-family": "Nunito, Inter, sans-serif",
        "font-size": "12px",
        "font-weight": "800",
        color: "data(textColor)",
        "background-color": "data(bgColor)",
        "border-width": "4px",
        "border-color": "data(borderColor)",
        "transition-property": "opacity, border-width, background-color, border-color",
        "transition-duration": "0.18s",
      },
    },
    {
      selector: "edge",
      style: {
        width: 3,
        "line-color": "#64748b",
        "target-arrow-color": "#64748b",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.15,
        "curve-style": "bezier",
        "transition-property": "opacity, line-color, target-arrow-color, width",
        "transition-duration": "0.18s",
      },
    },
    {
      selector: 'edge[tipo = "correquisito"]',
      style: {
        "line-style": "dashed",
        "line-dash-pattern": [7, 5],
        "line-color": "#6366f1",
        "target-arrow-color": "#6366f1",
        "source-arrow-color": "#6366f1",
        "source-arrow-shape": "triangle",
      },
    },
    {
      selector: ".is-dimmed",
      style: {
        opacity: 0.22,
      },
    },
    {
      selector: "node.is-selected-main",
      style: {
        "border-width": "6px",
        "border-color": "#0284c7",
      },
    },
    {
      selector: "node.is-req-done",
      style: {
        "border-width": "5px",
        "border-color": "#16a34a",
      },
    },
    {
      selector: "node.is-req-pending",
      style: {
        "border-width": "5px",
        "border-color": "#d97706",
      },
    },
    {
      selector: "node.is-req-alert",
      style: {
        "border-width": "5px",
        "border-color": "#dc2626",
      },
    },
    {
      selector: "node.is-supported",
      style: {
        "border-width": "5px",
        "border-color": "#0284c7",
      },
    },
    {
      selector: "edge.is-edge-done",
      style: {
        width: 4.5,
        "line-color": "#16a34a",
        "target-arrow-color": "#16a34a",
      },
    },
    {
      selector: "edge.is-edge-pending",
      style: {
        width: 4.5,
        "line-color": "#d97706",
        "target-arrow-color": "#d97706",
      },
    },
    {
      selector: "edge.is-edge-alert",
      style: {
        width: 4.5,
        "line-color": "#dc2626",
        "target-arrow-color": "#dc2626",
      },
    },
    {
      selector: "edge.is-edge-unlock",
      style: {
        width: 4.5,
        "line-color": "#0284c7",
        "target-arrow-color": "#0284c7",
        "source-arrow-color": "#0284c7",
      },
    },
  ];
}

function clearNetworkHighlight() {
  if (!cyInstance) return;
  cyInstance
    .elements()
    .removeClass(
      "is-dimmed is-selected-main is-req-done is-req-pending is-req-alert is-supported is-edge-done is-edge-pending is-edge-alert is-edge-unlock"
    );
}

function getTopicStatusInfo(nodoId) {
  const prog = obtenerProgresoNodo(nodoId, state);
  const foundSkill = findSkillGlobal(nodoId);
  const isTester = Boolean(state.is_tester);

  if (prog.status === "unlocked") {
    return {
      rowClass: "is-done",
      badgeClass: "text-bg-success",
      badgeText: "✅ Dominado",
      foundSkill,
    };
  }
  if (prog.status === "blocker") {
    return {
      rowClass: "is-blocker",
      badgeClass: "text-bg-danger",
      badgeText: "🔴 Reforzar",
      foundSkill,
    };
  }
  if (prog.status === "active" || isTester) {
    return {
      rowClass: "is-pending",
      badgeClass: "text-bg-warning text-dark",
      badgeText: prog.steps > 0 ? `⚠️ ${prog.percent}%` : "⚠️ Pendiente",
      foundSkill,
    };
  }
  return {
    rowClass: "is-pending",
    badgeClass: "text-bg-warning text-dark",
    badgeText: "⚠️ Pendiente",
    foundSkill,
  };
}

function renderTopicClaveRows(topics, emptyMessage) {
  const wrap = document.createElement("div");
  wrap.className = "d-flex flex-column gap-2";

  if (!Array.isArray(topics) || topics.length === 0) {
    wrap.innerHTML = `<div class="small text-secondary">${escapeHtml(emptyMessage)}</div>`;
    return wrap;
  }

  topics.forEach((tc) => {
    const statusInfo = getTopicStatusInfo(tc.nodo_id);
    const sourceMat = findMateriaById(tc.materia_id)?.materia;
    const row = document.createElement("div");
    row.className = `inspector-topic-row ${statusInfo.rowClass}`;

    row.innerHTML = `
      <div class="flex-grow-1" style="min-width: 0;">
        <div class="fw-bold small text-dark text-truncate" title="${escapeHtml(tc.nombre)}">
          ${escapeHtml(tc.nombre)}
        </div>
        <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
          <span class="badge rounded-pill text-bg-light border text-secondary" style="font-size: 0.7rem;">
            ${escapeHtml(sourceMat ? sourceMat.nombre : tc.materia_id)}
          </span>
          <span class="badge rounded-pill ${statusInfo.badgeClass}" style="font-size: 0.7rem;">
            ${escapeHtml(statusInfo.badgeText)}
          </span>
        </div>
      </div>
      <button type="button" class="btn btn-duo btn-duo-outline-secondary btn-sm flex-shrink-0 btn-jump-topic">
        Ir al tema
      </button>
    `;

    row.querySelector(".btn-jump-topic")?.addEventListener("click", () => {
      jumpToTopicHandler(tc.materia_id, tc.nodo_id);
    });

    wrap.appendChild(row);
  });

  return wrap;
}

function evaluateEdgeRequirementState(conn) {
  const topics = Array.isArray(conn.temas_clave) ? conn.temas_clave : [];
  const sourceMat = findMateriaById(conn.origen)?.materia;
  const sourceVis = sourceMat ? getMateriaVisualStatus(sourceMat) : { key: "idle" };

  if (sourceVis.key === "alert") return "alert";
  if (topics.some((tc) => state.nodos_estado?.[tc.nodo_id] === "blocker")) {
    return "alert";
  }
  if (
    topics.length > 0 &&
    topics.every((tc) => state.nodos_estado?.[tc.nodo_id] === "unlocked")
  ) {
    return "done";
  }
  if (sourceVis.key === "done") return "done";
  return "pending";
}

function highlightNodeAndNeighbors(matId) {
  if (!cyInstance) return;
  clearNetworkHighlight();
  const network = getKnowledgeNetwork();
  const targetNode = cyInstance.getElementById(matId);
  if (!targetNode || targetNode.empty()) return;

  cyInstance.elements().addClass("is-dimmed");
  targetNode.removeClass("is-dimmed").addClass("is-selected-main");

  (network.conexiones || []).forEach((conn) => {
    const edgeEl = cyInstance.getElementById(conn.id);
    if (!edgeEl || edgeEl.empty()) return;

    const isCoreq = conn.tipo === "correquisito";
    if (conn.destino === matId && !isCoreq) {
      const reqState = evaluateEdgeRequirementState(conn);
      const srcNode = cyInstance.getElementById(conn.origen);
      edgeEl.removeClass("is-dimmed").addClass(`is-edge-${reqState}`);
      srcNode?.removeClass("is-dimmed").addClass(`is-req-${reqState}`);
    } else if (conn.origen === matId || (isCoreq && conn.destino === matId)) {
      const otherId = conn.origen === matId ? conn.destino : conn.origen;
      const otherNode = cyInstance.getElementById(otherId);
      edgeEl.removeClass("is-dimmed").addClass("is-edge-unlock");
      otherNode?.removeClass("is-dimmed").addClass("is-supported");
    }
  });
}

function highlightEdgeConnection(conn) {
  if (!cyInstance || !conn) return;
  clearNetworkHighlight();
  cyInstance.elements().addClass("is-dimmed");

  const edgeEl = cyInstance.getElementById(conn.id);
  const srcNode = cyInstance.getElementById(conn.origen);
  const dstNode = cyInstance.getElementById(conn.destino);

  if (conn.tipo === "correquisito") {
    edgeEl?.removeClass("is-dimmed").addClass("is-edge-unlock");
    srcNode?.removeClass("is-dimmed").addClass("is-supported");
    dstNode?.removeClass("is-dimmed").addClass("is-supported");
  } else {
    const reqState = evaluateEdgeRequirementState(conn);
    edgeEl?.removeClass("is-dimmed").addClass(`is-edge-${reqState}`);
    srcNode?.removeClass("is-dimmed").addClass(`is-req-${reqState}`);
    dstNode?.removeClass("is-dimmed").addClass("is-selected-main");
  }
}

export function renderNodeInspector(matId) {
  const found = findMateriaById(matId);
  if (!found || !found.materia) return;

  const mat = found.materia;
  const vis = getMateriaVisualStatus(mat);
  const network = getKnowledgeNetwork();

  if (dom["inspector-kicker"]) {
    dom["inspector-kicker"].textContent =
      `INSPECTOR · ${mat.codigo || (mat.nivel === 0 ? "NIVEL 0" : "NIVEL 1")}`;
  }
  if (dom["inspector-title"]) {
    dom["inspector-title"].textContent = mat.nombre;
  }
  if (dom["inspector-badges"]) {
    const areaLabel = mat.area === "fisica" ? "⚛️ Física" : "📐 Matemáticas";
    const nivelLabel = mat.nivel === 0 ? "Nivel 0 · Fundamentos" : "Nivel 1 · Ciencias Básicas";
    dom["inspector-badges"].innerHTML = `
      <span class="badge rounded-pill text-bg-light border text-dark">${escapeHtml(nivelLabel)}</span>
      <span class="badge rounded-pill text-bg-light border text-secondary">${escapeHtml(areaLabel)}</span>
      <span class="badge rounded-pill ${vis.badgeClass}">${escapeHtml(vis.label)}</span>
    `;
  }

  dom["inspector-progress-wrap"]?.classList.remove("d-none");
  if (dom["inspector-progress-text"]) {
    dom["inspector-progress-text"].textContent = `${vis.pct}%`;
  }
  if (dom["inspector-progress-bar"]) {
    dom["inspector-progress-bar"].style.width = `${vis.pct}%`;
  }

  const body = dom["inspector-body"];
  if (!body) return;
  body.innerHTML = "";

  if (mat.descripcion) {
    const descP = document.createElement("p");
    descP.className = "small text-secondary mb-0";
    descP.textContent = mat.descripcion;
    body.appendChild(descP);
  }

  // CTA principal: Abrir Camino de esta Materia
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn-duo btn-duo-green w-100";
  openBtn.innerHTML = '<i class="bi bi-signpost-split-fill me-2"></i>Abrir Camino de esta Materia';
  openBtn.addEventListener("click", () => openSubjectCaminoHandler(mat.id));
  body.appendChild(openBtn);

  // Bases específicas entrantes dentro de desplegable cerrado por defecto
  const incomingConns = (network.conexiones || []).filter(
    (c) => c.destino === mat.id || (c.tipo === "correquisito" && c.origen === mat.id)
  );
  const incomingTopics = [];
  const seenTopicKeys = new Set();

  incomingConns.forEach((conn) => {
    (conn.temas_clave || []).forEach((tc) => {
      if (tc.materia_id === mat.id) return;
      const key = `${tc.materia_id}::${tc.nodo_id}`;
      if (!seenTopicKeys.has(key)) {
        seenTopicKeys.add(key);
        incomingTopics.push(tc);
      }
    });
  });

  if (incomingTopics.length > 0) {
    const detailsEl = document.createElement("details");
    detailsEl.className = "inspector-bases-details";
    const summaryEl = document.createElement("summary");
    summaryEl.className = "inspector-bases-summary";
    summaryEl.innerHTML = `<span><span class="inspector-bases-chevron me-1">▸</span>Ver temas base recomendados (${incomingTopics.length})</span>`;
    detailsEl.appendChild(summaryEl);

    const innerWrap = document.createElement("div");
    innerWrap.className = "mt-2";
    innerWrap.appendChild(
      renderTopicClaveRows(incomingTopics, "Sin temas base registrados.")
    );
    detailsEl.appendChild(innerWrap);
    body.appendChild(detailsEl);
  }

  // Para qué te sirve (materias que apoya)
  const outgoingConns = (network.conexiones || []).filter(
    (c) => c.origen === mat.id || (c.tipo === "correquisito" && c.destino === mat.id)
  );
  const supportTargets = [];
  const seenTargets = new Set();
  outgoingConns.forEach((conn) => {
    const targetId = conn.origen === mat.id ? conn.destino : conn.origen;
    if (targetId === mat.id || seenTargets.has(targetId)) return;
    seenTargets.add(targetId);
    const targetMat = findMateriaById(targetId)?.materia;
    if (targetMat) {
      supportTargets.push({ mat: targetMat, isCoreq: conn.tipo === "correquisito" });
    }
  });

  if (supportTargets.length > 0) {
    const supportSection = document.createElement("div");
    const supportTitle = document.createElement("div");
    supportTitle.className = "inspector-section-title";
    supportTitle.textContent = "Conecta con";
    supportSection.appendChild(supportTitle);

    const pillsWrap = document.createElement("div");
    pillsWrap.className = "d-flex flex-wrap gap-2";
    supportTargets.forEach(({ mat: targetMat, isCoreq }) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "inspector-support-pill";
      pill.textContent = `${isCoreq ? "↔ " : "→ "}${targetMat.nombre}`;
      pill.addEventListener("click", () => {
        appContext.networkSelectedType = "node";
        appContext.networkSelectedId = targetMat.id;
        highlightNodeAndNeighbors(targetMat.id);
        renderNodeInspector(targetMat.id);
      });
      pillsWrap.appendChild(pill);
    });
    supportSection.appendChild(pillsWrap);
    body.appendChild(supportSection);
  }
}

export function renderEdgeInspector(conn) {
  if (!conn) return;
  const originMat = findMateriaById(conn.origen)?.materia;
  const destMat = findMateriaById(conn.destino)?.materia;
  const isCoreq = conn.tipo === "correquisito";

  if (dom["inspector-kicker"]) {
    dom["inspector-kicker"].textContent = isCoreq
      ? "CONEXIÓN · CORREQUISITO"
      : "CONEXIÓN · PRERREQUISITO";
  }
  if (dom["inspector-title"]) {
    const arrow = isCoreq ? " ↔ " : " → ";
    dom["inspector-title"].textContent = `${originMat?.nombre || conn.origen}${arrow}${destMat?.nombre || conn.destino}`;
  }
  if (dom["inspector-badges"]) {
    dom["inspector-badges"].innerHTML = `
      <span class="badge rounded-pill text-bg-light border text-secondary">
        ${isCoreq ? "Correquisito" : "Prerrequisito"}
      </span>
    `;
  }

  dom["inspector-progress-wrap"]?.classList.add("d-none");

  const body = dom["inspector-body"];
  if (!body) return;
  body.innerHTML = "";

  if (conn.etiqueta || conn.descripcion) {
    const descP = document.createElement("p");
    descP.className = "small text-secondary mb-0";
    descP.textContent = conn.descripcion || conn.etiqueta;
    body.appendChild(descP);
  }

  const topics = Array.isArray(conn.temas_clave) ? conn.temas_clave : [];
  if (topics.length > 0) {
    const detailsEl = document.createElement("details");
    detailsEl.className = "inspector-bases-details";
    const summaryEl = document.createElement("summary");
    summaryEl.className = "inspector-bases-summary";
    summaryEl.innerHTML = `<span><span class="inspector-bases-chevron me-1">▸</span>Ver temas base recomendados (${topics.length})</span>`;
    detailsEl.appendChild(summaryEl);

    const innerWrap = document.createElement("div");
    innerWrap.className = "mt-2";
    innerWrap.appendChild(renderTopicClaveRows(topics, "Sin temas base registrados."));
    detailsEl.appendChild(innerWrap);
    body.appendChild(detailsEl);
  }

  if (destMat) {
    const destBtn = document.createElement("button");
    destBtn.type = "button";
    destBtn.className = "btn btn-duo btn-duo-green w-100 mt-1";
    destBtn.innerHTML = `<i class="bi bi-signpost-split-fill me-2"></i>Abrir Camino de ${escapeHtml(destMat.nombre)}`;
    destBtn.addEventListener("click", () => openSubjectCaminoHandler(destMat.id));
    body.appendChild(destBtn);
  }

  if (originMat) {
    const originBtn = document.createElement("button");
    originBtn.type = "button";
    originBtn.className = "btn btn-duo btn-duo-outline-secondary btn-sm w-100";
    originBtn.textContent = `Ver ficha de ${originMat.nombre}`;
    originBtn.addEventListener("click", () => {
      appContext.networkSelectedType = "node";
      appContext.networkSelectedId = originMat.id;
      highlightNodeAndNeighbors(originMat.id);
      renderNodeInspector(originMat.id);
    });
    body.appendChild(originBtn);
  }
}

function getLayoutConfig(isMobile) {
  return {
    name: "dagre",
    rankDir: isMobile ? "TB" : "LR",
    nodeSep: isMobile ? 28 : 44,
    rankSep: isMobile ? 54 : 88,
    edgeSep: 18,
    padding: isMobile ? 16 : 24,
    animate: false,
    fit: true,
  };
}

function bindResizeListener() {
  if (resizeListenerBound) return;
  resizeListenerBound = true;
  window.addEventListener("resize", () => {
    if (resizeTimerId !== null) window.clearTimeout(resizeTimerId);
    resizeTimerId = window.setTimeout(() => {
      resizeTimerId = null;
      if (!cyInstance || appContext.activeSection !== "materias") return;
      if (appContext.materiasViewMode !== "network") return;
      const isMobileNow = window.innerWidth < 768;
      cyInstance.resize();
      if (isMobileNow !== currentLayoutIsMobile) {
        currentLayoutIsMobile = isMobileNow;
        cyInstance.layout(getLayoutConfig(isMobileNow)).run();
      }
      cyInstance.fit(undefined, isMobileNow ? 16 : 24);
    }, 180);
  });
}

export function destroyKnowledgeNetwork() {
  if (cyInstance) {
    cyInstance.destroy();
    cyInstance = null;
  }
  currentLayoutIsMobile = null;
}

export function refreshNetworkStyles() {
  if (!cyInstance) return;
  getAllMaterias().forEach((mat) => {
    const node = cyInstance.getElementById(mat.id);
    if (!node || node.empty()) return;
    const vis = getMateriaVisualStatus(mat);
    node.data("borderColor", vis.borderColor);
    node.data("statusKey", vis.key);
  });
}

export function zoomNetworkIn() {
  if (!cyInstance) return;
  const next = Math.min(2.2, cyInstance.zoom() * 1.2);
  cyInstance.zoom({
    level: next,
    renderedPosition: {
      x: cyInstance.width() / 2,
      y: cyInstance.height() / 2,
    },
  });
}

export function zoomNetworkOut() {
  if (!cyInstance) return;
  const next = Math.max(0.45, cyInstance.zoom() * 0.82);
  cyInstance.zoom({
    level: next,
    renderedPosition: {
      x: cyInstance.width() / 2,
      y: cyInstance.height() / 2,
    },
  });
}

export function centerNetworkSelection() {
  if (!cyInstance) return;
  if (appContext.networkSelectedType === "node" && appContext.networkSelectedId) {
    const node = cyInstance.getElementById(appContext.networkSelectedId);
    if (node && !node.empty()) {
      cyInstance.center(node);
      return;
    }
  }
  cyInstance.fit(undefined, window.innerWidth < 768 ? 16 : 24);
}

export function fitNetworkAll() {
  if (!cyInstance) return;
  cyInstance.fit(undefined, window.innerWidth < 768 ? 16 : 24);
}

export function renderKnowledgeNetwork() {
  const container = dom["knowledge-network-canvas"];
  if (!container || typeof window.cytoscape !== "function") {
    if (dom["inspector-body"]) {
      dom["inspector-body"].innerHTML =
        '<div class="alert alert-warning small mb-0">No se pudo cargar Cytoscape.js. Cambia a <strong>Vista por Niveles</strong> para navegar tus materias.</div>';
    }
    return;
  }

  registerDagreIfNeeded();
  destroyKnowledgeNetwork();

  const isMobile = window.innerWidth < 768;
  currentLayoutIsMobile = isMobile;
  const network = getKnowledgeNetwork();
  const elements = buildCytoscapeElements();

  cyInstance = window.cytoscape({
    container,
    elements,
    style: getCytoscapeStylesheet(),
    layout: getLayoutConfig(isMobile),
    userZoomingEnabled: false,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    autoungrabify: true,
    minZoom: 0.45,
    maxZoom: 2.2,
  });

  cyInstance.on("tap", "node", (evt) => {
    const matId = evt.target.id();
    appContext.networkSelectedType = "node";
    appContext.networkSelectedId = matId;
    highlightNodeAndNeighbors(matId);
    renderNodeInspector(matId);
  });

  cyInstance.on("tap", "edge", (evt) => {
    const edgeId = evt.target.id();
    const conn = (network.conexiones || []).find((c) => c.id === edgeId);
    if (!conn) return;
    appContext.networkSelectedType = "edge";
    appContext.networkSelectedId = edgeId;
    highlightEdgeConnection(conn);
    renderEdgeInspector(conn);
  });

  cyInstance.on("tap", (evt) => {
    if (evt.target === cyInstance) {
      appContext.networkSelectedType = null;
      appContext.networkSelectedId = null;
      clearNetworkHighlight();
    }
  });

  bindResizeListener();

  window.requestAnimationFrame(() => {
    if (!cyInstance) return;
    cyInstance.resize();
    cyInstance.fit(undefined, isMobile ? 16 : 24);
  });

  // Poblar inicialmente el Inspector con la materia seleccionada o activa
  const initialMatId =
    (appContext.networkSelectedType === "node" && appContext.networkSelectedId) ||
    state.materia_activa ||
    "calculo_1";
  const initialMat = findMateriaById(initialMatId)?.materia || getAllMaterias()[0];

  if (appContext.networkSelectedType === "edge" && appContext.networkSelectedId) {
    const conn = (network.conexiones || []).find(
      (c) => c.id === appContext.networkSelectedId
    );
    if (conn) {
      highlightEdgeConnection(conn);
      renderEdgeInspector(conn);
      return;
    }
  }

  if (initialMat) {
    if (appContext.networkSelectedType === "node" && appContext.networkSelectedId) {
      highlightNodeAndNeighbors(initialMat.id);
    }
    renderNodeInspector(initialMat.id);
  }
}
