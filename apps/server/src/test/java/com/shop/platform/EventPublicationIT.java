package com.shop.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.shop.platform.admin.model.ShopReviewStatus;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 事件发布登记表集成验证（真库）：开店事务提交 → ShopCreatedEvent 与业务同事务落
 * kernel.event_publication → AFTER_COMMIT 监听在独立事务入队审核 → 登记标 COMPLETED。
 * 这条链路是「提交后崩溃可补发」的前提：登记行不在，补发无从谈起。
 */
@SpringBootTest
class EventPublicationIT extends IntegrationTestSupport {

    private static final String SHOP_CREATED_EVENT = "com.shop.platform.shop.events.ShopCreatedEvent";

    @Autowired
    private ShopService shopService;

    @Test
    void 开店_事件登记落库_审核入队() {
        // 1. 开店：事务内建店 + 发布 ShopCreatedEvent，登记与业务同事务落库
        UUID ownerId = UUID.randomUUID();
        Shop shop =
                shopService.createShop(ownerId, "登记验证店铺-" + ownerId.toString().substring(0, 8), null);
        UUID shopId = shop.getId();

        // 自建自清：登记行按序列化事件里的 shopId 圈定，其余按归属删（先父后子登记）
        db.onDelete(
                "DELETE FROM kernel.event_publication WHERE event_type = ? AND serialized_event LIKE ?",
                SHOP_CREATED_EVENT,
                "%" + shopId + "%");
        db.onDelete("DELETE FROM admin.shop_reviews WHERE shop_id = ?", shopId);
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shopId);
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shopId);

        assertEquals(ShopStatus.PENDING_REVIEW, shop.getStatus());

        // 2. 提交后 AFTER_COMMIT 监听已在独立事务入队一条 PENDING 审核（事件被消费的事实）
        Integer pendingReviews = jdbc.queryForObject(
                "SELECT count(*) FROM admin.shop_reviews WHERE shop_id = ? AND status = ?",
                Integer.class,
                shopId,
                ShopReviewStatus.PENDING.name());
        assertEquals(1, pendingReviews);

        // 3. 登记表：该事件的发布行存在且已标 COMPLETED——崩溃补发只认未完成的行，
        //    消费成功的登记到期由 EventPublicationRecoveryJob 清理
        Integer completedPublications = jdbc.queryForObject(
                """
				SELECT count(*) FROM kernel.event_publication
				WHERE event_type = ? AND serialized_event LIKE ? AND status = 'COMPLETED'
				""",
                Integer.class,
                SHOP_CREATED_EVENT,
                "%" + shopId + "%");
        assertNotNull(completedPublications);
        assertEquals(1, completedPublications);
    }
}
