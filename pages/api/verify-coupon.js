export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code } = req.body || {}
  if (!code || typeof code !== 'string') return res.status(400).json({ valid: false })

  const serverCode = process.env.COUPON_CODE
  if (!serverCode) {
    // No coupon configured
    return res.status(200).json({ valid: false })
  }

  // Use case-insensitive constant-time comparison for safety
  function safeEqualCI(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const A = a.trim().toUpperCase()
    const B = b.trim().toUpperCase()
    if (A.length !== B.length) return false
    let res = 0
    for (let i = 0; i < A.length; i++) res |= A.charCodeAt(i) ^ B.charCodeAt(i)
    return res === 0
  }

  const valid = safeEqualCI(code, String(serverCode || ''))
  return res.status(200).json({ valid: !!valid })
}
