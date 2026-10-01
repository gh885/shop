package com.shop.platform.shop.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.shop.events.ShopTradingSuspendedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.model.ShopStatus;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 平台店铺治理（ACC-60）的 service 单测：状态码口径、级联下架事件的发布与不发布、解封的店主账号闸门。
 * 逻辑是纯编排（mapper + 事件 + 缓存 + 审计），不连库——级联下架由 product 监听落地，那条归 ShopReviewFlowIT
 * 那类连库用例；这里只钉「本服务在该发时发、在不该发时一律不发，并且各档状态码给对」。
 */
@ExtendWith(MockitoExtension.class)
class ShopAdminServiceTest {

    @Mock
    ShopMapper shopMapper;

    @Mock
    UserReadQuery userReadQuery;

    @Mock
    StaffReadQuery staffReadQuery;

    @Mock
    RecordAuditCommand recordAuditCommand;

    @Mock
    ApplicationEventPublisher events;

    @Mock
    CacheManager cacheManager;

    @Mock
    Cache cache;

    @InjectMocks
    ShopAdminService service;

    private static final UUID SHOP_ID = UUID.randomUUID();
    private static final UUID OWNER_ID = UUID.randomUUID();
    private static final UUID OPERATOR_ID = UUID.randomUUID();

    private Shop shop(ShopStatus status) {
        return Shop.builder()
                .id(SHOP_ID)
                .ownerId(OWNER_ID)
                .name("测试店")
                .status(status)
                .build();
    }

    @Test
    void 封店_店铺不存在_404() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(null);

        var ex = assertThrows(BusinessException.class, () -> service.suspend(SHOP_ID, OPERATOR_ID));
        assertEquals(404, ex.getHttpStatus());
        // 404 是「没这家店」，与下面 409「这家店不是营业中」分开说：缺席与状态冲突不共用一句话
        verify(shopMapper, never()).suspend(any());
        verifyNoInteractions(events, recordAuditCommand, cacheManager);
    }

    @Test
    void 封店_非营业态_条件更新0行_409_不发事件不记审计() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.ACTIVE));
        // selectById 看见 ACTIVE，落 suspend 时已被别人处置 → 0 行：并发下的「不是营业中」
        when(shopMapper.suspend(SHOP_ID)).thenReturn(0);

        var ex = assertThrows(BusinessException.class, () -> service.suspend(SHOP_ID, OPERATOR_ID));
        assertEquals(409, ex.getHttpStatus());
        // 抢不到行就不该替别人刚处置的店级联下架，也不该在账本里补第二行封禁
        verifyNoInteractions(events, recordAuditCommand, cacheManager);
    }

    @Test
    void 封店成功_发级联停营业事件_同事务记审计并evict缓存() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.ACTIVE));
        when(shopMapper.suspend(SHOP_ID)).thenReturn(1);
        when(cacheManager.getCache(CacheNames.SHOP_PUBLIC)).thenReturn(cache);

        service.suspend(SHOP_ID, OPERATOR_ID);

        var captor = ArgumentCaptor.forClass(ShopTradingSuspendedEvent.class);
        verify(events).publishEvent(captor.capture());
        assertEquals(SHOP_ID, captor.getValue().shopId());
        // reason 区分平台封禁与店主注销：product 侧级联下架口径相同，但审计要看得出是谁让它停止营业
        assertEquals(ShopAdminService.REASON_PLATFORM_SUSPEND, captor.getValue().reason());
        // 店此前对买家可见，不 evict 等于封店后仍被整 TTL 读到
        verify(cache).evict(SHOP_ID);
        verify(recordAuditCommand)
                .record(eq(AuditAction.SHOP_TRADING_SUSPENDED), eq(SHOP_ID), eq(OPERATOR_ID), any(), anyString());
    }

    @Test
    void 解封_店铺不存在_404() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(null);

        var ex = assertThrows(BusinessException.class, () -> service.resume(SHOP_ID, OPERATOR_ID));
        assertEquals(404, ex.getHttpStatus());
        verifyNoInteractions(userReadQuery, events, recordAuditCommand, cacheManager);
    }

    @Test
    void 解封_非已封停档_400_不查店主账号() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.ACTIVE));

        var ex = assertThrows(BusinessException.class, () -> service.resume(SHOP_ID, OPERATOR_ID));
        assertEquals(400, ex.getHttpStatus());
        // 档位判据排在账号闸门之前：不是 DISABLED 根本不该去查店主状态
        verifyNoInteractions(userReadQuery);
        verify(shopMapper, never()).resume(any());
    }

    @Test
    void 解封_店主账号已注销_400_不推进状态() {
        // ACC-72 那道闸：DISABLED 也由店主注销连带产生，给一个已放弃的店解封等于平台替用户复活它
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.DISABLED));
        when(userReadQuery.isActive(OWNER_ID)).thenReturn(false);

        var ex = assertThrows(BusinessException.class, () -> service.resume(SHOP_ID, OPERATOR_ID));
        assertEquals(400, ex.getHttpStatus());
        verify(shopMapper, never()).resume(any());
        verifyNoInteractions(events, recordAuditCommand, cacheManager);
    }

    @Test
    void 解封_并发0行_409_不evict也不记审计() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.DISABLED));
        when(userReadQuery.isActive(OWNER_ID)).thenReturn(true);
        when(shopMapper.resume(SHOP_ID)).thenReturn(0);

        var ex = assertThrows(BusinessException.class, () -> service.resume(SHOP_ID, OPERATOR_ID));
        assertEquals(409, ex.getHttpStatus());
        // 条件更新排在 evict/审计之前：抢不到行说明别人已处置，不该再动缓存或补一行账
        verifyNoInteractions(cacheManager, recordAuditCommand, events);
    }

    @Test
    void 解封成功_只evict不发事件_重上架归卖家() {
        when(shopMapper.selectById(SHOP_ID)).thenReturn(shop(ShopStatus.DISABLED));
        when(userReadQuery.isActive(OWNER_ID)).thenReturn(true);
        when(shopMapper.resume(SHOP_ID)).thenReturn(1);
        when(cacheManager.getCache(CacheNames.SHOP_PUBLIC)).thenReturn(cache);

        service.resume(SHOP_ID, OPERATOR_ID);

        // 恢复营业 ≠ 平台背书历史商品仍在架：解封不发任何下架/上架事件，重上架由卖家逐件复检
        verifyNoInteractions(events);
        verify(cache).evict(SHOP_ID);
        var detail = ArgumentCaptor.forClass(String.class);
        verify(recordAuditCommand)
                .record(eq(AuditAction.SHOP_TRADING_RESUMED), eq(SHOP_ID), eq(OPERATOR_ID), any(), detail.capture());
        // 账本写明「未自动重上架」，免得事后查账时以为商品也回来了
        assertTrue(detail.getValue().contains("products_relisted=否"));
    }
}
