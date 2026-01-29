export type ProgramRow = {
  Campus: string
  College: string
  Program: string
  Major: string
  Level: string
  'COPC Status': string
  'COPC No.': string
  'Contents Notation': string
  Accreditation: string
  'CMO / PSG': string
  'BOR Resolution': string
  Dean: string
}

export type FilterState = {
  colleges: string[]
  levels: string[]
  copcStatuses: string[]
  accreditations: string[]
  deans: string[]
  search: string
  hideBlankMajor: boolean
}

