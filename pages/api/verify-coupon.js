export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code } = req.body || {}
  if (!code || typeof code !== 'string') return res.status(400).json({ valid: false })

  const serverCode = process.env.COUPON_CODE
  if (!serverCode) {
    // No coupon configured
    return res.status(200).json({ valid: false })
  }

  // Use constant-time comparison for safety
  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    if (a.length !== b.length) return false
    let res = 0
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return res === 0
  }

  const valid = safeEqual(code.trim(), String(serverCode).trim())
  return res.status(200).json({ valid: !!valid })
}
