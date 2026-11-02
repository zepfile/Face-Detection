package com.facedetection.websocket;

import java.time.LocalDateTime;

public record AttendanceEventMessage(
        Long studentId,
        String studentName,
        LocalDateTime entryTime,
        String formattedTime) {
}
