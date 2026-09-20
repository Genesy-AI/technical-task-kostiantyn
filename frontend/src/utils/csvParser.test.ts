import { describe, it, expect } from 'vitest'
import { parseCsv, isValidEmail, decodeCsv } from './csvParser'

describe('isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('first.last+tag@example.org')).toBe(true)
    expect(isValidEmail('123@456.com')).toBe(true)
  })

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test.example.com')).toBe(false)
    expect(isValidEmail('test@.com')).toBe(false)
    expect(isValidEmail('test@example')).toBe(false)
  })
})

describe('parseCsv', () => {
  it('should throw error for empty content', () => {
    expect(() => parseCsv('')).toThrow('CSV content cannot be empty')
    expect(() => parseCsv('   ')).toThrow('CSV content cannot be empty')
  })

  it('should throw error for CSV with only headers', () => {
    const csv = 'firstName,lastName,email'
    expect(() => parseCsv(csv)).toThrow('CSV file appears to be empty or contains no valid data')
  })

  it('should throw error for malformed CSV content', () => {
    const malformedCsv = `firstName,lastName,email
"John,Doe,john@example.com,extra"field`
    expect(() => parseCsv(malformedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with mismatched field count', () => {
    const mismatchedCsv = `firstName,lastName,email
John,Doe,john@example.com,ExtraField,AnotherExtra
Jane,Smith`
    expect(() => parseCsv(mismatchedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with critical delimiter issues', () => {
    const noDelimiterCsv = `firstName lastName email
John Doe john@example.com`
    expect(() => parseCsv(noDelimiterCsv)).toThrow()
  })

  it('should parse valid CSV with all required fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode,companyName
John,Doe,john.doe@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      jobTitle: 'Developer',
      countryCode: 'US',
      companyName: 'Tech Corp',
      isValid: true,
      errors: [],
      rowIndex: 2,
    })
  })

  it('should handle missing required fields and mark as invalid', () => {
    const csv = `firstName,lastName,email
,Smith,john@example.com
John,,john@example.com
John,Smith,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('First name is required')

    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('Last name is required')

    expect(result[2].isValid).toBe(false)
    expect(result[2].errors).toContain('Email is required')
  })

  it('should validate email format', () => {
    const csv = `firstName,lastName,email
John,Doe,invalid-email
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid email format')
    expect(result[1].isValid).toBe(true)
  })

  it('should handle CSV with quoted values', () => {
    const csv = `firstName,lastName,email,jobTitle
"John","Doe","john.doe@example.com","Software Engineer"`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john.doe@example.com')
    expect(result[0].jobTitle).toBe('Software Engineer')
  })

  it('should skip empty rows', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,,
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('John')
    expect(result[1].firstName).toBe('Jane')
  })

  it('should handle case-insensitive headers', () => {
    const csv = `FIRSTNAME,LASTNAME,EMAIL,JOBTITLE,COUNTRYCODE,COMPANYNAME
John,Doe,john@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].jobTitle).toBe('Developer')
  })

  it('should handle missing optional fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode
John,Doe,john@example.com,,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].jobTitle).toBeUndefined()
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should preserve row index correctly', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
Jane,Smith,jane@example.com
Bob,Johnson,bob@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].rowIndex).toBe(2)
    expect(result[1].rowIndex).toBe(3)
    expect(result[2].rowIndex).toBe(4)
  })

  it('should handle multiple validation errors per lead', () => {
    const csv = `firstName,lastName,email
 , ,invalid-email`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toHaveLength(3)
    expect(result[0].errors).toContain('First name is required')
    expect(result[0].errors).toContain('Last name is required')
    expect(result[0].errors).toContain('Invalid email format')
  })

  it('should handle extra columns not in header mapping', () => {
    const csv = `firstName,lastName,email,unknownColumn
John,Doe,john@example.com,someValue`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })

  it('should handle mixed valid and invalid leads', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,Smith,invalid-email
Jane,Johnson,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].isValid).toBe(true)
    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('First name is required')
    expect(result[1].errors).toContain('Invalid email format')
    expect(result[2].isValid).toBe(true)
  })

  it('should handle whitespace in fields', () => {
    const csv = `firstName,lastName,email
 John , Doe , john@example.com `

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })
})

describe('parseCsv country codes', () => {
  const parseOne = (country: string) =>
    parseCsv(`firstName,lastName,email,countryCode\nJohn,Doe,john@example.com,${country}`)[0]

  it('accepts valid ISO 3166-1 alpha-2 codes', () => {
    for (const code of ['US', 'ES', 'KI', 'TV', 'KP']) {
      const lead = parseOne(code)
      expect(lead.countryCode).toBe(code)
      expect(lead.isValid).toBe(true)
    }
  })

  it('normalises case and whitespace', () => {
    const lead = parseOne(' us ')
    expect(lead.countryCode).toBe('US')
    expect(lead.isValid).toBe(true)
  })

  it('flags invalid codes on the row and marks it invalid', () => {
    for (const code of ['XXX', '12', 'ZZ', 'U']) {
      const lead = parseOne(code)
      expect(lead.isValid).toBe(false)
      expect(lead.errors).toContain(`Invalid country code "${code}"`)
    }
  })

  it('does not keep an invalid code on the lead', () => {
    expect(parseOne('XXX').countryCode).toBeUndefined()
  })

  it('treats a blank country as missing, not invalid', () => {
    const lead = parseOne('')
    expect(lead.countryCode).toBeUndefined()
    expect(lead.isValid).toBe(true)
  })
})

describe('parseCsv BOM handling', () => {
  it('strips a UTF-8 BOM so the first header is still recognised', () => {
    const csv = '\uFEFFfirstName,lastName,email\nJohn,Doe,john@example.com'
    const [lead] = parseCsv(csv)
    expect(lead.firstName).toBe('John')
    expect(lead.isValid).toBe(true)
  })
})

describe('decodeCsv', () => {
  const bytes = (...b: number[]) => new Uint8Array(b).buffer

  it('decodes UTF-8', () => {
    const buf = new TextEncoder().encode('Iñaki,ES').buffer
    expect(decodeCsv(buf)).toBe('Iñaki,ES')
  })

  it('strips a UTF-8 BOM', () => {
    const buf = new TextEncoder().encode('\uFEFFfirstName').buffer
    expect(decodeCsv(buf)).toBe('firstName')
  })

  it('falls back to Windows-1252 when the bytes are not valid UTF-8', () => {
    // "Iñaki" in Windows-1252: ñ = 0xF1
    expect(decodeCsv(bytes(0x49, 0xf1, 0x61, 0x6b, 0x69))).toBe('Iñaki')
  })
})

describe('parseCsv new lead fields', () => {
  const parseOne = (headers: string, values: string) =>
    parseCsv(`firstName,lastName,email,${headers}\nJohn,Doe,john@example.com,${values}`)[0]

  it('reads phone, years at company and LinkedIn URL', () => {
    const lead = parseOne(
      'phone,yearsAtCompany,linkedinUrl',
      '+1 280 754 0462,4,https://www.linkedin.com/in/john-doe'
    )
    expect(lead.phone).toBe('+1 280 754 0462')
    expect(lead.yearsAtCompany).toBe(4)
    expect(lead.linkedinUrl).toBe('https://www.linkedin.com/in/john-doe')
    expect(lead.isValid).toBe(true)
  })

  it('accepts the header variants used by the sample files', () => {
    const lead = parseOne('phoneNumber,yearsInRole,linkedin', '(731)123-9702,2,https://linkedin.com/in/jd')
    expect(lead.phone).toBe('(731)123-9702')
    expect(lead.yearsAtCompany).toBe(2)
    expect(lead.linkedinUrl).toBe('https://linkedin.com/in/jd')
  })

  it('keeps phone numbers as text, preserving "+" and leading zeros', () => {
    expect(parseOne('phone', '+34600111222').phone).toBe('+34600111222')
    expect(parseOne('phone', '0034600111222').phone).toBe('0034600111222')
  })

  it('treats blank new fields as missing, not invalid', () => {
    const lead = parseOne('phone,yearsAtCompany,linkedinUrl', ',,')
    expect(lead.phone).toBeUndefined()
    expect(lead.yearsAtCompany).toBeUndefined()
    expect(lead.linkedinUrl).toBeUndefined()
    expect(lead.isValid).toBe(true)
  })

  it('accepts 0 years at company', () => {
    const lead = parseOne('yearsAtCompany', '0')
    expect(lead.yearsAtCompany).toBe(0)
    expect(lead.isValid).toBe(true)
  })

  it('flags years that are not whole non-negative numbers', () => {
    for (const years of ['abc', '-1', '2.5', '100']) {
      const lead = parseOne('yearsAtCompany', years)
      expect(lead.isValid).toBe(false)
      expect(lead.errors).toContain(`Invalid years at company "${years}"`)
      expect(lead.yearsAtCompany).toBeUndefined()
    }
  })

  it('adds https:// to a LinkedIn URL that has no scheme', () => {
    expect(parseOne('linkedinUrl', 'linkedin.com/in/jd').linkedinUrl).toBe('https://linkedin.com/in/jd')
  })

  it('flags LinkedIn values that are not linkedin.com URLs', () => {
    for (const url of ['not a url', 'https://example.com/in/jd', 'https://notlinkedin.com/in/jd']) {
      const lead = parseOne('linkedinUrl', `"${url}"`)
      expect(lead.isValid).toBe(false)
      expect(lead.errors).toContain(`Invalid LinkedIn URL "${url}"`)
      expect(lead.linkedinUrl).toBeUndefined()
    }
  })
})
