/**
 * Активный провайдер: СДЭК.
 * Бизнес-логика API пока остаётся в server/index.js;
 * этот модуль — точка расширения и публичный манифест в реестре.
 */
function createCdekProvider() {
  const enabled = Boolean(process.env.CDEK_ACCOUNT && process.env.CDEK_SECURE);
  return {
    id: "cdek",
    label: "СДЭК",
    enabled,
    comingSoon: false,
    description: "Пункты выдачи и курьерская доставка по России",
    capabilities: ["points", "quote", "waybill", "track"],
    info() {
      return {
        id: this.id,
        label: this.label,
        enabled: this.enabled,
        comingSoon: this.comingSoon,
        description: this.description,
        capabilities: this.capabilities
      };
    },
    async searchPoints() {
      throw new Error("CDEK points: use /api/cdek/pvz");
    },
    async calculate() {
      throw new Error("CDEK calculate: use /api/cdek/calculate");
    },
    async createWaybill() {
      throw new Error("CDEK waybill: use server createCdekWaybill");
    },
    async track() {
      throw new Error("CDEK track: use /api/cdek/track");
    },
    mapStatus() {
      return null;
    }
  };
}

module.exports = { createCdekProvider };
