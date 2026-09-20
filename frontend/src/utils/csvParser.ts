import Papa from 'papaparse'
import { isValidCountryCode } from './countryCodes'

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phone?: string
  yearsAtCompany?: number
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  rowIndex: number
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const parseYears = (value: string): number | null => (/^\d{1,2}$/.test(value) ? Number(value) : null)

// Returns a normalised https URL for linkedin.com (or a subdomain), or null.
const parseLinkedinUrl = (value: string): string | null => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    const isLinkedin = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')
    return isLinkedin ? url.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

// Decodes CSV file bytes as UTF-8 (BOM stripped), falling back to Windows-1252
// for legacy Excel exports so accented characters are not replaced with U+FFFD.
export const decodeCsv = (buffer: ArrayBuffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const lead: Partial<CsvLead> = { rowIndex: index + 2 }
    let rawYears = ''
    let rawLinkedin = ''

    Object.entries(row).forEach(([header, value]) => {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '')
      const trimmedValue = value?.trim() || ''

      switch (normalizedHeader) {
        case 'firstname':
          lead.firstName = trimmedValue
          break
        case 'lastname':
          lead.lastName = trimmedValue
          break
        case 'email':
          lead.email = trimmedValue
          break
        case 'jobtitle':
          lead.jobTitle = trimmedValue || undefined
          break
        case 'countrycode':
          lead.countryCode = trimmedValue.toUpperCase() || undefined
          break
        case 'companyname':
          lead.companyName = trimmedValue || undefined
          break
        case 'phone':
        case 'phonenumber':
          lead.phone = trimmedValue || undefined
          break
        case 'yearsatcompany':
        case 'yearsinrole':
          rawYears = trimmedValue
          break
        case 'linkedin':
        case 'linkedinurl':
          rawLinkedin = trimmedValue
          break
      }
    })

    const errors: string[] = []
    if (!lead.firstName?.trim()) {
      errors.push('First name is required')
    }
    if (!lead.lastName?.trim()) {
      errors.push('Last name is required')
    }
    if (!lead.email?.trim()) {
      errors.push('Email is required')
    } else if (!isValidEmail(lead.email)) {
      errors.push('Invalid email format')
    }
    if (lead.countryCode && !isValidCountryCode(lead.countryCode)) {
      errors.push(`Invalid country code "${lead.countryCode}"`)
      lead.countryCode = undefined
    }
    if (rawYears) {
      const years = parseYears(rawYears)
      if (years === null) {
        errors.push(`Invalid years at company "${rawYears}"`)
      } else {
        lead.yearsAtCompany = years
      }
    }
    if (rawLinkedin) {
      const linkedinUrl = parseLinkedinUrl(rawLinkedin)
      if (linkedinUrl === null) {
        errors.push(`Invalid LinkedIn URL "${rawLinkedin}"`)
      } else {
        lead.linkedinUrl = linkedinUrl
      }
    }

    data.push({
      ...lead,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      isValid: errors.length === 0,
      errors,
    } as CsvLead)
  })

  return data
}
