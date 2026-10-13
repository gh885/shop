package com.shop.platform.account.api;

import com.shop.platform.account.mapper.ShopSubaccount;
import com.shop.platform.account.service.SubaccountService;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 子账号只读查询（跨模块消费）：店铺侧的管理列表与明细，以及卖家过滤器每请求的会话装载。
 *
 * <p>{@link #findActiveSession} 是判权路径上唯一的一次查库（每请求跑，不吃缓存）——
 * 「停用下一请求即生效」这条口径就落在这里：它取不到 ACTIVE 行，卖家链立刻 403。
 */
@Component
@RequiredArgsConstructor
public class SubaccountReadQuery {

    private final SubaccountService subaccountService;

    /**
     * 判权用的会话：子账号 id → （店铺 + 权限码）。不是 ACTIVE（待激活 / 已停用 / 已移除）一律 empty，
     * 由调用方按「上下文与角色」的 403 处理（fail-close）。
     */
    public Optional<SubaccountSession> findActiveSession(UUID subaccountId) {
        ShopSubaccount row = subaccountService.findActiveSession(subaccountId);
        if (row == null) {
            return Optional.empty();
        }
        List<String> permissions = row.getPermissions() == null ? List.of() : List.copyOf(row.getPermissions());
        return Optional.of(new SubaccountSession(row.getId(), row.getShopId(), permissions));
    }

    /** 本店全部子账号（管理页列表），先建号的在前 */
    public List<SubaccountSummary> listByShop(UUID shopId) {
        return subaccountService.listByShop(shopId).stream()
                .map(SubaccountSummary::from)
                .toList();
    }

    /** 本店某个子账号的明细；别店的行与不存在的行一样返回 empty（调用方给同一句 404） */
    public Optional<SubaccountSummary> findInShop(UUID subaccountId, UUID shopId) {
        return Optional.ofNullable(subaccountService.findInShop(subaccountId, shopId))
                .map(SubaccountSummary::from);
    }
}
