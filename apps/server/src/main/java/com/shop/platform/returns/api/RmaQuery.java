package com.shop.platform.returns.api;

import com.shop.platform.infra.security.AccessScope;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 售后单的读入口。买家端看自己的，商家端看自己店的，平台端看全部（走后台权限）。 */
public interface RmaQuery {

    /**
     * 商家侧点查：归属与店铺范围都在 SQL 里，别家或别店的售后单查出来是空，调用方折 404。
     */
    Optional<CaseView> findForMerchant(UUID caseId, AccessScope.Seller scope);

    /** 买家侧点查，同上（buyer_id）。 */
    Optional<CaseView> findForBuyer(UUID caseId, UUID buyerId);

    /**
     * 游标分页的列表页。{@code type}/{@code status}/{@code cursor} 传 null 表示不过滤/第一页；
     * {@code nextCursor} 为 null 表示没有下一页。
     */
    CasePage pageByBuyer(UUID buyerId, String type, String status, String cursor, int limit);

    CasePage pageByMerchant(AccessScope.Seller scope, String type, String status, String cursor, int limit);

    record CasePage(List<CaseView> items, @Schema(nullable = true) String nextCursor) {}
}
