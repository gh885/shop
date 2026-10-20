package com.shop.platform.infra.db;

import com.shop.platform.common.ShopIdHolder;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * 给数据库连接注入租户上下文的 DataSource 包装：卖家请求借出连接时写入 {@code app.current_shop}，
 * 归还前清空。这是 V91 里 RLS 策略的应用侧半边（{@link ShopTenantHandler} 管 MyBatis 语句改写，
 * 本类管数据库会话变量，两者覆盖的路径不同）。
 *
 * <p><b>为什么需要它</b>：租户插件只改写 MyBatis 生成的 SQL，而 {@code JdbcTemplate}（各模块 api 包）
 * 与定时任务里的原生 SQL 不经过 MyBatis 拦截器链。RLS 在数据库层判断，能覆盖所有走这条连接的语句，
 * 但前提是会话里那个变量确实被设过——没有这一步，policy 永远是「空上下文 = 放行」。
 *
 * <p><b>空上下文不写变量</b>：买家侧、平台侧、Flyway 迁移与定时任务都拿不到 {@code ShopIdHolder}，
 * 此时直接透传、不产生任何额外往返。这与 V91「空上下文放行」是同一口径。
 *
 * <p><b>归还前清空</b>：连接是池化复用的，不清空就会把上一家店的上下文带给下一个请求——那比不做
 * 隔离更糟（买家会读到别家的数据）。清空放在 {@code close()} 的 finally 里，异常路径也走得到。
 *
 * <p><b>当前环境的一个已知限制</b>：本库的连接用户是超级用户（{@code usesuper=t}），而超级用户
 * 连 {@code FORCE ROW LEVEL SECURITY} 也绕过。也就是说这层防护在生产把连接用户换成非超级用户之前
 * 是<b>不生效</b>的——它现在的作用是把接线铺好，换账号即生效。别以为建了 policy 就完事了。
 */
public class TenantAwareDataSource extends DelegatingDataSource {

    public TenantAwareDataSource(DataSource delegate) {
        super(delegate);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return scope(super.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return scope(super.getConnection(username, password));
    }

    /** 有店铺上下文时写入会话变量，并返回一个「关闭前清空」的代理 */
    private static Connection scope(Connection target) throws SQLException {
        UUID shopId = ShopIdHolder.get();
        if (shopId == null) {
            return target;
        }
        setCurrentShop(target, shopId.toString());
        return (Connection) Proxy.newProxyInstance(
                TenantAwareDataSource.class.getClassLoader(), new Class<?>[] {Connection.class}, new Resetting(target));
    }

    private static void setCurrentShop(Connection connection, String shopId) throws SQLException {
        // 参数化而不是拼串：即便调用方保证是 UUID，也不给「某天换成一个可拼的入参」留口子
        try (var ps = connection.prepareStatement("select set_config('app.current_shop', ?, false)")) {
            ps.setString(1, shopId);
            ps.execute();
        }
    }

    /** 连接代理：只接管 close（先清空再真关），其余一律转发 */
    private record Resetting(Connection target) implements java.lang.reflect.InvocationHandler {

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if ("close".equals(method.getName())) {
                try {
                    setCurrentShop(target, "");
                } catch (SQLException ignored) {
                    // 清空失败不该掩盖真正的业务异常：连接随 close 一起回池，Hikari 会自行校验
                }
                target.close();
                return null;
            }
            try {
                return method.invoke(target, args);
            } catch (InvocationTargetException ex) {
                throw ex.getTargetException();
            }
        }
    }
}
