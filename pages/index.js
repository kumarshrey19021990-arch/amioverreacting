import { useState, useEffect } from 'react'

export default function Home() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [detectedRegion, setDetectedRegion] = useState('us')
  const [paying, setPaying] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponValid, setCouponValid] = useState(false)
  const [couponMessage, setCouponMessage] = useState('')

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!res.ok) throw new Error('Analysis failed')
      const json = await res.json()
      setResult(json)
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  // Handle Razorpay callback verification (no automatic redirect on load)
  // Payment verification is triggered manually when payment handler fires
  useEffect(() => {
    // Razorpay script must be loaded for client-side usage
    if (!window.Razorpay && typeof window !== 'undefined') {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  // Start payment flow: show modal
  function startPayment() {
    setShowPayModal(true)
  }

  function priceLabelForRegion(region) {
    console.log({region});
    if (!region) return '$1.99 — one analysis'
    if (region === 'europe') return '€1.99 — one analysis'
    if (region === 'uk') return '£1.66 — one analysis'
    if (region === 'india') return '₹99 — one analysis'
    return '$1.99 — one analysis'
  }

  // Detect region automatically from browser (geolocation or locale fallback)
  useEffect(() => {
    function mapCountryCodeToRegion(code) {
      if (!code) return 'other'
      const c = code.toUpperCase()
      if (c === 'US') return 'us'
      if (c === 'GB' || c === 'UK') return 'uk'
      if (c === 'IN') return 'india'

      // basic EU country list mapping -> europe
      const eu = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']
      if (eu.includes(c)) return 'europe'
      return 'other'
    }

    async function detect() {
      // try geolocation + reverse geocode (best-effort); fall back to locale
      try {
        if (navigator && navigator.geolocation) {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
          const { latitude, longitude } = pos.coords || {}
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            try {
              const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`)
              if (r.ok) {
                const j = await r.json()
                const cc = (j && j.address && j.address.country_code) ? j.address.country_code.toUpperCase() : null
                if (cc) {
                  setDetectedRegion(mapCountryCodeToRegion(cc))
                  return
                }
              }
            } catch (e) {
              // ignore remote reverse-geocode failure
            }
          }
        }
      } catch (e) {
        // ignore geolocation permission or timeout
      }

      // fallback: use navigator.language or Intl locale
      try {
        const locale = (navigator && (navigator.language || (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().locale))) || 'en-US'
        const parts = locale.split(/[-_]/)
        const maybeRegion = parts.length > 1 ? parts[1] : null
        setDetectedRegion(mapCountryCodeToRegion(maybeRegion || 'US'))
      } catch (e) {
        setDetectedRegion('us')
      }
    }

    detect()
  }, [])

  async function createCheckout() {
    setPaying(true)
    setError(null)
    try {
      // persist text across payment
      localStorage.setItem('pending_text', text || '')
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: detectedRegion })
      })
      if (!res.ok) throw new Error('Payment initiation failed')
      const data = await res.json()
      const { order, publicKey } = data
      if (!order || !order.id) throw new Error('No order created')

      // Open Razorpay Checkout modal
      const options = {
        key: publicKey,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'Am I Overreacting?',
        description: 'One-time neutral analysis and guidance',
        handler: async function (response) {
          // Payment successful; verify signature server-side
          try {
            const verifyRes = await fetch('/api/verify-checkout-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })
            if (!verifyRes.ok) throw new Error('Signature verification failed')
            const { valid } = await verifyRes.json()
            if (!valid) throw new Error('Invalid payment signature')

            // restore pending text from localStorage
            const pending = localStorage.getItem('pending_text') || ''
            if (pending) setText(pending)
            localStorage.removeItem('pending_text')
            setShowPayModal(false)
            // trigger analysis
            await handleAnalyze()
          } catch (e) {
            console.error('Payment verification error', e)
            setError('Payment verification failed: ' + e.message)
          } finally {
            setPaying(false)
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false)
            setError('Payment cancelled')
          },
        },
        theme: { color: '#2563EB' },
      }

      const razorpayWindow = new window.Razorpay(options)
      razorpayWindow.open()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Payment failed')
      setPaying(false)
    }
  }

  // Apply coupon code by checking server-side secret; if valid, bypass paywall and analyze
  async function applyCoupon() {
    setCouponChecking(true)
    setCouponMessage('Checking coupon…')
    try {
      const res = await fetch('/api/verify-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode || '' })
      })
      if (!res.ok) {
        setCouponMessage('Coupon check failed')
        setCouponChecking(false)
        return
      }
      const json = await res.json()
      if (json && json.valid) {
        setCouponValid(true)
        setCouponMessage('Coupon applied — analysis unlocked')
        setShowPayModal(false)
        // trigger analysis directly (no payment required)
        await handleAnalyze()
      } else {
        setCouponValid(false)
        setCouponMessage('Invalid coupon')
      }
    } catch (e) {
      console.error('Coupon verify error', e)
      setCouponMessage('Coupon verification error')
    } finally {
      setCouponChecking(false)
    }
  }

  async function handleDownloadPDF() {
    if (!result) return
    try {
      // dynamic import to avoid server-side issues
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const node = document.getElementById('result-card')
      if (!node) throw new Error('Result element not found')

      const canvas = await html2canvas(node, { scale: 2, useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 20, 20, pdfWidth - 40, pdfHeight)
      pdf.save('analysis.pdf')
    } catch (e) {
      console.error('PDF export failed', e)
      setError('PDF export failed: ' + (e.message || String(e)))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="w-full max-w-3xl mx-auto px-6 py-6">

        {/* Section 1: Hero / Title */}
        <section className="text-center py-2">
          <h1 className="text-4xl md:text-5xl font-serif text-slate-800 leading-tight">Am I Overreacting?</h1>
          <p className="mt-1 text-slate-500 max-w-2xl mx-auto">Get a calm, neutral breakdown of your situation — without judgment-free, no validation traps, no emotional noise.</p>
          <div className="mt-4 h-px w-40 mx-auto bg-slate-200" />
        </section>

        {/* Section 2: Input card */}
        <section className="mt-4 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-center mb-2">Describe what happened and how you feel</h2>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Start typing here..."
            className="w-full h-36 p-4 rounded-md border border-gray-100 shadow-sm placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100"
          />

          <div className="text-center mt-4">
            <button
              onClick={startPayment}
              disabled={loading || paying}
              className="w-full md:w-80 lg:w-96 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg shadow-lg text-lg disabled:opacity-60"
            >
              {loading ? 'Analyzing...' : paying ? 'Processing payment...' : 'Analyze my reaction'}
            </button>
            <div className="text-sm text-gray-400 mt-2">Takes about 30 seconds · Private &amp; neutral</div>
          </div>

          {error && <div className="mt-4 text-red-600 text-sm text-center">{error}</div>}

          {result && (
            <div id="result-card" className="mt-6 bg-gray-50 border rounded-lg p-4 space-y-6">
              <div>
                <div className="font-semibold">Neutral Summary</div>
                <div className="mt-2 text-sm text-gray-700">{result.summary || '—'}</div>
              </div>

              <div>
                <div className="font-semibold">Bias Check</div>
                <div className="mt-2 space-y-3 text-sm text-gray-700">
                  {Array.isArray(result.biases) && result.biases.length > 0 ? (
                    result.biases.map((b, i) => (
                      <div key={i} className="p-3 bg-white border rounded">
                        <div className="font-semibold">{b.name || 'Unnamed bias'}</div>
                        <div className="text-xs text-gray-600 mt-1">{b.description || ''}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500">No obvious biases detected.</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-700">
                    {typeof result.overreaction_score === 'number' ? result.overreaction_score : (result.overreaction_score ? Number(result.overreaction_score) : '—')}
                  </div>
                  <div>
                    <div className="font-semibold">Overreaction Score</div>
                    <div className="text-sm text-gray-600 mt-1">A numeric assessment from 1 (low) to 10 (high).</div>
                    <div className="mt-2 w-48 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(Math.max((result.overreaction_score || 0), 0), 10) * 10}%` }}
                        className="h-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-400"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-semibold">Proportionality</div>
                  <div className="mt-2 text-sm text-gray-700">{result.proportionality || '—'}</div>
                </div>
              </div>

              <div>
                <div className="font-semibold">Reality Check</div>
                <ol className="list-decimal list-inside text-sm mt-2 text-gray-700 space-y-2">
                  {Array.isArray(result.next_steps) && result.next_steps.length > 0 ? (
                    result.next_steps.map((s, i) => (
                      <li key={i}>
                        <div className="font-medium">{s.step}</div>
                        <div className="text-xs text-gray-600">{s.explanation}</div>
                      </li>
                    ))
                  ) : (
                    <li>No steps provided.</li>
                  )}
                </ol>
              </div>

              <div className="text-right">
                <button
                  onClick={handleDownloadPDF}
                  className="inline-block bg-white border px-4 py-2 rounded shadow hover:bg-gray-50 text-sm"
                >
                  Download PDF
                </button>
              </div>
            </div>
          )}

          {/* Paywall modal */}
          {showPayModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowPayModal(false)} />

              <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="text-center w-full">
                      <h3 className="text-2xl font-serif text-slate-800">Get a neutral breakdown</h3>
                      <p className="mt-2 text-sm text-slate-500">A calm, rational perspective — without taking sides.</p>
                    </div>
                    <button onClick={() => setShowPayModal(false)} className="ml-4 text-slate-400 hover:text-slate-600">×</button>
                  </div>

                  <div className="mt-6 p-4 bg-gray-50 border border-gray-100 rounded-md">
                    <ul className="space-y-3 text-sm text-slate-700">
                      <li className="flex items-start space-x-3">
                        <div className="mt-1 text-blue-600">✓</div>
                        <div>Neutral summary of your situation</div>
                      </li>
                      <li className="flex items-start space-x-3">
                        <div className="mt-1 text-blue-600">✓</div>
                        <div>Overreaction score (1–10)</div>
                      </li>
                      <li className="flex items-start space-x-3">
                        <div className="mt-1 text-blue-600">✓</div>
                        <div>Clear next steps</div>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 text-center">
                    <div className="text-xl font-semibold text-slate-800">{priceLabelForRegion(detectedRegion)}</div>
                    <div className="mt-2 text-sm text-slate-500">No subscription. No recurring charges.</div>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={createCheckout}
                      disabled={paying}
                      className="w-full bg-blue-600 text-white rounded-lg py-3 text-lg shadow-lg hover:bg-blue-700 disabled:opacity-60"
                    >
                      {paying ? 'Processing…' : ('pay '+`${priceLabelForRegion(detectedRegion).split(' — ')[0].replace(' — one analysis','')} & see analysis`)}
                    </button>
                  </div>

                  <div className="mt-4 text-center text-sm text-slate-500">Private by default · No history stored</div>

                  <div className="mt-5 border-t pt-4">
                    <div className="flex items-center justify-center space-x-2">
                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Coupon code (optional)"
                        className="px-3 py-2 border rounded-md text-sm w-56"
                      />
                      <button onClick={applyCoupon} disabled={couponChecking || !couponCode} className="px-3 py-2 bg-gray-100 border rounded text-sm">
                        {couponChecking ? 'Checking…' : 'Apply'}
                      </button>
                    </div>
                    {couponMessage && <div className="mt-3 text-center text-sm text-gray-600">{couponMessage}</div>}
                    <div className="mt-4 text-xs text-slate-400 text-center">If this wasn't helpful, email us for a refund.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="fixed inset-0 flex items-center justify-center z-40">
              <div className="absolute inset-0 bg-white opacity-60" />
              <div className="z-50 p-6 bg-white rounded-lg shadow-lg flex items-center space-x-3">
                <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <div className="text-sm">Analyzing — one moment please…</div>
              </div>
            </div>
          )}
        </section>

        {/* Section 3: What you'll get + Safety */}
        <section className="mt-10 text-center">
          <h3 className="text-xl font-semibold mb-6">What you'll get</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border rounded-lg bg-gray-50 shadow-sm">
              <div className="font-semibold">1. Neutral Summary</div>
              <div className="text-xs text-gray-500 mt-2">We'll rewrite your situation without emotional language.</div>
            </div>

            <div className="p-6 border rounded-lg bg-gray-50 shadow-sm">
              <div className="font-semibold">2. Overreaction Score</div>
              <div className="text-xs text-gray-500 mt-2">Get a clear rating from 1 to 10.</div>
            </div>

            <div className="p-6 border rounded-lg bg-gray-50 shadow-sm">
              <div className="font-semibold">3. Rational Next Steps</div>
              <div className="text-xs text-gray-500 mt-2">Receive 3 calm, practical suggestions.</div>
            </div>
          </div>

          <div className="mt-10 border-t pt-8 text-sm text-slate-500">
            <div className="font-semibold mb-3">Built for emotional safety</div>
            <div className="space-y-1">
              <div>No accounts required • No memory or history stored</div>
              <div>Private by design • No sides taken, just clarity</div>
            </div>
            <div className="mt-6">© 2025 Am I Overreacting · Calm clarity, when it matters</div>
          </div>
        </section>
      </div>
    </div>
  )
}
