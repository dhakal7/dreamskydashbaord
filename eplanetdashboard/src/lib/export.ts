export function exportCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (!rows.length) return

  const headers = Object.keys(rows[0])
  const csvContent = [headers.join(','), ...rows.map((row) => headers.map((header) => {
    const value = row[header]
    const normalized = value == null ? '' : String(value).replace(/"/g, '""')
    return `"${normalized}"`
  }).join(','))].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
