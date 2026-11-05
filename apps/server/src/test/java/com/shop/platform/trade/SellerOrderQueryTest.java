package com.shop.platform.trade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.testsupport.IntegrationTest;
import com.shop.platform.testsupport.TestScopes;
import com.shop.platform.trade.service.SellerOrderQuery;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 卖家订单读侧：归属隔离、手机号脱敏、剩余可发由 trade 算。
 *
 * <p>用真库：归属隔离是 SQL 行为（{@code WHERE merchant_id = ?}），脱敏是解析路径行为，
 * 剩余可发是计数器聚合——三者 mock 掉都等于没验。
 */
class SellerOrderQueryTest extends IntegrationTest {

    private static final String PLAIN_PHONE = "13800001234";

    @Autowired
    private SellerOrderQuery orders;

    private UUID buyer;
    private UUID merchant;
    private UUID group;
    private UUID sellerOrder;
    private UUID shop;

    /** 归属隔离：别家商家的子单查出来是 404，不是「查出来再比对」。 */
    @Test
    void anotherMerchantsOrderIsNotFound() {
        seedOrder();

        assertThatThrownBy(() -> orders.detail(sellerOrder, TestScopes.seller(Ids.newId(), java.util.Set.of(shop))))
                .as("别家商家的单必须 404——403 本身就是「这个 id 存在」的确认")
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("订单不存在");
    }

    /** 详情里的手机号必须脱敏。 */
    @Test
    void theDetailMasksTheReceiverPhone() {
        seedOrder();

        var detail = orders.detail(sellerOrder, TestScopes.seller(merchant, java.util.Set.of(shop)));

        assertThat(detail.shippingAddress().phone())
                .as("详情是高频只读页面，把完整号码塞进去等于每看一次就泄露一次")
                .isEqualTo(PhoneNumber.mask(PLAIN_PHONE));
        assertThat(detail.shippingAddress().phone()).as("明文号码绝不能出现在响应里").doesNotContain(PLAIN_PHONE);
        assertThat(detail.shippingAddress().receiverName()).isEqualTo("张三");
    }

    /** 发货端点给完整号码——那是唯一给的地方。 */
    @Test
    void theReceiverPhoneEndpointGivesThePlainNumber() {
        seedOrder();

        var phone = orders.receiverPhone(sellerOrder, TestScopes.seller(merchant, java.util.Set.of(shop)));

        assertThat(phone.phone()).isEqualTo(PLAIN_PHONE);
        assertThat(phone.receiverName()).isEqualTo("张三");
    }

    /** 剩余可发 = 数量 − 已发 − 已退。已退的件不许再发。 */
    @Test
    void remainingExcludesShippedAndRefundedQuantities() {
        seedOrder();
        // 5 件里发了 2 件、退了 1 件 → 还剩 2 件可发
        jdbc.update(
                "UPDATE trade.order_line SET shipped_qty = 2, refunded_qty = 1 WHERE seller_order_id = ?", sellerOrder);

        var detail = orders.detail(sellerOrder, TestScopes.seller(merchant, java.util.Set.of(shop)));

        assertThat(detail.lines()).hasSize(1);
        assertThat(detail.lines().getFirst().remaining())
                .as("已退的件不许再发——全额退款未发货的单还能发货就是买家钱货两得")
                .isEqualTo(2);
    }

    /** 列表只返回自己的单。 */
    @Test
    void theListOnlyReturnsOwnOrders() {
        seedOrder();

        var mine = orders.page(TestScopes.seller(merchant, java.util.Set.of(shop)), null, null, 20);
        var someoneElses = orders.page(TestScopes.seller(Ids.newId(), java.util.Set.of(shop)), null, null, 20);

        assertThat(mine.items())
                .anySatisfy(item -> assertThat(item.sellerOrderId()).isEqualTo(sellerOrder));
        assertThat(someoneElses.items()).isEmpty();
    }

    /** 地址快照解析不出来时给占位，不 500——老单子的格式可能随迁移变过。 */
    @Test
    void anUnparsableAddressSnapshotDoesNotBreakTheDetail() {
        seedOrder();
        jdbc.update("UPDATE trade.seller_order SET shipping_address = '{}'::jsonb WHERE id = ?", sellerOrder);

        var detail = orders.detail(sellerOrder, TestScopes.seller(merchant, java.util.Set.of(shop)));

        assertThat(detail.shippingAddress().receiverName()).isNull();
        assertThat(detail.shippingAddress().phone()).isNull();
    }

    /** 店铺范围：授权集里没有这张子单的店，详情按「不存在」处理。 */
    @Test
    void anOrderOutsideTheOperatorShopScopeIsNotFound() {
        seedOrder();

        assertThatThrownBy(() -> orders.detail(sellerOrder, TestScopes.seller(merchant, java.util.Set.of(Ids.newId()))))
                .as("店不在范围内与不是你的单同一口径——404，不给「存在但无权」的确认")
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("订单不存在");
    }

    /** 店铺范围：列表只出授权店的单；空集是「没有任何店可操作」，返回空页而不是全量。 */
    @Test
    void theListIsNarrowedToTheGrantedShops() {
        seedOrder();

        assertThat(orders.page(TestScopes.seller(merchant, java.util.Set.of(Ids.newId())), null, null, 20)
                        .items())
                .as("授权了别的店，本单不可见")
                .isEmpty();
        assertThat(orders.page(TestScopes.seller(merchant, java.util.Set.of()), null, null, 20)
                        .items())
                .as("空范围 = 没有任何店可操作，不是「全部」")
                .isEmpty();
    }

    /**
     * 造一张已存在的订单：买家 + 订单组 + 子单 + 一行。
     *
     * <p>不用 service 走全链路（那要报价单、库存、商品……），这里只造读侧要读的那几行。
     */
    private void seedOrder() {
        buyer = Ids.newId();
        merchant = Ids.newId();
        group = Ids.newId();
        sellerOrder = Ids.newId();

        jdbc.update(
                """
                INSERT INTO account.buyer (id, phone, password_hash, display_name)
                VALUES (?, ?, 'x', '买家')
                """,
                buyer,
                "1" + String.format("%010d", Math.abs(buyer.hashCode()) % 10_000_000_000L));

        String addressJson = JsonColumns.write(Map.of(
                "receiverName", "张三",
                "phone", PLAIN_PHONE,
                "regionCode", "110101",
                "province", "北京市",
                "city", "北京市",
                "district", "东城区",
                "detail", "某街 1 号"));

        jdbc.update(
                """
                INSERT INTO trade.order_group
                    (id, group_no, buyer_id, quote_id, currency, goods_amount, discount_amount,
                     shipping_amount, payable_amount, shipping_address, expires_at)
                VALUES (?, ?, ?, ?, 'CNY', 5000, 0, 0, 5000, CAST(? AS jsonb), now() + interval '30 minutes')
                """,
                group,
                "PO" + group.toString().substring(0, 12),
                buyer,
                Ids.newId(),
                addressJson);

        shop = Ids.newId();
        jdbc.update(
                """
                INSERT INTO trade.seller_order
                    (id, order_no, group_id, merchant_id, shop_id, currency,
                     goods_amount, discount_amount, shipping_amount, payable_amount, shipping_address)
                VALUES (?, ?, ?, ?, ?, 'CNY', 5000, 0, 0, 5000, CAST(? AS jsonb))
                """,
                sellerOrder,
                "SO" + sellerOrder.toString().substring(0, 12),
                group,
                merchant,
                shop,
                addressJson);

        jdbc.update(
                """
                INSERT INTO trade.order_line
                    (id, seller_order_id, line_no, listing_id, sku_id, spu_id, currency,
                     quantity, unit_amount, subtotal, discount_amount, payable_amount,
                     title, category_id)
                VALUES (?, ?, 1, ?, ?, ?, 'CNY', 5, 1000, 5000, 0, 5000, '测试商品', ?)
                """,
                Ids.newId(),
                sellerOrder,
                Ids.newId(),
                Ids.newId(),
                Ids.newId(),
                Ids.newId());
    }
}
