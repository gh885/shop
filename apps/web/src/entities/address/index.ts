export {
    AddressSchema,
    AddressInputSchema,
    isUsablePhone,
    isComplete,
    hasDefault,
    setDefault,
} from "./model"
export type { Address, AddressInput } from "./model"

export {
    listAddresses,
    getAddress,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    unsetDefaultAddress,
} from "./actions"
