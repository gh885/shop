package com.shop.platform.favorite.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.favorite.controller.response.FavoriteExistsResponse;
import com.shop.platform.favorite.controller.response.FavoriteItemResponse;
import com.shop.platform.favorite.controller.response.FavoriteListItemResponse;
import com.shop.platform.favorite.dto.AddFavoriteRequest;
import com.shop.platform.favorite.dto.FavoriteExistsRequest;
import com.shop.platform.favorite.service.FavoriteService;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家收藏夹。全部接口要求登录（不在 JwtAuthFilter skipPaths 内，未登录 401）。
 * 收藏是幂等开关：重复收藏/重复取消都是成功，前端可以放心做 toggle。
 */
@Tag(name = "favorites", description = "买家收藏夹（全部需登录）")
@RestController
@RequestMapping("/favorites")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    /** 收藏商品：幂等，已存在返回原行 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FavoriteItemResponse addFavorite(@CurrentUser UUID userId, @Valid @RequestBody AddFavoriteRequest req) {
        return FavoriteItemResponse.from(favoriteService.add(userId, req.productId()));
    }

    /** 取消收藏：按商品 ID 删，幂等（未收藏也 204） */
    @DeleteMapping("/products/{productId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@CurrentUser UUID userId, @PathVariable UUID productId) {
        favoriteService.remove(userId, productId);
    }

    /** 我的收藏分页：新收藏在前；下架商品置灰保留（available=false） */
    @GetMapping
    public PageResult<FavoriteListItemResponse> listFavorites(@CurrentUser UUID userId, @Valid PageParams pageParams) {
        return favoriteService
                .list(userId, pageParams.page(), pageParams.size())
                .map(FavoriteListItemResponse::from);
    }

    /** 批量查已收藏子集：详情页心形状态用，避免 product 详情接口反向依赖本模块 */
    @PostMapping("/exists")
    public FavoriteExistsResponse checkFavoriteExists(
            @CurrentUser UUID userId, @Valid @RequestBody FavoriteExistsRequest req) {
        return new FavoriteExistsResponse(favoriteService.favoritedProductIds(userId, req.productIds()));
    }
}
