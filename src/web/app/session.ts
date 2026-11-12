// Server session state for React. One query cache entry ('me') backs every
// consumer, so sign-in/sign-out invalidations keep the whole app in step.
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api, ApiClientError, queryKeys, type MeResponse, type WardResponse } from './api'

export type { MeResponse }

/**
 * The signed-in user, or null when no session exists (HTTP 401 NO_SESSION).
 * `isLoading` is true only while the first check is in flight.
 */
export function useSession(): { me: MeResponse | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
    retry: false,
    staleTime: 60_000,
  })
  return { me: query.data ?? null, isLoading: query.isLoading }
}

/** The ward board for the current day (patients in beds with derived day state). */
export function useWardDay(): UseQueryResult<WardResponse, ApiClientError> {
  return useQuery({
    queryKey: queryKeys.ward,
    queryFn: () => api.getWard(),
    staleTime: 5_000,
  })
}
