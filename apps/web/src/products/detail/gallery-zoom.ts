/**
 * 主图 hover 放大的几何 —— 纯算式，不碰 DOM。
 *
 * 难点不在放大，在 `object-cover` 的裁切：框的比例与原图比例不同时，图会被裁掉一圈，
 * 指针所在处**不是**原图上的同一比例处。裁掉的部分不扣回坐标，hover 到图片边缘时
 * 预览里就永远看不到那圈边缘（而放大镜偏偏是为看边缘细节存在的）。
 *
 * 抽出来的另一层理由是这套几何今天零测试：它错一点只会「看着差不多对」，没人会当 bug 报。
 */

/** 放大倍数：预览浮层 background-size = ZOOM × 浮层边长，蒙层尺寸由它反推 */
export const ZOOM = 2.5

/** 把中心比例夹在 [half, 1−half] 内，让蒙层不越出图片边界 */
export function clampCenter(v: number, half: number): number {
    return Math.min(1 - half, Math.max(half, v))
}

/** 原图比例 f → background-position 百分比：两者不是一回事，p = (z·f − 0.5) / (z − 1) */
export function bgPos(f: number, z: number): string {
    return `${((z * f - 0.5) / (z - 1)) * 100}%`
}

export interface LensGeometry {
    /** 蒙层中心（框内比例，已夹住半宽/半高，故蒙层永远整块在图内） */
    fx: number
    fy: number
    /** 蒙层宽 / 高（占框的比例） */
    lensX: number
    lensY: number
    /** 预览图的 `background-position` 值，可直接写进 style */
    backgroundPosition: string
}

/**
 * 由指针位置算出蒙层与该蒙层对应的预览位移。
 *
 * @param naturalAspect 原图宽高比（取不到 naturalWidth 时调用方给框的比例兜底）
 * @param pointerX/pointerY 指针在框内的比例（0..1，DOM 坐标换算留在组件里）
 */
export function lensGeometry(input: {
    naturalAspect: number
    frameWidth: number
    frameHeight: number
    pointerX: number
    pointerY: number
    zoom?: number
}): LensGeometry {
    const { naturalAspect: nat, frameWidth, frameHeight, pointerX, pointerY } = input
    const zoom = input.zoom ?? ZOOM
    const frameAspect = frameWidth / frameHeight
    /** 横向/纵向看得见的原图比例（被 cover 裁掉的那部分不在这里面） */
    const visX = Math.min(1, frameAspect / nat)
    const visY = Math.min(1, nat / frameAspect)
    // 预览窗口覆盖的原图比例：横 1/zoom，纵 nat/zoom（像素上都是 natW/zoom，是个正方形）
    const lensX = 1 / zoom / visX
    const lensY = nat / zoom / visY
    const fx = clampCenter(pointerX, lensX / 2)
    const fy = clampCenter(pointerY, lensY / 2)
    // 框内比例 → 原图比例（扣掉裁切）→ background-position
    const nx = 0.5 + (fx - 0.5) * visX
    const ny = 0.5 + (fy - 0.5) * visY
    return {
        fx,
        fy,
        lensX,
        lensY,
        backgroundPosition: `${bgPos(nx, zoom)} ${bgPos(ny, zoom / nat)}`,
    }
}
