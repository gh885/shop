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
 * （要跑 {@code pnpm sdk:gen}，{@code ApiDocsContractTest} 会先红），本类只做「同一数字的定义处收一」。
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
     * 原样导出进契约——加锚等于改契约（要跑 {@code pnpm sdk:gen}），收益为零。
     */
    public static final String SMS_CODE_PATTERN = "\\d{" + SMS_CODE_LENGTH + "}";

    /** 设备 ID 上限（字）：前端生成的持久标识，不给超长撑爆列 */
    public static final int DEVICE_ID_MAX = 100;

    /** 昵称上限（字）：与 {@code AddressFieldRules.NAME_MAX} 同数是巧合，不同概念是事实——一个管人名，一个管账号显示名 */
    public static final int NICKNAME_MAX = 30;

    /** 平台员工工号上限（字）：{@code account.staff.employee_no VARCHAR(50)}，工号即登录账号，唯一索引 */
    public static final int EMPLOYEE_NO_MAX = 50;

    /** 工号形状（字母、数字、短横）：登录账号不许有空格——粘贴错一个空格就是「工号明明对却登不上」 */
    public static final String EMPLOYEE_NO_PATTERN = "^[A-Za-z0-9-]+$";

    /** 工号形状的报错文案（与 {@link #EMPLOYEE_NO_PATTERN} 同一处事实，改形状即改这句） */
    public static final String EMPLOYEE_NO_PATTERN_MESSAGE = "工号只能包含字母、数字与短横";

    /** 平台员工展示名上限（字）：{@code account.staff.display_name VARCHAR(50)}；与 {@link #EMPLOYEE_NO_MAX} 同数不同概念（一个管显示、一个管登录账号） */
    public static final int DISPLAY_NAME_MAX = 50;

    /** 管理端账号列表关键字上限（字）：与工号/昵称列宽同档，拦住无界字符串进入 LIKE 查询。 */
    public static final int ADMIN_LIST_KEYWORD_MAX = 50;

    /**
     * 图形人机验证码的容量档（字）：只管「别把 10KB 塞进登录请求」，不管码上印了几个字符。
     *
     * <p>刻意与前端那一格不对称：{@code packages/app-kit/src/auth/login-schema.ts} 的
     * {@code CAPTCHA_CODE_DIGITS} 是图形码实际生成的位数（4），比这一档紧。收紧属于接口变更
     * （{@code maxLength} 会导出进契约），故这里保留宽松容量，紧的那一侧由 {@code FieldRuleVocabularyTest}
     * 的镜像表按「只许等于或严于契约 + 已登记理由」核对。
     */
    public static final int CAPTCHA_CODE_MAX = 10;

    /**
     * 刷新令牌上限（字）：它是 Redis 里的一条不透明串，不落任何表，所以这一格<b>不是</b>列宽而是容量闸门。
     *
     * <p>它与 {@code NoteFieldRules.FREE_TEXT_MAX}（200，一段人写的说明的字数预算）同数纯属巧合。
     * 此前正是这个巧合让门禁的例外清单里挂着 {@code RefreshRequest.java} 一行：扫描器按「有没有把 200 写进
     * 注解」找人，于是那条真正该走 owner 的字段被当成同名豁免。有了名字，例外清单可以空掉。
     */
    public static final int REFRESH_TOKEN_MAX = 200;

    /** 头像的对象存储 key 上限：{@code account.users.avatar_key VARCHAR(255)}（存 key 不存 URL，见 V39 的约定） */
    public static final int AVATAR_KEY_MAX = 255;

    private AccountFieldRules() {}
}
