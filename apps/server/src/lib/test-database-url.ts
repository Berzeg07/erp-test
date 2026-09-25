/** Vitest uses schema `test` so wipeLeadGraph never touches Swagger/dev (`public`). */
export function toTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  url.searchParams.set('schema', 'test')
  return url.toString()
}
