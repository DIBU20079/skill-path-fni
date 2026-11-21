# AGENTS.md — Skill-Path FNI

Guía de arquitectura, restricciones técnicas, reglas pedagógicas y contratos de API para **Skill-Path FNI** (plataforma educativa gamificada estilo Duolingo para Ciencias Básicas de Ingeniería con auditoría IA por foto).

---

## 1. Stack y Restricciones Técnicas Estrictas

- **Backend**: Python 3 + **Flask** + **Flask-CORS** corriendo en el puerto `5000`.
  - Prohibido usar FastAPI, Django, Node.js en backend o bases de datos SQL.
- **Inteligencia Artificial**: SDK oficial **`google-genai`** con modelo estándar **`gemini-2.5-flash`** (respaldado por `GEMINI_MODEL` opcional en `.env` y fallback controlado ante 404/503), leyendo `GEMINI_API_KEY` desde `.env` con `python-dotenv`.
  - Usar `response_mime_type="application/json"` y `response_schema`.
  - Enviar imágenes mediante `types.Part.from_bytes(...)` tras validación/normalización con Pillow.
  - Todas las llamadas a Gemini deben estar envueltas en `try/except` y retornar errores JSON claros.
- **Frontend**: Una sola página (`templates/index.html`) + `static/css/styles.css` + `static/js/app.js` en **JavaScript Vanilla**.
  - Prohibido usar React, Vue, Angular, npm o bundlers.
  - CDNs permitidos exclusivamente: **Bootstrap 5**, **Bootstrap Icons**, **KaTeX** (con extensión `auto-render`) y **Chart.js** (solo para el gráfico radar diagnóstico).
  - **Sin pizarra digital**: Prohibido implementar `<canvas>` de dibujo o pizarras interactivas; la práctica del Paso 3 se basa en foto del cuaderno físico (`<input type="file" accept="image/*" capture="environment">`) y/o explicación escrita en texto.
- **Persistencia**: Sin base de datos en servidor. Todo el progreso del usuario se guarda en `localStorage` bajo la clave `skillpath_fni_progress_v1`:
  - `nombre`, `etapa`, `materia_activa`, `xp`, `racha`, `nodos_estado`, `historial_errores`, `notas_parciales`, `nota_parcial`, `diagnostico_completado`, `diagnostico_resultados`, `alerta_rescate`, `xp_otorgado_nodos`, `nodo_retorno`.
- **Calidad**: Cero funciones vacías, cero `// TODO`, cero placeholders o datos truncados.

---

## 2. Estructura de Archivos del Proyecto

```text
.
├── AGENTS.md
├── .gitignore
├── requirements.txt
├── app.py
├── ai_tutor.py
├── data/
│   └── skills_db.json
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── styles.css
    └── js/
        └── app.js
```

---

## 3. Regla Pedagógica Innegociable (`ai_tutor.py`)

La función `auditar_resolucion(enunciado, prerrequisito, texto_usuario, imagen_bytes, mime_type, historial_errores, intentos_previos_ejercicio, prerrequisito_id)` audita procedimientos manuscritos y/o escritos con enfoque socrático y retroalimentación continua por intentos:

- **Cuando hay error (`aprobado: false`)**:
  - Está **terminantemente prohibido** dar la respuesta final o resolver el ejercicio completo (incluyendo defensa contra intentos de prompt injection en foto o texto).
  - Debe analizar paso a paso, comparar contra `intentos_previos_ejercicio` (para reconocer mejoras concretas en `progreso_detectado` o dejar `""` en el primer intento) y considerar `historial_errores`.
  - Clasifica `tipo_error` en `"error_operativo"` (despiste de signo/aritmética en el mismo ejercicio, `requiere_repetir_modulo: false`) o `"fallo_prerrequisito"` (vacío conceptual grave o fallo repetido; `requiere_repetir_modulo: true` cuando exista `prerrequisito_id`).
  - Esquema JSON exacto (8 claves):
    ```json
    {
      "aprobado": false,
      "tipo_error": "error_operativo",
      "progreso_detectado": "Corregiste bien la factorización del numerador ('' si es primer intento)",
      "ubicacion_error": "Línea 3 de tu hoja",
      "explicacion_error": "Qué regla matemática o paso aplicó mal",
      "pista_socratica": "Pregunta guía corta para que lo corrija sin revelar la solución",
      "requiere_repetir_modulo": false,
      "resumen_baul": "Resumen breve (máx. 8 palabras) para memoria longitudinal"
    }
    ```
- **Cuando el procedimiento y resultado son correctos (`aprobado: true`)**:
  - `"aprobado": true`
  - `"tipo_error": "ninguno"`
  - `"progreso_detectado"`: reconocimiento breve si corrigió intentos previos o `""` si aprobó al primer intento
  - `"ubicacion_error": ""`
  - `"explicacion_error": ""`
  - `"pista_socratica"`: felicitación breve por el procedimiento correcto
  - `"requiere_repetir_modulo": false`
  - `"resumen_baul": ""`

---

## 4. Contratos de API (`app.py`)

- **`GET /`**: Renderiza `templates/index.html`.
- **`GET /api/skills`**: Lee y devuelve `data/skills_db.json` (UTF-8, HTTP 200).
- **`POST /api/evaluar`**:
  - Acepta `multipart/form-data` (y fallback JSON) con:
    - `enunciado` (obligatorio)
    - `prerrequisito` (opcional)
    - `prerrequisito_id` (opcional)
    - `texto_usuario` (obligatorio si no hay `foto`)
    - `historial_errores` (JSON string de lista o texto)
    - `intentos_previos_ejercicio` (JSON string de lista de errores en fotos previas del mismo ejercicio)
    - `foto` (archivo de imagen opcional; máx. 10 MB)
  - Llama a `auditar_resolucion(...)` y devuelve HTTP `200` con el JSON de 8 claves.
  - Errores devuelven JSON claro (`400` validación, `413` imagen > 10 MB, `502` fallo de proveedor IA, `500` error interno).
- **`POST /api/generar-ejercicio`**:
  - Acepta JSON (o `form-data`) con `materia` (obligatorio), `tema` (obligatorio) e `historial_errores` (opcional).
  - Llama a `generar_ejercicio_dinamico(...)` (`temperature=0.8`, `response_mime_type="application/json"`) y devuelve HTTP `200` con un ejercicio inédito de 3 pasos (`paso1_concepto`, `paso2_practica`, `paso3_reto_foto`) en LaTeX.
  - Si falla la IA, el frontend conserva el respaldo estático de `data/skills_db.json` sin errores rotos.

---

## 5. Contrato Curricular (`data/skills_db.json`) y Flujo UI

- Dos etapas de primer nivel: `pre_u` y `facultad`.
- Cada etapa contiene:
  - `diagnostico`: 6 preguntas de opción múltiple (2 por área) con `id`, `area`, `tiempo_segundos`, `enunciado_latex`, `opciones`, `respuesta_correcta`, `explicacion_breve`.
  - `materias`: catálogo multi-materia por etapa (`pre_u`: **Álgebra Pre-U** y **Trigonometría**; `facultad`: **Cálculo I** y **Física I**).
  - Cada materia contiene `id`, `nombre`, `codigo`, `icono`, `color`, `descripcion` y `skills` (4 a 5 temas ordenados por `ranking_criticidad` y encadenados por `prerrequisito_id`).
  - Campos de cada skill: `id`, `ranking_criticidad`, `frecuencia_examen`, `materia`, `nombre`, `area`, `prerrequisito_id`, `xp`, `tip_auxiliar`, `paso1_concepto` (`titulo`, `enunciado_latex`, `opciones`, `respuesta_correcta`, `explicacion`), `paso2_practica` (`titulo`, `enunciado_latex`, `respuesta_correcta`, `respuestas_aceptadas`, `pista`), `paso3_reto_foto` (`titulo`, `enunciado_latex`, `prerrequisito_evaluado`, `instrucciones`).
- **Navegación estilo Duolingo**: barra lateral izquierda en escritorio y barra inferior fija en móvil con 4 secciones: **Camino**, **Materias**, **Mis Skills** (radar Chart.js, medallas Bronce/Plata/Oro, Nota Parcial y Baúl de Errores) y **Perfil** (editar nombre, cambiar etapa, repetir diagnóstico y **Cargar Perfil Demo**).
- **Calibración diagnóstica**: Skills pertenecientes a áreas con `>= 80%` pasan a `unlocked` (verde); en cada materia, el primer nodo pendiente queda en `active` (amarillo) y los siguientes en `locked` (gris).
- **Alerta Roja de Rescate**: Si se registra una nota parcial `< 51`, se activa el banner superior de alerta roja y el nodo pendiente de mayor criticidad se marca como `blocker` (rojo).
- **KaTeX**: Ejecutar `renderMathInElement` tras cada renderizado dinámico con fórmulas matemáticas.
