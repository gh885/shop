package com.shop.platform.infra.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 认证全部交给 Spring Security，没有手写的认证过滤器。
 *
 * <p>分工：Spring Security 管过滤器链、会话策略、密码编码、{@code SecurityContextHolder}；
 * resource-server 那套管 Bearer 令牌的解析、验签、过期校验。我们只写两件它管不了的事——令牌怎么签发
 * （{@link AccessTokenIssuer}）、令牌里的 subject 怎么变成 {@code CurrentOperator}
 * （{@link OperatorAuthenticationConverter}）。
 *
 * <p>为什么不用自建会话：本系统三端都是前后端分离，令牌是唯一凭证。服务端存会话意味着多一个共享存储和一套
 * 过期清理，而令牌方案在横向扩的时候不需要任何粘性路由。
 */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    /**
     * 不需要身份的路径。
     *
     * <p>三类：探针要用的健康检查、登录入口（卖家与买家各一个，注册也算）、**支付渠道的异步回调**。
     *
     * <p>回调必须免登录——渠道当然没有我们的令牌。它的安全靠签名（{@code AlipayChannel} 验不过就拒），
     * 不靠身份。这也意味着它对所有人开放，所以那边只做验签 + 一次 CAS，不能有任何"重"的操作。
     */
    private static final String[] PUBLIC_PATHS = {
        "/actuator/health",
        "/actuator/health/**",
        "/api/seller/login",
        "/api/buyer/login",
        "/api/buyer/register",
        "/api/staff/login",
        "/api/payments/notify/**"
    };

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            OperatorAuthenticationConverter converter,
            @Value("${shop.actuator.metrics-public:false}") boolean metricsPublic)
            throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.requestMatchers(publicPaths(metricsPublic))
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                        // 令牌不对时默认返回空 body；这里换成统一的问题详情，前端才认得出是 401 还是 500
                        .authenticationEntryPoint((request, response, ex) ->
                                AuthErrorWriter.write(request, response, 401, "INVALID_TOKEN", "登录状态无效，请重新登录"))
                        .accessDeniedHandler((request, response, ex) ->
                                AuthErrorWriter.write(request, response, 403, "PERMISSION_DENIED", "没有操作权限")))
                .exceptionHandling(handling -> handling.authenticationEntryPoint((request, response, ex) ->
                                AuthErrorWriter.write(request, response, 401, "INVALID_TOKEN", "登录状态无效，请重新登录"))
                        .accessDeniedHandler((request, response, ex) ->
                                AuthErrorWriter.write(request, response, 403, "PERMISSION_DENIED", "没有操作权限")));
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder(JwtProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey(properties))
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        // 校验签发方：别的系统用同一把密钥签的令牌不能冒充我们
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(properties.issuer()));
        return decoder;
    }

    @Bean
    JwtEncoder jwtEncoder(JwtProperties properties) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(secretKey(properties)));
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    private static SecretKeySpec secretKey(JwtProperties properties) {
        return new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    /**
     * 公开路径 = 探针要用的健康检查 + 登录入口，外加一个**默认关闭**的指标口。
     *
     * <p>指标放行是本地开发专用的：{@code compose.dev.yml} 里的 Prometheus 直接抓 8080，加令牌得给它配一套
     * 长期凭证，不值当。开关默认 false（fail-closed），本地靠 {@code apps/server/.env} 打开；
     * 生产没有那个文件，所以自动是关的。
     *
     * <p>生产要抓指标就走内网或带凭证，别把这个开关打开——指标里有流量形态和内部名字。
     */
    private static String[] publicPaths(boolean metricsPublic) {
        if (!metricsPublic) {
            return PUBLIC_PATHS;
        }
        String[] paths = Arrays.copyOf(PUBLIC_PATHS, PUBLIC_PATHS.length + 1);
        paths[PUBLIC_PATHS.length] = "/actuator/prometheus";
        return paths;
    }
}
