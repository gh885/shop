package com.shop.platform.returns.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 售后单的读入口。买家端看自己的，商家端看自己店的，平台端看全部（走后台权限）。 */
public interface AfterSaleQuery {

    Optional<CaseView> find(UUID caseId);

    /**
     * 游标分页的列表页。{@code type}/{@code status}/{@code cursor} 传 null 表示不过滤/第一页；
     * {@code nextCursor} 为 null 表示没有下一页。
     */
    CasePage pageByBuyer(UUID buyerId, String type, String status, String cursor, int limit);

    CasePage pageByMerchant(UUID merchantId, String type, String status, String cursor, int limit);

    record CasePage(List<CaseView> items, String nextCursor) {}
}
