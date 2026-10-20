package com.shop.platform.infra.security;

import com.shop.platform.common.security.CurrentOperator;
import com.shop.platform.common.security.OperatorResolver;
import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * 把验过签的令牌变成「当前操作人」。
 *
 * <p>关键决定：<b>每次请求都回库解析一次权限</b>，不把权限塞进令牌。塞进去意味着改权限要等令牌过期才生效，
 * 而权限变更要求立即生效；回库的代价是每请求两三条点查，等真有性能压力时加短 TTL 缓存，而不是牺牲正确性。
 *
 * <p>账号被停用时这里直接抛 {@link BadCredentialsException}——令牌没到期但人已经被禁用，必须当场拒。
 */
@Component
public class OperatorAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final OperatorResolver resolver;

    public OperatorAuthenticationConverter(OperatorResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UUID operatorId;
        try {
            operatorId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadCredentialsException("令牌缺少合法的 subject");
        }

        CurrentOperator operator =
                resolver.find(operatorId).orElseThrow(() -> new BadCredentialsException("账号不存在或已停用"));

        List<GrantedAuthority> authorities = operator.permissions().stream()
                .map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast)
                .toList();

        return new UsernamePasswordAuthenticationToken(operator, jwt, authorities);
    }
}
