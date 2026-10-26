package com.shop.platform.account.controller;

import com.shop.platform.account.dto.UpdateBuyerStatusRequest;
import com.shop.platform.account.service.BuyerGovernanceService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧买家治理：封禁 / 解封。
 *
 * <p><b>为什么在 {@code account} 而不在 {@code governance}。</b> 判据是 module-map 第 0 节那条：
 * 一个模块 = 一组只被它写的核心表。{@code account.buyer.status} 只被 account 写，
 * 治理模块写它就是第二个写者。{@code governance} 管的是「能不能卖」（商家资格），
 * 「能不能买」是账号状态，两者不共用表也不共用出口。
 *
 * <p><b>权限点是 {@code BUYER_MANAGE}，不是 {@code STAFF_MANAGE}。</b> 两者都是「封人」，
 * 但员工几十个、买家是全平台，爆炸半径差三个数量级。合并成一个点，等于让能管员工的人顺手能封全体买家。
 *
 * <p><b>为什么是 PATCH 而不是 PUT。</b> 只改 {@code status} 一列，其余字段不动——
 * PUT 的语义是「整体替换」，用它表达单列变更会让人以为还能改别的。
 */
@RestController
@RequestMapping("/api/admin/buyers")
public class AdminBuyerController {

    private final BuyerGovernanceService governance;
    private final Authorizer authorizer;

    public AdminBuyerController(BuyerGovernanceService governance, Authorizer authorizer) {
        this.governance = governance;
        this.authorizer = authorizer;
    }

    /**
     * 禁用 / 启用买家。
     *
     * <p>禁用会同步吊销全端会话：判权每请求查库是第一道，会话吊销是第二道——
     * 只做第一道的话，买家手里那个 refresh 还能续出新的 access，封禁在 access 过期前等于没生效。
     *
     * <p>0 行（已是目标状态 / 并发抢先 / 账号已注销）回 409，不静默成功。
     */
    @PatchMapping("/{buyerId}/status")
    public void updateStatus(@PathVariable UUID buyerId, @Valid @RequestBody UpdateBuyerStatusRequest request) {
        authorizer.check(Permission.BUYER_MANAGE);
        governance.updateStatus(buyerId, request.status(), authorizer.current().operatorId());
    }

    /**
     * 买家列表。封禁前得先找到人。
     *
     * <p>没有它封禁入口就是半个入口——管理员手里只有“有人投诉这个手机号刷单”，
     * 没有 buyerId，只能靠 SQL 查库。
     *
     * @param status 传 active / disabled 筛状态；不传看全部
     * @param keyword 同时匹配手机号与昵称（管理员两种都可能知道）
     * @param cursor 上一页的 nextCursor
     * @param limit 服务端 clamp 到 1–100
     */
    @GetMapping
    public BuyerGovernanceService.BuyerAdminPage list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @Size(max = 64) String keyword,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        authorizer.check(Permission.BUYER_MANAGE);
        return governance.adminPage(status, keyword, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 列表一次最多拉多少条。后台列表靠人翻，拉一万条没有意义。 */
    private static final int MAX_PAGE_SIZE = 100;
}
