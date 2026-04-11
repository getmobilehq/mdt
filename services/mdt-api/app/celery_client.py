"""
Thin Celery client used by the FastAPI service to enqueue worker tasks.
Only publishes by task name — it does not import worker code.
"""

import os
from functools import lru_cache

from celery import Celery


@lru_cache
def celery_client() -> Celery:
    broker = os.environ.get(
        "CELERY_BROKER_URL",
        os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    )
    return Celery("mdt-api", broker=broker)


def enqueue_transcription(session_id: str, audio_url: str) -> None:
    celery_client().send_task(
        "mdt_workers.tasks.transcription.transcribe_session",
        args=[session_id, audio_url],
    )


def enqueue_action_extraction(session_id: str) -> None:
    celery_client().send_task(
        "mdt_workers.tasks.transcription.extract_actions",
        args=[session_id],
    )
