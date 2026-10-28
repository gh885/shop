package com.shop.platform.seller.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.web.SupportedLocales;
import com.shop.platform.seller.dto.UpdateSellerLocaleRequest;
import com.shop.platform.seller.mapper.OperatorCredentialMapper;
import java.util.Locale;
import java.util.Objects;
import org.springframework.stereotype.Service;

/**
 * 卖家账号自服务里与身份无关的那部分：现在只有语言偏好。
 *
 * <p>「我是谁」不在这里——那个要连带查当前店铺，住 {@code SellerMeController} 与 {@code SellerMeMapper}。
 * 拆开的判据是数据来源：这里只碰 {@code seller.operator} 的一列，那边的答案跨两张表。
 */
@Service
public class SellerLocaleService {

    private final OperatorCredentialMapper operators;

    public SellerLocaleService(OperatorCredentialMapper operators) {
        this.operators = Objects.requireNonNull(operators, "operators");
    }

    /** 改语言偏好。归一 + 白名单在 {@link SupportedLocales}，返回落库的那个串。 */
    public String updateLocale(CurrentOperator operator, UpdateSellerLocaleRequest request) {
        if (!operator.operatorId().toString().equals(request.expectedAccountId())) {
            throw BusinessException.conflict("账号已切换，请重新操作");
        }
        Locale matched = SupportedLocales.normalize(request.preferredLocale());
        if (matched == null) {
            throw BusinessException.badRequest("不支持的语言: " + request.preferredLocale());
        }
        String normalized = matched.toLanguageTag();
        if (!operators.updatePreferredLocale(operator.operatorId(), normalized)) {
            throw BusinessException.unauthorized("账号不存在或已停用");
        }
        return normalized;
    }

    /** 读当前偏好。没设过返回 null（不是默认语言——两者在展示时都落默认，但语义不同）。 */
    public String find(java.util.UUID operatorId) {
        return operators.findPreferredLocale(operatorId).orElse(null);
    }
}
