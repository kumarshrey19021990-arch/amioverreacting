import { useState } from 'react'

export default function Home() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

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
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-block w-80 md:w-96 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg shadow-lg text-lg disabled:opacity-60"
            >
              {loading ? 'Analyzing...' : 'Analyze my reaction'}
            </button>
            <div className="text-sm text-gray-400 mt-2">Takes about 30 seconds · Private &amp; neutral</div>
          </div>

          {error && <div className="mt-4 text-red-600 text-sm text-center">{error}</div>}

          {result && (
            <div className="mt-6 bg-gray-50 border rounded-lg p-4">
              <div className="font-semibold">Neutral Summary</div>
              <div className="mt-2 text-sm text-gray-700">{result.summary || result.text || '—'}</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold">Overreaction Score</div>
                  <div className="text-2xl text-blue-700 mt-1">{result.score ?? '—'}</div>
                </div>
                <div>
                  <div className="font-semibold">Rational Next Steps</div>
                  <ol className="list-decimal list-inside text-sm mt-2 text-gray-700">
                    {(result.steps || []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
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
