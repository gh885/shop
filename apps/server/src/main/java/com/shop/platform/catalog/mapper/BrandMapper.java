package com.shop.platform.catalog.mapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 品牌的读写。
 *
 * <p>发布闸门只认 {@code approved}：品牌没审过就让商品挂上去，等于把“这是 Apple”这句话
 * 交给商家自己声明。品牌名的唯一性由 {@code uq_brand_name} 兜底。
 */
@Mapper
public interface BrandMapper {

    @Select("SELECT name FROM catalog.brand WHERE id = #{id}")
    Optional<String> findName(@Param("id") UUID brandId);

    @Select("SELECT name FROM catalog.brand WHERE id = #{id} AND status = 'approved'")
    Optional<String> findApprovedName(@Param("id") UUID brandId);

    @Select("SELECT EXISTS (SELECT 1 FROM catalog.brand WHERE lower(name) = lower(#{name}))")
    boolean existsName(@Param("name") String name);

    @Select(
            """
            <script>
            SELECT id, name, logo_url AS logoUrl, status, created_at AS createdAt
              FROM catalog.brand
             WHERE 1 = 1
            <if test="keyword != null and keyword != ''">
               AND name ILIKE '%' || #{keyword} || '%'
            </if>
             ORDER BY name
             LIMIT 200
            </script>
            """)
    List<BrandRow> list(@Param("keyword") String keyword);

    /** 卖家发品只能选已审核品牌；未审核的不能出现在下拉里。 */
    @Select(
            """
            <script>
            SELECT id, name, logo_url AS logoUrl, status, created_at AS createdAt
              FROM catalog.brand
             WHERE status = 'approved'
            <if test="keyword != null and keyword != ''">
               AND name ILIKE '%' || #{keyword} || '%'
            </if>
             ORDER BY name
             LIMIT 200
            </script>
            """)
    List<BrandRow> listApproved(@Param("keyword") String keyword);

    @Insert(
            """
            INSERT INTO catalog.brand (id, name, logo_url, status)
            VALUES (#{id}, #{name}, #{logoUrl}, #{status})
            """)
    void insert(
            @Param("id") UUID id,
            @Param("name") String name,
            @Param("logoUrl") String logoUrl,
            @Param("status") String status);

    /** 0 行 = 品牌不存在或状态没变，调用方按 409 处理。 */
    @Update("UPDATE catalog.brand SET status = #{status} WHERE id = #{id} AND status <> #{status}")
    int updateStatus(@Param("id") UUID id, @Param("status") String status);

    record BrandRow(UUID id, String name, String logoUrl, String status, Instant createdAt) {}
}
