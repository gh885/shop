package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.AdjustStockRequest;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.SellerProductDetail;
import com.shop.platform.catalog.dto.SellerStockView;
import com.shop.platform.catalog.dto.UpdateProductRequest;
import com.shop.platform.catalog.service.SellerProductEditService;
import com.shop.platform.catalog.service.SellerProductQuery;
import com.shop.platform.catalog.service.SellerProductQuery.ProductPage;
import com.shop.platform.catalog.service.SellerStockService;
import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * 卖家侧商品编辑：读详情、改基本信息、改 SKU、上下架、删草稿。
 *
 * <p>与 {@link SellerProductController} 分两个 controller：那个只有两个入口（建草稿、提交挂售），
 * 属于发布链路的起点；这个是一整套编辑动作。合起来会让「新建」和「编辑」的权限语义混在一处——
 * 实际上它们共用一个权限点（{@code PRODUCT_WRITE}），但一个类里十个方法读起来就是一个 CRUD 控制器，
 * 而它并不是：编辑有个非平凡的状态机（改已上架商品要重新审核）。
 *
 * <p><b>没有「发布」接口。</b> 上架只能由审核通过触发（{@code POST /api/admin/listings/{id}/approve}），
 * 或者由免审类目在提交时自动完成。商家自己能把商品推上架的入口不存在——
 * 「发布权只有 catalog 给」（module-map 第 9 节铁律 3），给商家就等于审核不存在。
 */
@RestController
@RequestMapping("/api/seller/products")
public class SellerProductEditController {

    private final SellerProductEditService products;
    private final SellerProductQuery queries;
    private final SellerStockService stock;
    private final Authorizer authorizer;

    public SellerProductEditController(
            SellerProductEditService products,
            SellerProductQuery queries,
            SellerStockService stock,
            Authorizer authorizer) {
        this.products = products;
        this.queries = queries;
        this.stock = stock;
        this.authorizer = authorizer;
    }

    /**
     * 我的商品列表。**任何状态都列**——草稿、审核中、被驳回、已下架、已上架。
     *
     * <p>在它之前商家没有任何办法列出自己的商品：所有商品端点的路径参数都是 {@code spuId}，
     * 而他拿不到那些 id。卖家订单列表当初缺的是同一个东西。
     *
     * <p>游标分页，不是 offset：商家发新商品时 offset 会漏掉或重复条目。
     *
     * @param status 展示态，不传 = 全部。词表见 {@code SellerProductQuery.STATUSES}，未知值 400
     * @param counts 响应里带各状态计数，筛选标签不必再发四个请求
     */
    @GetMapping
    public ProductPage listProducts(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String cursor,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit) {
        authorizer.check(Permission.PRODUCT_READ);
        return queries.page(authorizer.current().merchantId(), status, keyword, cursor, limit);
    }

    /**
     * 卖家详情。<b>任何状态可读</b>——草稿、审核中、已下架都能看。
     *
     * <p>买家侧详情（{@code GET /api/buyer/catalog/products/{spuId}}）只认 online 商品，
     * 所以卖家改完想确认结果不能用那个接口。
     */
    @GetMapping("/{spuId}")
    public SellerProductDetail productDetail(@PathVariable UUID spuId) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.detail(spuId, authorizer.current());
    }

    /**
     * 改基本信息（标题 / 品牌 / 型号 / 属性 / 图）。
     *
     * <p><b>改已上架的商品会把它退回审核。</b> 见 {@code SellerProductEditService} 的类注释：
     * 上架状态是审核过的结论，改动即失效。免审类目不受影响。
     */
    @PutMapping("/{spuId}")
    public SellerProductDetail updateBasics(
            @PathVariable UUID spuId, @Valid @RequestBody UpdateProductRequest request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.updateBasics(spuId, request, authorizer.current());
    }

    /**
     * 改 SKU（价格 / 重量 / 停售）。
     *
     * <p><b>全量替换：请求里没给的 SKU 一律停售。</b> 前端必须每次传全部 SKU——
     * 卖家后台本来就是一张全量的规格表格。增量语义下商家删掉的规格会永远活着。
     */
    @PutMapping("/{spuId}/skus")
    public SellerProductDetail updateSkus(
            @PathVariable UUID spuId, @Valid @RequestBody List<UpdateProductRequest.SkuRequest> request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.updateSkus(spuId, request, authorizer.current());
    }

    /**
     * 新增 SKU（加规格组合）。
     *
     * <p>规格本身仍然不可改——要换规格就停售旧的、在这里加新的。新 SKU 的规格维度
     * 必须和现有 SKU 一致；缺一个组合靠少一行 SKU 表达，不是少一个维度。
     */
    @PostMapping("/{spuId}/skus")
    public SellerProductDetail addSkus(
            @PathVariable UUID spuId, @Valid @RequestBody List<CreateProductRequest.SkuRequest> request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.addSkus(spuId, request, authorizer.current());
    }

    /**
     * 库存页：这个商品每个 SKU 的四个科目（实物 / 可售 / 预占 / 安全）。
     *
     * <p>放在 {@code /products/{spuId}/stock} 而不是独立资源，是因为商家的操作单位是「这个商品的规格表格」，
     * 而库存的归属校验也需要走「SKU → SPU → 商家」这条链——那正是这个路径表达的东西。
     */
    @GetMapping("/{spuId}/stock")
    public SellerStockView stock(@PathVariable UUID spuId) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return stock.view(spuId, authorizer.current());
    }

    /**
     * 改库存：覆盖实物与安全库存，可售由守恒式反推。
     *
     * <p><b>这是库存唯一的写入口。</b> 商家在别处卖了、盘亏了、进货了，都走这里。
     * 不允许直接改商品或 SKU 上的某个数字——那会绕开 {@code ck_stock_balance} 这道护栏，
     * 也会让 {@code stock_ledger} 断掉。
     *
     * <p>批量 + 幂等键：一次提交一整张 SKU 表格，超时重试只落一遍账。
     */
    @PutMapping("/{spuId}/stock")
    public SellerStockView adjustStock(@PathVariable UUID spuId, @Valid @RequestBody AdjustStockRequest request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return stock.adjust(spuId, request, authorizer.current());
    }

    /**
     * 商家主动下架。<b>只有已上架的商品能下。</b>
     *
     * <p>下架是「暂时不卖」，不是删除：SKU 与审核历史全部留着，随时可以重新提交。
     */
    @PostMapping("/{spuId}/offline")
    public SellerProductDetail offlineProduct(
            @PathVariable UUID spuId, @RequestBody(required = false) OfflineRequest request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.offline(spuId, request == null ? null : request.reason(), authorizer.current());
    }

    /**
     * 重新提交上架。<b>回 pending，不是直接回 online。</b>
     *
     * <p>「下架不能直接回 online」是文档定的不变式：否则下架就成了绕过审核的开关——
     * 先上架合规商品，下架、改违规、再上架。
     *
     * <p>免审类目下这条链路会一路推到 online，商家感觉不到差别。
     */
    @PostMapping("/{spuId}/relist")
    public SellerProductDetail relist(@PathVariable UUID spuId) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return products.relist(spuId, authorizer.current());
    }

    /**
     * 删草稿。<b>只删得掉从来没提交过挂售的 SPU。</b>
     *
     * <p>提交过（哪怕被驳回）就是审核历史的一部分，不能删——驳回理由、轮次都在
     * {@code listing_review} 里，删了 SPU 会让这些行悬空。
     */
    @DeleteMapping("/{spuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDraft(@PathVariable UUID spuId) {
        authorizer.check(Permission.PRODUCT_WRITE);
        products.deleteDraft(spuId, authorizer.current());
    }

    public record OfflineRequest(@jakarta.validation.constraints.Size(max = 500) String reason) {}
}
