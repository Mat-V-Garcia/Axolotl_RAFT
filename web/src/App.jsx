import { useState, useEffect, useRef } from 'react'
import './App.css'

// CSV to JSON converter utility
function csvToJson(csvText, format = 'sharegpt') {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const results = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < 2) continue

    const row = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })

    if (format === 'sharegpt') {
      const question = row.question || row.prompt || row.input || row.q || values[0]
      const answer = row.answer || row.response || row.output || row.a || values[1]
      results.push({
        messages: [
          { role: 'user', content: question },
          { role: 'assistant', content: answer }
        ]
      })
    } else if (format === 'raft') {
      results.push({
        instruction: row.instruction || row.question || row.prompt || values[0],
        context: row.context || row.document || row.source || values[1] || '',
        cot_answer: row.cot_answer || row.answer || row.response || values[2] || values[1]
      })
    }
  }
  return results
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// Sidebar Component
function Sidebar({ activeSection, setActiveSection, connected }) {
  const navItems = [
    { id: 'data', icon: '📋', label: 'Data Review' },
    { id: 'training', icon: '🎯', label: 'Training' },
    { id: 'metrics', icon: '📊', label: 'Metrics' }
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/logo.png" alt="MagisAI" className="logo" onError={(e) => { e.target.style.display = 'none' }} />
        <div className="brand">
          <span className="brand-name">MagisAI</span>
          <span className="brand-sub">Training Hub</span>
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`connection-indicator ${connected ? 'connected' : ''}`}>
          <span className="status-dot" />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <span className="version">v1.0.0</span>
      </div>
    </aside>
  )
}

// Data Review Section
function DataReviewSection({ trainingData, setTrainingData, dataFormat, setDataFormat }) {
  const [fileInfo, setFileInfo] = useState(null)
  const [previewData, setPreviewData] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const fileInputRef = useRef(null)

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target.result
      let data = []

      if (file.name.endsWith('.csv')) {
        data = csvToJson(content, dataFormat)
        setFileInfo({ name: file.name, type: 'CSV', converted: true })
      } else if (file.name.endsWith('.json') || file.name.endsWith('.jsonl')) {
        try {
          if (file.name.endsWith('.jsonl')) {
            data = content.trim().split('\n').map(line => JSON.parse(line))
          } else {
            const parsed = JSON.parse(content)
            data = Array.isArray(parsed) ? parsed : [parsed]
          }
          setFileInfo({ name: file.name, type: 'JSON', converted: false })
        } catch (err) {
          alert('Invalid JSON file: ' + err.message)
          return
        }
      }

      setTrainingData(data)
      setPreviewData(data)
      setCurrentIndex(0)
    }
    reader.readAsText(file)
  }

  const currentItem = previewData[currentIndex]

  const exportAsJsonl = () => {
    if (!trainingData.length) return
    const jsonl = trainingData.map(item => JSON.stringify(item)).join('\n')
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'training_data.jsonl'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Data Review</h2>
        <div className="header-actions">
          <select
            className="format-select"
            value={dataFormat}
            onChange={(e) => setDataFormat(e.target.value)}
          >
            <option value="sharegpt">ShareGPT Format</option>
            <option value="raft">RAFT Format</option>
          </select>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Load Data
          </button>
          <button className="btn btn-primary" onClick={exportAsJsonl} disabled={!trainingData.length}>
            Export JSONL
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.jsonl"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {fileInfo && (
        <div className="file-info-bar">
          <span className="file-name">{fileInfo.name}</span>
          {fileInfo.converted && <span className="converted-badge">Converted from CSV</span>}
          <span className="sample-count">{trainingData.length} samples</span>
        </div>
      )}

      <div className="progress-section">
        <div className="progress-bar-container">
          <div
            className="progress-fill"
            style={{ width: previewData.length ? `${((currentIndex + 1) / previewData.length) * 100}%` : '0%' }}
          />
        </div>
        <span className="progress-text">
          {previewData.length ? `${currentIndex + 1} / ${previewData.length}` : 'No data loaded'}
        </span>
      </div>

      <div className="glass-card preview-card">
        {currentItem ? (
          dataFormat === 'sharegpt' ? (
            <>
              <div className="preview-field">
                <label>Question</label>
                <div className="field-content">{currentItem.messages?.[0]?.content || '-'}</div>
              </div>
              <div className="preview-field">
                <label>Answer</label>
                <div className="field-content answer">{currentItem.messages?.[1]?.content || '-'}</div>
              </div>
            </>
          ) : (
            <>
              <div className="preview-field">
                <label>Instruction</label>
                <div className="field-content">{currentItem.instruction || '-'}</div>
              </div>
              <div className="preview-field">
                <label>Context</label>
                <div className="field-content context">{currentItem.context || '-'}</div>
              </div>
              <div className="preview-field">
                <label>Answer</label>
                <div className="field-content answer">{currentItem.cot_answer || '-'}</div>
              </div>
            </>
          )
        ) : (
          <div className="no-data-message">
            <div className="no-data-icon">📁</div>
            <p>No data loaded</p>
            <p className="hint">Upload a CSV or JSON file to get started</p>
          </div>
        )}
      </div>

      {previewData.length > 0 && (
        <div className="action-buttons">
          <button className="btn btn-accept">Accept (A)</button>
          <button className="btn btn-edit">Edit (E)</button>
          <button className="btn btn-reject">Reject (R)</button>
        </div>
      )}

      <div className="navigation-controls">
        <button
          className="btn btn-nav"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          ← Previous
        </button>
        <span className="nav-counter">{previewData.length ? `${currentIndex + 1} of ${previewData.length}` : '-'}</span>
        <button
          className="btn btn-nav"
          onClick={() => setCurrentIndex(i => Math.min(previewData.length - 1, i + 1))}
          disabled={currentIndex >= previewData.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// Training Section
function TrainingSection({ config, setConfig, trainingData, connected, onConnect, onStartTraining, consoleOutput }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('runpod_api_key') || '')
  const [endpointId, setEndpointId] = useState(localStorage.getItem('runpod_endpoint_id') || '')
  const consoleRef = useRef(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleOutput])

  const handleConnect = () => {
    localStorage.setItem('runpod_api_key', apiKey)
    localStorage.setItem('runpod_endpoint_id', endpointId)
    onConnect(apiKey, endpointId)
  }

  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Training Configuration</h2>
      </div>

      <div className="config-panels">
        {/* Connection Panel */}
        <div className="glass-card config-panel">
          <h3>RunPod Connection</h3>
          <div className="config-form">
            <div className="form-field">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter RunPod API Key"
              />
            </div>
            <div className="form-field">
              <label>Endpoint ID</label>
              <input
                type="text"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                placeholder="Enter Endpoint ID"
              />
            </div>
            <button className="btn btn-primary" onClick={handleConnect}>
              {connected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Training Type */}
        <div className="glass-card config-panel">
          <h3>Training Type</h3>
          <div className="training-types">
            {['qlora', 'lora', 'full'].map(type => (
              <button
                key={type}
                className={`type-btn ${config.method === type ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, method: type })}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="type-description">
            {config.method === 'qlora' && 'QLoRA: 4-bit quantized LoRA - most memory efficient'}
            {config.method === 'lora' && 'LoRA: Low-rank adaptation - good balance of speed and quality'}
            {config.method === 'full' && 'Full fine-tuning - best quality but requires more VRAM'}
          </p>
        </div>

        {/* Hyperparameters */}
        <div className="glass-card config-panel wide">
          <h3>Hyperparameters</h3>
          <div className="params-grid">
            <div className="form-field">
              <label>Base Model</label>
              <select
                value={config.base_model}
                onChange={(e) => setConfig({ ...config, base_model: e.target.value })}
              >
                <option value="Qwen/Qwen2.5-14B-Instruct">Qwen 2.5 14B Instruct</option>
                <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 7B Instruct</option>
                <option value="meta-llama/Llama-3.1-8B-Instruct">Llama 3.1 8B Instruct</option>
                <option value="mistralai/Mistral-7B-Instruct-v0.3">Mistral 7B Instruct</option>
              </select>
            </div>
            <div className="form-field">
              <label>Learning Rate</label>
              <input
                type="text"
                value={config.learning_rate}
                onChange={(e) => setConfig({ ...config, learning_rate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Epochs</label>
              <input
                type="number"
                value={config.num_epochs}
                onChange={(e) => setConfig({ ...config, num_epochs: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="form-field">
              <label>Batch Size</label>
              <input
                type="number"
                value={config.batch_size}
                onChange={(e) => setConfig({ ...config, batch_size: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="form-field">
              <label>LoRA Rank</label>
              <input
                type="number"
                value={config.lora_r}
                onChange={(e) => setConfig({ ...config, lora_r: parseInt(e.target.value) || 8 })}
              />
            </div>
            <div className="form-field">
              <label>LoRA Alpha</label>
              <input
                type="number"
                value={config.lora_alpha}
                onChange={(e) => setConfig({ ...config, lora_alpha: parseInt(e.target.value) || 16 })}
              />
            </div>
            <div className="form-field">
              <label>Max Seq Length</label>
              <input
                type="number"
                value={config.max_seq_length}
                onChange={(e) => setConfig({ ...config, max_seq_length: parseInt(e.target.value) || 2048 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Training Actions */}
      <div className="training-actions">
        <div className="data-status">
          <span className={trainingData.length > 0 ? 'ready' : ''}>
            {trainingData.length > 0
              ? `Training Data: ${trainingData.length} samples ready`
              : 'No training data loaded'}
          </span>
        </div>
        <button
          className="btn btn-start"
          onClick={onStartTraining}
          disabled={!connected || !trainingData.length}
        >
          Start Training
        </button>
      </div>

      {/* Console Output */}
      <div className="glass-card console-panel">
        <h3>Console Output</h3>
        <div className="console" ref={consoleRef}>
          {consoleOutput.map((line, i) => (
            <div key={i} className="console-line">{line}</div>
          ))}
          {consoleOutput.length === 0 && (
            <div className="console-line muted">Waiting for activity...</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Metrics Section
function MetricsSection({ jobHistory }) {
  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Training Metrics</h2>
      </div>

      <div className="stats-row">
        <div className="glass-card stat-card">
          <span className="stat-value">{jobHistory.length}</span>
          <span className="stat-label">Total Jobs</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-value success">{jobHistory.filter(j => j.status === 'COMPLETED').length}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-value warning">{jobHistory.filter(j => j.status === 'IN_PROGRESS' || j.status === 'IN_QUEUE').length}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-value error">{jobHistory.filter(j => j.status === 'FAILED').length}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      <div className="glass-card jobs-panel">
        <h3>Job History</h3>
        {jobHistory.length > 0 ? (
          <div className="job-list">
            {jobHistory.map((job, i) => (
              <div key={i} className={`job-card ${job.status.toLowerCase().replace('_', '-')}`}>
                <div className="job-header">
                  <span className="job-id">{job.id?.slice(0, 12) || 'Unknown'}</span>
                  <span className={`job-status ${job.status.toLowerCase()}`}>{job.status}</span>
                </div>
                <div className="job-details">
                  <span>Model: {job.model}</span>
                  <span>Samples: {job.samples}</span>
                  <span>Started: {job.startTime}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-data-message">
            <div className="no-data-icon">📊</div>
            <p>No training jobs yet</p>
            <p className="hint">Start a training job to see metrics here</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Main App
function App() {
  const [activeSection, setActiveSection] = useState('data')
  const [connected, setConnected] = useState(false)
  const [trainingData, setTrainingData] = useState([])
  const [dataFormat, setDataFormat] = useState('sharegpt')
  const [consoleOutput, setConsoleOutput] = useState([])
  const [jobHistory, setJobHistory] = useState(() => {
    const saved = localStorage.getItem('job_history')
    return saved ? JSON.parse(saved) : []
  })

  const [config, setConfig] = useState({
    base_model: 'Qwen/Qwen2.5-14B-Instruct',
    method: 'qlora',
    learning_rate: '2e-4',
    num_epochs: 3,
    batch_size: 4,
    gradient_accumulation_steps: 4,
    max_seq_length: 2048,
    lora_r: 32,
    lora_alpha: 64
  })

  const apiKeyRef = useRef('')
  const endpointIdRef = useRef('')

  const log = (message) => {
    setConsoleOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const handleConnect = async (apiKey, endpointId) => {
    apiKeyRef.current = apiKey
    endpointIdRef.current = endpointId
    log('Connecting to RunPod...')

    try {
      const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })

      if (response.ok) {
        setConnected(true)
        log('Connected to RunPod successfully!')
      } else {
        log(`Connection failed: ${response.status}`)
        setConnected(false)
      }
    } catch (err) {
      log(`Connection error: ${err.message}`)
      setConnected(false)
    }
  }

  const handleStartTraining = async () => {
    if (!connected || !trainingData.length) return

    log('Starting training job...')
    log(`Model: ${config.base_model}`)
    log(`Method: ${config.method}`)
    log(`Samples: ${trainingData.length}`)

    const jobId = `job_${Date.now()}`
    const newJob = {
      id: jobId,
      status: 'IN_QUEUE',
      model: config.base_model,
      samples: trainingData.length,
      startTime: new Date().toLocaleString()
    }

    setJobHistory(prev => {
      const updated = [newJob, ...prev]
      localStorage.setItem('job_history', JSON.stringify(updated))
      return updated
    })

    try {
      const response = await fetch(`https://api.runpod.ai/v2/${endpointIdRef.current}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeyRef.current}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: {
            base_model: config.base_model,
            training_data: trainingData,
            config: {
              method: config.method,
              num_epochs: config.num_epochs,
              learning_rate: parseFloat(config.learning_rate),
              batch_size: config.batch_size,
              gradient_accumulation_steps: config.gradient_accumulation_steps,
              max_seq_length: config.max_seq_length,
              lora_r: config.lora_r,
              lora_alpha: config.lora_alpha,
              use_raft: dataFormat === 'raft'
            }
          }
        })
      })

      const data = await response.json()

      if (data.id) {
        log(`Job submitted: ${data.id}`)
        setJobHistory(prev => {
          const updated = prev.map(j => j.id === jobId ? { ...j, id: data.id } : j)
          localStorage.setItem('job_history', JSON.stringify(updated))
          return updated
        })
        pollJobStatus(data.id)
      } else {
        log(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      log(`Error: ${err.message}`)
    }
  }

  const pollJobStatus = async (jobId) => {
    const poll = async () => {
      try {
        const response = await fetch(`https://api.runpod.ai/v2/${endpointIdRef.current}/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${apiKeyRef.current}` }
        })
        const data = await response.json()
        log(`Status: ${data.status}`)

        setJobHistory(prev => {
          const updated = prev.map(j => j.id === jobId ? { ...j, status: data.status } : j)
          localStorage.setItem('job_history', JSON.stringify(updated))
          return updated
        })

        if (data.status === 'IN_QUEUE' || data.status === 'IN_PROGRESS') {
          setTimeout(poll, 5000)
        } else if (data.status === 'COMPLETED') {
          log('Training completed!')
          if (data.output) log(`Output: ${JSON.stringify(data.output, null, 2)}`)
        } else if (data.status === 'FAILED') {
          log(`Training failed: ${data.error || 'Unknown error'}`)
        }
      } catch (err) {
        log(`Polling error: ${err.message}`)
      }
    }
    setTimeout(poll, 3000)
  }

  return (
    <div className="app">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        connected={connected}
      />

      <main className="main-content">
        {activeSection === 'data' && (
          <DataReviewSection
            trainingData={trainingData}
            setTrainingData={setTrainingData}
            dataFormat={dataFormat}
            setDataFormat={setDataFormat}
          />
        )}
        {activeSection === 'training' && (
          <TrainingSection
            config={config}
            setConfig={setConfig}
            trainingData={trainingData}
            connected={connected}
            onConnect={handleConnect}
            onStartTraining={handleStartTraining}
            consoleOutput={consoleOutput}
          />
        )}
        {activeSection === 'metrics' && (
          <MetricsSection jobHistory={jobHistory} />
        )}
      </main>
    </div>
  )
}

export default App
