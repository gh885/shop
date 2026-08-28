package com.shop.platform.favorite.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.favorite.dto.AddFavoriteRequest;
import com.shop.platform.favorite.dto.FavoriteExistsRequest;
import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.favorite.service.FavoriteItemView;
import com.shop.platform.favorite.service.FavoriteService;
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
    public FavoriteItemResponse addFavorite(@Valid @RequestBody AddFavoriteRequest req) {
        return FavoriteItemResponse.from(favoriteService.add(UserIdHolder.get(), req.productId()));
    }

    /** 取消收藏：按商品 ID 删，幂等（未收藏也 204） */
    @DeleteMapping("/products/{productId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@PathVariable UUID productId) {
        favoriteService.remove(UserIdHolder.get(), productId);
    }

    /** 我的收藏分页：新收藏在前；下架商品置灰保留（available=false） */
    @GetMapping
    public PageResult<FavoriteListItemResponse> listFavorites(@Valid PageParams pageParams) {
        PageResult<FavoriteItemView> page =
                favoriteService.list(UserIdHolder.get(), pageParams.page(), pageParams.size());
        return new PageResult<>(
                page.records().stream().map(FavoriteListItemResponse::from).toList(), page.total());
    }

    /** 批量查已收藏子集：详情页心形状态用，避免 product 详情接口反向依赖本模块 */
    @PostMapping("/exists")
    public FavoriteExistsResponse checkFavoriteExists(@Valid @RequestBody FavoriteExistsRequest req) {
        return new FavoriteExistsResponse(favoriteService.favoritedProductIds(UserIdHolder.get(), req.productIds()));
    }

    /** 收藏行出参：刻意不吐 userId（JWT 冗余），按 HTTP 契约规范禁止裸吐实体 */
    public record FavoriteItemResponse(UUID id, UUID productId, OffsetDateTime createdAt) {

        static FavoriteItemResponse from(FavoriteItem item) {
            return new FavoriteItemResponse(item.getId(), item.getProductId(), item.getCreatedAt());
        }
    }

    /** 列表条目出参：镜像 service 的 FavoriteItemView，字段只减不增 */
    public record FavoriteListItemResponse(
            UUID id, UUID productId, OffsetDateTime favoritedAt, ProductInfo product, boolean available) {

        static FavoriteListItemResponse from(FavoriteItemView view) {
            return new FavoriteListItemResponse(
                    view.id(),
                    view.productId(),
                    view.favoritedAt(),
                    ProductInfo.from(view.product()),
                    view.available());
        }

        @Schema(name = "FavoriteProductInfo", description = "收藏条目里的商品卡片信息")
        public record ProductInfo(
                UUID id, String name, String mainImage, Money minPrice, Money maxPrice, long collectCount) {

            static ProductInfo from(FavoriteItemView.ProductInfo info) {
                return new ProductInfo(
                        info.id(),
                        info.name(),
                        info.mainImage(),
                        info.minPrice(),
                        info.maxPrice(),
                        info.collectCount());
            }
        }
    }

    /** 已收藏商品 ID 子集出参 */
    public record FavoriteExistsResponse(List<UUID> productIds) {}
}
