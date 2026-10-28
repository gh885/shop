package com.shop.platform.seller.api;

import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import java.util.HashSet;
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
            FROM seller.operator_role orl
            JOIN seller.role_permission rp ON rp.role_id = orl.role_id
            WHERE orl.operator_id = :operatorId
            """;

    private static final String GRANTED_SHOPS =
            "SELECT shop_id FROM seller.operator_shop WHERE operator_id = :operatorId";

    /**
     * 主账号的数据范围 = 本商家全部店铺，<b>含已关店</b>。关店只是不再经营，历史订单、
     * 遗留的运费模板还是他家的——按 active 过滤会让主账号丢掉自己关掉的店的数据。
     * 子账号不走这里：范围是 operator_shop 里显式授权的那些店。
     */
    private static final String MERCHANT_SHOPS = "SELECT id FROM seller.shop WHERE merchant_id = :merchantId";

    /**
     * 主账号的全部权限：**只限 seller 域**。
     *
     * <p>原来这里是 {@code SELECT code FROM common.permission}——整张表。后果是一个卖家店主
     * 拿到了 {@code SUSPENSE_MANAGE}（手动退真钱）、{@code LEDGER_VIEW}（全平台余额）、
     * {@code STAFF_MANAGE}（管平台员工）。三套身份共用一份清单，却没有任何东西挡住跨域授予。
     *
     * <p>现在按域过滤，并在启动时另有 {@code Authorizer} 的跨域授予校验做第二道。
     */
    private static final String ALL_PERMISSIONS = "SELECT code FROM common.permission WHERE domain = 'seller'";

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

        Set<String> permissions = operator.primary()
                ? Set.copyOf(jdbc.sql(ALL_PERMISSIONS).query(String.class).list())
                : new HashSet<>(jdbc.sql(ROLE_PERMISSIONS)
                        .param("operatorId", operatorId)
                        .query(String.class)
                        .list());

        return Optional.of(new CurrentOperator(
                operatorId,
                CurrentOperator.TYPE_SELLER,
                operator.merchantId(),
                shops,
                permissions,
                operator.version()));
    }

    private record OperatorRow(UUID merchantId, boolean primary, String status, long version) {}
}
