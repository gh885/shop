package com.shop.platform.infra.security;

import java.util.Optional;
import java.util.UUID;

/**
 * 从身份库把一个操作人解析成完整的权限视图。
 *
 * <p>接口在这里、实现在 {@code seller/api}：权限判断的机制是跨模块的，但"谁是操作人、他有哪些角色和店"是
 * 卖家模块的知识。买家端和平台端将来各给一个实现。
 */
public interface OperatorResolver {

    /** 查不到、已停用、或身份类型不适用，一律返回空。 */
    Optional<CurrentOperator> find(UUID operatorId);
}
