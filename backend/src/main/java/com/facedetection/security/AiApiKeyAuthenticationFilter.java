package com.facedetection.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import com.facedetection.util.SecretResolver;

@Component
public class AiApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String AI_ATTENDANCE_ENDPOINT = "/api/attendance/ai";
    private static final String AI_SYNC_PATH_PREFIX = "/api/ai/";
    private static final String API_KEY_HEADER = "X-API-Key";
    private static final String LEGACY_API_KEY_HEADER = "X-AI-API-KEY";

    private final String configuredApiKey;

    public AiApiKeyAuthenticationFilter(
            @Value("${ai.api-key:}") String configuredApiKey,
            @Value("${ai.api-key-file:}") String configuredApiKeyFile) {
        this.configuredApiKey = SecretResolver.resolve(configuredApiKey, configuredApiKeyFile);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        if (!isAiEndpointRequest(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (SecurityContextHolder.getContext().getAuthentication() == null
                && request.getHeader("Authorization") == null) {
            String apiKey = request.getHeader(API_KEY_HEADER);
            if (apiKey == null || apiKey.isBlank()) {
                apiKey = request.getHeader(LEGACY_API_KEY_HEADER);
            }
            if (isValidApiKey(apiKey)) {
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        "ai-service",
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_AI")));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAiEndpointRequest(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        if (requestUri == null) {
            return false;
        }
        if ("POST".equalsIgnoreCase(request.getMethod()) && requestUri.endsWith(AI_ATTENDANCE_ENDPOINT)) {
            return true;
        }
        return requestUri.startsWith(AI_SYNC_PATH_PREFIX);
    }

    private boolean isValidApiKey(String apiKey) {
        return !configuredApiKey.isEmpty() && configuredApiKey.equals(apiKey);
    }
}
