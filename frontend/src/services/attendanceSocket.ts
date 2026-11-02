import { Client, IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";

import type { AttendanceRealtimeEvent } from "../types/AttendanceRealtimeEvent";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").trim();
const WS_ENDPOINT = `${API_BASE_URL.replace(/\/+$/g, "")}/ws`;
const ATTENDANCE_TOPIC = "/topic/attendance";

const isAttendanceEvent = (value: unknown): value is AttendanceRealtimeEvent => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.studentId === "number" &&
    typeof payload.studentName === "string" &&
    typeof payload.entryTime === "string" &&
    typeof payload.formattedTime === "string"
  );
};

const parseAttendanceEvent = (message: IMessage): AttendanceRealtimeEvent | null => {
  try {
    const parsed: unknown = JSON.parse(message.body);
    if (!isAttendanceEvent(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const connectAttendanceSocket = (
  onMessage: (event: AttendanceRealtimeEvent) => void,
  onError?: (error: string) => void,
): (() => void) => {
  const client = new Client({
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    webSocketFactory: () => new SockJS(WS_ENDPOINT),
  });

  client.onConnect = () => {
    client.subscribe(ATTENDANCE_TOPIC, (frame) => {
      const event = parseAttendanceEvent(frame);
      if (!event) {
        return;
      }
      onMessage(event);
    });
  };

  client.onStompError = (frame) => {
    const detail = frame.headers["message"] ?? "WebSocket broker error";
    if (onError) {
      onError(detail);
    }
  };

  client.onWebSocketError = () => {
    if (onError) {
      onError("WebSocket connection failed");
    }
  };

  client.activate();

  return () => {
    void client.deactivate();
  };
};
