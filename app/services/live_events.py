
import threading
import time
from collections import defaultdict
from typing import Any

_lock = threading.Lock()
_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
_created: dict[str, float] = {}
_finished: set[str] = set()

MAX_EVENTS_PER_RUN = 500
RUN_TTL_SECONDS = 1800


def _cleanup():
    now = time.time()

    expired = [
        run_id
        for run_id, created in _created.items()
        if now - created > RUN_TTL_SECONDS
    ]

    for run_id in expired:
        _events.pop(run_id, None)
        _created.pop(run_id, None)
        _finished.discard(run_id)


def publish_event(
    run_id: str | None,
    event: str,
    message: str,
    details: dict | None = None,
):
    if not run_id:
        return

    with _lock:
        _cleanup()

        if run_id not in _created:
            _created[run_id] = time.time()

        if run_id in _finished:
            return

        history = _events[run_id]

        history.append({
            "id": len(history) + 1,
            "event": event,
            "message": message,
            "details": details or {},
            "timestamp": time.time(),
        })

        if len(history) > MAX_EVENTS_PER_RUN:
            del history[:-MAX_EVENTS_PER_RUN]


def finish_run(
    run_id: str | None,
    success: bool = True,
):
    if not run_id:
        return

    publish_event(
        run_id,
        "completed" if success else "failed",
        "Investigation completed." if success
        else "Investigation failed.",
    )

    with _lock:
        _finished.add(run_id)


def get_events(
    run_id: str,
    after_id: int = 0,
):
    with _lock:
        _cleanup()

        history = list(_events.get(run_id, []))
        finished = run_id in _finished

    return [
        event for event in history
        if event["id"] > after_id
    ], finished
