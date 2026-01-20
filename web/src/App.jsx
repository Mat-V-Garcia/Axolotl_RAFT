import { useState, useEffect } from 'react'
import './App.css'

const DEFAULT_CONFIG = {
  method: 'qlora',
  num_epochs: 3,
  learning_rate: 0.0002,
  batch_size: 4,
  gradient_accumulation_steps: 4,
  max_seq_length: 2048,
  lora_r: 32,
  lora_alpha: 64,
  use_raft: false,
  hub_model_id: '',
  hub_token: '',
}

function App() {
  // Connection state
  const [apiKey, setApiKey] = useState(localStorage.getItem('runpodApiKey') || '')
  const [endpointId, setEndpointId] = useState(localStorage.getItem('endpointId') || '')
  const [connected, setConnected] = useState(false)

  // Training config
  const [baseModel, setBaseModel] = useState('Qwen/Qwen2.5-14B-Instruct')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [trainingData, setTrainingData] = useState([])
  const [dataFileName, setDataFileName] = useState('')

  // Jobs
  const [jobs, setJobs] = useState(() => {
    const saved = localStorage.getItem('jobs')
    return saved ? JSON.parse(saved) : []
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Save to localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem('runpodApiKey', apiKey)
    if (endpointId) localStorage.setItem('endpointId', endpointId)
  }, [apiKey, endpointId])

  useEffect(() => {
    localStorage.setItem('jobs', JSON.stringify(jobs))
  }, [jobs])

  // Poll for job updates
  useEffect(() => {
    if (!connected) return

    const activeJobs = jobs.filter(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')
    if (activeJobs.length === 0) return

    const interval = setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${job.id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          })
          if (res.ok) {
            const data = await res.json()
            setJobs(prev => prev.map(j =>
              j.id === job.id ? { ...j, status: data.status, output: data.output } : j
            ))
          }
        } catch (e) {
          console.error('Failed to poll job:', e)
        }
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [connected, jobs, apiKey, endpointId])

  const connect = async () => {
    if (!apiKey || !endpointId) {
      setError('API Key and Endpoint ID are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Test connection by checking endpoint health
      const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Check your API key and endpoint ID`)
      }

      const health = await res.json()
      setConnected(true)
      console.log('Endpoint health:', health)
    } catch (e) {
      setError(`Connection failed: ${e.message}`)
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const disconnect = () => {
    setConnected(false)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setError('')

    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      const data = lines.map(line => JSON.parse(line))
      setTrainingData(data)
      setDataFileName(file.name)
    } catch (e) {
      setError(`Failed to parse file: ${e.message}`)
    }
  }

  const startTraining = async () => {
    if (!trainingData.length) {
      setError('Please upload training data first')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        input: {
          base_model: baseModel,
          training_data: trainingData,
          config: {
            method: config.method,
            num_epochs: config.num_epochs,
            learning_rate: config.learning_rate,
            batch_size: config.batch_size,
            gradient_accumulation_steps: config.gradient_accumulation_steps,
            max_seq_length: config.max_seq_length,
            lora_r: config.lora_r,
            lora_alpha: config.lora_alpha,
            use_raft: config.use_raft,
            hub_model_id: config.hub_model_id || null,
            hub_token: config.hub_token || null,
          }
        }
      }

      const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to submit job')
      }

      const data = await res.json()
      const newJob = {
        id: data.id,
        status: data.status || 'IN_QUEUE',
        createdAt: new Date().toISOString(),
        baseModel,
        method: config.method,
        samples: trainingData.length,
        output: null
      }

      setJobs(prev => [newJob, ...prev])
    } catch (e) {
      setError(`Failed to start training: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'status-completed'
      case 'FAILED': return 'status-failed'
      case 'IN_PROGRESS': return 'status-running'
      default: return 'status-pending'
    }
  }

  const clearJobs = () => {
    setJobs([])
    localStorage.removeItem('jobs')
  }

  return (
    <div className="app">
      <header className="header">
        <h1>MagisAI Training Hub</h1>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : ''}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main className="main">
        {/* Connection Panel */}
        <section className="panel connection-panel">
          <h2>RunPod Connection</h2>
          <div className="connection-form">
            <div className="form-row">
              <input
                type="password"
                placeholder="RunPod API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={connected}
              />
              <input
                type="text"
                placeholder="Endpoint ID"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                disabled={connected}
              />
            </div>
            {connected ? (
              <button onClick={disconnect} className="btn btn-secondary">
                Disconnect
              </button>
            ) : (
              <button onClick={connect} disabled={loading || !apiKey || !endpointId} className="btn btn-primary">
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
          <p className="hint">Get your API key from <a href="https://www.runpod.io/console/user/settings" target="_blank" rel="noopener noreferrer">RunPod Settings</a></p>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {connected && (
          <>
            {/* Configuration Panel */}
            <section className="panel config-panel">
              <h2>Training Configuration</h2>

              <div className="config-grid">
                <div className="form-group">
                  <label>Base Model</label>
                  <input
                    type="text"
                    value={baseModel}
                    onChange={(e) => setBaseModel(e.target.value)}
                    placeholder="Qwen/Qwen2.5-14B-Instruct"
                  />
                </div>

                <div className="form-group">
                  <label>Training Method</label>
                  <select value={config.method} onChange={(e) => updateConfig('method', e.target.value)}>
                    <option value="qlora">QLoRA (4-bit, memory efficient)</option>
                    <option value="lora">LoRA (standard)</option>
                    <option value="full">Full Fine-tuning</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Epochs</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={config.num_epochs}
                    onChange={(e) => updateConfig('num_epochs', parseInt(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Learning Rate</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.learning_rate}
                    onChange={(e) => updateConfig('learning_rate', parseFloat(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Batch Size</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={config.batch_size}
                    onChange={(e) => updateConfig('batch_size', parseInt(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Gradient Accumulation</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={config.gradient_accumulation_steps}
                    onChange={(e) => updateConfig('gradient_accumulation_steps', parseInt(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Max Sequence Length</label>
                  <input
                    type="number"
                    min="256"
                    max="8192"
                    step="256"
                    value={config.max_seq_length}
                    onChange={(e) => updateConfig('max_seq_length', parseInt(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>LoRA Rank (r)</label>
                  <input
                    type="number"
                    min="4"
                    max="256"
                    value={config.lora_r}
                    onChange={(e) => updateConfig('lora_r', parseInt(e.target.value))}
                    disabled={config.method === 'full'}
                  />
                </div>

                <div className="form-group">
                  <label>LoRA Alpha</label>
                  <input
                    type="number"
                    min="4"
                    max="512"
                    value={config.lora_alpha}
                    onChange={(e) => updateConfig('lora_alpha', parseInt(e.target.value))}
                    disabled={config.method === 'full'}
                  />
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.use_raft}
                      onChange={(e) => updateConfig('use_raft', e.target.checked)}
                    />
                    Enable RAFT Format
                  </label>
                </div>
              </div>

              <div className="hub-config">
                <h3>Hugging Face Hub (Optional)</h3>
                <div className="config-grid">
                  <div className="form-group">
                    <label>Hub Model ID</label>
                    <input
                      type="text"
                      placeholder="username/model-name"
                      value={config.hub_model_id}
                      onChange={(e) => updateConfig('hub_model_id', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Hub Token</label>
                    <input
                      type="password"
                      placeholder="hf_..."
                      value={config.hub_token}
                      onChange={(e) => updateConfig('hub_token', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Data Panel */}
            <section className="panel data-panel">
              <h2>Training Data</h2>

              <div className="upload-area">
                <input
                  type="file"
                  accept=".jsonl,.json"
                  onChange={handleFileUpload}
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="upload-label">
                  {dataFileName ? (
                    <>
                      <span className="file-icon">📄</span>
                      <span>{dataFileName}</span>
                      <span className="sample-count">{trainingData.length} samples</span>
                    </>
                  ) : (
                    <>
                      <span className="upload-icon">📁</span>
                      <span>Click to upload JSONL file</span>
                    </>
                  )}
                </label>
              </div>

              {trainingData.length > 0 && (
                <div className="data-preview">
                  <h4>Preview (first sample):</h4>
                  <pre>{JSON.stringify(trainingData[0], null, 2)}</pre>
                </div>
              )}

              <button
                onClick={startTraining}
                disabled={loading || !trainingData.length}
                className="btn btn-primary btn-large"
              >
                {loading ? 'Submitting...' : 'Start Training'}
              </button>
            </section>

            {/* Jobs Panel */}
            <section className="panel jobs-panel">
              <div className="jobs-header">
                <h2>Training Jobs</h2>
                {jobs.length > 0 && (
                  <button onClick={clearJobs} className="btn btn-secondary btn-small">
                    Clear History
                  </button>
                )}
              </div>

              {jobs.length === 0 ? (
                <p className="no-jobs">No training jobs yet</p>
              ) : (
                <div className="jobs-list">
                  {jobs.map(job => (
                    <div key={job.id} className={`job-card ${job.status.toLowerCase().replace('_', '-')}`}>
                      <div className="job-header">
                        <span className="job-id">Job {job.id.slice(0, 8)}</span>
                        <span className={`job-status ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="job-details">
                        <span>{job.baseModel}</span>
                        <span>{job.method.toUpperCase()}</span>
                        <span>{job.samples} samples</span>
                      </div>
                      {job.output && job.status === 'COMPLETED' && (
                        <div className="job-result">
                          <span>Trained: {job.output.samples_trained} samples</span>
                          {job.output.hub_model_id && (
                            <a
                              href={`https://huggingface.co/${job.output.hub_model_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View on Hub
                            </a>
                          )}
                        </div>
                      )}
                      {job.output && job.status === 'FAILED' && (
                        <div className="job-error">
                          {job.output.error || 'Training failed'}
                        </div>
                      )}
                      <div className="job-time">
                        {new Date(job.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
