# AGENTS.md — Skill-Path FNI

Guía de arquitectura, restricciones técnicas, reglas pedagógicas y contratos de API para **Skill-Path FNI** (plataforma educativa gamificada estilo Duolingo para Ciencias Básicas de Ingeniería con auditoría IA por foto).

---

## 1. Stack y Restricciones Técnicas Estrictas

- **Backend**: Python 3 + **Flask** + **Flask-CORS** corriendo en el puerto `5000` (configurable mediante `PORT`), organizado con **Flask Blueprints** en `routes/` y lógica de dominio en `services/`.
  - Prohibido usar FastAPI, Django, Node.js en backend o bases de datos SQL locales.
- **Inteligencia Artificial**: SDK oficial **`google-genai`** con modelo estándar **`gemini-2.5-flash`** (respaldado por `GEMINI_MODEL` opcional en `.env` y fallback controlado ante 404/503), leyendo `GEMINI_API_KEY` desde `.env` con `python-dotenv`.
  - Cliente compartido en `services/ai_client.py`; auditoría en `services/ai_auditor.py`; generación dinámica en `services/ai_generator.py`.
  - Usar `response_mime_type="application/json"` y `response_schema`.
  - Enviar imágenes mediante `types.Part.from_bytes(...)` tras validación/normalización con Pillow.
  - Todas las llamadas a Gemini deben estar envueltas en `try/except` y retornar errores JSON claros.
- **Frontend**: Una sola página modular (`templates/index.html` + `templates/partials/*.html`) + hojas CSS modulares (`base.css`, `skilltree.css`, `modals.css`) + **ES Modules** en **JavaScript Vanilla** (`static/js/*.js` cargados desde `main.js` con `<script type="module">`).
  - Prohibido usar React, Vue, Angular, npm, bundlers o `onclick="..."` inline en HTML.
  - CDNs permitidos exclusivamente: **Bootstrap 5**, **Bootstrap Icons**, **KaTeX** (con extensión `auto-render`) y **Chart.js** (solo para gráficos radar).
  - **Sin pizarra digital**: Prohibido implementar `<canvas>` de dibujo o pizarras interactivas; la práctica del Paso 3 se basa en foto del cuaderno físico (`<input type="file" accept="image/*" capture="environment">`) y/o explicación escrita en texto.
- **Persistencia**: El progreso del usuario se guarda en `localStorage` bajo la clave `skillpath_fni_progress_v1`, con adaptador en nube opcional (`services/db_cloud.py` / `/api/auth/sync`) con fallback automático local:
  - `nombre`, `etapa`, `materia_activa`, `xp`, `racha`, `nodos_estado`, `historial_errores`, `notas_parciales`, `nota_parcial`, `diagnostico_completado`, `diagnostico_resultados`, `alerta_rescate`, `xp_otorgado_nodos`, `nodo_retorno`.
- **Calidad**: Cero funciones vacías, cero `// TODO`, cero placeholders o datos truncados.

---

## 2. Estructura Modular del Proyecto (Trabajo en Paralelo)

```text
.
├── AGENTS.md
├── README.md
├── .env.example
├── .gitattributes
├── .gitignore
├── requirements.txt
├── app.py                        # Inicialización minimalista de Flask, CORS, error 413 y Blueprints
├── routes/
│   ├── __init__.py               # Exporta los 4 Blueprints
│   ├── views.py                  # GET / -> renderiza index.html
│   ├── api_skills.py             # GET /api/skills (combina diagnostico + pre_u + facultad)
│   ├── api_ai.py                 # POST /api/evaluar y POST /api/generar-ejercicio
│   └── api_auth.py               # GET/POST /api/auth/* (base para login y sync Supabase)
├── services/
│   ├── __init__.py
│   ├── ai_client.py              # Cliente Gemini compartido, timeout y fallback de modelos
│   ├── ai_auditor.py             # Auditoría socrática por foto/texto (8 claves)
│   ├── ai_generator.py           # Generación dinámica de ejercicios de 3 pasos en LaTeX
│   └── db_cloud.py               # Adaptador Supabase / respaldo seguro localStorage
├── data/
│   ├── diagnostico.json          # Bancos de diagnóstico y tiempos de pre_u y facultad
│   ├── pre_u.json                # Materias y skills de la etapa Pre-U
│   └── facultad.json             # Materias y skills de la etapa Facultad
├── templates/
│   ├── index.html                # Shell HTML, CDNs, CSS modulares e entry ES Module (main.js)
│   └── partials/
│       ├── navbar.html           # Navegación lateral/inferior Duolingo y topbar fija
│       ├── auth_welcome.html     # Pantalla bienvenida, perfil rápido y selector de etapa
│       ├── diagnostic.html       # Quiz diagnóstico con cronómetro y radar inicial
│       ├── skilltree.html        # Camino vertical de nodos, Alerta Roja y ranking crítico
│       ├── materias.html         # Catálogo curricular multi-materia
│       ├── skills_stats.html     # Mis Skills: radar, medallas, nota parcial y Baúl IA
│       ├── profile.html          # Sección Perfil: nombre, etapa, repetir diag y Demo
│       └── challenge_modal.html  # Modal de 3 pasos (Concepto, Práctica, Reto Foto) + Nota Parcial
└── static/
    ├── css/
    │   ├── base.css              # Design tokens, botones 3D, navbar, bienvenida y diagnóstico
    │   ├── skilltree.css         # Árbol de nodos, conectores, animaciones, catálogo y medallas
    │   └── modals.css            # Modal 3 pasos, dropzone, tarjeta IA, historial e intentos
    └── js/
        ├── api.js                # Llamadas fetch tipadas (/api/skills, /api/evaluar, etc.)
        ├── state.js              # Estado localStorage, caché DOM, helpers currículo y KaTeX
        ├── diagnostic.js         # Cuestionario diagnóstico, temporizador, calibración y radar
        ├── skilltree.js          # Camino de nodos, ranking, catálogo Materias, Mis Skills y Baúl
        ├── challenge.js          # Modal 3 pasos, generación IA, subida foto, auditoría continua
        └── main.js               # Orquestador inicialización, navegación, perfil y eventos
```

---

## 3. Regla Pedagógica Innegociable (`services/ai_auditor.py`)

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

## 4. Contratos de API (`routes/*.py`)

- **`GET /` (`routes/views.py`)**: Renderiza `templates/index.html`.
- **`GET /api/skills` (`routes/api_skills.py`)**: Lee y combina `data/diagnostico.json`, `data/pre_u.json` y `data/facultad.json` en UTF-8 devolviendo exactamente el objeto unificado `{ "pre_u": ..., "facultad": ... }` (HTTP 200).
- **`POST /api/evaluar` (`routes/api_ai.py`)**:
  - Acepta `multipart/form-data` (y fallback JSON) con:
    - `enunciado` (obligatorio)
    - `prerrequisito` (opcional)
    - `prerrequisito_id` (opcional)
    - `texto_usuario` (obligatorio si no hay `foto`)
    - `historial_errores` (JSON string de lista o texto)
    - `intentos_previos_ejercicio` (JSON string de lista de errores en fotos previas del mismo ejercicio)
    - `foto` (archivo de imagen opcional; máx. 10 MB)
  - Llama a `auditar_resolucion(...)` (`services/ai_auditor.py`) y devuelve HTTP `200` con el JSON de 8 claves.
  - Errores devuelven JSON claro (`400` validación, `413` imagen > 10 MB, `502` fallo de proveedor IA, `500` error interno).
- **`POST /api/generar-ejercicio` (`routes/api_ai.py`)**:
  - Acepta JSON (o `form-data`) con `materia` (obligatorio), `tema` (obligatorio) e `historial_errores` (opcional).
  - Llama a `generar_ejercicio_dinamico(...)` (`services/ai_generator.py`, `temperature=0.8`, `response_mime_type="application/json"`) y devuelve HTTP `200` con un ejercicio inédito de 3 pasos (`paso1_concepto`, `paso2_practica`, `paso3_reto_foto`) en LaTeX.
  - Si falla la IA, el frontend conserva el respaldo estático del currículo sin errores rotos.
- **`GET /api/auth/status`, `GET /api/auth/sync/<user_id>`, `POST /api/auth/sync` (`routes/api_auth.py`)**:
  - Endpoints base conectados a `services/db_cloud.py` preparados para sincronización futura con Supabase con fallback automático a `localStorage`.

---

## 5. Contrato Curricular (`data/{diagnostico,pre_u,facultad}.json`) y Flujo UI

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
