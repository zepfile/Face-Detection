package com.facedetection.config;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private static final List<String> DEFAULT_ORIGINS = List.of(
            "http://localhost:5173",
            "http://localhost:3000");

    private final CorsProperties corsProperties;

    public WebSocketConfig(CorsProperties corsProperties) {
        this.corsProperties = corsProperties;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOrigins(resolveAllowedOrigins().toArray(String[]::new))
                .withSockJS();
    }

    private List<String> resolveAllowedOrigins() {
        List<String> configuredOrigins = corsProperties.getAllowedOrigins();
        if (configuredOrigins == null || configuredOrigins.isEmpty()) {
            return DEFAULT_ORIGINS;
        }
        return configuredOrigins;
    }
}
