export function copyText(value: string) {
  void navigator.clipboard?.writeText(value).catch(() => undefined)
}
