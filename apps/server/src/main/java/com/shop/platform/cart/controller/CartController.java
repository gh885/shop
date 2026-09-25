package com.shop.platform.cart.controller;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.BatchDeleteCartItemsRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartSelectedRequest;
import com.shop.platform.cart.service.CartCount;
import com.shop.platform.cart.service.CartItemMutationView;
import com.shop.platform.cart.service.CartItemView;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
    public CartItemMutationView addCartItem(@CurrentUser UUID userId, @Valid @RequestBody AddCartItemRequest req) {
        return CartItemMutationView.from(cartService.add(userId, req));
    }

    /** 整车列表：现价/库存/店铺信息读取时拼装，失效条目置灰保留 */
    @GetMapping("/items")
    public List<CartItemView> listCartItems(@CurrentUser UUID userId) {
        return cartService.list(userId);
    }

    /** 角标计数：免拉整车 */
    @GetMapping("/count")
    public CartCount getCartCount(@CurrentUser UUID userId) {
        return cartService.count(userId);
    }

    /** 改数量或勾选（部分更新） */
    @PutMapping("/items/{id}")
    public CartItemMutationView updateCartItem(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody UpdateCartItemRequest req) {
        return CartItemMutationView.from(cartService.update(userId, id, req));
    }

    /** 批量勾选/全选：itemIds 省略 = 整车；按店铺勾选由前端传该店条目 ID 列表 */
    @PutMapping("/items/selected")
    public void updateCartSelected(@CurrentUser UUID userId, @Valid @RequestBody UpdateCartSelectedRequest req) {
        cartService.updateSelected(userId, req);
    }

    /**
     * 删一条：204 无体，与买家地址 / 商家地址 / 收藏 / 商品的 DELETE 同口径（这四个都已标 NO_CONTENT）。
     * 不存在或不是你的条目同为 404，不给「存在但删不掉」的中间态。
     */
    @DeleteMapping("/items/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeCartItem(@CurrentUser UUID userId, @PathVariable UUID id) {
        cartService.remove(userId, id);
    }

    /**
     * 批量删：「清除失效商品」「删除选中」共用。POST 动作型入口（DELETE 带 body 语义太别扭），
     * 与 {@code /items/selected} 同为 200 空体——本模块的 RPC 动作一律 200，只有 DELETE 语义的那一条给 204，
     * 不给仓库长出第三套口径（券的 {@code /void} 是唯一例外，它有 CPN-62 那条款）。
     */
    @PostMapping("/items/batch-delete")
    public void batchRemoveCartItems(@CurrentUser UUID userId, @Valid @RequestBody BatchDeleteCartItemsRequest req) {
        cartService.batchRemove(userId, req);
    }
}
