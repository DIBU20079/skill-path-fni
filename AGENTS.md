# AGENTS.md — Skill-Path FNI

Guía de arquitectura, restricciones técnicas, reglas pedagógicas y contratos de API para **Skill-Path FNI** (plataforma educativa gamificada estilo Duolingo para Ciencias Básicas de Ingeniería con auditoría IA por foto).

---

## 1. Stack y Restricciones Técnicas Estrictas

- **Backend**: Python 3 + **Flask** + **Flask-CORS** corriendo en el puerto `5000` (configurable mediante `PORT`), con `ProxyFix` de Werkzeug y sesiones HTTP seguras (`SECRET_KEY`, `SESSION_COOKIE_SAMESITE="Lax"`), organizado con **Flask Blueprints** en `routes/` y lógica de dominio en `services/`.
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
- **Persistencia**: Persistencia híbrida multi-dispositivo: caché inmediata en `localStorage` bajo la clave `skillpath_fni_progress_v1` + sincronización en la nube vía HTTPS REST (`services/db_cloud.py` -> tabla `usuarios` en **Supabase** usando `requests`, limpiando `SUPABASE_URL` y `SUPABASE_KEY` con `.strip().strip("()\"'")` y `.rstrip("/")`, con headers `apikey` + `Content-Type` + `Prefer: return=representation` y **sin** `Authorization: Bearer` cuando `SUPABASE_KEY` comienza con `sb_secret_`). Si faltan variables de Supabase, usa `data/usuarios_fallback.json` como respaldo local:
  - `nombre`, `etapa`, `materia_activa`, `materias_iniciadas`, `xp`, `racha`, `nodos_estado`, `historial_errores` (cada entrada con `id`, `resumen`, `tema`, `materia`, `tipo_error`, `fecha`, `superado`), `diagnostico_completado`, `diagnostico_resultados`, `xp_otorgado_nodos`, `nodo_retorno`, `contadores_medallas`, `simulacros_mejor_nota`.
  - **Regla de Oro de XP**: El `xp` es un puntaje permanente de dominio que **nunca** se gasta ni se resta.
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
│   ├── api_skills.py             # GET /api/skills (combina pre_u.json + facultad.json)
│   ├── api_ai.py                 # POST /api/{evaluar,generar-ejercicio,ejemplo-analogo,generar-ejercicio-error}
│   └── api_auth.py               # POST /api/{register,login,demo-login,logout,progreso} y GET /api/me
├── services/
│   ├── __init__.py
│   ├── ai_client.py              # Cliente Gemini compartido, timeout y fallback de modelos
│   ├── ai_auditor.py             # Auditoría socrática por foto/texto (8 claves)
│   ├── ai_generator.py           # Ejercicios 3 pasos, ejemplo análogo y reto focalizado de error
│   └── db_cloud.py               # Cliente HTTPS Supabase REST (`usuarios`) + respaldo data/usuarios_fallback.json
├── data/
│   ├── pre_u.json                # Materias, preguntas_examen y skills de la etapa Pre-U
│   └── facultad.json             # Materias, preguntas_examen y skills de la etapa Facultad
├── templates/
│   ├── index.html                # Shell HTML, CDNs, CSS modulares e entry ES Module (main.js)
│   └── partials/
│       ├── navbar.html           # Navegación Duolingo, topbar con saludo, Ubicación y botón Salir
│       ├── auth_welcome.html     # Login, Registro (Pre-U/Facultad) y Acceso Rápido Demo (Jurados)
│       ├── diagnostic.html       # Motor de examen reutilizable (Ubicación por materia + Salto de Nivel)
│       ├── skilltree.html        # Inicio de materia, camino vertical de nodos, "⚡ Saltar aquí" y ranking
│       ├── materias.html         # Catálogo curricular multi-materia
│       ├── skills_stats.html     # Mis Skills: radar, medallas Bronce/Plata/Oro y Baúl de Errores IA
│       ├── profile.html          # Sección Perfil: nombre, etapa, repetir ubicación y Demo
│       └── challenge_modal.html  # Modal de 3 pasos (Concepto, Práctica, Reto Foto)
└── static/
    ├── css/
    │   ├── base.css              # Design tokens, botones 3D, navbar, bienvenida y motor de examen
    │   ├── skilltree.css         # Inicio de materia, árbol de nodos, "⚡ Saltar aquí", catálogo y medallas
    │   └── modals.css            # Modal 3 pasos, dropzone, tarjeta IA, historial e intentos
    └── js/
        ├── api.js                # Llamadas fetch tipadas (/api/skills, /api/evaluar, auth y sync)
        ├── state.js              # Estado localStorage + Supabase, materias_iniciadas, caché DOM y KaTeX
        ├── diagnostic.js         # Motor de examen reutilizable: Ubicación por materia y Salto de Nivel
        ├── skilltree.js          # Inicio de materia, Camino de nodos, Materias, Mis Skills y Baúl
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
- **`GET /api/skills` (`routes/api_skills.py`)**: Lee y combina `data/pre_u.json` y `data/facultad.json` en UTF-8 devolviendo exactamente el objeto unificado `{ "pre_u": ..., "facultad": ... }` (HTTP 200).
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
- **`POST /api/ejemplo-analogo` (`routes/api_ai.py`)**:
  - Acepta `{materia, tema, ejercicio_actual}` (todos obligatorios) y llama a `generar_ejemplo_analogo(...)` (`services/ai_generator.py`) devolviendo HTTP `200` con `{"enunciado", "pasos", "conclusion"}` en LaTeX para un ejercicio distinto y resuelto paso a paso (andamiaje gratuito tras 2 fallos sin gastar XP).
- **`POST /api/generar-ejercicio-error` (`routes/api_ai.py`)**:
  - Acepta `{materia, tema, tipo_error, detalle_error}` (obligatorios `tema` y `detalle_error`) y llama a `generar_ejercicio_error(...)` (`services/ai_generator.py`) devolviendo HTTP `200` con `{"enunciado", "pista_inicial", "objetivo"}` en LaTeX para el **Baúl de Errores Activo**.
- **`POST /api/register`, `POST /api/login`, `POST /api/demo-login`, `POST /api/logout`, `GET /api/me`, `POST /api/progreso`, `GET /api/auth/status` (`routes/api_auth.py`)**:
  - Gestión real de cuentas, contraseñas con `werkzeug.security`, sesión persistente Flask (`session["username"]`) y sincronización automática con Supabase (`services/db_cloud.py`) o respaldo JSON local (`data/usuarios_fallback.json`).
  - `/api/demo-login` inicia sesión en `"jurado_demo"` con progreso precargado (320 XP, racha de 4 días, 2 nodos dominados y 2 errores en el Baúl).
  - `/api/me` responde `401` si no existe sesión activa.

---

## 5. Contrato Curricular (`data/{pre_u,facultad}.json`) y Flujo UI

- Dos etapas de primer nivel: `pre_u` y `facultad`.
- Cada etapa contiene `materias`: catálogo multi-materia por etapa (`pre_u`: **Álgebra Pre-U** y **Trigonometría**; `facultad`: **Cálculo I** y **Física I**).
- Cada materia contiene `id`, `nombre`, `codigo`, `icono`, `color`, `descripcion`, `preguntas_examen` (5 preguntas de opción múltiple en LaTeX vinculadas por `skill_id` y `nivel_nodo` de básico a avanzado) y `skills` (4 a 5 temas ordenados por `ranking_criticidad` y encadenados por `prerrequisito_id`).
- Campos de cada skill: `id`, `ranking_criticidad`, `frecuencia_examen`, `materia`, `nombre`, `area`, `prerrequisito_id`, `xp`, `tip_auxiliar`, `paso1_concepto` (`titulo`, `enunciado_latex`, `opciones`, `respuesta_correcta`, `explicacion`), `paso2_practica` (`titulo`, `enunciado_latex`, `respuesta_correcta`, `respuestas_aceptadas`, `pista`), `paso3_reto_foto` (`titulo`, `enunciado_latex`, `prerrequisito_evaluado`, `instrucciones`).
- **Navegación estilo Duolingo**: barra lateral izquierda en escritorio y barra inferior fija (grid de 4 columnas) en móvil con 4 secciones: **Camino**, **Materias**, **Mis Skills** (Rango FNI, Medallas FNI, Preparación para Examen, Resumen Pre-Examen Top 3, radar Chart.js, nivel Bronce/Plata/Oro y **Baúl de Errores Activo**) y **Perfil** (Rango FNI, Medallas, nombre, etapa, repetir ubicación, **Cargar Perfil Demo**, **Cerrar Sesión (Salir)** y acordeón cerrado de reinicio). Se eliminó por completo la función de "Registrar Nota Parcial".
- **Inicio por materia (`materias_iniciadas`)**: Al iniciar sesión o registrarse no existe diagnóstico global obligatorio; el usuario va a **Materias** (o a su última materia activa iniciada). Al elegir una materia no iniciada, elige entre **"🚀 Empezar desde cero"** (Nodo 1 en `active`, demás en `locked`) o **"🎯 Hacer Examen de Ubicación"**.
- **Motor de examen reutilizable (`static/js/diagnostic.js` + `templates/partials/diagnostic.html`)**:
  - **Modo 1 — Examen de Ubicación**: Evalúa las preguntas de básico a avanzado de esa materia, desbloquea en `unlocked` (verde) los nodos dominados, deja el siguiente en `active` (amarillo) y los posteriores en `locked` (gris), suma XP y guarda en Supabase.
  - **Modo 2 — Salto de Nivel ("⚡ Saltar aquí")**: En nodos bloqueados (`locked`) a partir del Nodo 3 en adelante, el botón **"⚡ Saltar aquí"** evalúa 3 a 4 preguntas de los nodos anteriores. Con `>= 75%` desbloquea los nodos previos en verde, activa el nodo destino en amarillo, otorga `+60 XP` y desbloquea la medalla **Salto de Nivel**; con `< 75%` indica qué temas reforzar.
  - **Modo 3 — Nodo Final "🏆 Simulacro de Parcial"**: Al final del camino vertical de cada materia; se desbloquea con `>= 60%` de nodos en `unlocked` (Verde). Evalúa 4–5 preguntas mezcladas con temporizador global visible de `05:00` y entrega automática al llegar a `00:00`. Calcula nota sobre `100`: con `>= 51` aprueba, suma `+100 XP`, desbloquea **Simulacro Aprobado** y guarda la mejor nota en `simulacros_mejor_nota`.
- **XP Permanente, Rangos FNI, Medallas, Preparación y Baúl Activo (`static/js/state.js` + `static/js/challenge.js`)**:
  - **XP Permanente**: `state.xp` nunca se resta ni se gasta. `obtenerRangoFNI(xp)` asigna 5 niveles: *Postulante* (`0–199`), *Ingresante FNI* (`200–499`), *Estudiante Nivelado* (`500–999`), *Aspirante a Auxiliar* (`1000–1999`) y *Auxiliar de Ciencias Básicas* (`2000+`).
  - **6 Medallas FNI (`obtenerMedallas`)**: *Resiliencia*, *Rescate Crítico*, *Salto de Nivel*, *Error Superado*, *Simulacro Aprobado* y *Constancia FNI* (`racha >= 3`).
  - **Preparación para Examen (`calcularPreparacionExamen`)**: Pondera los nodos `unlocked` por su peso (`frecuencia_examen`) sobre el total de la materia; se muestra en la cabecera de la materia activa y en **Mis Skills**.
  - **Compresión, Carga Animada, Ejemplo Análogo y Bonos XP**: Antes de enviar a `/api/evaluar`, las fotos se redimensionan en `<canvas>` oculto a máx. `1280px` (`image/jpeg`, `0.78`). Mientras espera respuesta, rota mensajes cada `~1.8s`. Tras `>= 2` intentos fallidos aparece **"💡 Ver ejemplo parecido resuelto (Gratis)"**. Al aprobar en intento `>= 2` suma **+25 XP (Bono de Resiliencia)**; si el nodo estaba en `blocker` (Rojo) suma **+50 XP (Bono de Rescate)**.
  - **Baúl de Errores Activo y Resumen Pre-Examen**: Cada falla tiene `id` y `superado`. Los fallos pendientes ofrecen **"🔁 Superar este error"** (`abrirRetoSuperarError`), que al aprobar con Gemini llama `marcarErrorSuperado(id)` (**+30 XP**). `obtenerFallosRepetitivos` alimenta el Top 3 de advertencias pre-parcial en **Mis Skills**.
- **Estado Rojo (`blocker`)**: Cuando la auditoría IA por foto detecta `requiere_repetir_modulo: true` (`fallo_prerrequisito`), el nodo prerrequisito se marca en rojo (`blocker`) para refuerzo guiado con retorno automático.
- **KaTeX**: Ejecutar `renderMathInElement` tras cada renderizado dinámico con fórmulas matemáticas.
