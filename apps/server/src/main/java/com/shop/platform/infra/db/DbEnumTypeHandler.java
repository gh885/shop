package com.shop.platform.infra.db;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.concurrent.ConcurrentHashMap;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/**
 * 模型枚举的库值映射，接住「库里存枚举名的小写」这条全量约定。
 *
 * <p>每个 model 枚举都有 {@code dbValue() = name().toLowerCase()} 和 {@code from(String)}，
 * 库约束也照着写。这里按约定反射取方法并缓存，不给每个枚举单独注册；不守约定的枚举在
 * 构造时（应用启动装配 mapper 的那一刻）就抛——失败可见，比悄悄错值好。
 *
 * <p>全局注册见 {@link MybatisConfig}；读写两个方向都走约定方法，不依赖枚举名大小写。
 */
public class DbEnumTypeHandler<E extends Enum<E>> extends BaseTypeHandler<E> {

    private static final ConcurrentHashMap<Class<?>, Method> DB_VALUE = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<Class<?>, Method> FROM = new ConcurrentHashMap<>();

    private final Class<E> type;

    public DbEnumTypeHandler(Class<E> type) {
        this.type = type;
        try {
            dbValue(type);
            from(type);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("枚举必须守 dbValue()/from(String) 约定: " + type.getName(), e);
        }
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, E parameter, JdbcType jdbcType) throws SQLException {
        ps.setString(i, dbValueOf(parameter));
    }

    @Override
    public E getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public E getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public E getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private E parse(String raw) throws SQLException {
        if (raw == null) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            E value = (E) from(type).invoke(null, raw);
            return value;
        } catch (InvocationTargetException e) {
            // from() 对未知值抛的 IllegalArgumentException 原样透传，别裹一层丢上下文
            if (e.getCause() instanceof RuntimeException rte) {
                throw rte;
            }
            throw new IllegalStateException("枚举反解失败: " + type.getName() + " <- " + raw, e);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("枚举反解失败: " + type.getName() + " <- " + raw, e);
        }
    }

    private String dbValueOf(E value) {
        try {
            return (String) dbValue(type).invoke(value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("枚举 dbValue() 调用失败: " + type.getName(), e);
        }
    }

    private static Method dbValue(Class<?> type) throws NoSuchMethodException {
        return DB_VALUE.computeIfAbsent(type, t -> {
            try {
                Method m = t.getMethod("dbValue");
                m.setAccessible(true);
                return m;
            } catch (NoSuchMethodException e) {
                throw new IllegalStateException("枚举缺 dbValue(): " + t.getName(), e);
            }
        });
    }

    private static Method from(Class<?> type) throws NoSuchMethodException {
        return FROM.computeIfAbsent(type, t -> {
            try {
                Method m = t.getMethod("from", String.class);
                m.setAccessible(true);
                return m;
            } catch (NoSuchMethodException e) {
                throw new IllegalStateException("枚举缺 from(String): " + t.getName(), e);
            }
        });
    }
}
