"""Punto de entrada minimalista del servidor Flask para Skill-Path FNI."""

from __future__ import annotations

import os
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix

from routes import api_ai_bp, api_auth_bp, api_skills_bp, views_bp

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-fni")
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # Límite de 10 MB por solicitud
app.json.ensure_ascii = False
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

CORS(app, supports_credentials=True)


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(_error: RequestEntityTooLarge):
    """Devuelve un JSON claro cuando la imagen supera el tamaño permitido."""
    return (
        jsonify(
            {
                "error": "Archivo demasiado grande",
                "detalle": "La imagen supera el límite máximo permitido de 10 MB.",
            }
        ),
        413,
    )


app.register_blueprint(views_bp)
app.register_blueprint(api_skills_bp)
app.register_blueprint(api_ai_bp)
app.register_blueprint(api_auth_bp)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
