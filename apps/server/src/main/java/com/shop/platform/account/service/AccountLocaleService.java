package com.shop.platform.account.service;

import com.shop.platform.account.dto.UpdateLocalePreferenceRequest;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.web.SupportedLocales;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AccountLocaleService {
    private final UserMapper userMapper;
    private final StaffMapper staffMapper;

    public void updateUserLocale(UUID userId, UpdateLocalePreferenceRequest request) {
        requireValidChange(userId, request);
        Validate.present(
                userMapper.updateLocale(userId, request.preferredLocale(), OffsetDateTime.now()) == 1, "账号不可用");
    }

    public void updateStaffLocale(UUID staffId, UpdateLocalePreferenceRequest request) {
        requireValidChange(staffId, request);
        Validate.present(
                staffMapper.updateLocale(staffId, request.preferredLocale(), OffsetDateTime.now()) == 1, "账号不可用");
    }

    private static void requireValidChange(UUID accountId, UpdateLocalePreferenceRequest request) {
        if (!accountId.equals(request.expectedAccountId())) throw BusinessException.conflict("账号已切换，请重新操作");
        if (!SupportedLocales.SUPPORTED.contains(request.preferredLocale()))
            throw BusinessException.badRequest("不支持的语言");
    }
}
