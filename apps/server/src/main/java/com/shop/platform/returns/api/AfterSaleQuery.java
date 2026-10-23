package com.shop.platform.returns.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 售后单的读入口。买家端看自己的，商家端看自己店的，平台端看全部（走后台权限）。 */
public interface AfterSaleQuery {

    Optional<CaseView> find(UUID caseId);

    List<CaseView> listByBuyer(UUID buyerId, int limit);

    List<CaseView> listByMerchant(UUID merchantId, int limit);
}
