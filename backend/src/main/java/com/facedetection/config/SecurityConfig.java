package com.facedetection.config;

import com.facedetection.security.AiApiKeyAuthenticationFilter;
import com.facedetection.security.AuthRateLimitFilter;
import com.facedetection.security.CsrfCookieFilter;
import com.facedetection.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final AiApiKeyAuthenticationFilter aiApiKeyAuthenticationFilter;
    private final AuthRateLimitFilter authRateLimitFilter;
    private final CsrfCookieFilter csrfCookieFilter;
    private final AppSecurityProperties securityProperties;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            AiApiKeyAuthenticationFilter aiApiKeyAuthenticationFilter,
            AuthRateLimitFilter authRateLimitFilter,
            CsrfCookieFilter csrfCookieFilter,
            AppSecurityProperties securityProperties) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.aiApiKeyAuthenticationFilter = aiApiKeyAuthenticationFilter;
        this.authRateLimitFilter = authRateLimitFilter;
        this.csrfCookieFilter = csrfCookieFilter;
        this.securityProperties = securityProperties;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        CsrfTokenRequestAttributeHandler csrfTokenRequestHandler = new CsrfTokenRequestAttributeHandler();
        csrfTokenRequestHandler.setCsrfRequestAttributeName(null);

        HttpSecurity chain = http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository())
                        .csrfTokenRequestHandler(csrfTokenRequestHandler)
                        .ignoringRequestMatchers("/api/auth/login", "/api/auth/refresh", "/api/attendance/ai", "/ws", "/ws/**"))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .contentTypeOptions(Customizer.withDefaults())
                        .frameOptions(frameOptions -> frameOptions.deny())
                        .addHeaderWriter(new StaticHeadersWriter("X-XSS-Protection", "1; mode=block"))
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'self'; "
                                        + "script-src 'self'; "
                                        + "style-src 'self' 'unsafe-inline'; "
                                        + "img-src 'self' data: blob: https: http:; "
                                        + "connect-src 'self' https: http: ws: wss:; "
                                        + "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"))
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31_536_000)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/ws", "/ws/**").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/refresh", "/api/auth/csrf").permitAll()
                        .requestMatchers("/api/auth/logout", "/api/auth/me").authenticated()
                        .requestMatchers("/api/auth/register").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/ai/**").hasAnyRole("ADMIN", "AI")
                        .requestMatchers("/api/notifications/**").hasAnyRole("ADMIN", "COORDINATOR")
                        .requestMatchers("/api/attendance/ai").hasAnyRole("ADMIN", "COORDINATOR", "AI")
                        .requestMatchers("/api/attendance/**").hasAnyRole("ADMIN", "COORDINATOR")
                        .requestMatchers("/api/students/**").hasAnyRole("ADMIN", "COORDINATOR")
                        .anyRequest().authenticated())
                .addFilterBefore(authRateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(aiApiKeyAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(csrfCookieFilter, UsernamePasswordAuthenticationFilter.class)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable);

        if (securityProperties.isRequireHttps()) {
            chain.requiresChannel(channel -> channel.anyRequest().requiresSecure());
        }

        return chain.build();
    }

    @Bean
    public CookieCsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieName("XSRF-TOKEN");
        repository.setHeaderName("X-XSRF-TOKEN");
        repository.setCookiePath("/");
        repository.setSecure(securityProperties.isSecureCookies());
        return repository;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(Math.max(10, securityProperties.getBcryptStrength()));
    }
}
