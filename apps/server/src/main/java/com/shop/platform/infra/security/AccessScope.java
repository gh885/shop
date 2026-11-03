package com.shop.platform.infra.security;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 一次判权通过后拿到的凭据：<b>谁的、能碰哪些数据</b>。
 *
 * <p>为什么要有这个东西：{@link Authorizer#check} 返回 {@code void}，它拒绝但不产出任何东西，
 * 于是下一行完全可以无视它——判了权，查库时不带范围，编译器不会说话。这是"先查后比对"和
 * "漏了 shop 谓词"这类越权的来源。凭据把判权的结果变成**后续代码需要的东西**：
 * 拿不到它，带范围的查询根本写不出来。
 *
 * <p>三种实现对应三个主体池。端点用哪个工厂方法（{@link Authorizer#buyer()} /
 * {@link Authorizer#seller} / {@link Authorizer#platform}）就等于声明了它服务哪个池——
 * 买家令牌打卖家接口是当场拒绝，不是"解析完再比一下 operatorType"。
 *
 * <p><b>它证明的是"某种权限通过了、范围是真的"，不是"这个权限通过了"。</b>
 * 类型系统挡不住"A 权限的凭据传给 B 操作"，那由接口覆盖测试挡（每个 Mapping 方法必须有且只有一个
 * 工厂调用）。
 */
public sealed interface AccessScope {

    /** 主体 id：买家 id / 商家账号 id / 平台员工 id，视实现而定。 */
    UUID subjectId();

    /**
     * 买家。唯一边界是「这条数据是不是我的」——靠业务表上的 {@code buyer_id} 列绑定表达，
     * 不是靠授权。所以它没有店、没有权限点。
     */
    record Buyer(UUID buyerId) implements AccessScope {

        public Buyer {
            Objects.requireNonNull(buyerId, "buyerId");
        }

        @Override
        public UUID subjectId() {
            return buyerId;
        }
    }

    /**
     * 商家账号。三个维度缺一不可：{@code merchantId} 拦别家商家，{@code shopIds} 拦同商家内
     * 未授权给这个子账号的店，{@code refundCap} 拦超上限的退款。
     *
     * <p>{@code shopIds} 为空是「没有任何店可操作」，**不是「全部店」**。方向搞反就是从小越权。
     *
     * <p>{@code refundCap} 为 null 是「不限」，不是「没有」——主账号即内置店长角色没有上限；
     * 子账号的值是他各退款角色上限的 max。它只约束动钱的动作，比较是业务规则（RmaService），
     * 不是判权：能退和能退多少是两件事。
     *
     * <p>不携带权限集：判权已经发生在这里之前，凭据只需要回答"能碰哪些数据、能动多少钱"。
     * 画菜单、审计留痕用的是 {@link CurrentOperator#permissions()}，别从这里拿。
     */
    record Seller(UUID operatorId, UUID merchantId, Set<UUID> shopIds, Long refundCap) implements AccessScope {

        public Seller {
            Objects.requireNonNull(operatorId, "operatorId");
            Objects.requireNonNull(merchantId, "merchantId");
            shopIds = Set.copyOf(Objects.requireNonNull(shopIds, "shopIds"));
        }

        @Override
        public UUID subjectId() {
            return operatorId;
        }

        /** 店不在范围内 → false。调用方一律折 404，不给"存在但无权"的确认。 */
        public boolean coversShop(UUID shopId) {
            return shopIds.contains(shopId);
        }

        /** 空集 = 一个店都碰不了，调用方直接返回空页，不查库。 */
        public boolean coversNoShop() {
            return shopIds.isEmpty();
        }
    }

    /**
     * 平台员工。**没有店铺范围**，不是"有但因为空所以没有"——这个维度对平台身份不适用。
     * 所以任何按店判权的地方都不能拿它当输入。
     */
    record Platform(UUID staffId) implements AccessScope {

        public Platform {
            Objects.requireNonNull(staffId, "staffId");
        }

        @Override
        public UUID subjectId() {
            return staffId;
        }
    }
}
