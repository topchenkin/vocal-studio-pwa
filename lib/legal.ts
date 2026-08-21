export const LEGAL = {
  brand: "Unique Vocal Studio",
  site: "https://www.uniquevocal.ru",
  siteAlt: "https://uniquevocal.ru",
  inn: "668400292050",
  /** Паспортное ФИО самозанятого. Пусто — в оферте только статус и ИНН. */
  fullName: "",
  status:
    "физическое лицо, применяющее специальный налоговый режим «Налог на профессиональный доход» (самозанятый)",
  phone: "+7 963 052-02-51",
  phoneHref: "tel:+79630520251",
  email: "yangta4@gmail.com",
  offerDate: "21 августа 2026 г.",
  offerPath: "/oferta",
} as const;

export function executorTitle() {
  if (LEGAL.fullName.trim()) {
    return `${LEGAL.fullName}, ${LEGAL.status}`;
  }
  return LEGAL.status;
}
