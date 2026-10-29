package com.shop.platform.governance.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 售卖资格的 SQL。只做点查，不在这里拼业务结论。
 *
 * <p>四条 {@code EXISTS} 拼成一行布尔。原来靠九个位置参数逐个对号入座，
 * 其中 {@code merchantId} 出现四次、{@code categoryId} 三次——顺序写反了结果会变成
 * "看起来能卖但其实没授权"，而且不会报错。改成命名参数之后这类错位不可能再发生。
 *
 * <p><b>授权只认叶子类目。</b> 三条 grant 查询都用精确匹配，而发布时传的就是 L3 叶子。
 * 所以「授予 L1 数码配件」不会被当成"覆盖所有子孙"，它根本匹配不上任何叶子——
 * 这是有意的（见 {@code V20261022114000} 的迁移注释），库里有触发器挡住往非叶子授权。
 */
@Mapper
public interface GovernanceMapper {

    @Select(
            """
            SELECT
                EXISTS(
                    SELECT 1 FROM governance.seller_profile p
                     WHERE p.merchant_id = #{merchantId} AND p.status = 'active'
                ) AS profile_ok,
                EXISTS(
                    SELECT 1 FROM governance.category_grant g
                     WHERE g.merchant_id = #{merchantId} AND g.category_id = #{categoryId}
                       AND g.status = 'active'
                       AND (g.expires_at IS NULL OR g.expires_at > now())
                ) AS category_ok,
                (
                    CAST(#{brandId} AS uuid) IS NULL
                    OR EXISTS(
                        SELECT 1 FROM governance.brand_grant b
                         WHERE b.merchant_id = #{merchantId} AND b.brand_id = #{brandId}
                           AND b.category_id = #{categoryId}
                           AND b.status = 'active'
                           AND (b.expires_at IS NULL OR b.expires_at > now())
                    )
                ) AS brand_ok
            """)
    Checks check(
            @Param("merchantId") UUID merchantId, @Param("categoryId") UUID categoryId, @Param("brandId") UUID brandId);

    @Select("SELECT status FROM governance.seller_profile WHERE merchant_id = #{merchantId}")
    Optional<String> profileStatus(@Param("merchantId") UUID merchantId);

    /** 商家经营状态 CAS。0 行 = 档案不存在或不是 from 状态。 */
    @Update(
            "UPDATE governance.seller_profile SET status = #{to}, updated_at = now() WHERE merchant_id = #{merchantId} AND status = #{from}")
    int updateProfileStatus(@Param("merchantId") UUID merchantId, @Param("from") String from, @Param("to") String to);

    /**
     * 这个商家缺哪些类目要求的资质。
     *
     * <p><b>这条之前完全不存在。</b> {@code category_config.qualification_codes} 存了「这个类目要 3C」，
     * 而 {@code credential} 校验只看「有没有任意一条 valid 的资质」，不看类型对不对——
     * 商家拿一张食品经营许可就能卖手机。这和 {@code is_required} 之前"写进库里却从没被读过"是同一个问题。
     *
     * <p>用 {@code EXCEPT} 而不是逐条判：一次查询给出差集，缺哪个就报哪个。
     * 资质 {@code category_id} 为空表示全平台通用，也能满足具体类目的要求。
     */
    @Select(
            """
            SELECT unnest(CAST(#{required} AS text[]))
            EXCEPT
            SELECT c.type
              FROM governance.credential c
             WHERE c.merchant_id = #{merchantId}
               AND (c.category_id IS NULL OR c.category_id = #{categoryId})
               AND c.status IN ('valid', 'expiring')
               AND (c.expires_at IS NULL OR c.expires_at > now())
            """)
    List<String> missingCredentialsRow(
            @Param("merchantId") UUID merchantId,
            @Param("categoryId") UUID categoryId,
            @Param("required") String requiredLiteral);

    /**
     * 这个商家缺哪些类目要求的资质。
     *
     * @param required 类目配置里的 {@code qualification_codes}。空列表直接返回空，不查库
     * @return 缺失的资质代码，空表示齐了
     */
    default List<String> missingCredentials(UUID merchantId, UUID categoryId, List<String> required) {
        if (required == null || required.isEmpty()) {
            return List.of();
        }
        return missingCredentialsRow(merchantId, categoryId, toTextArray(required));
    }

    /**
     * Postgres 的 {@code text[]} 用文本字面量传（见 {@code RuleMapper.toUuidArray} 同一思路）：
     * 元素裹双引号并转义，代码里出现引号或反斜杠也不会拼破字面量。
     */
    static String toTextArray(List<String> codes) {
        return codes.stream()
                .map(code -> "\"" + code.replace("\\", "\\\\").replace("\"", "\\\"") + "\"")
                .reduce((left, right) -> left + "," + right)
                .map(joined -> "{" + joined + "}")
                .orElse("{}");
    }

    public record Checks(boolean profileOk, boolean categoryOk, boolean brandOk) {}
}
