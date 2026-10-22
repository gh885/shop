package com.shop.platform.infra.db;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.jdbc.core.DataClassRowMapper;
import org.springframework.jdbc.core.RowMapper;

/**
 * record 行映射的唯一定义处。
 *
 * <p>用 {@link DataClassRowMapper} 而不是手写 {@code RowMapper}：列名到字段自动对上，加一列不用改映射代码，
 * 也不会出现"改了列名忘了改 getString"这种运行时才炸的错。
 *
 * <p><b>必须显式给 ConversionService。</b> 不给的话 Spring 用的是只认基本类型的默认转换器，
 * 项目里所有 {@code status} 列（库里存小写字符串）映射到枚举时会直接抛
 * {@code Failed to convert value of type 'java.lang.String' to required type '...'}。
 *
 * <p>枚举转换走一条约定：<b>库里存枚举名的小写</b>。这条约定在项目里是全量的——
 * 每个 model 枚举都有 {@code dbValue() = name().toLowerCase()} 和 {@code from(String)}，
 * 库约束也照着写。所以这里统一按"大写后 valueOf"反解，不给每个枚举单独注册。
 * 将来若有枚举不守这条约定，它会在这里抛转换异常而不是静默错值——失败可见，比悄悄错好。
 */
public final class RowMappers {

    private static final ConversionService CONVERSION = buildConversion();

    private RowMappers() {}

    /** 给一张表的投影建映射器。record 字段名按驼峰对下划线列名，多余列自动忽略。 */
    public static <T> RowMapper<T> of(Class<T> type) {
        return DataClassRowMapper.newInstance(type, CONVERSION);
    }

    private static ConversionService buildConversion() {
        DefaultConversionService conversion = new DefaultConversionService();
        // 用 DefaultConversionService 而不是空的 GenericConversionService：前者带着
        // Timestamp -> Instant、UUID、数字装箱这些内建转换，后者的缺失会在第一行数据上就炸。
        conversion.addConverterFactory(new EnumByLowerCaseFactory());
        return conversion;
    }

    /**
     * 往库里传时间：{@code Instant} 必须先转 {@code OffsetDateTime}。
     *
     * <p><b>这是迁移到 {@code JdbcClient} 时最容易踩的坑。</b> 直接 {@code .param("t", instant)} 会在运行期抛
     * {@code 无法推测实例 java.time.Instant 的 SQL 类型}——PG 驱动不认 {@code Instant}，
     * 而原来用 {@code JdbcTemplate} 时是靠 {@code Timestamp.from(...)} 手工转的。
     *
     * <p>读方向不用管：{@code DataClassRowMapper} 的默认转换器能把 {@code Timestamp} 转成 {@code Instant}。
     * 只有写方向需要这个。
     */
    public static OffsetDateTime toDb(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    /** {@code "paid"} → {@code PaymentStatus.PAID}。库里的值必须是枚举名的小写。 */
    private static final class EnumByLowerCaseFactory implements ConverterFactory<String, Enum> {

        @Override
        public <T extends Enum> Converter<String, T> getConverter(Class<T> targetType) {
            return source -> {
                @SuppressWarnings("unchecked")
                T value = (T) Enum.valueOf(targetType, source.toUpperCase(java.util.Locale.ROOT));
                return value;
            };
        }
    }
}
