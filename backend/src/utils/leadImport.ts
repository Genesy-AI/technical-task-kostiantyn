const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const wholeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

// Maps an (already required-field-checked) import row to the Prisma create payload.
export function toLeadCreateData(lead: Record<string, any>) {
  return {
    firstName: lead.firstName.trim(),
    lastName: lead.lastName.trim(),
    email: lead.email.trim(),
    jobTitle: optionalText(lead.jobTitle),
    countryCode: optionalText(lead.countryCode),
    companyName: optionalText(lead.companyName),
    phone: optionalText(lead.phone),
    yearsAtCompany: wholeNumber(lead.yearsAtCompany),
    linkedinUrl: optionalText(lead.linkedinUrl),
  }
}
