package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopReviewService;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 店铺停业治理链集成验证（真库）：审核驳回 → 同事务级联下架该店在架商品（product 监听 shop :: events）→
 * 买家侧公开详情 404、公开列表不再召回；恢复 ACTIVE 不自动回上架（要卖家手动重上）。
 * 交易入口的营业闸门另用直插的 DISABLED 店验证：下单 / 加购一律 409「店铺已停止营业」。
 *
 * <p>与 {@code ShopGovernanceIT} 的分工：那边管店铺自己的状态机与审核留痕，这里管「停业对商品与交易的外溢」。
 */
@SpringBootTest
class ShopSuspensionIT extends IntegrationTestSupport {

    @Autowired
    private ShopService shopService;

    @Autowired
    private ShopReviewService shopReviewService;

    @Autowired
    private ProductQueryService productQueryService;

    @Autowired
    private CartService cartService;

    @Autowired
    private OrderService orderService;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID staffId = UUID.randomUUID();

    private final UUID buyerId = UUID.randomUUID();

    /** 开店（PENDING_REVIEW + 店主 ACTIVE 成员 + 审核入队，全由 createShop 同事务完成）并登记清理 */
    private Shop openShop(String name) {
        Shop shop = shopService.createShop(ownerId, name, null);
        db.onDelete("DELETE FROM shop.shop_reviews WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shop.getId());
        return shop;
    }

    private UUID reviewId(UUID shopId) {
        UUID id = jdbc.queryForObject(
                "SELECT id FROM shop.shop_reviews WHERE shop_id = ?::uuid LIMIT 1", UUID.class, shopId.toString());
        assertNotNull(id, "审核单未入队: " + shopId);
        return id;
    }

    /** 为该店再造一条待审记录（一店可有多轮审核：驳回后重新提交是常态） */
    private UUID newPendingReview(UUID shopId) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.shop_reviews (id, shop_id, status) VALUES (?::uuid, ?::uuid, 'PENDING')",
                id.toString(),
                shopId.toString());
        return id;
    }

    private String productStatus(UUID productId) {
        String status = jdbc.queryForObject(
                "SELECT status FROM product.products WHERE id = ?::uuid", String.class, productId.toString());
        assertNotNull(status);
        return status;
    }

    private String shopStatus(UUID shopId) {
        String status = jdbc.queryForObject(
                "SELECT status FROM shop.shops WHERE id = ?::uuid", String.class, shopId.toString());
        assertNotNull(status);
        return status;
    }

    /** 店的商品（PUBLISHED + 在售 SKU + 库存行），返回 [productId, skuId]；清理由 seedOnSaleSku 登记 */
    private UUID[] seedPublishedProduct(UUID shopId) {
        UUID skuId = db.seedOnSaleSku(shopId, 1000, 5);
        return new UUID[] {db.productIdOfSku(skuId), skuId};
    }

    @Test
    void 审核驳回_该店在架商品级联下架_公开详情404() {
        Shop shop = openShop("驳回级联店");
        UUID[] product = seedPublishedProduct(shop.getId());
        assertEquals("PUBLISHED", productStatus(product[0]));

        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        // 1. 店铺状态推进与商品下架同事务：驳回返回即可查到商品已不在架上
        assertEquals(ShopStatus.REJECTED.name(), shopStatus(shop.getId()));
        assertEquals("WAREHOUSE", productStatus(product[0]));
        // 2. 买家侧读闸：公开详情 404（不泄露「存在但被下架」），公开列表也召回不到
        BusinessException hidden =
                assertThrows(BusinessException.class, () -> productQueryService.publicDetail(product[0]));
        assertEquals(404, hidden.getHttpStatus());
        assertEquals(
                0L,
                productQueryService
                        .pagePublic(new ProductQuery(null, shop.getId(), null, null), 1, 10)
                        .total());
    }

    @Test
    void 驳回店重新审核通过_商品不自动回上架() {
        Shop shop = openShop("驳回后复活店");
        UUID[] product = seedPublishedProduct(shop.getId());
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");
        assertEquals("WAREHOUSE", productStatus(product[0]));

        // 重新提审并通过：店铺回 ACTIVE。级联只有单向事件——恢复营业 ≠ 平台背书历史商品仍满足上架门槛
        shopReviewService.approve(newPendingReview(shop.getId()), staffId);

        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shop.getId()));
        assertEquals("WAREHOUSE", productStatus(product[0]));
        assertThrows(BusinessException.class, () -> productQueryService.publicDetail(product[0]));
        // 卖家侧仍在册（下架不是删除），要卖家自己重新上架
        assertTrue(jdbc.queryForObject(
                        "SELECT count(*) FROM product.products WHERE id = ?::uuid",
                        Integer.class,
                        product[0].toString())
                > 0);
    }

    @Test
    void 禁用店_加购被闸_409() {
        // 直插一家 DISABLED 店（平台禁用尚无写入端点，闸门按「店是否 ACTIVE」判定，与状态来源无关）
        UUID shopId = seedShopWithStatus(ShopStatus.DISABLED);
        UUID[] product = seedPublishedProduct(shopId);

        BusinessException ex = assertThrows(
                BusinessException.class, () -> cartService.add(buyerId, new AddCartItemRequest(product[1], 1)));

        assertEquals(409, ex.getHttpStatus());
        assertEquals("店铺已停止营业", ex.getDetail());
        assertNull(ex.getCode()); // 只有 status 够区分，不加 error code
        assertEquals(
                0,
                jdbc.queryForObject(
                                "SELECT count(*) FROM cart.items WHERE user_id = ?::uuid",
                                Integer.class,
                                buyerId.toString())
                        .intValue());
    }

    @Test
    void 禁用店_下单被闸_409且不落单不冻库存() {
        UUID shopId = seedShopWithStatus(ShopStatus.DISABLED);
        UUID[] product = seedPublishedProduct(shopId);
        db.seedActiveUser(buyerId);
        db.onDeleteBuyerOrderChain(buyerId);
        UUID addressId = db.seedAddress(buyerId);

        var req = new CreateOrderRequest(
                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(product[1], 1)), null, null);
        BusinessException ex = assertThrows(BusinessException.class, () -> orderService.create(buyerId, req));

        assertEquals(409, ex.getHttpStatus());
        assertEquals("店铺已停止营业", ex.getDetail());
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid",
                        Integer.class,
                        buyerId.toString()));
        // 闸门在冻结之前：库存分毫未动（total 5 / frozen 0）
        assertEquals(
                0,
                jdbc.queryForObject(
                                "SELECT frozen_stock FROM inventory.sku_stock WHERE sku_id = ?::uuid",
                                Integer.class,
                                product[1].toString())
                        .intValue());
    }

    /** 对照：ACTIVE 店的同款商品能加购 —— 闸门只停业、不误伤正常链路 */
    @Test
    void 正常店_同款商品可加购() {
        UUID shopId = seedShopWithStatus(ShopStatus.ACTIVE);
        UUID[] product = seedPublishedProduct(shopId);
        db.onDelete("DELETE FROM cart.items WHERE sku_id = ?::uuid", product[1].toString());

        assertNotNull(cartService.add(buyerId, new AddCartItemRequest(product[1], 1)));
    }

    /** 驳回店的下单先撞「部分商品已下架」那道 400：商品已被级联下架，走不到店那道闸（闸门的验证用上面两例 DISABLED 店） */
    @Test
    void 驳回店_结算行判定为已下架_下单被拒400() {
        Shop shop = openShop("驳回后下单店");
        UUID[] product = seedPublishedProduct(shop.getId());
        db.seedActiveUser(buyerId);
        UUID addressId = db.seedAddress(buyerId);
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> orderService.create(
                        buyerId,
                        new CreateOrderRequest(
                                UUID.randomUUID(),
                                addressId,
                                List.of(new OrderLineRequest(product[1], 1)),
                                null,
                                null)));

        assertEquals(400, ex.getHttpStatus());
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid",
                        Integer.class,
                        buyerId.toString()));
    }

    /** 造一家指定状态的店（店主 = ownerId），登记清理 */
    private UUID seedShopWithStatus(ShopStatus status) {
        UUID shopId = db.seedShop(UUID.randomUUID(), status.name());
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?::uuid", shopId.toString());
        return shopId;
    }
}
