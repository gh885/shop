package com.shop.platform.seller.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * 商家点查。治理审核队列拼申请主体名称用。
 *
 * <p>返回空 Map 或缺键 = 查不到这个商家，调用方兜底展示，不报错——名称是展示信息不是判定输入。
 */
public interface MerchantQuery {

    /** 商家名批查，查不到的键不在返回 Map 里。 */
    Map<UUID, String> namesByIds(Collection<UUID> merchantIds);
}
