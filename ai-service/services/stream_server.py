from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from typing import Any, Iterable

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from flask_sock import Sock


class LiveStreamServer:
    def __init__(
        self,
        frame_provider: Callable[[str | None], bytes | None],
        faces_provider: Callable[[str | None], dict[str, Any]],
        cameras_provider: Callable[[], list[dict[str, Any]]],
        camera_update_handler: Callable[[list[str]], dict[str, Any]] | None,
        encoding_reload_handler: Callable[[], int] | None = None,
        host: str = "0.0.0.0",
        port: int = 5000,
        fps: int = 8,
        allowed_origins: Iterable[str] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self._frame_provider = frame_provider
        self._faces_provider = faces_provider
        self._cameras_provider = cameras_provider
        self._camera_update_handler = camera_update_handler
        self._encoding_reload_handler = encoding_reload_handler
        self._host = host
        self._port = port
        self._fps = max(1, fps)
        self._logger = logger or logging.getLogger(__name__)
        self._stop_event = threading.Event()

        self._app = Flask(__name__)
        CORS(self._app, resources={r"/*": {"origins": list(allowed_origins or ["*"])}})
        self._sock = Sock(self._app)
        self._server_thread: threading.Thread | None = None

        self._register_routes()

    def start(self) -> None:
        if self._server_thread and self._server_thread.is_alive():
            return

        self._server_thread = threading.Thread(
            target=self._run,
            name="live-stream-server",
            daemon=True,
        )
        self._server_thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def _run(self) -> None:
        self._logger.info("Starting live stream server on %s:%s", self._host, self._port)
        self._app.run(
            host=self._host,
            port=self._port,
            debug=False,
            use_reloader=False,
            threaded=True,
        )

    def _register_routes(self) -> None:
        @self._app.get("/health")
        def health() -> tuple[dict, int]:
            return {"status": "ok"}, 200

        @self._app.post("/api/live/reload-encodings")
        def reload_encodings() -> tuple[dict[str, Any], int] | Response:
            if self._encoding_reload_handler is None:
                return {"message": "Reload handler is not configured"}, 400
            count = self._encoding_reload_handler()
            return jsonify({"status": "ok", "knownStudents": count})

        @self._app.get("/api/live/cameras")
        def get_cameras() -> Response:
            return jsonify({"cameras": self._cameras_provider()})

        @self._app.post("/api/live/cameras")
        def update_cameras() -> tuple[dict[str, Any], int] | Response:
            if self._camera_update_handler is None:
                return {"message": "Camera updates are disabled"}, 400

            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                return {"message": "Invalid request payload"}, 400

            raw_sources = payload.get("sources")
            if not isinstance(raw_sources, list):
                return {"message": "'sources' must be an array"}, 400

            normalized_sources: list[str] = []
            for source in raw_sources:
                text = str(source).strip()
                if not text:
                    continue
                normalized_sources.append(text)

            if not normalized_sources:
                return {"message": "At least one camera source is required"}, 400

            result = self._camera_update_handler(normalized_sources)
            return jsonify(result)

        @self._app.get("/api/live/faces")
        def faces() -> Response:
            return jsonify(self._faces_provider(None))

        @self._app.get("/api/live/faces/<camera_key>")
        def faces_by_camera(camera_key: str) -> Response:
            return jsonify(self._faces_provider(camera_key))

        @self._app.get("/api/live/stream")
        def stream_default() -> Response:
            return Response(
                self._mjpeg_generator(None),
                mimetype="multipart/x-mixed-replace; boundary=frame",
            )

        @self._app.get("/api/live/stream/<camera_key>")
        def stream_by_camera(camera_key: str) -> Response:
            return Response(
                self._mjpeg_generator(camera_key),
                mimetype="multipart/x-mixed-replace; boundary=frame",
            )

        @self._sock.route("/ws/faces")
        def ws_faces(ws) -> None:  # type: ignore[no-untyped-def]
            self._ws_faces_loop(ws, None)

        @self._sock.route("/ws/faces/<camera_key>")
        def ws_faces_by_camera(ws, camera_key: str) -> None:  # type: ignore[no-untyped-def]
            self._ws_faces_loop(ws, camera_key)

    def _ws_faces_loop(self, ws: Any, camera_key: str | None) -> None:
        delay = 1.0 / float(self._fps)
        while not self._stop_event.is_set():
            ws.send(json.dumps(self._faces_provider(camera_key)))
            time.sleep(delay)

    def _mjpeg_generator(self, camera_key: str | None):
        delay = 1.0 / float(self._fps)
        while not self._stop_event.is_set():
            frame = self._frame_provider(camera_key)
            if frame is None:
                time.sleep(delay)
                continue

            yield b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            time.sleep(delay)
