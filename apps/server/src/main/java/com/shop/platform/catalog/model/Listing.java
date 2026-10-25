package com.shop.platform.catalog.model;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import java.util.Objects;
import java.util.UUID;

/**
 * 一个商家在某个店铺挂售某个 SPU 的关系。
 *
 * <p>状态迁移是聚合内规则，不散在 controller 或 mapper 里。非法迁移直接 409，不允许“先查再改”
 * 留下的窗口由数据库条件更新兜底。
 */
public record Listing(UUID id, UUID spuId, UUID merchantId, UUID shopId, ListingStatus status) {

    public Listing {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(spuId, "spuId");
        Objects.requireNonNull(merchantId, "merchantId");
        Objects.requireNonNull(shopId, "shopId");
        Objects.requireNonNull(status, "status");
    }

    public static Listing draft(UUID spuId, UUID merchantId, UUID shopId) {
        return new Listing(Ids.newId(), spuId, merchantId, shopId, ListingStatus.DRAFT);
    }

    public Listing transitionTo(ListingStatus target) {
        Objects.requireNonNull(target, "target");
        if (!status.canTransitionTo(target)) {
            throw BusinessException.conflict(
                    "OFFER_STATE_INVALID", "listing " + id + " 不能从 " + status + " 迁到 " + target);
        }
        return new Listing(id, spuId, merchantId, shopId, target);
    }
}
