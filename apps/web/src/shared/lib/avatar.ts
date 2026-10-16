export function avatarInitial(name: string): string {
    const trimmed = name.trim()
    // 解构字符串走的是迭代器，即按码位取首字符；charAt(0) 会切出半个代理对，
    // emoji 与非 BMP 汉字渲染成乱码方块。
    // toUpperCase 而不是 toLocaleUpperCase：后者跟浏览器语言走，土耳其语言环境下
    // "i" 会转成带点的 İ，同一个人的头像在两台机器上不该长两个字符
    const [first] = trimmed
    return first === undefined ? "" : first.toUpperCase()
}
