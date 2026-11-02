package com.facedetection.util;

import org.springframework.web.util.HtmlUtils;

public final class InputSanitizer {

    private InputSanitizer() {
    }

    public static String sanitize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return HtmlUtils.htmlEscape(trimmed);
    }

    public static String sanitizePreserveCase(String value, int maxLength) {
        String sanitized = sanitize(value);
        if (sanitized == null) {
            return null;
        }
        return sanitized.length() > maxLength ? sanitized.substring(0, maxLength) : sanitized;
    }
}
