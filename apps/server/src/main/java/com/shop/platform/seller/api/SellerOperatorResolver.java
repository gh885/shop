package com.shop.platform.seller.api;

import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import com.shop.platform.infra.security.Permission;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 卖家侧的身份解析。
 *
 * <p>主账号直接拿走全部权限和全部店铺（含已关店）——这是"表按多账号建、功能先只开主账号"那条决定的落点：主账号永远走得通，
 * 子账号的数据结构已经就位，将来接登录只多一条分支。
 *
 * <p>子账号的权限是「角色权限并集」，数据范围是「显式授权的店」。两者分开取，因为它们是两个维度：
 * 有"看订单"的权限，不代表能看所有店的订单。
 */
@Component
public class SellerOperatorResolver implements OperatorResolver {

    private static final String FIND_OPERATOR =
            """
            SELECT merchant_id, is_primary, status, permission_version FROM seller.operator WHERE id = :operatorId
            """;

    private static final String ROLE_PERMISSIONS =
            """
            SELECT DISTINCT rp.permission_code
              FROM authz.role_grant g
              JOIN authz.role_permission rp ON rp.role_id = g.role_id
             WHERE g.subject_type = 'seller'
               AND g.subject_id = :operatorId
               AND g.revoked_at IS NULL
               AND (g.valid_to IS NULL OR g.valid_to > now())
            """;

    /**
     * 子账号的退款上限：他持有的、含 {@code after_sale_case:refund} 的那些角色的
     * {@code max_refund_amount}。取回的是<b>去重后的候选值集合</b>而不是 SQL MAX——
     * Postgres 的 MAX 会无视 NULL，而 NULL 的语义是「不限」，混着算会把"其中有一个不限"
     * 静默折成"取有限的最大值"。不限的判断在 Java 里做。
     */
    private static final String REFUND_CAPS =
            """
            SELECT DISTINCT r.max_refund_amount
              FROM authz.role_grant g
              JOIN authz.role_permission rp ON rp.role_id = g.role_id
              JOIN authz.role r ON r.id = g.role_id
             WHERE g.subject_type = 'seller'
               AND g.subject_id = :operatorId
               AND g.revoked_at IS NULL
               AND (g.valid_to IS NULL OR g.valid_to > now())
               AND rp.permission_code = :refundCode
            """;

    private static final String GRANTED_SHOPS =
            """
            SELECT DISTINCT scope_shop_id
              FROM authz.role_grant
             WHERE subject_type = 'seller'
               AND subject_id = :operatorId
               AND scope_kind = 'shop'
               AND scope_shop_id IS NOT NULL
               AND revoked_at IS NULL
               AND (valid_to IS NULL OR valid_to > now())
            """;

    /**
     * 主账号的数据范围 = 本商家全部店铺，<b>含已关店</b>。关店只是不再经营，历史订单、
     * 遗留的运费模板还是他家的——按 active 过滤会让主账号丢掉自己关掉的店的数据。
     * 子账号不走这里：范围是 operator_shop 里显式授权的那些店。
     */
    private static final String MERCHANT_SHOPS = "SELECT id FROM seller.shop WHERE merchant_id = :merchantId";

    private final JdbcClient jdbc;

    public SellerOperatorResolver(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public String operatorType() {
        return CurrentOperator.TYPE_SELLER;
    }

    @Override
    public Optional<CurrentOperator> find(UUID operatorId) {
        Optional<OperatorRow> found = jdbc.sql(FIND_OPERATOR)
                .param("operatorId", operatorId)
                .query((rs, row) -> new OperatorRow(
                        rs.getObject("merchant_id", UUID.class),
                        rs.getBoolean("is_primary"),
                        rs.getString("status"),
                        rs.getLong("permission_version")))
                .optional();
        if (found.isEmpty()) {
            return Optional.empty();
        }

        OperatorRow operator = found.get();
        if (!"active".equals(operator.status())) {
            return Optional.empty();
        }

        Set<UUID> shops = Set.copyOf(
                operator.primary()
                        ? jdbc.sql(MERCHANT_SHOPS)
                                .param("merchantId", operator.merchantId())
                                .query(UUID.class)
                                .list()
                        : jdbc.sql(GRANTED_SHOPS)
                                .param("operatorId", operatorId)
                                .query(UUID.class)
                                .list());

        // 主账号的集合由清单推导（pool 含 merchant 的全部码），不再查库。
        // 原来这里读的是 common.permission 整张表，于是店主拿到了手动退真钱、全平台余额、管平台员工——
        // 三套身份共用一份清单却没有任何东西挡住跨池授予。现在清单里每个码显式标 pool。
        Set<String> permissions = operator.primary()
                ? Permission.merchantPoolCodes()
                : new HashSet<>(jdbc.sql(ROLE_PERMISSIONS)
                        .param("operatorId", operatorId)
                        .query(String.class)
                        .list());

        // 退款上限：主账号就是内置店长角色，不限；子账号取各退款角色上限的 max，其中任一不限则不限。
        // 没有退款角色的子账号这里的 null 与"不限"同形——那种情况判权已经挡住，上限轮不到被问。
        Long refundCap = null;
        if (!operator.primary()) {
            List<Long> caps = jdbc.sql(REFUND_CAPS)
                    .param("operatorId", operatorId)
                    .param("refundCode", Permission.AFTER_SALE_CASE_REFUND.code())
                    .query(Long.class)
                    .list();
            if (!caps.isEmpty() && caps.stream().allMatch(Objects::nonNull)) {
                refundCap = caps.stream().max(Long::compareTo).orElseThrow();
            }
        }

        return Optional.of(new CurrentOperator(
                operatorId,
                CurrentOperator.TYPE_SELLER,
                operator.merchantId(),
                shops,
                permissions,
                operator.version(),
                refundCap));
    }

    private record OperatorRow(UUID merchantId, boolean primary, String status, long version) {}
}
