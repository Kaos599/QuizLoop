"""Central logging setup: rotating file logs + dedicated prompts/flows log.

Shared by the FastAPI app (app.main) and standalone scripts so trace
verification works identically from both entry points.
"""
import logging
import os
from logging.handlers import RotatingFileHandler

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_DIR = os.path.join(BACKEND_DIR, "logs")

LOG_FORMAT = "%(asctime)s [%(levelname)s] [%(name)s]: %(message)s"

_configured = False


def configure_logging():
    global _configured
    if _configured:
        return
    os.makedirs(LOGS_DIR, exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    if not any(isinstance(h, logging.StreamHandler) for h in root_logger.handlers):
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root_logger.addHandler(console_handler)

    app_file_handler = RotatingFileHandler(
        os.path.join(LOGS_DIR, "skillforge.log"),
        maxBytes=20 * 1024 * 1024, backupCount=5, encoding="utf-8",
    )
    app_file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(app_file_handler)

    flow_logger = logging.getLogger("skillforge.prompts_and_flows")
    flow_logger.setLevel(logging.INFO)
    flow_file_handler = RotatingFileHandler(
        os.path.join(LOGS_DIR, "prompts_and_flows.log"),
        maxBytes=30 * 1024 * 1024, backupCount=5, encoding="utf-8",
    )
    flow_file_handler.setFormatter(
        logging.Formatter("%(asctime)s\n%(message)s\n" + "-" * 80)
    )
    flow_logger.addHandler(flow_file_handler)
    flow_logger.propagate = False

    _configured = True
