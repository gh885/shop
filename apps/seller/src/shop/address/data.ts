import {
    type MerchantAddressRequest,
    type MerchantAddressResponse,
    SellerAddressesApi,
} from "@shop/api/sdk"

// ---------- 商家地址数据函数（wire → 领域形状） ----------

/** 本店地址库列表 */
export async function listAddresses(): Promise<MerchantAddressResponse[]> {
    return SellerAddressesApi.listAddresses1()
}

/** 新增地址（可同时标记默认发货/默认退货） */
export async function createAddress(
    input: MerchantAddressRequest,
): Promise<MerchantAddressResponse> {
    return SellerAddressesApi.createAddress1({ body: input })
}

/** 编辑地址 */
export async function updateAddress(
    id: string,
    input: MerchantAddressRequest,
): Promise<MerchantAddressResponse> {
    return SellerAddressesApi.updateAddress1({ path: { id }, body: input })
}

/** 删除地址（软删） */
export async function deleteAddress(id: string) {
    await SellerAddressesApi.deleteAddress1({ path: { id } })
}

/** 设为默认发货地址 */
export async function setDefaultShip(id: string): Promise<MerchantAddressResponse> {
    return SellerAddressesApi.setDefaultShip({ path: { id } })
}

/** 设为默认退货地址 */
export async function setDefaultReturn(id: string): Promise<MerchantAddressResponse> {
    return SellerAddressesApi.setDefaultReturn({ path: { id } })
}
