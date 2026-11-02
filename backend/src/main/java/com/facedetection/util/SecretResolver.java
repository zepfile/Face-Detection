package com.facedetection.util;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class SecretResolver {

    private SecretResolver() {
    }

    public static String resolve(String value, String filePath) {
        if (filePath != null && !filePath.isBlank()) {
            try {
                String fileValue = Files.readString(Path.of(filePath)).trim();
                if (!fileValue.isEmpty()) {
                    return fileValue;
                }
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to load secret from file: " + filePath, ex);
            }
        }
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.trim();
    }
}
