/**
 * Módulo de comunicación HTTP con la API de Skill-Path FNI.
 */

export async function fetchSkillsDB() {
  const response = await fetch("/api/skills", {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const msg = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(`No se pudo cargar /api/skills (${msg}).`);
  }
  return data;
}

export async function evaluateResolution(formData) {
  const response = await fetch("/api/evaluar", {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `Error del servidor (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

export async function generateDynamicExercise({ materia, tema, historial_errores }) {
  const response = await fetch("/api/generar-ejercicio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      materia,
      tema,
      historial_errores,
    }),
  });
  const data = await response.json().catch(() => null);

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
  const response = await fetch("/api/auth/status", {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const detail = data?.detalle || data?.error || `HTTP ${response.status}`;
    throw new Error(`No se pudo consultar /api/auth/status (${detail}).`);
  }
  return data;
}
