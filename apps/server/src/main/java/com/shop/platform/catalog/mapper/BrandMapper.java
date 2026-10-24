package com.shop.platform.catalog.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 品牌的读写。
 *
 * <p>现在只有一个 {@link #findName}：识别键要拿品牌名拼前缀（{@code APPLE:A3294}）。
 * 品牌的增删改审是平台侧的活，等 {@code CATEGORY_MANAGE} 的管理端做齐了再加。
 */
@Mapper
public interface BrandMapper {

    @Select("SELECT name FROM catalog.brand WHERE id = #{id}")
    Optional<String> findName(@Param("id") UUID brandId);
}
