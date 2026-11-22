# Skill-Path

Plataforma educativa gamificada estilo Duolingo para Ciencias Básicas de Ingeniería (Pre-U y Facultad), con **auditoría socrática por IA** de fotos del cuaderno usando Gemini.

## Stack

- **Backend**: Python 3 + Flask + Flask-CORS (puerto `5000`)
- **IA**: SDK `google-genai` (Gemini) con respuestas JSON estructuradas
- **Frontend**: HTML + CSS + JavaScript Vanilla, Bootstrap 5, Bootstrap Icons, KaTeX y Chart.js por CDN
- **Persistencia**: `localStorage` del navegador (sin base de datos)

Las reglas de arquitectura y contratos de API están en [AGENTS.md](AGENTS.md).

## Puesta en marcha

```bash
# 1. Clonar
git clone <URL_DEL_REPO>
cd <carpeta_del_repo>

# 2. (Recomendado) Entorno virtual
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. Dependencias
pip install -r requirements.txt

# 4. Variables de entorno
# Copia .env.example como .env y coloca tu propia GEMINI_API_KEY
# Windows:      copy .env.example .env
# macOS/Linux:  cp .env.example .env

# 5. Ejecutar
python app.py
```

Abre http://127.0.0.1:5000 en el navegador.

## Estructura

```text
.
├── AGENTS.md                 # Reglas de arquitectura y contratos modulares
├── app.py                    # Inicialización Flask, CORS y registro de Blueprints
├── requirements.txt
├── routes/
│   ├── views.py              # GET / -> index.html
│   ├── api_skills.py         # GET /api/skills (combina los JSON de data/)
│   ├── api_ai.py             # POST /api/evaluar y POST /api/generar-ejercicio
│   └── api_auth.py           # Endpoints base para login y sync en nube
├── services/
│   ├── ai_client.py          # Cliente Gemini y manejo de fallback de modelos
│   ├── ai_auditor.py         # Auditoría socrática por foto/texto
│   ├── ai_generator.py       # Generación dinámica de ejercicios en LaTeX
│   └── db_cloud.py           # Adaptador Supabase / fallback localStorage
├── data/
│   ├── pre_u.json            # Materias, preguntas_examen y skills Pre-U
│   └── facultad.json         # Materias, preguntas_examen y skills Facultad
├── templates/
│   ├── index.html            # Plantilla principal
│   └── partials/             # Parciales Jinja2 independientes por sección/modal
└── static/
    ├── css/                  # base.css, skilltree.css, modals.css
    └── js/                   # ES Modules: api, state, diagnostic, skilltree, challenge, main
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Interfaz principal |
| GET | `/api/skills` | Currículo combinado desde `data/` |
| POST | `/api/evaluar` | Auditoría socrática de foto/texto (JSON de 8 claves) |
| POST | `/api/generar-ejercicio` | Ejercicio inédito de 3 pasos generado por IA |
| GET/POST | `/api/auth/*` | Estado y base de sincronización futura con Supabase |

## Flujo de trabajo para colaboradores

1. Crea una rama por funcionalidad: `git checkout -b feature/nombre-corto`
2. Haz commits pequeños y descriptivos.
3. Sube tu rama: `git push -u origin feature/nombre-corto`
4. Abre un Pull Request hacia `main` en GitHub para revisión.

> **Importante:** cada colaborador usa su propia `GEMINI_API_KEY` en su `.env` local. El archivo `.env` está en `.gitignore` y nunca debe subirse.
