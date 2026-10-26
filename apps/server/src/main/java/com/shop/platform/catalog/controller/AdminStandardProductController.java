package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.StandardSpuView;
import com.shop.platform.catalog.service.StandardProductService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧标准品运营：列表、合并。
 *
 * <p>权限点用 {@code PRODUCT_REVIEW}（商品审核），不新开一个。
 * 理由：标准品合并判的是「这两条商品是不是同一个东西」，和审核判的是「这条商品合不合规」
 * 是同一个知识域——由同一个人做才对。新开一个点会让「谁该有它」变成一道没人能答的题，
 * 而拆开之后两个点必然被同时授予，那就是白拆。
 *
 * <p><b>没有「新建标准品」入口。</b> 标准品是懒建的（{@link com.shop.platform.catalog.service.StandardMatcher}：
 * 第一个发布到这个识别键的商家顺手建出来）。手工新建一个标准品，等于凭空造一个没有商品挂的归并标签，
 * 而运营真正需要的是「把两个已有的合成一个」——那是合并，不是新建。
 */
@RestController
@RequestMapping("/api/admin/standard-products")
public class AdminStandardProductController {

    private final StandardProductService standards;
    private final Authorizer authorizer;

    public AdminStandardProductController(StandardProductService standards, Authorizer authorizer) {
        this.standards = standards;
        this.authorizer = authorizer;
    }

    /**
     * 标准品列表。
     *
     * @param includeMerged 默认 true。运营要能看到「这条被并到哪儿了」——合并错了只能靠它查回去
     */
    @GetMapping
    public List<StandardSpuView> list(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "true") boolean includeMerged) {
        authorizer.check(Permission.PRODUCT_REVIEW);
        return standards.list(categoryId, keyword, includeMerged);
    }

    /**
     * 合并：{@code sourceId} 并入 {@code targetId}。
     *
     * <p>用 {@code POST /{id}/merge} 而不是 {@code PUT /{id}}：这不是「改这个标准品的字段」，
     * 是一次不可逆的运营动作，有它自己的前置条件（两个都得是没被合并过的）与后果
     * （挂靠关系全部改指）。做成 PUT 会让人以为是幂等的字段更新。
     */
    @PostMapping("/{sourceId}/merge")
    public StandardSpuView merge(@PathVariable UUID sourceId, @RequestParam UUID targetId) {
        authorizer.check(Permission.PRODUCT_REVIEW);
        return standards.merge(sourceId, targetId, authorizer.current().operatorId());
    }
}
