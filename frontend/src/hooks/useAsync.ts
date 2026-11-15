import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export function useAsync<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    if (!path) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    try {
      setData(await api<T>(path, { signal: controller.signal }))
    } catch (reason) {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra.')
    } finally {
      if (controllerRef.current !== controller) return
      setLoading(false)
    }
  }, [path])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => () => controllerRef.current?.abort(), [])
  return { data, loading, error, reload, setData }
}
