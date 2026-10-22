package com.shop.platform.seller.api;

import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 卖家侧的身份解析。
 *
 * <p>主账号直接拿走全部权限和全部在营店铺——这是"表按多账号建、功能先只开主账号"那条决定的落点：主账号永远走得通，
 * 子账号的数据结构已经就位，将来接登录只多一条分支。
 *
 * <p>子账号的权限是「角色权限并集」，数据范围是「显式授权的店」。两者分开取，因为它们是两个维度：
 * 有"看订单"的权限，不代表能看所有店的订单。
 */
@Component
public class SellerOperatorResolver implements OperatorResolver {

    private static final String FIND_OPERATOR =
            "SELECT merchant_id, is_primary, status FROM seller.operator WHERE id = ?";

    private static final String ROLE_PERMISSIONS =
            """
            SELECT DISTINCT rp.permission_code
            FROM seller.operator_role orl
            JOIN seller.role_permission rp ON rp.role_id = orl.role_id
            WHERE orl.operator_id = ?
            """;

    private static final String GRANTED_SHOPS = "SELECT shop_id FROM seller.operator_shop WHERE operator_id = ?";

    private static final String MERCHANT_SHOPS =
            "SELECT id FROM seller.shop WHERE merchant_id = ? AND status = 'active'";

    private static final String ALL_PERMISSIONS = "SELECT code FROM common.permission";

    private final JdbcTemplate jdbc;

    public SellerOperatorResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String operatorType() {
        return CurrentOperator.TYPE_SELLER;
    }

    @Override
    public Optional<CurrentOperator> find(UUID operatorId) {
        List<OperatorRow> rows = jdbc.query(
                FIND_OPERATOR,
                (rs, row) -> new OperatorRow(
                        rs.getObject("merchant_id", UUID.class), rs.getBoolean("is_primary"), rs.getString("status")),
                operatorId);
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        OperatorRow operator = rows.getFirst();
        if (!"active".equals(operator.status())) {
            return Optional.empty();
        }

        Set<UUID> shops = Set.copyOf(jdbc.queryForList(
                operator.primary() ? MERCHANT_SHOPS : GRANTED_SHOPS,
                UUID.class,
                operator.primary() ? operator.merchantId() : operatorId));

        Set<String> permissions = operator.primary()
                ? Set.copyOf(jdbc.queryForList(ALL_PERMISSIONS, String.class))
                : new HashSet<>(jdbc.queryForList(ROLE_PERMISSIONS, String.class, operatorId));

        return Optional.of(new CurrentOperator(
                operatorId, CurrentOperator.TYPE_SELLER, operator.merchantId(), shops, permissions));
    }

    private record OperatorRow(UUID merchantId, boolean primary, String status) {}
}
