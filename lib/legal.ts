export const LEGAL = {
  brand: "Unique Vocal Studio",
  site: "https://www.uniquevocal.ru",
  siteAlt: "https://uniquevocal.ru",
  inn: "668400292050",
  fullName: "Топченкина Ирина Алексеевна",
  city: "Екатеринбург",
  status:
    "физическое лицо, применяющее специальный налоговый режим «Налог на профессиональный доход» (самозанятый)",
  offerDate: "21 августа 2026 г.",
  offerPath: "/oferta",
  privacyPath: "/privacy",
  uslugiPath: "/uslugi",
  contactsPath: "/kontakty",
} as const;

export function executorTitle() {
  if (LEGAL.fullName.trim()) {
    return `${LEGAL.fullName}, ${LEGAL.status}`;
  }
  return LEGAL.status;
}
