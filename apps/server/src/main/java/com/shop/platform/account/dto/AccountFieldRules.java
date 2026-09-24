package com.shop.platform.account.dto;

/**
 * 账号侧入参的字段规则：登录、注册、改密、注销这些入口共用一份，不各抄一遍。
 *
 * <p>此前「设备 ID 最长 100」写在 5 个 DTO 的注解里，「密码 8~72」写在 4 个 DTO 里，另有
 * {@code AuthService} 的两道运行时闸门再各持一份。数字相同而定义处不同，正是「改了登录忘了改注销」
 * 会静默发生的地方：同一个输入在一条路径 400、另一条路径落库（前端还会按入口不同给两种报错）。
 *
 * <p>注解元素值必须是编译期常量表达式，所以这里是常量而不是校验器，执行仍由 Bean Validation 完成。
 * 值一个都没改：这些数字经 springdoc 导出进 {@code openapi/api-docs.json}，动数字属于接口变更
 * （要跑 {@code pnpm gen:sdk}，{@code ApiDocsContractTest} 会先红），本类只做「同一数字的定义处收一」。
 */
public final class AccountFieldRules {

    /** 密码下限（位）：REG-01。运行时闸门与 DTO 注解同一数 */
    public static final int PASSWORD_MIN = 8;

    /** 密码上限（字符数）：与 {@link #BCRYPT_INPUT_MAX_BYTES} 同数不同义——这里量字符，那里量字节 */
    public static final int PASSWORD_MAX = 72;

    /**
     * BCrypt 的 72 是<b>字节</b>上限，不是字符数（REG-06）：多字节字符会让 8~72 个字符超出编码器容量，
     * 截断后「输入的密码」与「存进去的哈希」不再是同一个，用户以为自己设了 A 实际能登进 B。
     * 所以字符档放行、字节档必须在 service 里挡。
     */
    public static final int BCRYPT_INPUT_MAX_BYTES = 72;

    /** 联系电话入参下限（位）：短号（95543 这类客服号）也要能填，但不收 1~2 位的误触 */
    public static final int PHONE_MIN = 7;

    /** 联系电话入参上限（位）：含国家码与分隔符的宽松档，硬形状由 {@link com.shop.platform.common.PhoneNumber} 判 */
    public static final int PHONE_MAX = 20;

    /**
     * 一次性验证码位数：发码侧的格式化宽度、校验侧的长度门都吃这一个数。
     *
     * <p>刻意留的不对称：注销那一格额外要求全数字（{@link #SMS_CODE_PATTERN}），登录与重置两格只卡长度。
     * 三者收齐属于接口变更（{@code @Pattern} 会导出进契约），故本类只保证「位数只有一处定义」。
     */
    public static final int SMS_CODE_LENGTH = 6;

    /**
     * 验证码形状（恰好 {@value #SMS_CODE_LENGTH} 位数字）：只用于注销确认那一格，见 {@link #SMS_CODE_LENGTH} 的说明。
     *
     * <p>刻意不带锚：Bean Validation 的 {@code @Pattern} 本来就是整串匹配，而 {@code ^$} 会被 springdoc
     * 原样导出进契约——加锚等于改契约（要跑 {@code pnpm gen:sdk}），收益为零。
     */
    public static final String SMS_CODE_PATTERN = "\\d{" + SMS_CODE_LENGTH + "}";

    /** 设备 ID 上限（字）：前端生成的持久标识，不给超长撑爆列 */
    public static final int DEVICE_ID_MAX = 100;

    /** 昵称上限（字）：与 {@code AddressFieldRules.NAME_MAX} 同数是巧合，不同概念是事实——一个管人名，一个管账号显示名 */
    public static final int NICKNAME_MAX = 30;

    private AccountFieldRules() {}
}
