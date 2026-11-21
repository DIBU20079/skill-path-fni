"""Registro de Flask Blueprints de Skill-Path FNI."""

from routes.api_ai import api_ai_bp
from routes.api_auth import api_auth_bp
from routes.api_skills import api_skills_bp
from routes.views import views_bp

__all__ = [
    "api_ai_bp",
    "api_auth_bp",
    "api_skills_bp",
    "views_bp",
]
