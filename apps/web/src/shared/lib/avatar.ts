/**
 * 头像占位字符：没有图（或图片 URL 还没签发）时，用名字的第一个字符兜底。
 *
 * 三处都在算这件事（顶栏用户菜单、首页用户卡、商详店铺条），各写各的迟早分家：
 * 一处 `toUpperCase()` 了英文昵称、另一处没有，头像里的字母就一半大写一半小写。
 */
export function avatarInitial(name: string): string {
    const trimmed = name.trim()
    // 解构字符串走的是迭代器，即按码位取首字符；charAt(0) 会切出半个代理对，
    // emoji 与非 BMP 汉字渲染成乱码方块——头像兜底本来是无损的展示，别在这里变成坏字符。
    // toUpperCase 而不是 toLocaleUpperCase：后者跟浏览器语言走，土耳其语言环境下
    // "i" 会转成带点的 İ，同一个人的头像在两台机器上不该长两个字符
    const [first] = trimmed
    return first === undefined ? "" : first.toUpperCase()
}
