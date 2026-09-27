package com.shop.platform.account.dto;

import com.shop.platform.account.model.StaffRole;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 创建平台员工（STAFF_MANAGE，仅超管）。口令由超管一次性告知——员工没有手机号，不走短信通道。
 *
 * <p>密码档位与买家侧同一组常量（{@link AccountFieldRules#PASSWORD_MIN} ~ {@link AccountFieldRules#PASSWORD_MAX}），
 * 字节上限那一道在 service 挡（同 {@code AuthService} 的口径）。
 */
@Schema(description = "创建平台员工")
public record CreateStaffRequest(
        @NotBlank
                @Size(max = AccountFieldRules.EMPLOYEE_NO_MAX)
                @Pattern(
                        regexp = AccountFieldRules.EMPLOYEE_NO_PATTERN,
                        message = AccountFieldRules.EMPLOYEE_NO_PATTERN_MESSAGE)
                String employeeNo,
        @NotBlank @Size(min = AccountFieldRules.PASSWORD_MIN, max = AccountFieldRules.PASSWORD_MAX) String password,
        @Size(max = AccountFieldRules.DISPLAY_NAME_MAX) String displayName,
        @NotNull @Schema(description = "岗位：SUPER_ADMIN / REVIEWER / OPS") StaffRole role) {}
