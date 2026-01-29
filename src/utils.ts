import type { ProgramRow } from './types'

export const EXPECTED_HEADERS: (keyof ProgramRow)[] = [
  'Campus',
  'College',
  'Program',
  'Major',
  'Level',
  'COPC Status',
  'COPC No.',
  'Contents Notation',
  'Accreditation',
  'CMO / PSG',
  'BOR Resolution',
  'Dean',
]

export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value).trim()
}

export function normalizeAccreditation(raw: string): string {
  const v = (raw ?? '').trim()
  if (!v) return 'Unknown'
  const upper = v.toUpperCase()
  if (upper.includes('LEVEL IV')) return 'Level IV'
  if (upper.includes('LEVEL III')) return 'Level III'
  if (upper.includes('LEVEL II')) return 'Level II'
  if (upper.includes('LEVEL I')) return 'Level I'
  if (upper.includes('CANDIDATE')) return 'Candidate'
  return v
}

export function includesSearch(row: ProgramRow, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const haystack = [
    row.Program,
    row.Major,
    row['COPC No.'],
    row['CMO / PSG'],
    row['BOR Resolution'],
    row['Contents Notation'],
    row.College,
    row.Level,
    row['COPC Status'],
    row.Accreditation,
    row.Dean,
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()
  return haystack.includes(query)
}

export function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

