package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.shop.dto.AdminShopQuery;
import com.shop.platform.shop.events.ShopTradingSuspendedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.model.ShopStatus;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台侧店铺治理（ACC-60）：封店 / 解封，与入驻审核（{@link ShopReviewService}）分开——
 * 审核决定的是「这店能不能开张」，治理决定的是「已经开张的店要不要继续营业」，两者的后果与入口都不同。
 *
 * <p>封店走 {@code ShopMapper.suspend}（只推 ACTIVE 行）并同事务发布 {@link ShopTradingSuspendedEvent}，
 * 级联下架口径与审核驳回完全一致：判据是「店不营业了」，不是「谁让它不营业的」。
 * 解封<b>不</b>自动重上架：下架时店铺已可能改了价、换了图，恢复营业与恢复在架是两件事，平台解封只做前一件。
 */
@Service
@RequiredArgsConstructor
public class ShopAdminService {

    private final ShopMapper shopMapper;
    private final UserReadQuery userReadQuery;
    private final StaffReadQuery staffReadQuery;
    private final RecordAuditCommand recordAuditCommand;
    private final ApplicationEventPublisher events;
    private final CacheManager cacheManager;

    /** 封停原因串：与账号注销那条区分开，审计 detail 里看得出是哪条路径封的 */
    static final String REASON_PLATFORM_SUSPEND = "PLATFORM_SUSPEND";

    /** 平台店铺列表：状态档位 + 关键字（店名或店主 ID），排序与筛选组装在 mapper */
    @Transactional(readOnly = true)
    public PageResult<AdminShopItem> pageShops(PageParams pageParams, AdminShopQuery query) {
        ShopStatus filter = Validate.enumFilter(ShopStatus.class, query.status(), "非法的店铺状态筛选值");
        String keyword = Text.blankToNull(query.keyword());
        Page<Shop> rows = shopMapper.selectPageAdmin(pageParams, filter, keyword);
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(shop -> new AdminShopItem(
                                shop.getId(),
                                shop.getName(),
                                shop.getOwnerId(),
                                shop.getStatus().name(),
                                shop.getLogoKey(),
                                shop.getCreatedAt()))
                        .toList(),
                rows.getTotal());
    }

    /**
     * 封店：ACTIVE → DISABLED，级联下架 + 审计账本同事务。
     *
     * <p>非 ACTIVE 一律 409（已停/待审/被拒）：条件更新只推 ACTIVE 行，抢不到就是「不是营业中」，
     * 不静默成功——「我封了但其实没封」是治理事故。
     */
    @Transactional
    public void suspend(UUID shopId, UUID operatorId) {
        // 1. 存在性先判（缺席与状态冲突要分开说：404 是「没这家店」，409 是「这家店不是营业中」）
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");

        // 2. 条件推进：只推 ACTIVE 行，0 行即并发下已被别人处置
        Validate.conflict(shopMapper.suspend(shopId) == 1, "只有营业中的店铺才能封店，请刷新后重试");

        // 3. 公开信息缓存：店此前对买家可见，不 evict 等于封店后还能被读到一整个 TTL
        cacheManager.getCache(CacheNames.SHOP_PUBLIC).evict(shopId);

        // 4. 同事务播报停营业：product 监听把在架商品级联下架（与审核驳回同一出口）
        events.publishEvent(new ShopTradingSuspendedEvent(shopId, REASON_PLATFORM_SUSPEND));

        // 5. 审计账本（同一事务）
        recordAuditCommand.record(
                AuditAction.SHOP_TRADING_SUSPENDED,
                shopId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "name=%s, owner_id=%s".formatted(shop.getName(), shop.getOwnerId()));
    }

    /**
     * 解封：DISABLED → ACTIVE，<b>不重上架</b>。
     *
     * <p>两道闸：① 只解 DISABLED 一档（REJECTED 是审核驳回，解它等于替审核员翻案）；
     * ② 店主账号必须仍可用 —— DISABLED 也由「店主注销连带停业」产生（ACC-72），
     * 给一个已注销账号的店解封，等于平台替用户复活了一个他已放弃的店。
     */
    @Transactional
    public void resume(UUID shopId, UUID operatorId) {
        // 1. 存在性 + 当前档位
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");
        Validate.isTrue(shop.getStatus() == ShopStatus.DISABLED, "只有已封停的店铺才能解封");

        // 2. 店主账号闸门：账号已注销/禁用时拒绝解封（同一句话，不区分两者——调用方只需知道「这个店不该被恢复」）
        Validate.isTrue(userReadQuery.isActive(shop.getOwnerId()), "店主账号已注销或被禁用，无法解封该店铺");

        // 3. 条件推进：并发下别人已处置则 0 行
        Validate.conflict(shopMapper.resume(shopId) == 1, "店铺状态已变化，请刷新后重试");

        // 4. 缓存失效（同封店：不 evict 会让解封后的店铺继续以停业态被读到）
        cacheManager.getCache(CacheNames.SHOP_PUBLIC).evict(shopId);

        // 5. 审计账本；detail 写明「未自动重上架」，免得事后查账时以为商品也回来了
        recordAuditCommand.record(
                AuditAction.SHOP_TRADING_RESUMED,
                shopId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "name=%s, owner_id=%s, products_relisted=否".formatted(shop.getName(), shop.getOwnerId()));
    }
}
