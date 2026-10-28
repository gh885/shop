package com.shop.platform.cart.controller;

import com.shop.platform.cart.dto.FavoriteExistsRequest;
import com.shop.platform.cart.service.FavoriteService;
import com.shop.platform.cart.service.FavoriteViews.ExistsResult;
import com.shop.platform.cart.service.FavoriteViews.FavoritePage;
import com.shop.platform.cart.service.FavoriteViews.ToggleResult;
import com.shop.platform.infra.security.Authorizer;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家收藏夹。全部需登录——收藏是个人数据，匿名连「收藏了什么」都不该被探到。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这些收藏是不是我的」。
 * {@code buyerId} 一律从令牌来，请求体里没有这个字段。
 *
 * <p><b>按 spuId 寻址，没有行 id。</b> 前端在商品页手里只有 spuId，
 * 按它寻址天然幂等、跨设备稳定；暴露行 id 只会多一个「这个 id 是不是我的」的越权面。
 *
 * <p><b>收藏是幂等开关</b>，重复收藏 / 重复取消都是成功，前端可以放心做 toggle。
 * 但 201/200 有区别：201 = 这次真的新收了，200 = 已经收过了。前端不需要按它分支，
 * 但它让「收藏按钮点了没反应」这类问题在日志里能一眼分辨。
 */
@RestController
@RequestMapping("/api/buyer/favorites")
public class FavoriteController {

    private final FavoriteService favorites;
    private final Authorizer authorizer;

    public FavoriteController(FavoriteService favorites, Authorizer authorizer) {
        this.favorites = favorites;
        this.authorizer = authorizer;
    }

    /**
     * 收藏。幂等：重复收藏返回 200 与 {@code created=false}，新收藏返回 201。
     *
     * <p>为什么不用 {@code @ResponseStatus(CREATED)} 固定：重复收藏不是新建资源，
     * 回 201 会让「幂等」这个词在 HTTP 语义上失真。用一个方法内分支表达两种结果。
     */
    @PostMapping("/{spuId}")
    public ResponseEntity<ToggleResult> addFavorite(@PathVariable UUID spuId) {
        ToggleResult result = favorites.add(buyerId(), spuId);
        return result.created() ? ResponseEntity.status(HttpStatus.CREATED).body(result) : ResponseEntity.ok(result);
    }

    /** 取消收藏：按商品 id 删，幂等（未收藏也 204）。 */
    @DeleteMapping("/{spuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@PathVariable UUID spuId) {
        favorites.remove(buyerId(), spuId);
    }

    /**
     * 我的收藏分页：新收藏在前；下架商品置灰保留（{@code available=false}）。
     *
     * @param cursor 上一页返回的 {@code nextCursor}；不传是第一页
     * @param limit 服务端 clamp 到 1–100，不让调用方传 100000
     */
    @GetMapping
    public FavoritePage listFavorites(
            @RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
        return favorites.list(buyerId(), cursor, limit);
    }

    /**
     * 批量查已收藏子集：详情页心形状态、商品卡片小红心用。
     *
     * <p>做成批量而不是逐个点查，是因为一屏商品卡片有 24 个商品，
     * 逐个查就是 24 次往返。也做成独立端点而不是塞进商品详情，
     * 是因为商品详情是公开可缓存的（{@code Cache-Control: max-age=30}），
     * 塞进去会让它变成「每人一份」的私有响应，缓存直接失效。
     */
    @PostMapping("/exists")
    public ExistsResult exists(@Valid @RequestBody FavoriteExistsRequest request) {
        return favorites.exists(buyerId(), request.spuIds());
    }

    private UUID buyerId() {
        return authorizer.current().operatorId();
    }
}
