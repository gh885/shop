// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：packages/app-kit/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

/** namespace `appKit`：100 条。收窄入口 `AppKitScopedT<"appKit">` */
export type AppKitKeys =
    "appKit.routeError.label" |
    "appKit.routeError.title" |
    "appKit.routeError.description" |
    "appKit.routeError.retry" |
    "appKit.error.network" |
    "appKit.error.badRequest" |
    "appKit.error.unauthorized" |
    "appKit.error.forbidden" |
    "appKit.error.notFound" |
    "appKit.error.conflict" |
    "appKit.error.validation" |
    "appKit.error.rateLimited" |
    "appKit.error.payloadTooLarge" |
    "appKit.error.serverError" |
    "appKit.time.unknown" |
    "appKit.locale.switch" |
    "appKit.confirm.cancel" |
    "appKit.confirm.confirm" |
    "appKit.form.showPassword" |
    "appKit.form.hidePassword" |
    "appKit.topbar.searchPlaceholder" |
    "appKit.topbar.searchLabel" |
    "appKit.login.smsTab" |
    "appKit.login.passwordTab" |
    "appKit.login.captchaPlaceholder" |
    "appKit.login.captchaLabel" |
    "appKit.login.captchaRefresh" |
    "appKit.login.captchaAlt" |
    "appKit.login.captchaClick" |
    "appKit.login.captchaTitle" |
    "appKit.login.captchaDesc" |
    "appKit.login.captchaConfirm" |
    "appKit.login.smsCodeLabel" |
    "appKit.login.smsCodePlaceholder" |
    "appKit.login.resend" |
    "appKit.login.sendCode" |
    "appKit.login.needPhone" |
    "appKit.login.captchaLoading" |
    "appKit.login.passwordLabel" |
    "appKit.login.passwordPlaceholder" |
    "appKit.login.submit" |
    "appKit.login.successTitle" |
    "appKit.login.successDescription" |
    "appKit.login.codeSent" |
    "appKit.ui.search.button" |
    "appKit.ui.search.placeholder" |
    "appKit.ui.search.ariaLabel" |
    "appKit.ui.stateError.title" |
    "appKit.ui.stateError.retry" |
    "appKit.ui.stateError.retrying" |
    "appKit.ui.imageUpload.remove" |
    "appKit.ui.imageUpload.drag" |
    "appKit.ui.imageUpload.emptyAlt" |
    "appKit.ui.imageUpload.gridLabel" |
    "appKit.ui.imageUpload.readError" |
    "appKit.ui.imageUpload.uploadError" |
    "appKit.ui.regionPicker.placeholder" |
    "appKit.ui.regionPicker.searchPlaceholder" |
    "appKit.ui.phoneField.ariaLabel" |
    "appKit.ui.phoneField.placeholder" |
    "appKit.ui.select.placeholder" |
    "appKit.ui.maskedValue.view" |
    "appKit.ui.maskedValue.aria" |
    "appKit.ui.maskedValue.ariaNoSubject" |
    "appKit.ui.dataTable.sortAscending" |
    "appKit.ui.dataTable.sortDescending" |
    "appKit.ui.dataTable.columnsMenu" |
    "appKit.ui.dataTable.toggleColumns" |
    "appKit.ui.dataTable.pinColumnStart" |
    "appKit.ui.dataTable.pinColumnEnd" |
    "appKit.ui.dataTable.moveColumnStart" |
    "appKit.ui.dataTable.moveColumnEnd" |
    "appKit.ui.dataTable.unpinColumn" |
    "appKit.ui.dataTable.rowCreate" |
    "appKit.ui.dataTable.pinRow" |
    "appKit.ui.dataTable.unpinRow" |
    "appKit.ui.dataTable.selectRow" |
    "appKit.ui.dataTable.selectAll" |
    "appKit.ui.dataTable.expandRow" |
    "appKit.ui.dataTable.collapseRow" |
    "appKit.ui.dataTable.dragToReorder" |
    "appKit.ui.dataTable.dragToReorderRow" |
    "appKit.ui.dataTable.reorderingUnavailable" |
    "appKit.ui.dataTable.loading" |
    "appKit.ui.dataTable.empty" |
    "appKit.ui.dataTable.allRowsLoaded" |
    "appKit.ui.dataTable.rowsPerPage" |
    "appKit.ui.dataTable.paginationInfo" |
    "appKit.ui.dataTable.previousPage" |
    "appKit.ui.dataTable.nextPage" |
    "appKit.ui.dataTable.goToPage" |
    "appKit.ui.dataTable.paginationEllipsis" |
    "appKit.ui.dataTable.filterSelectedCount" |
    "appKit.ui.dataTable.filterNoResults" |
    "appKit.ui.dataTable.filterClear" |
    "appKit.ui.dataTable.reset" |
    "appKit.ui.dateTimePicker.placeholder" |
    "appKit.ui.dateTimePicker.clear" |
    "appKit.ui.dateTimePicker.done" |
    "appKit.ui.dateTimePicker.timeAria"

/** namespace `error`：28 条。收窄入口 `AppKitScopedT<"error">` */
export type ErrorKeys =
    "error.SMS_RATE_LIMIT" |
    "error.SMS_DAILY_LIMIT" |
    "error.SMS_CODE_EXPIRED" |
    "error.SMS_CODE_INVALID" |
    "error.CAPTCHA_REQUIRED" |
    "error.CAPTCHA_EXPIRED" |
    "error.CAPTCHA_INVALID" |
    "error.TOKEN_EXPIRED" |
    "error.INVALID_TOKEN" |
    "error.REFRESH_TOKEN_REUSED" |
    "error.USER_DISABLED" |
    "error.STAFF_DISABLED" |
    "error.PERMISSION_DENIED" |
    "error.SHOP_NAME_TAKEN" |
    "error.SHOP_LIMIT_EXCEEDED" |
    "error.INSUFFICIENT_STOCK" |
    "error.COUPON_ALREADY_CLAIMED" |
    "error.AFTER_SALE_ALREADY_REFUNDED" |
    "error.CATEGORY_NOT_LEAF" |
    "error.CATEGORY_DISABLED" |
    "error.ADDRESS_LIMIT_EXCEEDED" |
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED" |
    "error.BANNER_TIME_RANGE_INVALID" |
    "error.FORBIDDEN_WORD_HIT" |
    "error.RESPONSE_VALIDATION_FAILED" |
    "error.NETWORK_ERROR" |
    "error.REQUEST_TIMEOUT" |
    "error.REQUEST_ABORTED"

/** namespace `validation`：6 条。收窄入口 `AppKitScopedT<"validation">` */
export type ValidationKeys =
    "validation.REQUIRED" |
    "validation.MIN_LENGTH" |
    "validation.MAX_LENGTH" |
    "validation.PATTERN" |
    "validation.MIN" |
    "validation.MAX"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `AppKitScopedT` 的入口。
 */
export type AppKitNamespace = {
    "appKit": AppKitKeys
    "error": ErrorKeys
    "validation": ValidationKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AppKitScopedT`——见 §4.2 末段。 */
export type AppKitMessageKey = AppKitNamespace[keyof AppKitNamespace]

type AppKitParamsByKey = {
    "appKit.login.resend": { countdown: string | number }
    "appKit.topbar.searchLabel": { brand: string | number }
    "appKit.ui.dataTable.filterSelectedCount": { count: string | number }
    "appKit.ui.dataTable.goToPage": { page: string | number }
    "appKit.ui.dataTable.paginationInfo": { from: string | number; to: string | number; count: string | number }
    "appKit.ui.dataTable.unpinColumn": { title: string | number }
    "appKit.ui.dateTimePicker.timeAria": { label: string | number }
    "appKit.ui.maskedValue.aria": { subject: string | number; value: string | number }
    "appKit.ui.maskedValue.ariaNoSubject": { value: string | number }
    "error.ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "validation.MAX": { max: string | number }
    "validation.MAX_LENGTH": { max: string | number }
    "validation.MIN": { min: string | number }
    "validation.MIN_LENGTH": { min: string | number }
}

export type AppKitParamsOf<K extends AppKitMessageKey> = K extends keyof AppKitParamsByKey
    ? AppKitParamsByKey[K]
    : undefined

/**
 * app-kit 自己的 `t` 形状：只认 `appKit.*`。三端调用侧不用它——各端生成物里那份
 * `XTranslate` 把本端 key 与这份并在一起，与运行时的解析链同一条（先查本端资源、再查共享资源）。
 * 无参消息的参数位是 `undefined`，多塞一个就是编译错误；带参消息漏传不拦（可选位）。
 */
export type AppKitTranslate = <K extends AppKitMessageKey>(
    key: K,
    params?: AppKitParamsOf<K>,
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AppKitScopedT<N extends keyof AppKitNamespace> = <K extends AppKitNamespace[N]>(
    key: K,
    params?: AppKitParamsOf<K>,
) => string

/** 一种语言里 AppKitMessageKey 的每一个都得有一句 */
export type AppKitCatalog = { [K in AppKitMessageKey]: string }
