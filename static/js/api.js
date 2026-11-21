/**
 * Módulo de comunicación HTTP con la API de Skill-Path FNI (incluye Auth y Sync Cloud).
 */

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function fetchSkillsDB() {
  const { response, data } = await requestJson("/api/skills", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !data) {
    const msg = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(`No se pudo cargar /api/skills (${msg}).`);
  }
  return data;
}

export async function evaluateResolution(formData) {
  const { response, data } = await requestJson("/api/evaluar", {
    method: "POST",
    body: formData,
  });
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `Error del servidor (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

export async function generateDynamicExercise({ materia, tema, historial_errores }) {
  const { response, data } = await requestJson("/api/generar-ejercicio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      materia,
      tema,
      historial_errores,
    }),
  });
  if (
    !response.ok ||
    !data ||
    !data.paso1_concepto ||
    !data.paso2_practica ||
    !data.paso3_reto_foto
  ) {
    throw new Error(data?.detalle || data?.error || "Respuesta incompleta");
  }
  return data;
}

export async function fetchAuthStatus() {
  const { response, data } = await requestJson("/api/auth/status", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(`No se pudo consultar /api/auth/status (${detail}).`);
  }
  return data;
}

export async function apiMe() {
  const { response, data } = await requestJson("/api/me", {
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function apiLogin(username, password) {
  const { response, data } = await requestJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function apiRegister({ nombre, username, password, etapa }) {
  const { response, data } = await requestJson("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, username, password, etapa }),
  });
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function apiDemoLogin() {
  const { response, data } = await requestJson("/api/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function apiLogout() {
  const { response, data } = await requestJson("/api/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data || { ok: true };
}

export async function apiGuardarProgreso(estado_json, etapa = null) {
  const { response, data } = await requestJson("/api/progreso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado_json, etapa }),
  });
  if (!response.ok) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data || { ok: true };
}
