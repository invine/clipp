import React, { useEffect, useState } from 'react'
import type { TrustedDevice } from '../../../../packages/core/trust'

export const TrustPrompt = () => {
  const [requests, setRequests] = useState<TrustedDevice[]>([])

  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: 'getPendingRequests' }, (res) => {
      setRequests(res || [])
    })
  }, [])

  function respond(dev: TrustedDevice, accept: boolean) {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: 'respondTrust', id: dev.deviceId, accept, device: dev }, () => {
      setRequests((r) => r.filter((p) => p.deviceId !== dev.deviceId))
    })
  }

  if (requests.length === 0) return null

  return (
    <div className="bg-yellow-100 p-2 rounded text-sm mb-2">
      {requests.map((r) => (
        <div key={r.deviceId} className="flex justify-between items-center mb-1">
          <span className="truncate mr-2" title={r.deviceName}>{r.deviceName}</span>
          <div className="space-x-1">
            <button className="text-xs text-blue-600" onClick={() => respond(r, true)}>Accept</button>
            <button className="text-xs text-red-600" onClick={() => respond(r, false)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}
