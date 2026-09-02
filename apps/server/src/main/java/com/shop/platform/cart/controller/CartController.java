package com.shop.platform.cart.controller;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.BatchDeleteCartItemsRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartSelectedRequest;
import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.cart.service.CartCount;
import com.shop.platform.cart.service.CartItemView;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.common.Money;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家购物车。全部接口要求登录（不在 JwtAuthFilter skipPaths 内，未登录 401）。
 * 结算预览/创建订单不属于本模块——order 拿勾选条目 ID 去取数做快照。
 */
@Tag(name = "cart", description = "买家购物车（全部需登录）")
@RestController
@RequestMapping("/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;

    /** 加购：同 SKU 幂等合并为数量累加 */
    @PostMapping("/items")
    @ResponseStatus(HttpStatus.CREATED)
    public CartItemResponse addCartItem(@CurrentUser UUID userId, @Valid @RequestBody AddCartItemRequest req) {
        return CartItemResponse.from(cartService.add(userId, req));
    }

    /** 整车列表：现价/库存/店铺信息读取时拼装，失效条目置灰保留 */
    @GetMapping("/items")
    public List<CartListItemResponse> listCartItems(@CurrentUser UUID userId) {
        return cartService.list(userId).stream().map(CartListItemResponse::from).toList();
    }

    /** 角标计数：免拉整车 */
    @GetMapping("/count")
    public CartCountResponse getCartCount(@CurrentUser UUID userId) {
        return CartCountResponse.from(cartService.count(userId));
    }

    /** 改数量或勾选（部分更新） */
    @PutMapping("/items/{id}")
    public CartItemResponse updateCartItem(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody UpdateCartItemRequest req) {
        return CartItemResponse.from(cartService.update(userId, id, req));
    }

    /** 批量勾选/全选：itemIds 省略 = 整车；按店铺勾选由前端传该店条目 ID 列表 */
    @PutMapping("/items/selected")
    public void updateCartSelected(@CurrentUser UUID userId, @Valid @RequestBody UpdateCartSelectedRequest req) {
        cartService.updateSelected(userId, req);
    }

    /** 删一条 */
    @DeleteMapping("/items/{id}")
    public void removeCartItem(@CurrentUser UUID userId, @PathVariable UUID id) {
        cartService.remove(userId, id);
    }

    /** 批量删：「清除失效商品」「删除选中」共用 */
    @PostMapping("/items/batch-delete")
    public void batchRemoveCartItems(@CurrentUser UUID userId, @Valid @RequestBody BatchDeleteCartItemsRequest req) {
        cartService.batchRemove(userId, req);
    }

    /**
     * 条目出参：刻意不吐 userId（JWT 里就有，纯冗余）。前端 TS 类型尚未建立，
     * 是唯一可以从一开始就按最小契约设计的端点。
     */
    public record CartItemResponse(
            UUID id,
            UUID skuId,
            Integer quantity,
            Boolean selected,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static CartItemResponse from(CartItem item) {
            return new CartItemResponse(
                    item.getId(),
                    item.getSkuId(),
                    item.getQuantity(),
                    item.getSelected(),
                    item.getCreatedAt(),
                    item.getUpdatedAt());
        }
    }

    /** 列表条目出参：镜像 service 的 CartItemView（行字段 + 拼装展示数据），字段只减不增 */
    public record CartListItemResponse(
            UUID id,
            UUID skuId,
            Integer quantity,
            Boolean selected,
            OffsetDateTime addedAt,
            ProductInfo product,
            SkuInfo sku,
            boolean available) {

        static CartListItemResponse from(CartItemView view) {
            return new CartListItemResponse(
                    view.id(),
                    view.skuId(),
                    view.quantity(),
                    view.selected(),
                    view.addedAt(),
                    ProductInfo.from(view.product()),
                    SkuInfo.from(view.sku()),
                    view.available());
        }

        @Schema(name = "CartProductInfo", description = "购物车条目里的商品（SPU）信息")
        public record ProductInfo(UUID id, String name, String mainImage, UUID shopId, String shopName) {

            static ProductInfo from(CartItemView.ProductInfo info) {
                return new ProductInfo(info.id(), info.name(), info.mainImage(), info.shopId(), info.shopName());
            }
        }

        public record SkuInfo(
                UUID id, String name, String image, Money price, Money originalPrice, Integer stock, boolean onSale) {

            static SkuInfo from(CartItemView.SkuInfo info) {
                return new SkuInfo(
                        info.id(),
                        info.name(),
                        info.image(),
                        info.price(),
                        info.originalPrice(),
                        info.stock(),
                        info.onSale());
            }
        }
    }

    /** 角标计数出参：镜像 service 的 CartCount，字段只减不增 */
    public record CartCountResponse(long total, long selected) {

        static CartCountResponse from(CartCount count) {
            return new CartCountResponse(count.total(), count.selected());
        }
    }
}
