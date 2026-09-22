/**
 * Account 模块跨模块事件。显式开放为命名接口，消费方均同步监听（同事务，落不成一起回滚）：
 * <ul>
 *   <li>UserDeletedEvent —— 买家账号注销生效；cart / favorite / coupon / shop 据此清掉自己那边属于这个人的数据。
 * </ul>
 *
 * <p>方向是刻意的：注销要动的东西散在四个模块里，而 account 谁都不依赖（order/shop 反过来读它的账号闸门）。
 * 若让 account 去调那四家的 api，account ↔ shop 立刻成环（shop 已依赖 account :: api）——
 * 成环时改的是依赖方向，不是事件归属（AGENTS.md「模块通信」）。事件由事实的拥有者（account）播报，
 * 各模块自己决定「这个人注销了，我这边留什么、清什么」，清理规则因此长在使用那张表的模块里。
 *
 * <p>登录/支付类通知不在这里：本模块的历史口径是日志（{@code auth.login.succeeded}），不是事件。
 *
 * <p>四个消费方的监听类名字各带自己的模块前缀（{@code CartAccountDeletionListener}…）而不叫
 * {@code AccountEventListener}：Spring 默认 bean 名只取类的简单名，四份同名即四份 {@code accountEventListener}，
 * 上下文启动直接以 ConflictingBeanDefinitionException 失败。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.account.events;
