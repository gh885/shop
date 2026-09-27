/**
 * 会话列表里的设备图标判定。
 *
 * 后端只给一个自由文本 `deviceName`（浏览器/User-Agent 传上来的），没有枚举字段可switch，
 * 所以「画手机还是画显示器」靠词表猜。既然是猜，就要能测：词表漏一项不会报错，
 * 只会让某款手机的会话顶着台式机的图标。
 */

/** 认作移动设备的线索，一律小写比对；中文只收「手机」，平板不在本词表内（画桌面图标不算错） */
const MOBILE_HINTS = ["iphone", "android", "手机"]

export function isMobileDeviceName(name: string | null): boolean {
    if (name === null || name === "") return false
    const lowered = name.toLowerCase()
    return MOBILE_HINTS.some((hint) => lowered.includes(hint))
}
