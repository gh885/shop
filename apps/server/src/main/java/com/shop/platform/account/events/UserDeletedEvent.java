package com.shop.platform.account.events;

import java.util.UUID;

/**
 * 账号注销生效事件：买家的账号在冷静期满后被匿名化（个人信息清空、身份失去全部资格）的同一事务内发布。
 *
 * <p>消费方同步监听（同事务，落不成一起回滚）：cart 清购物车、favorite 清收藏、coupon 作废未使用的券、
 * shop 摘掉本人的店铺成员身份并在其为店主时停掉该店营业。事件只播报「这个身份已经注销」这一个事实，
 * 不携带任何个人信息——注销之后再去广播手机号本身就是违例。
 *
 * <p>刻意不带来历（是本人申请还是别的）：全平台只有本人申请这一条路，加了字段就是给未来的
 * 「平台代注销」留一个没人校验的入口。
 *
 * <p>冷静期内撤销不发事件：那期间什么都没动过，复原是账号自己的事（见 {@code AccountDeletionService#cancel}）；
 * 注销生效之后也没有反向事件——注销不可逆，要回来请用手机号重新注册成新主体（ACC-77）。
 */
public record UserDeletedEvent(UUID userId) {}
