import { describe, it, expect } from 'vitest'
import { toLeadCreateData } from './leadImport'

describe('toLeadCreateData', () => {
  const base = { firstName: ' Jane ', lastName: ' Doe ', email: ' jane@example.com ' }

  it('trims required fields and nulls missing optional ones', () => {
    expect(toLeadCreateData(base)).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      jobTitle: null,
      countryCode: null,
      companyName: null,
      phone: null,
      yearsAtCompany: null,
      linkedinUrl: null,
    })
  })

  it('maps the new fields', () => {
    const data = toLeadCreateData({
      ...base,
      phone: ' +34600111222 ',
      yearsAtCompany: 4,
      linkedinUrl: ' https://linkedin.com/in/jane ',
    })
    expect(data.phone).toBe('+34600111222')
    expect(data.yearsAtCompany).toBe(4)
    expect(data.linkedinUrl).toBe('https://linkedin.com/in/jane')
  })

  it('keeps 0 years at company', () => {
    expect(toLeadCreateData({ ...base, yearsAtCompany: 0 }).yearsAtCompany).toBe(0)
  })

  it('accepts years sent as a numeric string', () => {
    expect(toLeadCreateData({ ...base, yearsAtCompany: '7' }).yearsAtCompany).toBe(7)
  })

  it('drops years that are not whole non-negative numbers', () => {
    for (const years of ['abc', -1, 2.5, NaN, '', null]) {
      expect(toLeadCreateData({ ...base, yearsAtCompany: years }).yearsAtCompany).toBeNull()
    }
  })
})
