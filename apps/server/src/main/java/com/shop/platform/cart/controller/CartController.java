package com.shop.platform.cart.controller;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.BatchDeleteRequest;
import com.shop.platform.cart.dto.MergeCartRequest;
import com.shop.platform.cart.dto.ReplaceSelectionRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.cart.service.CartViews.AddedItem;
import com.shop.platform.cart.service.CartViews.CartCount;
import com.shop.platform.cart.service.CartViews.CartView;
import com.shop.platform.infra.security.Authorizer;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 购物车入口。全部需登录——车是个人数据，匿名连「车里有什么」都不该被探到；游标车住前端 localStorage。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这车是不是我的」。{@code buyerId} 一律从令牌来，
 * 请求体里没有这个字段；条目按 skuId 寻址（(buyer_id, sku_id) 唯一的自然键），没有行 id。
 *
 * <p>突变响应刻意从简（数量真值或 204）：前端失效后重拉整车，不回传拼装好的视图。
 * 唯一例外是加购回数量——合并封顶后真值和请求不同，回显它免得前端多发一个 GET。
 */
@RestController
@RequestMapping("/api/buyer/cart")
public class CartController {

    private final CartService cart;
    private final Authorizer authorizer;

    public CartController(CartService cart, Authorizer authorizer) {
        this.cart = cart;
        this.authorizer = authorizer;
    }

    /** 整车：失效条目原样保留置灰（available=false），按店分组是前端的事 */
    @GetMapping
    public CartView listCart() {
        return cart.list(buyerId());
    }

    /** 角标计数：一条聚合 SQL，免拼装 */
    @GetMapping("/count")
    public CartCount count() {
        return cart.count(buyerId());
    }

    /** 加购：同 SKU 幂等合并，返回合并封顶后的真值数量与整车种类数 */
    @PostMapping("/items")
    @ResponseStatus(HttpStatus.CREATED)
    public AddedItem addCartItem(@Valid @RequestBody AddCartItemRequest request) {
        return cart.add(buyerId(), request.skuId(), request.quantity());
    }

    /** 改数量（设为终值）：0 行（条目刚被删）静默通过 */
    @PatchMapping("/items/{skuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateQuantity(@PathVariable UUID skuId, @Valid @RequestBody UpdateCartItemRequest request) {
        cart.updateQuantity(buyerId(), skuId, request.quantity());
    }

    /** 勾选集合声明式重设：单选 / 全选 / 按店选同一入口 */
    @PutMapping("/selection")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void replaceSelection(@Valid @RequestBody ReplaceSelectionRequest request) {
        cart.replaceSelection(buyerId(), request.skuIds());
    }

    /** 删一条：0 行静默 */
    @DeleteMapping("/items/{skuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeCartItem(@PathVariable UUID skuId) {
        cart.remove(buyerId(), skuId);
    }

    /** 批量删：下单后清勾选、清置灰共用 */
    @PostMapping("/items/batch-delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeAll(@Valid @RequestBody BatchDeleteRequest request) {
        cart.removeAll(buyerId(), request.skuIds());
    }

    /** 游标车并入：登录成功后调用，逐条 upsert，不做在售闸门 */
    @PostMapping("/merge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void mergeCart(@Valid @RequestBody MergeCartRequest request) {
        cart.merge(
                buyerId(),
                request.items().stream()
                        .map(line -> new CartService.MergeLine(line.skuId(), line.quantity()))
                        .toList());
    }

    private UUID buyerId() {
        return authorizer.current().operatorId();
    }
}
