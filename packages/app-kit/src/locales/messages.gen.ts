// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：packages/app-kit/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致、没有译文照抄源语言。这条保证属于生成期，手改这份文件不会让它成立。

/** namespace `confirm`：2 条。收窄入口 `AppKitScopedT<"confirm">` */
export type ConfirmKeys =
    "confirm.cancel" |
    "confirm.confirm"

/** namespace `copy`：2 条。收窄入口 `AppKitScopedT<"copy">` */
export type CopyKeys =
    "copy.plain" |
    "copy.failed"

/** namespace `coupon`：6 条。收窄入口 `AppKitScopedT<"coupon">` */
export type CouponKeys =
    "coupon.rule.reduction.threshold" |
    "coupon.rule.reduction.noThreshold" |
    "coupon.rule.rate.threshold" |
    "coupon.rule.rate.thresholdCapped" |
    "coupon.rule.rate.noThreshold" |
    "coupon.rule.rate.noThresholdCapped"

/** namespace `error`：41 条。收窄入口 `AppKitScopedT<"error">` */
export type ErrorKeys =
    "error.network" |
    "error.badRequest" |
    "error.unauthorized" |
    "error.forbidden" |
    "error.notFound" |
    "error.conflict" |
    "error.validation" |
    "error.rateLimited" |
    "error.methodNotAllowed" |
    "error.unsupportedMediaType" |
    "error.payloadTooLarge" |
    "error.serverError" |
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
    "error.SUBACCOUNT_NOT_ACTIVATED" |
    "error.PERMISSION_DENIED" |
    "error.SHOP_NAME_TAKEN" |
    "error.SHOP_LIMIT_EXCEEDED" |
    "error.INSUFFICIENT_STOCK" |
    "error.COUPON_ALREADY_CLAIMED" |
    "error.CATEGORY_NOT_LEAF" |
    "error.CATEGORY_DISABLED" |
    "error.SPEC_SELECTION_EMPTY" |
    "error.ADDRESS_LIMIT_EXCEEDED" |
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED" |
    "error.BANNER_TIME_RANGE_INVALID" |
    "error.FORBIDDEN_WORD_HIT" |
    "error.RESPONSE_VALIDATION_FAILED" |
    "error.NETWORK_ERROR" |
    "error.REQUEST_TIMEOUT" |
    "error.REQUEST_ABORTED"

/** namespace `form`：5 条。收窄入口 `AppKitScopedT<"form">` */
export type FormKeys =
    "form.showPassword" |
    "form.hidePassword" |
    "form.reasonRequired" |
    "form.reasonMaxLength" |
    "form.regionLabel"

/** namespace `locale`：3 条。收窄入口 `AppKitScopedT<"locale">` */
export type LocaleKeys =
    "locale.switch" |
    "locale.syncFailed" |
    "locale.retry"

/** namespace `login`：25 条。收窄入口 `AppKitScopedT<"login">` */
export type LoginKeys =
    "login.smsTab" |
    "login.passwordTab" |
    "login.captchaPlaceholder" |
    "login.captchaLabel" |
    "login.captchaRefresh" |
    "login.captchaAlt" |
    "login.captchaClick" |
    "login.captchaTitle" |
    "login.captchaDesc" |
    "login.captchaConfirm" |
    "login.smsCodeLabel" |
    "login.smsCodePlaceholder" |
    "login.resend" |
    "login.sendCode" |
    "login.needPhone" |
    "login.captchaLoading" |
    "login.passwordLabel" |
    "login.passwordPlaceholder" |
    "login.err.passwordMin" |
    "login.err.phoneFormat" |
    "login.err.smsCodeFormat" |
    "login.submit" |
    "login.successTitle" |
    "login.successDescription" |
    "login.codeSent"

/** namespace `nav`：1 条。收窄入口 `AppKitScopedT<"nav">` */
export type NavKeys =
    "nav.railLabel"

/** namespace `route-error`：4 条。收窄入口 `AppKitScopedT<"route-error">` */
export type RouteErrorKeys =
    "routeError.label" |
    "routeError.title" |
    "routeError.description" |
    "routeError.retry"

/** namespace `time`：1 条。收窄入口 `AppKitScopedT<"time">` */
export type TimeKeys =
    "time.unknown"

/** namespace `topbar`：2 条。收窄入口 `AppKitScopedT<"topbar">` */
export type TopbarKeys =
    "topbar.searchPlaceholder" |
    "topbar.searchLabel"

/** namespace `ui`：56 条。收窄入口 `AppKitScopedT<"ui">` */
export type UiKeys =
    "ui.search.button" |
    "ui.search.placeholder" |
    "ui.search.ariaLabel" |
    "ui.stateError.title" |
    "ui.stateError.retry" |
    "ui.stateError.retrying" |
    "ui.imageUpload.remove" |
    "ui.imageUpload.drag" |
    "ui.imageUpload.emptyAlt" |
    "ui.imageUpload.gridLabel" |
    "ui.imageUpload.readError" |
    "ui.imageUpload.uploadError" |
    "ui.regionPicker.placeholder" |
    "ui.regionPicker.searchPlaceholder" |
    "ui.phoneField.ariaLabel" |
    "ui.phoneField.placeholder" |
    "ui.select.placeholder" |
    "ui.maskedValue.view" |
    "ui.maskedValue.aria" |
    "ui.maskedValue.ariaNoSubject" |
    "ui.dataTable.sortAscending" |
    "ui.dataTable.sortDescending" |
    "ui.dataTable.columnsMenu" |
    "ui.dataTable.toggleColumns" |
    "ui.dataTable.pinColumnStart" |
    "ui.dataTable.pinColumnEnd" |
    "ui.dataTable.moveColumnStart" |
    "ui.dataTable.moveColumnEnd" |
    "ui.dataTable.unpinColumn" |
    "ui.dataTable.rowCreate" |
    "ui.dataTable.pinRow" |
    "ui.dataTable.unpinRow" |
    "ui.dataTable.selectRow" |
    "ui.dataTable.selectAll" |
    "ui.dataTable.expandRow" |
    "ui.dataTable.collapseRow" |
    "ui.dataTable.dragToReorder" |
    "ui.dataTable.dragToReorderRow" |
    "ui.dataTable.reorderingUnavailable" |
    "ui.dataTable.loading" |
    "ui.dataTable.empty" |
    "ui.dataTable.allRowsLoaded" |
    "ui.dataTable.rowsPerPage" |
    "ui.dataTable.paginationInfo" |
    "ui.dataTable.previousPage" |
    "ui.dataTable.nextPage" |
    "ui.dataTable.goToPage" |
    "ui.dataTable.paginationEllipsis" |
    "ui.dataTable.filterSelectedCount" |
    "ui.dataTable.filterNoResults" |
    "ui.dataTable.filterClear" |
    "ui.dataTable.reset" |
    "ui.dateTimePicker.placeholder" |
    "ui.dateTimePicker.clear" |
    "ui.dateTimePicker.done" |
    "ui.dateTimePicker.timeAria"

/** namespace `unsaved-leave`：4 条。收窄入口 `AppKitScopedT<"unsaved-leave">` */
export type UnsavedLeaveKeys =
    "unsavedLeave.title" |
    "unsavedLeave.description" |
    "unsavedLeave.cancel" |
    "unsavedLeave.confirm"

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
    "confirm": ConfirmKeys
    "copy": CopyKeys
    "coupon": CouponKeys
    "error": ErrorKeys
    "form": FormKeys
    "locale": LocaleKeys
    "login": LoginKeys
    "nav": NavKeys
    "route-error": RouteErrorKeys
    "time": TimeKeys
    "topbar": TopbarKeys
    "ui": UiKeys
    "unsaved-leave": UnsavedLeaveKeys
    "validation": ValidationKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AppKitScopedT`——见 按资源文件收窄 key 的约定。 */
export type AppKitMessageKey = AppKitNamespace[keyof AppKitNamespace]

export type AppKitParamsByKey = {
    "coupon.rule.rate.noThreshold": { rate: string | number }
    "coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "coupon.rule.reduction.noThreshold": { discount: string | number }
    "coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "error.ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "form.reasonMaxLength": { label: string | number; max: string | number }
    "form.reasonRequired": { label: string | number }
    "login.err.passwordMin": { min: string | number }
    "login.err.smsCodeFormat": { digits: string | number }
    "login.resend": { countdown: string | number }
    "topbar.searchLabel": { brand: string | number }
    "ui.dataTable.filterSelectedCount": { count: string | number }
    "ui.dataTable.goToPage": { page: string | number }
    "ui.dataTable.paginationInfo": { from: string | number; to: string | number; count: string | number }
    "ui.dataTable.unpinColumn": { title: string | number }
    "ui.dateTimePicker.timeAria": { label: string | number }
    "ui.maskedValue.aria": { subject: string | number; value: string | number }
    "ui.maskedValue.ariaNoSubject": { value: string | number }
    "validation.MAX": { max: string | number }
    "validation.MAX_LENGTH": { max: string | number }
    "validation.MIN": { min: string | number }
    "validation.MIN_LENGTH": { min: string | number }
}

export type AppKitParamsOf<K extends AppKitMessageKey> = K extends keyof AppKitParamsByKey
    ? AppKitParamsByKey[K]
    : undefined

/**
 * app-kit 自己的 `t` 形状：只认自己的资源。三端调用侧不用它——各端生成物里那份
 * `XTranslate` 把本端 key 与这份并在一起，与运行时的解析链同一条（先查本端资源、再查共享资源）。
 * 无参消息不接收参数；带参消息必须提供完整参数。
 */
export type AppKitTranslate = <K extends AppKitMessageKey>(
    key: K,
    ...args: AppKitParamsOf<K> extends undefined ? [] : [params: AppKitParamsOf<K>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AppKitScopedT<N extends keyof AppKitNamespace> = <K extends AppKitNamespace[N]>(
    key: K,
    ...args: AppKitParamsOf<K> extends undefined ? [] : [params: AppKitParamsOf<K>]
) => string

/** 一种语言里 AppKitMessageKey 的每一个都得有一句 */
export type AppKitCatalog = { [K in AppKitMessageKey]: string }
