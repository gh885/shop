package com.shop.platform.governance.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.governance.mapper.ForbiddenWordMapper;
import com.shop.platform.governance.service.ForbiddenWordService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 违禁词管理。词表是内容合规的输入，改它必须留审计。 */
@RestController
@RequestMapping("/api/admin/governance/forbidden-words")
public class AdminGovernanceForbiddenWordController {

    private final ForbiddenWordService words;
    private final Authorizer authorizer;

    public AdminGovernanceForbiddenWordController(ForbiddenWordService words, Authorizer authorizer) {
        this.words = words;
        this.authorizer = authorizer;
    }

    @GetMapping
    public List<ForbiddenWordMapper.Row> list(
            @RequestParam(required = false) String status, @RequestParam(required = false) String keyword) {
        requireStaff();
        if (status != null
                && !status.isBlank()
                && !List.of("active", "disabled").contains(status)) {
            throw BusinessException.badRequest("未知状态: " + status);
        }
        return words.list(status == null || status.isBlank() ? null : status, keyword);
    }

    @PostMapping
    public CreatedWord create(@Valid @RequestBody CreateWordRequest request) {
        requireStaff();
        return new CreatedWord(words.create(request.word(), authorizer.current().operatorId()));
    }

    @PutMapping("/{id}/status")
    public void updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateWordStatusRequest request) {
        requireStaff();
        words.updateStatus(id, request.status(), authorizer.current().operatorId());
    }

    private void requireStaff() {
        authorizer.check(Permission.GOVERNANCE_REVIEW);
        if (!CurrentOperator.TYPE_STAFF.equals(authorizer.current().operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以维护违禁词");
        }
    }

    public record CreateWordRequest(@NotBlank @Size(max = 64) String word) {}

    public record UpdateWordStatusRequest(@NotBlank String status) {}

    public record CreatedWord(UUID id) {}
}
