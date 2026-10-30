package com.shop.platform.cart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.cart.service.CartViews.AddedItem;
import com.shop.platform.cart.service.CartViews.CartCount;
import com.shop.platform.cart.service.CartViews.CartLine;
import com.shop.platform.cart.service.CartViews.CartView;
import com.shop.platform.cart.service.CartViews.SkuInfo;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.CartRules;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import jakarta.validation.Validation;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * 购物车的服务规则：同 SKU 合并封顶、种类上限、加购/并入两道闸门、声明式勾选、读时置灰、归属隔离。
 * 每个用例用独立买家与独立商品，互不清理。
 */
class CartServiceTest extends IntegrationTest {

    @Autowired
    private CartService cart;

    @Autowired
    private JdbcClient jdbc;

    // —— 加购 ——

    @Test
    void 同SKU幂等合并为数量累加() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();

        AddedItem first = cart.add(buyer, sku, request(2).quantity());
        AddedItem second = cart.add(buyer, sku, request(5).quantity());

        assertThat(first.quantity()).isEqualTo(2);
        assertThat(second.quantity()).isEqualTo(7);
        assertThat(second.totalKinds()).isEqualTo(1);
    }

    @Test
    void 合并在单条目上限处封顶_回显真值() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();

        AddedItem merged =
                cart.add(buyer, sku, request(CartRules.LINE_QUANTITY_MAX).quantity());
        AddedItem again = cart.add(buyer, sku, request(50).quantity());

        assertThat(merged.quantity()).isEqualTo(CartRules.LINE_QUANTITY_MAX);
        assertThat(again.quantity()).isEqualTo(CartRules.LINE_QUANTITY_MAX);
    }

    @Test
    void 不可售拒收并带稳定错误码() {
        UUID buyer = UUID.randomUUID();
        UUID ghost = UUID.randomUUID();

        assertThatThrownBy(() -> cart.add(buyer, ghost, request(1).quantity()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode())
                        .isEqualTo(ErrorCodes.CART_SKU_NOT_SELLABLE));
        assertThat(cart.list(buyer).lines()).isEmpty();
    }

    @Test
    void 车满拒收新种类_同SKU累加不受拦() {
        UUID buyer = UUID.randomUUID();
        List<UUID> kinds = new ArrayList<>();
        for (int i = 0; i < CartRules.ITEM_KINDS_MAX; i++) {
            kinds.add(seedSellable().skuId());
        }
        kinds.forEach(sku -> cart.add(buyer, sku, request(1).quantity()));

        assertThatThrownBy(
                        () -> cart.add(buyer, seedSellable().skuId(), request(1).quantity()))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.CART_FULL));

        cart.add(buyer, kinds.getFirst(), request(1).quantity());
        assertThat(cart.count(buyer).total()).isEqualTo(CartRules.ITEM_KINDS_MAX);
    }

    @Test
    void 数量低于下限被DTO挡在门外() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var violations = validator.validate(request(0));
        var violationsNegative = validator.validate(request(-3));

        assertThat(violations).hasSize(1);
        assertThat(violationsNegative).hasSize(1);
    }

    // —— 并入 ——

    @Test
    void 游标并入不做在售闸门_失效商品照收() {
        UUID buyer = UUID.randomUUID();
        UUID dead = seedSellable().skuId();
        UUID alive = seedSellable().skuId();
        jdbc.sql(
                        "UPDATE catalog.listing SET status = 'offline' WHERE spu_id IN (SELECT spu_id FROM catalog.sku WHERE id = ?)")
                .param(dead)
                .update();

        cart.merge(buyer, List.of(new CartService.MergeLine(dead, 1), new CartService.MergeLine(alive, 2)));

        CartView view = cart.list(buyer);
        assertThat(view.lines()).hasSize(2);
        assertThat(view.lines().stream().filter(CartLine::available).map(CartLine::skuId))
                .containsExactly(alive);
        assertThat(view.lines().stream().filter(l -> !l.available()).map(CartLine::skuId))
                .containsExactly(dead);
    }

    @Test
    void 并入与加购同一条合并路径() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();
        cart.add(buyer, sku, request(3).quantity());

        cart.merge(buyer, List.of(new CartService.MergeLine(sku, 4)));

        assertThat(cart.list(buyer).lines().getFirst().quantity()).isEqualTo(7);
    }

    @Test
    void 并入受种类上限拦_新种类超限静默丢弃_已有种类照常累加() {
        UUID buyer = UUID.randomUUID();
        List<UUID> kinds = new ArrayList<>();
        for (int i = 0; i < CartRules.ITEM_KINDS_MAX; i++) {
            kinds.add(seedSellable().skuId());
        }
        kinds.forEach(sku -> cart.add(buyer, sku, request(1).quantity()));
        UUID overflow = seedSellable().skuId();
        UUID overflow2 = seedSellable().skuId();

        // 两行新种类都越线：静默丢弃，不抛错
        cart.merge(buyer, List.of(new CartService.MergeLine(overflow, 1), new CartService.MergeLine(overflow2, 1)));
        // 已有种类照常累加
        cart.merge(buyer, List.of(new CartService.MergeLine(kinds.getFirst(), 3)));

        assertThat(cart.count(buyer).total()).isEqualTo(CartRules.ITEM_KINDS_MAX);
        assertThat(cart.list(buyer).lines().stream()
                        .filter(l -> l.skuId().equals(kinds.getFirst()))
                        .findFirst()
                        .orElseThrow()
                        .quantity())
                .isEqualTo(4);
    }

    @Test
    void 并入同行重复sku不重复计种类() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();

        cart.merge(buyer, List.of(new CartService.MergeLine(sku, 1), new CartService.MergeLine(sku, 2)));

        assertThat(cart.count(buyer).total()).isEqualTo(1);
        assertThat(cart.list(buyer).lines().getFirst().quantity()).isEqualTo(3);
    }

    @Test
    void 列表型入参超过种类上限被DTO挡在门外() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        List<UUID> tooMany = new ArrayList<>();
        for (int i = 0; i <= CartRules.ITEM_KINDS_MAX; i++) {
            tooMany.add(UUID.randomUUID());
        }

        assertThat(validator.validate(new com.shop.platform.cart.dto.MergeCartRequest(
                        java.util.stream.IntStream.rangeClosed(0, CartRules.ITEM_KINDS_MAX)
                                .mapToObj(i ->
                                        new com.shop.platform.cart.dto.MergeCartRequest.MergeLine(UUID.randomUUID(), 1))
                                .toList())))
                .hasSize(1);
        assertThat(validator.validate(new com.shop.platform.cart.dto.ReplaceSelectionRequest(tooMany)))
                .hasSize(1);
        assertThat(validator.validate(new com.shop.platform.cart.dto.BatchDeleteRequest(tooMany)))
                .hasSize(1);
    }

    // —— 整车与置灰 ——

    @Test
    void 下架后读时置灰_条目原样保留() {
        UUID buyer = UUID.randomUUID();
        Seed seed = seedSellable();
        cart.add(buyer, seed.skuId(), request(2).quantity());

        assertThat(cart.list(buyer).lines().getFirst().available()).isTrue();

        jdbc.sql("UPDATE catalog.listing SET status = 'offline' WHERE id = ?")
                .param(seed.listingId())
                .update();

        CartLine line = cart.list(buyer).lines().getFirst();
        assertThat(line.available()).isFalse();
        assertThat(line.unavailableReason()).isEqualTo(CartLine.REASON_UNAVAILABLE);
        assertThat(line.sku()).isNull();
        assertThat(line.quantity()).isEqualTo(2);
    }

    @Test
    void 整车带展示数据与店名() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();
        cart.add(buyer, sku, request(1).quantity());

        SkuInfo info = cart.list(buyer).lines().getFirst().sku();
        assertThat(info.title()).isEqualTo("测试商品");
        assertThat(info.shopName()).isEqualTo("测试店");
        assertThat(info.price().amount()).isEqualTo(1200);
    }

    @Test
    void 角标计数分总与勾选() {
        UUID buyer = UUID.randomUUID();
        UUID a = seedSellable().skuId();
        UUID b = seedSellable().skuId();
        cart.add(buyer, a, request(1).quantity());
        cart.add(buyer, b, request(1).quantity());

        assertThat(cart.count(buyer)).isEqualTo(new CartCount(2, 2));
    }

    // —— 勾选 ——

    @Test
    void 勾选集合声明式重设_先清后置() {
        UUID buyer = UUID.randomUUID();
        UUID a = seedSellable().skuId();
        UUID b = seedSellable().skuId();
        UUID c = seedSellable().skuId();
        cart.add(buyer, a, request(1).quantity());
        cart.add(buyer, b, request(1).quantity());
        cart.add(buyer, c, request(1).quantity());

        cart.replaceSelection(buyer, List.of(a, b));
        assertThat(cart.count(buyer).selected()).isEqualTo(2);

        cart.replaceSelection(buyer, List.of(c));
        assertThat(cart.count(buyer).selected()).isEqualTo(1);

        cart.replaceSelection(buyer, List.of());
        assertThat(cart.count(buyer).selected()).isZero();
    }

    // —— 删改 ——

    @Test
    void 改数量与删除走skuId寻址() {
        UUID buyer = UUID.randomUUID();
        UUID sku = seedSellable().skuId();
        cart.add(buyer, sku, request(2).quantity());

        cart.updateQuantity(buyer, sku, 9);
        assertThat(cart.list(buyer).lines().getFirst().quantity()).isEqualTo(9);

        cart.remove(buyer, sku);
        assertThat(cart.list(buyer).lines()).isEmpty();
    }

    @Test
    void 批量删只动传入的条目() {
        UUID buyer = UUID.randomUUID();
        UUID a = seedSellable().skuId();
        UUID b = seedSellable().skuId();
        cart.add(buyer, a, request(1).quantity());
        cart.add(buyer, b, request(1).quantity());

        cart.removeAll(buyer, List.of(a, UUID.randomUUID()));

        CartView view = cart.list(buyer);
        assertThat(view.lines()).hasSize(1);
        assertThat(view.lines().getFirst().skuId()).isEqualTo(b);
    }

    // —— 归属 ——

    @Test
    void 买家之间互相不可见不可改() {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        UUID sku = seedSellable().skuId();
        cart.add(owner, sku, request(2).quantity());

        assertThat(cart.list(stranger).lines()).isEmpty();
        assertThat(cart.count(stranger).total()).isZero();

        // 别人改数量/删条目都是 no-op：条件更新带 buyer_id，0 行是判决
        cart.updateQuantity(stranger, sku, 99);
        cart.remove(stranger, sku);
        cart.removeAll(stranger, List.of(sku));

        CartLine line = cart.list(owner).lines().getFirst();
        assertThat(line.quantity()).isEqualTo(2);
    }

    @Test
    void 突变入参带不上buyer_归属只从令牌来是service签名决定的() {
        // 编译期事实：CartService 所有方法都以 buyerId 为首参，DTO 里没有 buyer 字段。
        // 这里只验证 DTO 确实没有归属字段可传——归侵略性由 ArchitectureTest 兜底，此用例作占位说明。
        var fields = AddCartItemRequest.class.getRecordComponents();
        assertThat(fields)
                .extracting(java.lang.reflect.RecordComponent::getName)
                .containsExactly("skuId", "quantity");
    }

    // —— 断言与种子 ——

    private AddCartItemRequest request(int quantity) {
        return new AddCartItemRequest(UUID.randomUUID(), quantity);
    }

    private record Seed(UUID skuId, UUID listingId) {}

    private Seed seedSellable() {
        UUID categoryId = Ids.newId();
        jdbc.sql("INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 3, ?, '测试类目')")
                .param(categoryId)
                .param("/" + Ids.newId() + "/" + Ids.newId() + "/" + categoryId + "/")
                .param("C" + Math.abs(categoryId.hashCode()))
                .update();
        UUID spuId = Ids.newId();
        UUID merchantId = Ids.newId();
        jdbc.sql("INSERT INTO catalog.spu (id, merchant_id, category_id, title) VALUES (?, ?, ?, '测试商品')")
                .param(spuId)
                .param(merchantId)
                .param(categoryId)
                .update();
        UUID skuId = Ids.newId();
        jdbc.sql("INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, price_amount, price_currency, status)"
                        + " VALUES (?, ?, '{}'::jsonb, ?, 1200, 'CNY', 'active')")
                .param(skuId)
                .param(spuId)
                .param("spec-" + skuId)
                .update();
        UUID shopId = Ids.newId();
        jdbc.sql("INSERT INTO seller.shop (id, merchant_id, name) VALUES (?, ?, '测试店')")
                .param(shopId)
                .param(merchantId)
                .update();
        UUID listingId = Ids.newId();
        jdbc.sql("INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')")
                .param(listingId)
                .param(spuId)
                .param(merchantId)
                .param(shopId)
                .update();
        return new Seed(skuId, listingId);
    }
}
