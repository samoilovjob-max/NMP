/**
 * Выгрузка заказов для обработки в 1С.
 * Форматы: CommerceML 2 (orders.xml), CSV (;), JSON.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalParts(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
      time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
    };
  }
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  };
}

function money(value) {
  const n = Number(value || 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fio(customer = {}) {
  return [customer.lastName, customer.firstName, customer.middleName].filter(Boolean).join(" ").trim();
}

function deliveryLabel(method) {
  return (
    {
      cdek: "Доставка СДЭК",
      pickup: "Самовывоз со склада",
      local: "Адресная доставка по Петрозаводску"
    }[method] || "Доставка СДЭК"
  );
}

function paymentLabel(status) {
  return (
    {
      paid: "Оплачен",
      pending: "Ждёт оплату",
      waiting_for_capture: "Ждёт списание",
      canceled: "Оплата отменена",
      cancelled: "Оплата отменена"
    }[status] || status || ""
  );
}

function statusLabel(status) {
  return (
    {
      pending_payment: "Ждёт оплату",
      assembly: "Сборка / к отгрузке",
      shipped: "Отправлен",
      arrived: "В ПВЗ / к вручению",
      cancelled: "Отменён"
    }[status] || status || ""
  );
}

function filterOrdersForExport(orders, { scope = "paid", ids = [] } = {}) {
  const idSet = new Set((ids || []).map(String).filter(Boolean));
  return (orders || []).filter((order) => {
    if (idSet.size && !idSet.has(String(order.id))) return false;
    if (scope === "all") return true;
    if (scope === "new") return !order.exportedTo1cAt;
    if (scope === "paid") return order.paymentStatus === "paid" && order.status !== "cancelled";
    if (scope === "processing") {
      return (
        order.paymentStatus === "paid" &&
        ["assembly", "shipped", "arrived"].includes(order.status)
      );
    }
    return true;
  });
}

function requisites(pairs) {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(
      ([name, value]) => `      <ЗначениеРеквизита>
        <Наименование>${xmlEscape(name)}</Наименование>
        <Значение>${xmlEscape(value)}</Значение>
      </ЗначениеРеквизита>`
    )
    .join("\n");
}

function buildCommerceMl(orders, { formedAt = new Date() } = {}) {
  const formed = toLocalParts(formedAt.toISOString());
  const docs = orders
    .map((order) => {
      const created = toLocalParts(order.createdAt);
      const customer = order.customer || {};
      const name = fio(customer) || "Покупатель";
      const items = Array.isArray(order.items) ? order.items : [];
      const goodsXml = items
        .map((item) => {
          const id = item.productId || item.sku || item.name || "item";
          const qty = Number(item.qty || 1);
          const price = Number(item.price || 0);
          const sum = Number(item.sum ?? price * qty);
          return `      <Товар>
        <Ид>${xmlEscape(id)}</Ид>
        <Артикул>${xmlEscape(item.sku || "")}</Артикул>
        <Наименование>${xmlEscape(item.name || "Товар")}</Наименование>
        <БазоваяЕдиница Код="796" НаименованиеПолное="Штука" МеждународноеСокращение="PCE">шт</БазоваяЕдиница>
        <ЦенаЗаЕдиницу>${money(price)}</ЦенаЗаЕдиницу>
        <Количество>${qty}</Количество>
        <Сумма>${money(sum)}</Сумма>
        <ЗначенияРеквизитов>
${requisites([
  ["ВидНоменклатуры", "Товар"],
  ["ТипНоменклатуры", "Товар"]
])}
        </ЗначенияРеквизитов>
      </Товар>`;
        })
        .join("\n");

      const deliverySum = Number(order.deliverySum || 0);
      const deliveryXml =
        deliverySum > 0
          ? `
      <Товар>
        <Ид>DELIVERY</Ид>
        <Артикул>DELIVERY</Артикул>
        <Наименование>${xmlEscape(deliveryLabel(order.deliveryMethod))}</Наименование>
        <БазоваяЕдиница Код="796" НаименованиеПолное="Штука" МеждународноеСокращение="PCE">шт</БазоваяЕдиница>
        <ЦенаЗаЕдиницу>${money(deliverySum)}</ЦенаЗаЕдиницу>
        <Количество>1</Количество>
        <Сумма>${money(deliverySum)}</Сумма>
        <ЗначенияРеквизитов>
${requisites([
  ["ВидНоменклатуры", "Услуга"],
  ["ТипНоменклатуры", "Услуга"]
])}
        </ЗначенияРеквизитов>
      </Товар>`
          : "";

      return `  <Документ>
    <Ид>${xmlEscape(order.id)}</Ид>
    <Номер>${xmlEscape(order.id)}</Номер>
    <Дата>${created.date}</Дата>
    <Время>${created.time}</Время>
    <ХозОперация>Заказ товара</ХозОперация>
    <Роль>Продавец</Роль>
    <Валюта>руб</Валюта>
    <Курс>1</Курс>
    <Сумма>${money(order.total)}</Сумма>
    <Контрагенты>
      <Контрагент>
        <Ид>${xmlEscape(customer.email || customer.phone || order.id)}</Ид>
        <Наименование>${xmlEscape(name)}</Наименование>
        <ПолноеНаименование>${xmlEscape(name)}</ПолноеНаименование>
        <Фамилия>${xmlEscape(customer.lastName || "")}</Фамилия>
        <Имя>${xmlEscape(customer.firstName || "")}</Имя>
        <Отчество>${xmlEscape(customer.middleName || "")}</Отчество>
        <Контакты>
          <Контакт>
            <Тип>Телефон</Тип>
            <Значение>${xmlEscape(customer.phone || "")}</Значение>
          </Контакт>
          <Контакт>
            <Тип>Почта</Тип>
            <Значение>${xmlEscape(customer.email || "")}</Значение>
          </Контакт>
        </Контакты>
        <АдресРегистрации>
          <Представление>${xmlEscape(order.pvzAddress || order.city || customer.city || "")}</Представление>
        </АдресРегистрации>
        <Роль>Покупатель</Роль>
      </Контрагент>
    </Контрагенты>
    <Товары>
${goodsXml}${deliveryXml}
    </Товары>
    <ЗначенияРеквизитов>
${requisites([
  ["Номер по 1С", ""],
  ["Дата по 1С", ""],
  ["Статус заказа", statusLabel(order.status)],
  ["Статус оплаты", paymentLabel(order.paymentStatus)],
  ["Способ доставки", deliveryLabel(order.deliveryMethod)],
  ["Город", order.city || customer.city || ""],
  ["Код города СДЭК", order.cityCode || ""],
  ["Код ПВЗ", order.pvzCode || ""],
  ["Адрес ПВЗ", order.pvzAddress || ""],
  ["Трек СДЭК", order.cdek?.trackNumber || ""],
  ["Этап СДЭК", order.cdek?.stage || ""],
  ["ЮKassa paymentId", order.paymentId || ""],
  ["Комментарий", order.comment || ""],
  ["Заметка админа", order.adminNotes || ""],
  ["Отменен", order.status === "cancelled" ? "true" : "false"],
  ["Проведен", order.paymentStatus === "paid" ? "true" : "false"]
])}
    </ЗначенияРеквизитов>
  </Документ>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="${formed.date}T${formed.time}">
${docs}
</КоммерческаяИнформация>
`;
}

function buildCsv(orders) {
  const header = [
    "НомерЗаказа",
    "Дата",
    "Время",
    "Статус",
    "Оплата",
    "ФИО",
    "Телефон",
    "Email",
    "Город",
    "СпособПолучения",
    "КодПВЗ",
    "АдресПВЗ",
    "ТрекСДЭК",
    "Артикул",
    "Товар",
    "Количество",
    "Цена",
    "СуммаСтроки",
    "Доставка",
    "ИтогоЗаказа",
    "Комментарий",
    "ЗаметкаАдмина",
    "PaymentId"
  ];

  const rows = [header.join(";")];
  orders.forEach((order) => {
    const created = toLocalParts(order.createdAt);
    const customer = order.customer || {};
    const items = Array.isArray(order.items) && order.items.length ? order.items : [{ sku: "", name: "", qty: 0, price: 0, sum: 0 }];
    items.forEach((item, index) => {
      rows.push(
        [
          order.id,
          created.date,
          created.time,
          statusLabel(order.status),
          paymentLabel(order.paymentStatus),
          fio(customer),
          customer.phone || "",
          customer.email || "",
          order.city || customer.city || "",
          deliveryLabel(order.deliveryMethod),
          order.pvzCode || "",
          order.pvzAddress || "",
          order.cdek?.trackNumber || "",
          item.sku || "",
          item.name || "",
          item.qty || "",
          money(item.price),
          money(item.sum ?? Number(item.price || 0) * Number(item.qty || 0)),
          index === 0 ? money(order.deliverySum) : "",
          index === 0 ? money(order.total) : "",
          index === 0 ? order.comment || "" : "",
          index === 0 ? order.adminNotes || "" : "",
          index === 0 ? order.paymentId || "" : ""
        ]
          .map(csvEscape)
          .join(";")
      );
    });
  });

  // BOM for Excel / 1C on Windows
  return `\uFEFF${rows.join("\n")}\n`;
}

function buildJson(orders) {
  return JSON.stringify(
    {
      ok: true,
      format: "nmp-1c-orders",
      version: "1.0",
      generatedAt: new Date().toISOString(),
      count: orders.length,
      orders: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        status: order.status,
        statusLabel: statusLabel(order.status),
        paymentStatus: order.paymentStatus,
        paymentLabel: paymentLabel(order.paymentStatus),
        paymentId: order.paymentId || "",
        deliveryMethod: order.deliveryMethod || "cdek",
        deliveryMethodLabel: deliveryLabel(order.deliveryMethod),
        city: order.city || order.customer?.city || "",
        cityCode: order.cityCode || "",
        pvzCode: order.pvzCode || "",
        pvzAddress: order.pvzAddress || "",
        tariffCode: order.tariffCode || "",
        trackNumber: order.cdek?.trackNumber || "",
        cdekStage: order.cdek?.stage || "",
        comment: order.comment || "",
        adminNotes: order.adminNotes || "",
        goodsTotal: Number(order.goodsTotal || 0),
        deliverySum: Number(order.deliverySum || 0),
        total: Number(order.total || 0),
        customer: {
          lastName: order.customer?.lastName || "",
          firstName: order.customer?.firstName || "",
          middleName: order.customer?.middleName || "",
          phone: order.customer?.phone || "",
          email: order.customer?.email || "",
          fullName: fio(order.customer)
        },
        items: (order.items || []).map((item) => ({
          productId: item.productId || "",
          sku: item.sku || "",
          name: item.name || "",
          price: Number(item.price || 0),
          qty: Number(item.qty || 0),
          sum: Number(item.sum ?? Number(item.price || 0) * Number(item.qty || 0))
        })),
        exportedTo1cAt: order.exportedTo1cAt || null
      }))
    },
    null,
    2
  );
}

async function buildXlsx(orders) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Northern Magical Place";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Заказы", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  sheet.columns = [
    { header: "Номер заказа", key: "id", width: 18 },
    { header: "Дата", key: "date", width: 12 },
    { header: "Время", key: "time", width: 10 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Оплата", key: "payment", width: 16 },
    { header: "ФИО", key: "fio", width: 28 },
    { header: "Телефон", key: "phone", width: 16 },
    { header: "E-mail", key: "email", width: 24 },
    { header: "Город", key: "city", width: 16 },
    { header: "Доставка", key: "delivery", width: 24 },
    { header: "ПВЗ / адрес", key: "address", width: 36 },
    { header: "Трек", key: "track", width: 16 },
    { header: "Товары", key: "items", width: 40 },
    { header: "Сумма товаров", key: "goods", width: 14 },
    { header: "Доставка ₽", key: "deliverySum", width: 12 },
    { header: "Итого ₽", key: "total", width: 12 },
    { header: "Комментарий", key: "comment", width: 28 },
    { header: "Заметка админа", key: "adminNotes", width: 28 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  orders.forEach((order) => {
    const created = toLocalParts(order.createdAt);
    const customer = order.customer || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsText = items
      .map((item) => `${item.name || item.sku || "товар"} × ${item.qty || 0}`)
      .join("; ");

    sheet.addRow({
      id: order.id,
      date: created.date,
      time: created.time,
      status: statusLabel(order.status),
      payment: paymentLabel(order.paymentStatus),
      fio: fio(customer),
      phone: customer.phone || "",
      email: customer.email || "",
      city: order.city || customer.city || "",
      delivery: deliveryLabel(order.deliveryMethod),
      address: order.localAddress || order.pvzAddress || "",
      track: order.cdek?.trackNumber || "",
      items: itemsText,
      goods: Number(order.goodsTotal || 0),
      deliverySum: Number(order.deliverySum || 0),
      total: Number(order.total || 0),
      comment: order.comment || "",
      adminNotes: order.adminNotes || ""
    });
  });

  ["goods", "deliverySum", "total"].forEach((key) => {
    sheet.getColumn(key).numFmt = "#,##0.00";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function exportOrders(orders, format = "commerceml") {
  const fmt = String(format || "commerceml").toLowerCase();
  if (fmt === "csv") {
    return {
      contentType: "text/csv; charset=utf-8",
      extension: "csv",
      body: buildCsv(orders)
    };
  }
  if (fmt === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: buildJson(orders)
    };
  }
  if (fmt === "xlsx" || fmt === "excel") {
    return {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      body: await buildXlsx(orders)
    };
  }
  return {
    contentType: "application/xml; charset=utf-8",
    extension: "xml",
    body: buildCommerceMl(orders)
  };
}

module.exports = {
  filterOrdersForExport,
  exportOrders,
  buildCommerceMl,
  buildCsv,
  buildJson,
  buildXlsx
};
