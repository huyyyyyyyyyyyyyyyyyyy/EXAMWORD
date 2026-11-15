const API_URL = import.meta.env.VITE_API_URL || '/functions/v1/app/api'
const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('examworld_token')
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const controller = new AbortController()
  const externalSignal = options.signal
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
    if (response.status === 204) return undefined as T

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/')) {
        localStorage.removeItem('examworld_token')
        window.dispatchEvent(new Event('auth-expired'))
      }
      const detail = (data as { detail?: unknown }).detail
      throw new ApiError(
        typeof detail === 'string' ? detail : 'Không thể hoàn thành yêu cầu. Vui lòng thử lại.',
        response.status,
      )
    }
    return data as T
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new ApiError('Máy chủ phản hồi quá chậm. Vui lòng thử lại.', 0)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const jsonBody = (value: unknown) => JSON.stringify(value)

export async function resolveAudioUrl(path: string): Promise<string> {
  const result = await api<{ url: string }>(path)
  if (!result?.url) throw new ApiError('Không thể tải tệp âm thanh.', 500)
  return result.url
}
