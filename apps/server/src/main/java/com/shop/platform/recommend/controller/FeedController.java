package com.shop.platform.recommend.controller;

import com.shop.platform.recommend.controller.response.FeedItemResponse;
import com.shop.platform.recommend.controller.response.FeedResponse;
import com.shop.platform.recommend.dto.FeedQuery;
import com.shop.platform.recommend.service.FeedPage;
import com.shop.platform.recommend.service.FeedService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 首页推荐流（匿名可访问）。
 *
 * <p>与 {@code GET /api/products} 的分工（决策二）：那边是确定性列表（类目 / 店铺 / 搜索要 total 与排序），
 * 这边是随机批次的货架流（要种子、要游标、不要 total）——响应形状不同，所以是两个端点、两套出参。
 *
 * <p>出参不跨模块复用 product 的 Response：本模块拿不到它（不在 product 的命名接口里），
 * feed 的 item 契约也要能独立长出 V3 的运营卡联合类型。
 */
@Tag(name = "feed", description = "首页推荐流（匿名可访问）")
@RestController
@RequestMapping("/api/feed")
@Validated
@RequiredArgsConstructor
public class FeedController {

    private final FeedService feedService;

    /** 首页 feed：带 cursor 续翻同一批，不带 cursor 即「换一批」（服务端发新种子） */
    @GetMapping
    public FeedResponse listHomeFeed(@Valid FeedQuery query) {
        FeedPage page = feedService.page(query);
        return new FeedResponse(
                page.items().stream().map(FeedItemResponse::from).toList(), page.nextCursor());
    }
}
