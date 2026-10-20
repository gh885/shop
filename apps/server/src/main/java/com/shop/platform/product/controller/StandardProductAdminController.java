package com.shop.platform.product.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.product.dto.MergeStandardProductRequest;
import com.shop.platform.product.dto.ProductFieldRules;
import com.shop.platform.product.dto.StandardProductRequest;
import com.shop.platform.product.service.StandardProductService;
import com.shop.platform.product.service.StandardProductView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端平台标准品维护（授权要求 CATEGORY_MANAGE：标准品是类目运营的一部分，不另立权限码）。
 *
 * <p>没有删除端点：错匹配的收口是合并（{@code POST /{id}/merge}），不是删。挂靠在它上面的
 * 商家商品与历史映射都还引用这一行，物理删只会留下悬空引用。
 */
@Tag(name = "standard-products-admin", description = "管理端平台标准品维护")
@RestController
@RequestMapping("/admin/standard-products")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.CATEGORY_MANAGE)
public class StandardProductAdminController {

    private final StandardProductService standardProductService;

    /** 标准品列表：按类目与关键词（名字/品牌/条码）筛，最多返回 50 条 */
    @GetMapping
    public List<StandardProductView> listStandardProducts(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) @Size(max = ProductFieldRules.KEYWORD_MAX) String keyword) {
        return standardProductService.listForAdmin(categoryId, keyword);
    }

    /** 新建标准品 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StandardProductView createStandardProduct(@Valid @RequestBody StandardProductRequest request) {
        return StandardProductView.from(standardProductService.create(request));
    }

    /** 改标准品（名称/品牌/条码/类目）；合并走 /{id}/merge */
    @PutMapping("/{id}")
    public StandardProductView updateStandardProduct(
            @PathVariable UUID id, @Valid @RequestBody StandardProductRequest request) {
        return StandardProductView.from(standardProductService.update(id, request));
    }

    /** 合并：把 {id} 并入请求体里的 targetId，挂靠关系一并改指，来源行置 MERGED 不物理删 */
    @PostMapping("/{id}/merge")
    public StandardProductView mergeStandardProduct(
            @PathVariable UUID id, @Valid @RequestBody MergeStandardProductRequest request) {
        return StandardProductView.from(standardProductService.merge(id, request.targetId()));
    }
}
