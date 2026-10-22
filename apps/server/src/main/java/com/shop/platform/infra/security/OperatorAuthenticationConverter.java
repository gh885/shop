package com.shop.platform.infra.security;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * <p>三个关键决定：
 *
 * <ul>
 *   <li><b>按 {@code typ} 声明分流</b>。三套身份域共用一把签名密钥，没有类型就只能拿 subject 挨个表去撞。
 *       买家 id 撞上某个 {@code seller.operator.id} 的概率不高，但"不高"不是"不可能"，而越权一次就够。
 *   <li><b>每次请求都回库解析一次权限</b>，不把权限塞进令牌。塞进去意味着改权限要等令牌过期才生效，
 *       而权限变更要求立即生效；回库的代价是每请求两三条点查，等真有性能压力时加短 TTL 缓存，而不是牺牲正确性。
 *   <li><b>类型与实现不一致就在启动时失败</b>，不留到线上。
 * </ul>
 *
 * <p>账号被停用时这里直接抛 {@link BadCredentialsException}——令牌没到期但人已经被禁用，必须当场拒。
 */
@Component
public class OperatorAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    /** 令牌里的身份类型声明。缺了它一律拒：老令牌、别人签的令牌都过不去。 */
    static final String TYPE_CLAIM = "typ";

    private final Map<String, OperatorResolver> resolvers;

    public OperatorAuthenticationConverter(List<OperatorResolver> resolvers) {
        Map<String, OperatorResolver> byType = new LinkedHashMap<>();
        for (OperatorResolver resolver : resolvers) {
            OperatorResolver previous = byType.put(resolver.operatorType(), resolver);
            if (previous != null) {
                // 两个实现抢同一类身份，说明有人复制粘贴没改 operatorType()，结果取决于 bean 顺序
                throw new IllegalStateException("身份类型 " + resolver.operatorType() + " 有两个 OperatorResolver："
                        + previous.getClass().getName() + " 与 "
                        + resolver.getClass().getName());
            }
        }
        this.resolvers = Map.copyOf(byType);
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UUID operatorId;
        try {
            operatorId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadCredentialsException("令牌缺少合法的 subject");
        }

        String operatorType = jwt.getClaimAsString(TYPE_CLAIM);
        if (operatorType == null || operatorType.isBlank()) {
            throw new BadCredentialsException("令牌缺少身份类型声明");
        }

        OperatorResolver resolver = resolvers.get(operatorType);
        if (resolver == null) {
            // 不认识的类型不是"查一下再说"，是拒——否则加一类身份时旧代码会静默放行
            throw new BadCredentialsException("未知的身份类型: " + operatorType);
        }

        CurrentOperator operator =
                resolver.find(operatorId).orElseThrow(() -> new BadCredentialsException("账号不存在或已停用"));

        if (!operatorType.equals(operator.operatorType())) {
            // 实现返回了另一类身份：它的 operatorType() 和实际行为对不上，是代码 bug 不是请求问题
            throw new IllegalStateException("OperatorResolver 声明类型 " + operatorType + "，却返回了 " + operator.operatorType()
                    + "：" + resolver.getClass().getName());
        }

        List<GrantedAuthority> authorities = operator.permissions().stream()
                .map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast)
                .toList();

        return new UsernamePasswordAuthenticationToken(operator, jwt, authorities);
    }
}
