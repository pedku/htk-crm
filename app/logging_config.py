"""
Logging estructurado con rotación y request logging.
F1.2 del ROADMAP v5.
"""
import logging
import os
from logging.handlers import RotatingFileHandler

LOG_FORMAT = '%(asctime)s [%(levelname)s] %(name)s [%(funcName)s:%(lineno)d]: %(message)s'
LOG_FILE = os.environ.get('CRM_LOG_FILE', 'crm.log')


def setup_logging(app):
    """Configure structured logging with rotation and request tracing."""
    # File handler: 5MB × 3 = 15MB max
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    file_handler.setLevel(logging.INFO)

    # Console handler: debug in dev, warnings+ in production
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(LOG_FORMAT))
    console.setLevel(logging.DEBUG if app.debug else logging.WARNING)

    # Configure app logger
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console)
    app.logger.setLevel(logging.DEBUG if app.debug else logging.INFO)

    # Log every non-static request
    from flask import request

    @app.after_request
    def log_request(response):
        if not request.path.startswith('/static'):
            app.logger.info('%s %s → %s', request.method, request.path, response.status_code)
        return response

    app.logger.info('Logging initialized (file=%s, debug=%s)', LOG_FILE, app.debug)
