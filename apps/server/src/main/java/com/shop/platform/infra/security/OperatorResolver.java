package com.shop.platform.infra.security;

import java.util.Optional;
import java.util.UUID;

/**
 * 从身份库把一个操作人解析成完整的权限视图。
 *
 * <p>接口在这里、实现在各身份域：权限判断的机制是跨模块的，但"谁是操作人、他有哪些角色和店"是各模块的知识。
 * 三套身份域各给一个实现，靠 {@link #operatorType()} 区分，<b>不合成一张 user 表</b>——合成之后
 * 每个查询里都会长出 {@code if (type == "seller")}。
 *
 * <p>为什么类型由实现声明而不是由调用方指定：令牌里的 {@code typ} 只决定"用哪个实现去查"，
 * 解析出来的人是什么类型必须以库里的行为准。两者不一致就说明令牌被伪造过。
 */
public interface OperatorResolver {

    /**
     * 这个实现负责哪一类身份，取值见 {@link CurrentOperator} 的 {@code TYPE_*} 常量。
     *
     * <p>必须与实现返回的 {@link CurrentOperator#operatorType()} 一致；不一致时
     * {@link OperatorAuthenticationConverter} 会在启动阶段报错，不会等到线上才出问题。
     */
    String operatorType();

    /** 查不到、已停用、或身份类型不适用，一律返回空。 */
    Optional<CurrentOperator> find(UUID operatorId);
}
