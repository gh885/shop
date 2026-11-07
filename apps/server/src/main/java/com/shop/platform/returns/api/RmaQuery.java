package com.shop.platform.returns.api;

import com.shop.platform.infra.security.AccessScope;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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

    /**
     * 这批子单里哪些还挂着未终态售后。给履约的自动收货任务用：有未结案的子单先别替买家签收，
     * 不然"货还在扯皮、钱已经解冻"——订单完成事件的分量比一个包裹的签收重。
     * 售后超时机制保证未结案必然收敛（每一段都有 deadline），所以这个避让是暂时的，不是扣住不放。
     */
    Set<UUID> openCaseOrderIds(Collection<UUID> sellerOrderIds);

    record CasePage(List<CaseView> items, @Schema(nullable = true) String nextCursor) {}
}
