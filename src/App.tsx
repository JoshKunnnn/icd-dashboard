import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import * as XLSX from 'xlsx'
import type { FilterState, ProgramRow } from './types'
import { EXPECTED_HEADERS, includesSearch, normalizeAccreditation, normalizeCell, uniqSorted } from './utils'

type LoadedData = {
  raw: ProgramRow[]
  bambang: ProgramRow[]
  removedNonBambangCount: number
}

const DEFAULT_FILTERS: FilterState = {
  colleges: [],
  levels: [],
  copcStatuses: [],
  accreditations: [],
  deans: [],
  search: '',
  hideBlankMajor: false,
}

function validateHeaders(headers: string[]): string | null {
  const trimmed = headers.map((h) => h.trim())
  const expected = EXPECTED_HEADERS as unknown as string[]
  const missing = expected.filter((h) => !trimmed.includes(h))
  if (missing.length) return `Missing expected columns: ${missing.join(', ')}`
  return null
}

function parseXlsxFirstSheet(file: File): Promise<ProgramRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read the file.'))
    reader.onload = () => {
      try {
        const data = reader.result
        const wb = XLSX.read(data, { type: 'array' })
        const firstSheetName = wb.SheetNames[0]
        if (!firstSheetName) throw new Error('No sheets found in the workbook.')
        const ws = wb.Sheets[firstSheetName]

        const rowsArr = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
          raw: false,
        })

        if (!rowsArr.length) {
          resolve([])
          return
        }

        const headers = Object.keys(rowsArr[0] ?? {})
        const headerErr = validateHeaders(headers)
        if (headerErr) throw new Error(headerErr)

        const out: ProgramRow[] = rowsArr.map((r) => ({
          Campus: normalizeCell(r['Campus']),
          College: normalizeCell(r['College']),
          Program: normalizeCell(r['Program']),
          Major: normalizeCell(r['Major']),
          Level: normalizeCell(r['Level']),
          'COPC Status': normalizeCell(r['COPC Status']),
          'COPC No.': normalizeCell(r['COPC No.']),
          'Contents Notation': normalizeCell(r['Contents Notation']),
          Accreditation: normalizeCell(r['Accreditation']),
          'CMO / PSG': normalizeCell(r['CMO / PSG']),
          'BOR Resolution': normalizeCell(r['BOR Resolution']),
          Dean: normalizeCell(r['Dean']),
        }))

        resolve(out)
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const selectedLabel = selected.length ? `${selected.length} selected` : 'All'
  return (
    <details className="dropdown" open={false}>
      <summary>
        <span className="dropdownLabel">{label}</span>
        <span className="dropdownMeta">{selectedLabel}</span>
      </summary>
      <div className="dropdownBody">
        <div className="dropdownActions">
          <button className="btn" type="button" onClick={() => onChange([])} disabled={!selected.length}>
            Clear
          </button>
        </div>
        <select
          multiple
          value={selected}
          onChange={(e) => {
            const next = Array.from(e.currentTarget.selectedOptions).map((o) => o.value)
            onChange(next)
          }}
          size={Math.min(10, Math.max(6, options.length))}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {selected.length ? (
          <div className="pillRow" style={{ marginTop: 10 }}>
            {selected.slice(0, 8).map((s) => (
              <span key={s} className="pill" title={s}>
                {s}
              </span>
            ))}
            {selected.length > 8 ? <span className="hint">+{selected.length - 8} more</span> : null}
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 10 }}>
            No selection (all included)
          </div>
        )}
      </div>
    </details>
  )
}

function matchesMulti(selected: string[], value: string): boolean {
  if (!selected.length) return true
  return selected.includes(value)
}

export function App() {
  const [loaded, setLoaded] = useState<LoadedData | null>(null)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [error, setError] = useState<string | null>(null)

  const rows = loaded?.bambang ?? []

  const rowsWithDerived = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      AccreditationNormalized: normalizeAccreditation(r.Accreditation),
    }))
  }, [rows])

  const filteredRows = useMemo(() => {
    return rowsWithDerived.filter((r) => {
      if (!matchesMulti(filters.colleges, r.College)) return false
      if (!matchesMulti(filters.levels, r.Level)) return false
      if (!matchesMulti(filters.copcStatuses, r['COPC Status'])) return false
      if (!matchesMulti(filters.accreditations, r.AccreditationNormalized)) return false
      if (!matchesMulti(filters.deans, r.Dean)) return false
      if (filters.hideBlankMajor && !r.Major.trim()) return false
      if (!includesSearch(r, filters.search)) return false
      return true
    })
  }, [rowsWithDerived, filters])

  const options = useMemo(() => {
    const colleges = uniqSorted(rowsWithDerived.map((r) => r.College))
    const levels = uniqSorted(rowsWithDerived.map((r) => r.Level))
    const copcStatuses = uniqSorted(rowsWithDerived.map((r) => r['COPC Status']))
    const accreditations = uniqSorted(rowsWithDerived.map((r) => r.AccreditationNormalized))
    const deans = uniqSorted(rowsWithDerived.map((r) => r.Dean))
    return { colleges, levels, copcStatuses, accreditations, deans }
  }, [rowsWithDerived])

  const kpis = useMemo(() => {
    const total = filteredRows.length
    const issued = filteredRows.filter((r) => r['COPC Status'].toLowerCase() === 'issued').length
    const underApp = filteredRows.filter((r) => r['COPC Status'].toLowerCase() === 'under application').length
    const phaseOut = filteredRows.filter((r) => r['COPC Status'].toLowerCase().includes('phase-out')).length
    const colleges = new Set(filteredRows.map((r) => r.College).filter(Boolean)).size
    return { total, issued, underApp, phaseOut, colleges }
  }, [filteredRows])

  const copcByCollegeOption = useMemo(() => {
    const colleges = uniqSorted(filteredRows.map((r) => r.College))
    const statuses = uniqSorted(filteredRows.map((r) => r['COPC Status']))
    const series = statuses.map((s) => {
      const counts = colleges.map(
        (c) => filteredRows.filter((r) => r.College === c && r['COPC Status'] === s).length,
      )
      return { name: s, type: 'bar', stack: 'status', emphasis: { focus: 'series' }, data: counts }
    })
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: 'rgba(255,255,255,0.8)' } },
      grid: { left: 20, right: 20, top: 40, bottom: 60, containLabel: true },
      xAxis: {
        type: 'category',
        data: colleges,
        axisLabel: { color: 'rgba(255,255,255,0.7)', rotate: 20 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'rgba(255,255,255,0.7)' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      series,
    }
  }, [filteredRows])

  const offeringsByCollegeLevelOption = useMemo(() => {
    const colleges = uniqSorted(filteredRows.map((r) => r.College))
    const levels = uniqSorted(filteredRows.map((r) => r.Level))
    const series = levels.map((lvl) => ({
      name: lvl,
      type: 'bar',
      stack: 'level',
      data: colleges.map((c) => filteredRows.filter((r) => r.College === c && r.Level === lvl).length),
    }))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: 'rgba(255,255,255,0.8)' } },
      grid: { left: 20, right: 20, top: 40, bottom: 60, containLabel: true },
      xAxis: {
        type: 'category',
        data: colleges,
        axisLabel: { color: 'rgba(255,255,255,0.7)', rotate: 20 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'rgba(255,255,255,0.7)' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      series,
    }
  }, [filteredRows])

  const accreditationDistOption = useMemo(() => {
    const wrapAxisLabel = (label: string, maxLineLen = 12): string => {
      const s = (label ?? '').trim()
      if (!s) return ''
      if (s.length <= maxLineLen) return s
      const parts = s.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let line = ''
      for (const p of parts) {
        const next = line ? `${line} ${p}` : p
        if (next.length > maxLineLen && line) {
          lines.push(line)
          line = p
        } else {
          line = next
        }
      }
      if (line) lines.push(line)
      return lines.slice(0, 3).join('\n')
    }

    const accs = uniqSorted(filteredRows.map((r) => r.AccreditationNormalized))
    const counts = accs.map((a) => filteredRows.filter((r) => r.AccreditationNormalized === a).length)
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 24, right: 24, top: 20, bottom: 76, containLabel: true },
      xAxis: {
        type: 'category',
        data: accs,
        axisLabel: {
          color: 'rgba(255,255,255,0.75)',
          rotate: 25,
          margin: 14,
          interval: 0,
          formatter: (v: string) => wrapAxisLabel(v, 12),
        },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'rgba(255,255,255,0.7)' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      series: [
        {
          type: 'bar',
          data: counts,
          itemStyle: { color: 'rgba(124, 92, 255, 0.75)' },
        },
      ],
    }
  }, [filteredRows])

  const accreditationHeatmapOption = useMemo(() => {
    const wrapAxisLabel = (label: string, maxLineLen = 12): string => {
      const s = (label ?? '').trim()
      if (!s) return ''
      if (s.length <= maxLineLen) return s
      const parts = s.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let line = ''
      for (const p of parts) {
        const next = line ? `${line} ${p}` : p
        if (next.length > maxLineLen && line) {
          lines.push(line)
          line = p
        } else {
          line = next
        }
      }
      if (line) lines.push(line)
      return lines.slice(0, 3).join('\n')
    }

    const colleges = uniqSorted(filteredRows.map((r) => r.College))
    const accs = uniqSorted(filteredRows.map((r) => r.AccreditationNormalized))
    const data: [number, number, number][] = []
    colleges.forEach((c, i) => {
      accs.forEach((a, j) => {
        const v = filteredRows.filter((r) => r.College === c && r.AccreditationNormalized === a).length
        data.push([j, i, v])
      })
    })
    const max = Math.max(1, ...data.map((d) => d[2]))
    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        formatter: (p: { value: [number, number, number] }) => {
          const [x, y, v] = p.value
          return `${colleges[y]} • ${accs[x]}: <b>${v}</b>`
        },
      },
      grid: { left: 96, right: 24, top: 18, bottom: 86 },
      xAxis: {
        type: 'category',
        data: accs,
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)'] } },
        axisLabel: {
          color: 'rgba(255,255,255,0.75)',
          rotate: 25,
          margin: 14,
          formatter: (v: string) => wrapAxisLabel(v, 12),
        },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      },
      yAxis: {
        type: 'category',
        data: colleges,
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)'] } },
        axisLabel: { color: 'rgba(255,255,255,0.75)', margin: 12 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      },
      visualMap: {
        min: 0,
        max,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
        textStyle: { color: 'rgba(255,255,255,0.7)' },
        inRange: { color: ['rgba(255,255,255,0.08)', 'rgba(124, 92, 255, 0.85)'] },
      },
      series: [
        {
          name: 'Count',
          type: 'heatmap',
          data,
          label: { show: true, color: 'rgba(255,255,255,0.85)' },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.4)',
            },
          },
        },
      ],
    }
  }, [filteredRows])

  async function onFileSelected(file: File | null) {
    setError(null)
    if (!file) return
    try {
      const raw = await parseXlsxFirstSheet(file)
      const bambang = raw.filter((r) => r.Campus.trim().toLowerCase() === 'bambang')
      const removedNonBambangCount = raw.length - bambang.length
      setLoaded({ raw, bambang, removedNonBambangCount })
      setFilters(DEFAULT_FILTERS)
    } catch (e) {
      setLoaded(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const downloadFilteredCsv = () => {
    const headers = [...EXPECTED_HEADERS, 'AccreditationNormalized'] as const
    const lines: string[] = []
    lines.push(headers.join(','))
    for (const r of filteredRows) {
      const row: Record<string, string> = {
        ...r,
        AccreditationNormalized: r.AccreditationNormalized,
      }
      const values = headers.map((h) => {
        const v = String(row[h] ?? '')
        const escaped = v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replaceAll('"', '""')}"` : v
        return escaped
      })
      lines.push(values.join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bambang_filtered.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="appShell">
      <div className="topBar">
        <div className="topBarInner">
          <div className="titleBlock">
            <div className="title">Bambang Programs Dashboard</div>
            <div className="subtitle">Upload your Excel → filters → charts → table (Campus locked to Bambang)</div>
          </div>
          <div className="fileInput">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void onFileSelected(f)
              }}
            />
            <button
              className="btn btnPrimary"
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>('input[type="file"]')
                input?.click()
              }}
            >
              Upload
            </button>
          </div>
        </div>
      </div>

      <div className="contentGrid">
        <aside className="panel">
          <div className="panelHeader">
            <h2>Filters</h2>
            <button className="btn" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset
            </button>
          </div>
          <div className="panelBody">
            {!loaded ? (
              <div className="hint">Upload an `.xlsx` file to begin. (We always show Campus = Bambang.)</div>
            ) : (
              <>
                <div className="hint" style={{ marginBottom: 10 }}>
                  Loaded: <b>{loaded.raw.length}</b> rows • Bambang: <b>{loaded.bambang.length}</b> rows
                  {loaded.removedNonBambangCount ? (
                    <>
                      {' '}
                      • Removed non‑Bambang: <b>{loaded.removedNonBambangCount}</b>
                    </>
                  ) : null}
                </div>

                <div className="field">
                  <label>Search</label>
                  <input
                    value={filters.search}
                    placeholder="Program, Major, COPC No., CMO/PSG, BOR..."
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  />
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={filters.hideBlankMajor}
                      onChange={(e) => setFilters((f) => ({ ...f, hideBlankMajor: e.target.checked }))}
                    />
                    Hide blank Major
                  </label>
                </div>

                <MultiSelect
                  label="College"
                  options={options.colleges}
                  selected={filters.colleges}
                  onChange={(next) => setFilters((f) => ({ ...f, colleges: next }))}
                />
                <MultiSelect
                  label="Level"
                  options={options.levels}
                  selected={filters.levels}
                  onChange={(next) => setFilters((f) => ({ ...f, levels: next }))}
                />
                <MultiSelect
                  label="COPC Status"
                  options={options.copcStatuses}
                  selected={filters.copcStatuses}
                  onChange={(next) => setFilters((f) => ({ ...f, copcStatuses: next }))}
                />
                <MultiSelect
                  label="Accreditation (normalized)"
                  options={options.accreditations}
                  selected={filters.accreditations}
                  onChange={(next) => setFilters((f) => ({ ...f, accreditations: next }))}
                />
                <MultiSelect
                  label="Dean"
                  options={options.deans}
                  selected={filters.deans}
                  onChange={(next) => setFilters((f) => ({ ...f, deans: next }))}
                />
              </>
            )}

            {error ? (
              <div className="panel" style={{ marginTop: 12, padding: 12, borderColor: 'rgba(239,68,68,0.5)' }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Upload error</div>
                <div className="hint">{error}</div>
              </div>
            ) : null}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 12 }}>
          <section className="panel">
            <div className="panelHeader">
              <h2>Overview (filtered)</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={downloadFilteredCsv} disabled={!loaded || !filteredRows.length}>
                  Download CSV
                </button>
              </div>
            </div>
            <div className="panelBody">
              {!loaded ? (
                <div className="hint">
                  Upload your `Database.xlsx`. Once loaded, you’ll get KPIs, charts, and a table.
                </div>
              ) : (
                <div className="kpis">
                  <div className="kpi">
                    <div className="kpiLabel">Total programs</div>
                    <div className="kpiValue">{kpis.total}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Issued</div>
                    <div className="kpiValue">{kpis.issued}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Under application</div>
                    <div className="kpiValue">{kpis.underApp}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Voluntary phase-out</div>
                    <div className="kpiValue">{kpis.phaseOut}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">Colleges</div>
                    <div className="kpiValue">{kpis.colleges}</div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Compliance: COPC Status by College</h2>
              <div className="hint">Stacked counts</div>
            </div>
            <div className="panelBody">
              <ReactECharts option={copcByCollegeOption} style={{ height: 380 }} notMerge lazyUpdate />
            </div>
          </section>

          <section className="chartsGrid2">
            <div className="panel">
              <div className="panelHeader">
                <h2>Offerings breadth: College × Level</h2>
              </div>
              <div className="panelBody">
                <ReactECharts option={offeringsByCollegeLevelOption} style={{ height: 340 }} notMerge lazyUpdate />
              </div>
            </div>
            <div className="panel">
              <div className="panelHeader">
                <h2>Quality: Accreditation distribution</h2>
              </div>
              <div className="panelBody">
                <ReactECharts option={accreditationDistOption} style={{ height: 340 }} notMerge lazyUpdate />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Quality: College × Accreditation (heatmap)</h2>
            </div>
            <div className="panelBody">
              <ReactECharts option={accreditationHeatmapOption} style={{ height: 420 }} notMerge lazyUpdate />
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Programs table</h2>
              <div className="hint">
                Showing <b>{filteredRows.length}</b> rows
              </div>
            </div>
            <div className="panelBody">
              {!loaded ? (
                <div className="hint">Upload a file to see the table.</div>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>College</th>
                        <th>Program</th>
                        <th>Major</th>
                        <th>Level</th>
                        <th>COPC Status</th>
                        <th>COPC No.</th>
                        <th>Accreditation</th>
                        <th>Dean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r, idx) => (
                        <tr key={`${r.College}-${r.Program}-${idx}`}>
                          <td>{r.College}</td>
                          <td>{r.Program}</td>
                          <td>{r.Major}</td>
                          <td>{r.Level}</td>
                          <td>{r['COPC Status']}</td>
                          <td>{r['COPC No.']}</td>
                          <td>{r.AccreditationNormalized}</td>
                          <td>{r.Dean}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

