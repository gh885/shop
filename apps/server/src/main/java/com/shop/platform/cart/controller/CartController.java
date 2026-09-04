package com.shop.platform.cart.controller;

import com.shop.platform.cart.controller.response.CartCountResponse;
import com.shop.platform.cart.controller.response.CartItemResponse;
import com.shop.platform.cart.controller.response.CartListItemResponse;
import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.BatchDeleteCartItemsRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartSelectedRequest;
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
}
