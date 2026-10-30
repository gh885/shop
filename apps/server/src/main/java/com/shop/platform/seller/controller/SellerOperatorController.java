package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.seller.service.OperatorManagementService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 子账号与角色管理（主账号专属）。
 *
 * <p>闸门两道：{@code SELLER_STAFF_MANAGE} 权限 + 服务层的主账号身份复核。角色是授权单位——
 * 建角色挑权限点（动钱与管钥匙的码服务层拒收），子账号挂角色 + 授权店铺范围。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerOperatorController {

    private final OperatorManagementService operators;
    private final Authorizer authorizer;

    public SellerOperatorController(OperatorManagementService operators, Authorizer authorizer) {
        this.operators = operators;
        this.authorizer = authorizer;
    }

    @GetMapping("/operators")
    public List<OperatorManagementService.OperatorView> listOperators() {
        return operators.listOperators();
    }

    @PostMapping("/operators")
    public UUID createOperator(@Valid @RequestBody OperatorManagementService.CreateOperatorRequest request) {
        return operators.createOperator(request);
    }

    @PutMapping("/operators/{operatorId}")
    public void updateOperator(
            @PathVariable UUID operatorId,
            @Valid @RequestBody OperatorManagementService.UpdateOperatorRequest request) {
        operators.updateOperator(operatorId, request);
    }

    @PatchMapping("/operators/{operatorId}/status")
    public void updateStatus(@PathVariable UUID operatorId, @RequestBody StatusRequest request) {
        operators.updateStatus(operatorId, request.status());
    }

    @PutMapping("/operators/{operatorId}/password")
    public void resetPassword(@PathVariable UUID operatorId, @RequestBody PasswordRequest request) {
        operators.resetPassword(operatorId, request.password());
    }

    @GetMapping("/roles")
    public List<OperatorManagementService.RoleView> listRoles() {
        return operators.listRoles();
    }

    @PostMapping("/roles")
    public UUID createRole(@Valid @RequestBody OperatorManagementService.RoleRequest request) {
        return operators.createRole(request);
    }

    @PutMapping("/roles/{roleId}")
    public void updateRole(@PathVariable UUID roleId, @RequestBody OperatorManagementService.RoleRequest request) {
        operators.updateRole(roleId, request);
    }

    @DeleteMapping("/roles/{roleId}")
    public void deleteRole(@PathVariable UUID roleId) {
        operators.deleteRole(roleId);
    }

    /** 授权店铺清单：建子账号时勾选范围用 */
    @GetMapping("/shops")
    public List<OperatorManagementService.ShopView> listShops() {
        return operators.listShops();
    }

    public record StatusRequest(String status) {}

    public record PasswordRequest(String password) {}
}
