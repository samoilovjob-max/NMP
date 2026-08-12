/**
 * Контракт провайдера доставки (ТК).
 *
 * Checkout methods (cdek | pickup | local) — способ получения.
 * Carrier providers — внешние ТК для расчёта/ПВЗ/накладной/трека.
 *
 * Сейчас активен только `cdek`. Остальные — заглушки под будущее подключение.
 *
 * @typedef {Object} DeliveryProviderInfo
 * @property {string} id
 * @property {string} label
 * @property {boolean} enabled
 * @property {boolean} [comingSoon]
 * @property {string} [description]
 * @property {string[]} [capabilities]  points | quote | waybill | track
 *
 * @typedef {Object} DeliveryProvider
 * @property {string} id
 * @property {string} label
 * @property {boolean} enabled
 * @property {boolean} [comingSoon]
 * @property {string} [description]
 * @property {string[]} [capabilities]
 * @property {() => DeliveryProviderInfo} info
 * @property {(query: object) => Promise<object>} [searchPoints]
 * @property {(payload: object) => Promise<object>} [calculate]
 * @property {(order: object) => Promise<object>} [createWaybill]
 * @property {(orderOrQuery: object|string) => Promise<object>} [track]
 * @property {(external: object) => string|null} [mapStatus]
 */

module.exports = {};
