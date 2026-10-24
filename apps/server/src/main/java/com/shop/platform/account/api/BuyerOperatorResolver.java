package com.shop.platform.account.api;

import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 买家侧的身份解析。实现 infra 的 {@link OperatorResolver} SPI。
 *
 * <p><b>买家没有权限点和店铺范围</b>，两个集合都是空的。这不是没做完，是形状不同：
 * 买家的边界是「这单是不是我的」，靠数据归属列 {@code buyer_id} 判，不靠权限点。
 * 给买家塞一套 {@code Permission} 会把卖家那套 RBAC 拖过来，然后每次判权都要多一个分支。
 *
 * <p>空集合在 {@code Authorizer.check} 里意味着买家做不了任何卖家动作——这正是想要的。
 * 需要判断"这是买家还是卖家"的地方，用 {@link CurrentOperator#operatorType()}，不要用权限是否为空去猜。
 */
@Component
public class BuyerOperatorResolver implements OperatorResolver {

    private final BuyerMapper buyers;

    public BuyerOperatorResolver(BuyerMapper buyers) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
    }

    @Override
    public String operatorType() {
        return CurrentOperator.TYPE_BUYER;
    }

    @Override
    public Optional<CurrentOperator> find(UUID buyerId) {
        return buyers.find(buyerId)
                .filter(BuyerMapper.BuyerRow::active)
                .map(row -> new CurrentOperator(
                        row.buyerId(), CurrentOperator.TYPE_BUYER, null, Set.of(), Set.of(), row.permissionVersion()));
    }
}
