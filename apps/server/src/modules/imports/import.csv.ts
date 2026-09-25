export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
          continue
        }
        inQuotes = false
        continue
      }
      field += char
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\r') {
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text)
  const headers = rows[0]
  if (!headers) return []
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, index) => {
        record[header] = row[index] ?? ''
      })
      return record
    })
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

function parseOptOut(value: string | undefined) {
  const trimmed = (value ?? '').trim().toLowerCase()
  return trimmed === 'true' || trimmed === '1' || trimmed === 'yes'
}

export function csvRecordsToUnknownLeads(records: Record<string, string>[]): unknown[] {
  return records.map((row) => {
    const tagsRaw = emptyToUndefined(row.tags)
    return {
      id: row.id,
      tenantSlug: row.tenantSlug,
      source: row.source,
      externalId: row.externalId,
      companyName: emptyToUndefined(row.companyName),
      domain: emptyToUndefined(row.domain),
      contactName: emptyToUndefined(row.contactName),
      email: emptyToUndefined(row.email),
      segment: emptyToUndefined(row.segment),
      comment: emptyToUndefined(row.comment),
      processingBasis: row.processingBasis,
      sourcePurpose: row.sourcePurpose,
      optOut: parseOptOut(row.optOut),
      plannedReply: emptyToUndefined(row.plannedReply),
      tags: tagsRaw ? tagsRaw.split('|').filter(Boolean) : [],
    }
  })
}

export function parseCsvLeads(text: string): unknown[] {
  return csvRecordsToUnknownLeads(parseCsvRecords(text))
}
