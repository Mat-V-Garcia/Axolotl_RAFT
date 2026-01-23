import { useState, useEffect, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import yaml from 'js-yaml'
import './App.css'

// ============================================
// THEME CONTEXT & HOOK
// ============================================

const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggleTheme }
}

// ============================================
// ANIMATED STARFIELD BACKGROUND
// ============================================

function Starfield({ theme }) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const starsRef = useRef([])
  const mouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let width = window.innerWidth
    let height = window.innerHeight

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
      initStars()
    }

    const initStars = () => {
      const starCount = Math.min(Math.floor((width * height) / 10000), 180)
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.3,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinkleOffset: Math.random() * Math.PI * 2
      }))
    }

    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const draw = (time) => {
      ctx.clearRect(0, 0, width, height)

      const stars = starsRef.current
      const mouse = mouseRef.current
      const isDark = theme === 'dark'

      // Draw stars
      stars.forEach((star, i) => {
        // Update position with slight drift
        star.x += star.speedX
        star.y += star.speedY

        // Wrap around edges
        if (star.x < 0) star.x = width
        if (star.x > width) star.x = 0
        if (star.y < 0) star.y = height
        if (star.y > height) star.y = 0

        // Mouse interaction - subtle repulsion
        const dx = mouse.x - star.x
        const dy = mouse.y - star.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 150) {
          const force = (150 - dist) / 150
          star.x -= (dx / dist) * force * 0.5
          star.y -= (dy / dist) * force * 0.5
        }

        // Twinkle effect
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7
        const opacity = star.opacity * twinkle

        // Draw star
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fillStyle = isDark
          ? `rgba(180, 200, 255, ${opacity})`
          : `rgba(100, 120, 180, ${opacity * 0.6})`
        ctx.fill()
      })

      // Draw constellation lines using spatial grid for O(n) performance
      const connectionDistance = 120
      const connDistSq = connectionDistance * connectionDistance
      const cellSize = connectionDistance
      const cols = Math.ceil(width / cellSize)
      const rows = Math.ceil(height / cellSize)
      const grid = new Array(cols * rows)

      // Place stars into grid cells
      for (let i = 0; i < stars.length; i++) {
        const cx = Math.floor(stars[i].x / cellSize)
        const cy = Math.floor(stars[i].y / cellSize)
        const key = cy * cols + cx
        if (!grid[key]) grid[key] = []
        grid[key].push(i)
      }

      ctx.lineWidth = 0.5

      // Only check neighboring cells
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const cell = grid[cy * cols + cx]
          if (!cell) continue

          // Check current cell and right/bottom neighbors to avoid duplicates
          const neighbors = [
            cell,
            cx + 1 < cols ? grid[cy * cols + cx + 1] : null,
            cy + 1 < rows ? grid[(cy + 1) * cols + cx] : null,
            cx + 1 < cols && cy + 1 < rows ? grid[(cy + 1) * cols + cx + 1] : null,
            cx - 1 >= 0 && cy + 1 < rows ? grid[(cy + 1) * cols + cx - 1] : null
          ]

          for (let i = 0; i < cell.length; i++) {
            const si = stars[cell[i]]
            for (let n = 0; n < neighbors.length; n++) {
              const neighbor = neighbors[n]
              if (!neighbor) continue
              const startJ = neighbor === cell ? i + 1 : 0
              for (let j = startJ; j < neighbor.length; j++) {
                const sj = stars[neighbor[j]]
                const dx = si.x - sj.x
                const dy = si.y - sj.y
                const distSq = dx * dx + dy * dy
                if (distSq < connDistSq) {
                  const opacity = 1 - (Math.sqrt(distSq) / connectionDistance)
                  ctx.strokeStyle = isDark
                    ? `rgba(100, 150, 255, ${opacity * 0.1})`
                    : `rgba(80, 120, 200, ${opacity * 0.06})`
                  ctx.beginPath()
                  ctx.moveTo(si.x, si.y)
                  ctx.lineTo(sj.x, sj.y)
                  ctx.stroke()
                }
              }
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouseMove)
    animationRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [theme])

  return (
    <div className="starfield-container">
      <canvas ref={canvasRef} className="starfield-canvas" />
    </div>
  )
}

// ============================================
// CSV TO JSON CONVERTER UTILITY
// ============================================

// Parse CSV text properly handling multi-line quoted fields
function parseCSV(csvText) {
  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    const nextChar = csvText[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote ("") - add single quote and skip next
        currentField += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim())
      currentField = ''
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      // End of row (handle both \n and \r\n)
      if (char === '\r') i++ // Skip the \n in \r\n
      currentRow.push(currentField.trim())
      if (currentRow.some(f => f)) { // Only add non-empty rows
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ''
    } else if (char === '\r' && !inQuotes) {
      // Handle standalone \r as line ending
      currentRow.push(currentField.trim())
      if (currentRow.some(f => f)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  // Don't forget the last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(f => f)) {
      rows.push(currentRow)
    }
  }

  return rows
}

function csvToJson(csvText, format = 'sharegpt') {
  const rows = parseCSV(csvText)
  if (rows.length < 2) return []

  // First row is headers
  const headers = rows[0].map(h => h.toLowerCase().replace(/"/g, ''))
  const results = []

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
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
      // Only populate context if there's actually a context/document column
      const hasContextColumn = row.context || row.document || row.source
      const hasThirdColumn = values.length >= 3 && values[2]

      results.push({
        instruction: row.instruction || row.question || row.prompt || values[0],
        context: hasContextColumn ? (row.context || row.document || row.source) : (hasThirdColumn ? values[1] : ''),
        cot_answer: row.cot_answer || row.answer || row.response || (hasThirdColumn ? values[2] : values[1])
      })
    }
  }
  return results
}

// ============================================
// TRAINING PROGRESS INDICATOR
// ============================================

function TrainingSpinner({ status, message }) {
  const isActive = status === 'IN_PROGRESS' || status === 'IN_QUEUE'

  if (!isActive) return null

  return (
    <div className="training-spinner-container">
      <div className="training-spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring delay-1"></div>
        <div className="spinner-ring delay-2"></div>
        <div className="spinner-core"></div>
      </div>
      <div className="spinner-text">
        <span className="spinner-status">{status === 'IN_QUEUE' ? 'Queued' : 'Training'}</span>
        {message && <span className="spinner-message">{message}</span>}
      </div>
      <div className="training-progress-bar">
        <div className="progress-indeterminate"></div>
      </div>
    </div>
  )
}

// ============================================
// STYLED DIALOG (replaces native alert/confirm)
// ============================================

function ModalDialog({ message, type, onConfirm, onCancel }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        ;(onCancel || onConfirm)()
      }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        onConfirm()
      }
      // Focus trap: cycle within modal
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll('button:not([disabled])')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel || onConfirm} role="dialog" aria-modal="true" aria-label="Dialog">
      <div className="modal-dialog glass-card" onClick={(e) => e.stopPropagation()} ref={dialogRef}>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          {type === 'confirm' && (
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          )}
          <button className="btn btn-primary" onClick={onConfirm} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function useDialog() {
  const [dialogState, setDialogState] = useState(null)
  const resolveRef = useRef(null)

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setDialogState({ message, type: 'alert' })
    })
  }, [])

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setDialogState({ message, type: 'confirm' })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    setDialogState(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    setDialogState(null)
  }, [])

  const dialog = dialogState ? (
    <ModalDialog
      message={dialogState.message}
      type={dialogState.type}
      onConfirm={handleConfirm}
      onCancel={dialogState.type === 'confirm' ? handleCancel : undefined}
    />
  ) : null

  return { dialog, showAlert, showConfirm }
}

// ============================================
// ICON COMPONENTS (SVG-based for better theming)
// ============================================

const Icons = {
  Data: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Training: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  ),
  Evaluate: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  Metrics: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Sun: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Spinner: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-spinner">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Play: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Edit: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Folder: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  BarChart: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Flag: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  ),
  Package: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  Docs: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="8" y1="7" x2="16" y2="7"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  )
}

// ============================================
// THEME TOGGLE COMPONENT
// ============================================

function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <div className="theme-toggle-track">
        <div className="theme-toggle-thumb">
          {theme === 'dark' ? <Icons.Moon /> : <Icons.Sun />}
        </div>
      </div>
      <span className="theme-toggle-label">
        {theme === 'dark' ? 'Dark' : 'Light'}
      </span>
    </button>
  )
}

// ============================================
// SIDEBAR COMPONENT
// ============================================

function Sidebar({ activeSection, setActiveSection, connected, theme, toggleTheme }) {
  const navItems = [
    { id: 'data', icon: Icons.Data, label: 'Data Review' },
    { id: 'training', icon: Icons.Training, label: 'Training' },
    { id: 'evaluate', icon: Icons.Evaluate, label: 'Evaluate' },
    { id: 'metrics', icon: Icons.Metrics, label: 'Metrics' },
    { id: 'docs', icon: Icons.Docs, label: 'Docs' }
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img
          src="/logo.png"
          alt="MagisAI Training Hub"
          className="logo"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => setActiveSection(item.id)}
            aria-current={activeSection === item.id ? 'page' : undefined}
          >
            <span className="nav-icon"><item.icon /></span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        <div className={`connection-indicator ${connected ? 'connected' : ''}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <span className="version">v1.1.0</span>
      </div>
    </aside>
  )
}

// ============================================
// DATA REVIEW SECTION
// ============================================

function DataReviewSection({ trainingData, setTrainingData, onSaveNotification }) {
  const { dialog, showAlert, showConfirm } = useDialog()
  const [fileInfo, setFileInfo] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [cardTransition, setCardTransition] = useState('enter')
  const [editMode, setEditMode] = useState(false)
  const [editedAnswer, setEditedAnswer] = useState('')
  const fileInputRef = useRef(null)
  const answerTextareaRef = useRef(null)

  // Handle smooth card transitions
  useEffect(() => {
    if (currentIndex !== displayIndex) {
      setCardTransition('exit')
      const timer = setTimeout(() => {
        setDisplayIndex(currentIndex)
        setCardTransition('enter')
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [currentIndex, displayIndex])

  // Initialize items with status if not present
  const initializeWithStatus = (data) => {
    return data.map((item, index) => ({
      ...item,
      _id: item._id || `item_${Date.now()}_${index}`,
      _status: item._status || 'pending'
    }))
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target.result
      let data = []

      if (file.name.endsWith('.csv')) {
        // Always parse as simple Q&A format
        data = csvToJson(content, 'sharegpt')
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
          showAlert('Invalid JSON file: ' + err.message)
          return
        }
      }

      const initializedData = initializeWithStatus(data)
      setTrainingData(initializedData)
      setCurrentIndex(0)
      setEditMode(false)
    }
    reader.readAsText(file)
  }

  const currentItem = trainingData[currentIndex]
  const displayItem = trainingData[displayIndex]

  // Get question from any format
  const getQuestion = (item) => {
    if (!item) return ''
    return item.messages?.[0]?.content || item.question || item.instruction || ''
  }

  // Get answer from any format
  const getAnswer = (item) => {
    if (!item) return ''
    return item.messages?.[1]?.content || item.answer || item.cot_answer || ''
  }

  // Get the current answer text
  const getCurrentAnswer = () => getAnswer(currentItem)

  // Update answer in the data (handles any format)
  const updateCurrentAnswer = (newAnswer) => {
    if (!currentItem) return

    const updatedData = [...trainingData]
    const item = { ...updatedData[currentIndex] }

    // Update based on detected format
    if (item.messages) {
      item.messages = [item.messages[0], { role: 'assistant', content: newAnswer }]
    } else if (item.cot_answer !== undefined) {
      item.cot_answer = newAnswer
    } else {
      item.answer = newAnswer
    }

    updatedData[currentIndex] = item
    setTrainingData(updatedData)
  }

  // Accept current item
  const handleAccept = useCallback(() => {
    if (!trainingData.length || currentIndex >= trainingData.length) return

    // Save edit if in edit mode
    if (editMode) {
      updateCurrentAnswer(editedAnswer)
      setEditMode(false)
    }

    const updatedData = [...trainingData]
    updatedData[currentIndex] = {
      ...updatedData[currentIndex],
      _status: editMode ? 'edited' : 'accepted'
    }
    setTrainingData(updatedData)

    // Move to next item
    if (currentIndex < trainingData.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }, [trainingData, currentIndex, editMode, editedAnswer, setTrainingData])

  // Reject current item
  const handleReject = useCallback(() => {
    if (!trainingData.length || currentIndex >= trainingData.length) return

    // Exit edit mode without saving
    if (editMode) {
      setEditMode(false)
    }

    const updatedData = [...trainingData]
    updatedData[currentIndex] = {
      ...updatedData[currentIndex],
      _status: 'rejected'
    }
    setTrainingData(updatedData)

    // Move to next item
    if (currentIndex < trainingData.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }, [trainingData, currentIndex, editMode, setTrainingData])

  // Toggle edit mode
  const handleToggleEdit = useCallback(() => {
    if (!trainingData.length || currentIndex >= trainingData.length) return

    if (editMode) {
      // Save the edit
      updateCurrentAnswer(editedAnswer)
      setEditMode(false)
    } else {
      // Enter edit mode
      setEditedAnswer(getCurrentAnswer())
      setEditMode(true)
      // Focus textarea after state update
      setTimeout(() => answerTextareaRef.current?.focus(), 0)
    }
  }, [trainingData, currentIndex, editMode, editedAnswer])

  // Accept all pending items
  const handleAcceptAll = async () => {
    if (!trainingData.length) return

    const pendingCount = trainingData.filter(item => item._status === 'pending').length
    if (pendingCount === 0) {
      showAlert('All items have already been reviewed.')
      return
    }

    const confirmed = await showConfirm(`Accept all ${pendingCount} pending items?`)
    if (!confirmed) return

    const updatedData = trainingData.map(item => ({
      ...item,
      _status: item._status === 'pending' ? 'accepted' : item._status
    }))
    setTrainingData(updatedData)
  }

  // Save progress to JSON file (and localStorage as backup)
  const handleSave = useCallback(() => {
    if (!trainingData.length) return

    // Save edit if in edit mode
    if (editMode) {
      updateCurrentAnswer(editedAnswer)
    }

    const saveData = {
      data: trainingData,
      fileInfo: fileInfo,
      currentIndex: currentIndex,
      savedAt: new Date().toISOString()
    }

    // Save to localStorage as backup
    localStorage.setItem('training_data_progress', JSON.stringify(saveData))

    // Download as JSON file
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const timestamp = new Date().toISOString().slice(0, 10)
    a.download = `training_progress_${timestamp}.json`
    a.click()
    URL.revokeObjectURL(url)

    onSaveNotification?.('Progress saved!')
  }, [trainingData, fileInfo, currentIndex, editMode, editedAnswer, onSaveNotification])

  // Resume from JSON file via file picker
  const resumeInputRef = useRef(null)

  const handleResume = () => {
    resumeInputRef.current?.click()
  }

  const handleResumeFileLoad = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const saveData = JSON.parse(event.target.result)
        setTrainingData(saveData.data || [])
        setFileInfo(saveData.fileInfo || { name: file.name, type: 'JSON', converted: false })
        setCurrentIndex(saveData.currentIndex || 0)
        setEditMode(false)
        onSaveNotification?.('Progress restored!')
      } catch (err) {
        showAlert('Failed to restore progress: ' + err.message)
      }
    }
    reader.readAsText(file)
    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  // Export only accepted/edited items as JSONL
  const exportAsJsonl = () => {
    if (!trainingData.length) return

    // Filter to only accepted and edited items, and remove internal fields
    const exportData = trainingData
      .filter(item => item._status === 'accepted' || item._status === 'edited')
      .map(({ _id, _status, ...rest }) => rest)

    if (exportData.length === 0) {
      showAlert('No accepted items to export. Accept some items first.')
      return
    }

    const jsonl = exportData.map(item => JSON.stringify(item)).join('\n')
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'training_data.jsonl'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in input/textarea (except for Ctrl+S)
      const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'

      // Ctrl+S - always save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }

      // Skip other shortcuts if typing
      if (isTyping) return

      switch (e.key.toLowerCase()) {
        case 'a':
          handleAccept()
          break
        case 'r':
          handleReject()
          break
        case 'e':
          handleToggleEdit()
          break
        case 'arrowleft':
          if (currentIndex > 0) {
            if (editMode) setEditMode(false)
            setCurrentIndex(i => i - 1)
          }
          break
        case 'arrowright':
          if (currentIndex < trainingData.length - 1) {
            if (editMode) setEditMode(false)
            setCurrentIndex(i => i + 1)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, trainingData.length, editMode, handleAccept, handleReject, handleToggleEdit, handleSave])

  // Calculate statistics
  const stats = {
    total: trainingData.length,
    accepted: trainingData.filter(item => item._status === 'accepted').length,
    edited: trainingData.filter(item => item._status === 'edited').length,
    rejected: trainingData.filter(item => item._status === 'rejected').length,
    pending: trainingData.filter(item => item._status === 'pending').length
  }
  stats.reviewed = stats.accepted + stats.edited + stats.rejected

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'status-accepted'
      case 'edited': return 'status-edited'
      case 'rejected': return 'status-rejected'
      default: return 'status-pending'
    }
  }

  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Data Review</h2>
        <div className="header-actions">
          <div className="btn-group">
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icons.Upload />
              <span>Load</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleResume}
            >
              <span>Resume</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleSave}
              disabled={!trainingData.length}
            >
              <span>Save</span>
            </button>
          </div>
          <div className="btn-group">
            <button
              className="btn btn-accept-all"
              onClick={handleAcceptAll}
              disabled={!trainingData.length}
            >
              <span>Accept All</span>
            </button>
            <button
              className="btn btn-primary"
              onClick={exportAsJsonl}
              disabled={!trainingData.length}
            >
              <Icons.Download />
              <span>Export</span>
            </button>
          </div>
          <input
            ref={resumeInputRef}
            type="file"
            accept=".json"
            onChange={handleResumeFileLoad}
            style={{ display: 'none' }}
            aria-label="Load saved session file"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.jsonl"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            aria-label="Upload training data file"
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
            style={{ width: stats.total ? `${(stats.reviewed / stats.total) * 100}%` : '0%' }}
            role="progressbar"
            aria-valuenow={stats.reviewed}
            aria-valuemin={0}
            aria-valuemax={stats.total}
          />
        </div>
        <span className="progress-text">
          {stats.total > 0
            ? `${stats.reviewed} / ${stats.total}`
            : 'No data loaded'}
        </span>
      </div>

      <div className="glass-card preview-card dynamic-card">
        {currentItem ? (
          <div className={`card-content-animated card-${cardTransition}`}>
            <div className="preview-header">
              <span className={`status-badge ${getStatusColor(displayItem?._status)} status-animated`}>
                <span className="status-dot-indicator"></span>
                {(displayItem?._status || 'pending').toUpperCase()}
              </span>
            </div>
            <div className="preview-field">
              <label>
                <span className="field-icon">Q</span>
                Question
              </label>
              <div className="field-content">{getQuestion(displayItem) || '-'}</div>
            </div>
            <div className="preview-field">
              <label>
                <span className="field-icon">A</span>
                Answer
              </label>
              {editMode ? (
                <textarea
                  ref={answerTextareaRef}
                  className="field-content answer editable editing-active"
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                />
              ) : (
                <div className="field-content answer">{getAnswer(displayItem) || '-'}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="no-data-message">
            <div className="no-data-icon pulse-icon">
              <Icons.Folder />
            </div>
            <p>No data loaded</p>
            <p className="hint">Upload a CSV or JSON file to get started</p>
          </div>
        )}
      </div>

      {trainingData.length > 0 && (
        <div className="action-buttons">
          <button className="btn btn-accept" onClick={handleAccept}>
            <Icons.Check />
            <span>Accept (A)</span>
          </button>
          <button className={`btn btn-edit ${editMode ? 'active' : ''}`} onClick={handleToggleEdit}>
            <Icons.Edit />
            <span>{editMode ? 'Save Edit (E)' : 'Edit (E)'}</span>
          </button>
          <button className="btn btn-reject" onClick={handleReject}>
            <Icons.X />
            <span>Reject (R)</span>
          </button>
        </div>
      )}

      <div className="navigation-controls">
        <button
          className="btn btn-nav"
          onClick={() => {
            if (editMode) setEditMode(false)
            setCurrentIndex(i => Math.max(0, i - 1))
          }}
          disabled={currentIndex === 0}
          aria-label="Previous item"
        >
          <Icons.ChevronLeft />
          <span>Previous</span>
        </button>
        <span className="nav-counter">
          {trainingData.length ? `${currentIndex + 1} of ${trainingData.length}` : '-'}
        </span>
        <button
          className="btn btn-nav"
          onClick={() => {
            if (editMode) setEditMode(false)
            setCurrentIndex(i => Math.min(trainingData.length - 1, i + 1))
          }}
          disabled={currentIndex >= trainingData.length - 1}
          aria-label="Next item"
        >
          <span>Next</span>
          <Icons.ChevronRight />
        </button>
      </div>
      {dialog}
    </div>
  )
}

// ============================================
// WEAVIATE SEARCH UTILITY
// ============================================

async function searchWeaviate(query, weaviateConfig, limit = 10, excludeContent = '') {
  const { url, apiKey, collection } = weaviateConfig

  if (!url || !collection) {
    return { success: false, documents: [], error: 'Weaviate not configured' }
  }

  // GraphQL query for near_text search
  const graphqlQuery = {
    query: `
      {
        Get {
          ${collection}(
            nearText: {
              concepts: ["${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"]
            }
            limit: ${limit}
          ) {
            content
            text
            _additional {
              id
              distance
            }
          }
        }
      }
    `
  }

  try {
    // Use proxy to avoid CORS issues (auth handled by proxy)
    const response = await fetch('/weaviate-proxy/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(graphqlQuery)
    })

    if (!response.ok) {
      throw new Error(`Weaviate request failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.errors) {
      throw new Error(data.errors[0]?.message || 'GraphQL error')
    }

    const results = data.data?.Get?.[collection] || []

    // Filter and format documents
    const documents = results
      .map(item => ({
        id: item._additional?.id || `wv_${Math.random().toString(36).slice(2)}`,
        content: item.content || item.text || '',
        distance: item._additional?.distance
      }))
      .filter(doc => {
        // Exclude documents containing the answer
        if (excludeContent && doc.content.toLowerCase().includes(excludeContent.toLowerCase().slice(0, 100))) {
          return false
        }
        return doc.content.length > 0
      })

    return { success: true, documents, error: null }
  } catch (err) {
    console.error('Weaviate search error:', err)
    return { success: false, documents: [], error: err.message }
  }
}

// ============================================
// RAFT PREPARATION UTILITIES
// ============================================

function generateCotAnswer(question, answer, oracleDocNum) {
  return `Let me analyze the provided documents to answer: ${question}

Looking at Document ${oracleDocNum}, I find relevant information that addresses this question.

Based on Document ${oracleDocNum}, the answer is:

${answer}`
}

function createOracleDocument(item, index, dataFormat) {
  const question = dataFormat === 'sharegpt'
    ? item.messages?.[0]?.content || ''
    : item.instruction || item.question || ''
  const answer = dataFormat === 'sharegpt'
    ? item.messages?.[1]?.content || ''
    : item.cot_answer || item.answer || ''

  return {
    id: `oracle_${item._id || index}`,
    content: `${question}\n\n${answer}`,
    is_oracle: true
  }
}

function createFallbackDistractors(allItems, currentIndex, numDistractors, dataFormat) {
  const otherItems = allItems.filter((_, idx) => idx !== currentIndex)
  const selected = []
  const shuffled = [...otherItems].sort(() => Math.random() - 0.5)

  for (let i = 0; i < Math.min(numDistractors, shuffled.length); i++) {
    const item = shuffled[i]
    const question = dataFormat === 'sharegpt'
      ? item.messages?.[0]?.content || ''
      : item.instruction || item.question || ''
    const answer = dataFormat === 'sharegpt'
      ? item.messages?.[1]?.content || ''
      : item.cot_answer || item.answer || ''

    selected.push({
      id: `distractor_${item._id || i}`,
      content: `${question}\n\n${answer}`,
      is_oracle: false
    })
  }

  return selected
}

function prepareRaftSample(item, index, allItems, raftConfig, dataFormat) {
  const { numDistractors, oracleProbability } = raftConfig

  // Create oracle document
  const oracleDoc = createOracleDocument(item, index, dataFormat)

  // Get distractor documents
  const distractors = createFallbackDistractors(allItems, index, numDistractors, dataFormat)

  // Decide if oracle should be included
  const includeOracle = Math.random() < oracleProbability

  let documents
  let cotAnswer
  const question = dataFormat === 'sharegpt'
    ? item.messages?.[0]?.content || ''
    : item.instruction || item.question || ''
  const answer = dataFormat === 'sharegpt'
    ? item.messages?.[1]?.content || ''
    : item.cot_answer || item.answer || ''

  if (includeOracle) {
    // Combine and shuffle
    documents = [oracleDoc, ...distractors]
    documents = documents.sort(() => Math.random() - 0.5)

    // Find oracle position (1-indexed)
    const oraclePosition = documents.findIndex(d => d.is_oracle) + 1

    // Generate CoT answer
    cotAnswer = generateCotAnswer(question, answer, oraclePosition)
  } else {
    documents = distractors
    cotAnswer = `I've reviewed the provided documents looking for information about: ${question}

However, none of the documents contain sufficient information to answer this question accurately. I would need additional sources to provide a reliable answer.`
  }

  // Format documents as numbered context
  const contextParts = documents.map((doc, i) => `[Document ${i + 1}]\n${doc.content}`)
  const contextStr = contextParts.join('\n\n')

  // Create the final training format
  const userContent = `Based on the following documents, answer the question.
If the answer is found in one of the documents, cite it by document number.

${contextStr}

Question: ${question}`

  return {
    messages: [
      { role: 'user', content: userContent },
      { role: 'assistant', content: cotAnswer }
    ],
    _id: item._id,
    _raft_prepared: true,
    _oracle_included: includeOracle
  }
}

// ============================================
// AXOLOTL CONFIG GENERATOR
// ============================================

function generateAxolotlConfig(config, dataFormat) {
  const axolotlConfig = {
    base_model: config.base_model,
    model_type: 'AutoModelForCausalLM',
    tokenizer_type: 'AutoTokenizer',
    trust_remote_code: true,

    // Dataset configuration
    datasets: [
      {
        path: './train.jsonl',
        type: 'sharegpt',
        conversation: 'chatml'
      }
    ],
    dataset_prepared_path: './prepared_data',

    // Output settings
    output_dir: './output',

    // Training parameters
    sequence_len: config.max_seq_length || 2048,
    sample_packing: false,
    pad_to_sequence_len: true,

    // LoRA/QLoRA settings
    adapter: config.method === 'full' ? null : 'lora',
    lora_r: config.lora_r || 32,
    lora_alpha: config.lora_alpha || 64,
    lora_dropout: 0.05,
    lora_target_linear: true,

    // Quantization for QLoRA
    ...(config.method === 'qlora' && {
      load_in_4bit: true,
      bnb_4bit_compute_dtype: 'bfloat16',
      bnb_4bit_use_double_quant: true,
      bnb_4bit_quant_type: 'nf4'
    }),

    // Training hyperparameters
    gradient_accumulation_steps: config.gradient_accumulation_steps || 4,
    micro_batch_size: config.batch_size || 4,
    num_epochs: config.num_epochs || 3,
    learning_rate: parseFloat(config.learning_rate) || 2e-4,
    optimizer: 'adamw_torch',
    lr_scheduler: 'cosine',
    warmup_ratio: 0.1,

    // Training features
    train_on_inputs: false,
    group_by_length: false,
    bf16: 'auto',
    fp16: false,
    tf32: false,

    // Gradient checkpointing for memory efficiency
    gradient_checkpointing: true,
    gradient_checkpointing_kwargs: {
      use_reentrant: false
    },

    // Flash attention for faster training
    flash_attention: true,

    // Logging
    logging_steps: 10,
    save_steps: 100,
    eval_steps: 100,
    save_total_limit: 2,

    // Misc
    seed: 42,
    strict: false
  }

  // Remove null values
  Object.keys(axolotlConfig).forEach(key => {
    if (axolotlConfig[key] === null) {
      delete axolotlConfig[key]
    }
  })

  return axolotlConfig
}

// ============================================
// TRAINING SECTION
// ============================================

const TRAINING_TYPE_DESCRIPTIONS = {
  sft: "SFT fine-tunes directly on question-answer pairs. Simple but effective for basic instruction following.",
  raft: "RAFT trains the model to identify relevant documents among distractors and cite sources. Best for RAG applications.",
  dpo: "DPO (Direct Preference Optimization) training is coming soon."
}

function TrainingSection({
  config,
  setConfig,
  trainingData,
  connected,
  runpodConnecting,
  runpodError,
  onConnect,
  onStartTraining,
  consoleOutput,
  dataFormat,
  raftConfig,
  setRaftConfig,
  weaviateConfig,
  runpodConfig,
  onSaveNotification
}) {
  const { dialog: trainingDialog, showAlert } = useDialog()
  const [raftPreparedData, setRaftPreparedData] = useState([])
  const [preparingRaft, setPreparingRaft] = useState(false)
  const [raftProgress, setRaftProgress] = useState({ current: 0, total: 0 })
  const [trainingType, setTrainingType] = useState('raft') // 'sft' | 'raft' | 'dpo'
  const consoleRef = useRef(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleOutput])

  const handleConnect = () => {
    onConnect(runpodConfig.apiKey, runpodConfig.endpointId)
  }

  // Get accepted items for RAFT preparation
  const acceptedItems = trainingData.filter(
    item => item._status === 'accepted' || item._status === 'edited'
  )

  const [weaviateStatus, setWeaviateStatus] = useState({ tested: false, connecting: false, connected: false, error: null })

  // Test Weaviate connection (uses Vite proxy to avoid CORS)
  const testWeaviateConnection = async () => {
    if (!weaviateConfig.url) {
      setWeaviateStatus({ tested: true, connecting: false, connected: false, error: 'URL not configured' })
      return
    }

    // Set connecting state
    setWeaviateStatus({ tested: false, connecting: true, connected: false, error: null })

    try {
      // Use proxy to avoid CORS issues
      const response = await fetch('/weaviate-proxy/v1/meta')

      if (response.ok) {
        setWeaviateStatus({ tested: true, connecting: false, connected: true, error: null })
        onSaveNotification?.('Weaviate connected!')
      } else {
        const text = await response.text()
        setWeaviateStatus({ tested: true, connecting: false, connected: false, error: `Status ${response.status}: ${text.slice(0, 100)}` })
      }
    } catch (err) {
      setWeaviateStatus({ tested: true, connecting: false, connected: false, error: err.message })
    }
  }

  // Prepare RAFT data with Weaviate distractors
  const handlePrepareRaft = async () => {
    if (!acceptedItems.length) {
      showAlert('No accepted items to prepare. Accept some items in Data Review first.')
      return
    }

    setPreparingRaft(true)
    setRaftProgress({ current: 0, total: acceptedItems.length, status: 'Starting...' })

    const prepared = []
    let weaviateSuccessCount = 0
    let fallbackCount = 0

    for (let i = 0; i < acceptedItems.length; i++) {
      const item = acceptedItems[i]
      const question = item.messages?.[0]?.content || item.question || item.instruction || ''
      const answer = item.messages?.[1]?.content || item.answer || item.cot_answer || ''

      setRaftProgress({
        current: i + 1,
        total: acceptedItems.length,
        status: `Processing item ${i + 1}...`
      })

      // Try to get distractors from Weaviate
      let distractors = []
      console.log(`[RAFT] Item ${i + 1}: Weaviate URL=${!!weaviateConfig.url}, Connected=${weaviateStatus.connected}`)

      if (weaviateConfig.url && weaviateStatus.connected) {
        console.log(`[RAFT] Searching Weaviate for: "${question.slice(0, 50)}..."`)
        const result = await searchWeaviate(
          question,
          weaviateConfig,
          raftConfig.numDistractors + 5, // Get extra in case some are filtered
          answer
        )
        console.log(`[RAFT] Weaviate result: success=${result.success}, docs=${result.documents?.length || 0}, error=${result.error || 'none'}`)

        if (result.success && result.documents.length > 0) {
          distractors = result.documents
            .slice(0, raftConfig.numDistractors)
            .map(doc => ({
              id: doc.id,
              content: doc.content,
              is_oracle: false
            }))
          weaviateSuccessCount++
        }
      } else {
        console.log(`[RAFT] Skipping Weaviate - not connected. Make sure to click "Test Connection" first.`)
      }

      // Fallback to other Q&A pairs if Weaviate didn't return enough
      if (distractors.length < raftConfig.numDistractors) {
        const fallbackDistractors = createFallbackDistractors(
          acceptedItems,
          i,
          raftConfig.numDistractors - distractors.length,
          'sharegpt'
        )
        distractors = [...distractors, ...fallbackDistractors]
        if (distractors.length > 0 && weaviateSuccessCount === 0) {
          fallbackCount++
        }
      }

      // Create oracle document
      const oracleDoc = {
        id: `oracle_${item._id || i}`,
        content: `${question}\n\n${answer}`,
        is_oracle: true
      }

      // Decide if oracle should be included
      const includeOracle = Math.random() < raftConfig.oracleProbability

      let documents
      let cotAnswer

      if (includeOracle) {
        documents = [oracleDoc, ...distractors].sort(() => Math.random() - 0.5)
        const oraclePosition = documents.findIndex(d => d.is_oracle) + 1
        cotAnswer = generateCotAnswer(question, answer, oraclePosition)
      } else {
        documents = distractors
        cotAnswer = `I've reviewed the provided documents looking for information about: ${question}

However, none of the documents contain sufficient information to answer this question accurately. I would need additional sources to provide a reliable answer.`
      }

      // Format as training sample
      const contextParts = documents.map((doc, idx) => `[Document ${idx + 1}]\n${doc.content}`)
      const contextStr = contextParts.join('\n\n')

      const userContent = `Based on the following documents, answer the question.
If the answer is found in one of the documents, cite it by document number.

${contextStr}

Question: ${question}`

      prepared.push({
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: cotAnswer }
        ],
        _id: item._id,
        _raft_prepared: true,
        _oracle_included: includeOracle,
        _weaviate_distractors: weaviateSuccessCount > 0
      })

      // Small delay to prevent UI freeze
      if (i % 5 === 0) {
        await new Promise(r => setTimeout(r, 10))
      }
    }

    setRaftPreparedData(prepared)
    setPreparingRaft(false)

    const sourceMsg = weaviateSuccessCount > 0
      ? `${weaviateSuccessCount} with Weaviate distractors`
      : `${fallbackCount} with fallback distractors`
    onSaveNotification?.(`Prepared ${prepared.length} RAFT samples (${sourceMsg})`)
  }

  // Export as ZIP with train.jsonl and config.yaml
  const handleExportForRunPod = async () => {
    let dataToExport

    if (trainingType === 'raft' && raftPreparedData.length > 0) {
      // Use RAFT-prepared data
      dataToExport = raftPreparedData
    } else {
      // Use SFT format - simple Q&A pairs
      dataToExport = acceptedItems.map(item => {
        const question = dataFormat === 'sharegpt'
          ? item.messages?.[0]?.content || ''
          : item.instruction || item.question || ''
        const answer = dataFormat === 'sharegpt'
          ? item.messages?.[1]?.content || ''
          : item.cot_answer || item.answer || ''

        return {
          messages: [
            { role: 'user', content: question },
            { role: 'assistant', content: answer }
          ]
        }
      })
    }

    if (dataToExport.length === 0) {
      showAlert('No data to export. Accept items first.')
      return
    }

    // Create ZIP
    const zip = new JSZip()

    // Add train.jsonl
    const jsonl = dataToExport.map(item => {
      const { _id, _status, _raft_prepared, _oracle_included, ...rest } = item
      return JSON.stringify(rest)
    }).join('\n')
    zip.file('train.jsonl', jsonl)

    // Add config.yaml
    const axolotlConfig = generateAxolotlConfig(config, dataFormat)
    const configYaml = yaml.dump(axolotlConfig)
    zip.file('config.yaml', configYaml)

    // Add README
    const isRaftPrepared = trainingType === 'raft' && raftPreparedData.length > 0
    const readme = `# Training Package

Generated by MagisAI Training Hub on ${new Date().toISOString()}

## Contents
- train.jsonl: ${dataToExport.length} training samples
- config.yaml: Axolotl configuration

## Training Type
${trainingType.toUpperCase()}${isRaftPrepared ? ' (with distractor documents)' : ''}

## Usage
1. Upload this folder to your RunPod instance
2. Navigate to the directory containing these files
3. Run: axolotl train config.yaml

## Configuration Summary
- Base Model: ${config.base_model}
- Fine-tuning Method: ${config.method}
- Epochs: ${config.num_epochs}
- Learning Rate: ${config.learning_rate}
- LoRA Rank: ${config.lora_r}
- LoRA Alpha: ${config.lora_alpha}
`
    zip.file('README.md', readme)

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training_package_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(url)

    onSaveNotification?.('Training package exported!')
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
            <p className="config-info">
              Endpoint ID: <code>{runpodConfig.endpointId || 'Not configured'}</code>
            </p>
            <div className="connection-row">
              <button
                className={`btn btn-primary${runpodConnecting ? ' btn-loading' : ''}`}
                onClick={handleConnect}
                disabled={runpodConnecting}
              >
                <span>{runpodConnecting ? 'Connecting...' : connected ? 'Reconnect' : 'Test Connection'}</span>
              </button>
              {runpodConnecting && (
                <span className="connection-status connecting">
                  <span className="spinner"></span>
                  Connecting...
                </span>
              )}
              {!runpodConnecting && connected && (
                <span className="connection-status connected">✓ Connected</span>
              )}
              {!runpodConnecting && !connected && runpodError && (
                <span className="connection-status error">✗ {runpodError}</span>
              )}
            </div>
          </div>
        </div>

        {/* Training Type Selector */}
        <div className="glass-card config-panel">
          <h3>Training Type</h3>
          <div className="training-types" role="radiogroup" aria-label="Training type">
            {['sft', 'raft', 'dpo'].map(type => (
              <button
                key={type}
                className={`type-btn ${trainingType === type ? 'active' : ''} ${type === 'dpo' ? 'disabled' : ''}`}
                onClick={() => type !== 'dpo' && setTrainingType(type)}
                role="radio"
                aria-checked={trainingType === type}
                disabled={type === 'dpo'}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="type-description">
            {TRAINING_TYPE_DESCRIPTIONS[trainingType]}
          </p>
        </div>

        {/* RAFT Preparation Panel - Only show when RAFT selected */}
        {trainingType === 'raft' && (
          <>
            {/* Weaviate Configuration */}
            <div className="glass-card config-panel">
              <h3>Weaviate (Distractors)</h3>
              <div className="config-form">
                <p className="config-info">
                  Collection: <code>{weaviateConfig.collection || 'Not configured'}</code>
                </p>
                <div className="connection-row">
                  <button
                    className="btn btn-secondary"
                    onClick={testWeaviateConnection}
                    disabled={weaviateStatus.connecting}
                  >
                    {weaviateStatus.connecting ? 'Connecting...' : 'Test Connection'}
                  </button>
                  {weaviateStatus.connecting && (
                    <span className="connection-status connecting">
                      <span className="spinner"></span>
                      Connecting...
                    </span>
                  )}
                  {weaviateStatus.tested && !weaviateStatus.connecting && (
                    <span className={`connection-status ${weaviateStatus.connected ? 'connected' : 'error'}`}>
                      {weaviateStatus.connected ? '✓ Connected' : `✗ ${weaviateStatus.error || 'Failed'}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* RAFT Settings */}
            <div className="glass-card config-panel">
              <h3>RAFT Settings</h3>
              <div className="config-form">
                <div className="form-field">
                  <label htmlFor="num-distractors">Distractor Documents</label>
                  <input
                    id="num-distractors"
                    type="number"
                    value={raftConfig.numDistractors}
                    onChange={(e) => setRaftConfig({ ...raftConfig, numDistractors: parseInt(e.target.value) || 3 })}
                    min="1"
                    max="5"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="oracle-prob">Oracle Probability (0-1)</label>
                  <input
                    id="oracle-prob"
                    type="number"
                    value={raftConfig.oracleProbability}
                    onChange={(e) => setRaftConfig({ ...raftConfig, oracleProbability: parseFloat(e.target.value) || 0.8 })}
                    min="0"
                    max="1"
                    step="0.1"
                  />
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handlePrepareRaft}
                  disabled={preparingRaft || !acceptedItems.length}
                >
                  {preparingRaft ? (
                    <span>Preparing... {raftProgress.current}/{raftProgress.total}</span>
                  ) : (
                    <>
                      <Icons.Refresh />
                      <span>Prepare RAFT Data</span>
                    </>
                  )}
                </button>
                {raftPreparedData.length > 0 && (
                  <div className="raft-status">
                    {raftPreparedData.length} samples prepared
                  </div>
                )}
                {!weaviateStatus.connected && (
                  <p className="hint-text">
                    Connect Weaviate for semantic distractors, or use fallback mode (other Q&A pairs)
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Fine-tuning Method */}
        <div className="glass-card config-panel">
          <h3>Fine-tuning Method</h3>
          <div className="training-types" role="radiogroup" aria-label="Training method">
            {['qlora', 'lora', 'full'].map(type => (
              <button
                key={type}
                className={`type-btn ${config.method === type ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, method: type })}
                role="radio"
                aria-checked={config.method === type}
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
              <label htmlFor="base-model">Base Model</label>
              <select
                id="base-model"
                value={config.base_model}
                onChange={(e) => setConfig({ ...config, base_model: e.target.value })}
              >
                <option value="Qwen/Qwen2.5-14B-Instruct">Qwen 2.5 14B Instruct (24GB+ VRAM)</option>
                <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 7B Instruct (16GB+ VRAM)</option>
                <option value="Qwen/Qwen2.5-3B-Instruct">Qwen 2.5 3B Instruct (8GB+ VRAM)</option>
                <option value="meta-llama/Llama-3.1-8B-Instruct">Llama 3.1 8B Instruct</option>
                <option value="mistralai/Mistral-7B-Instruct-v0.3">Mistral 7B Instruct</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="learning-rate">Learning Rate</label>
              <input
                id="learning-rate"
                type="text"
                value={config.learning_rate}
                onChange={(e) => setConfig({ ...config, learning_rate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="epochs">Epochs</label>
              <input
                id="epochs"
                type="number"
                value={config.num_epochs}
                onChange={(e) => setConfig({ ...config, num_epochs: parseInt(e.target.value) || 1 })}
                min="1"
              />
            </div>
            <div className="form-field">
              <label htmlFor="batch-size">Batch Size</label>
              <input
                id="batch-size"
                type="number"
                value={config.batch_size}
                onChange={(e) => setConfig({ ...config, batch_size: parseInt(e.target.value) || 1 })}
                min="1"
              />
            </div>
            <div className="form-field">
              <label htmlFor="lora-rank">LoRA Rank</label>
              <input
                id="lora-rank"
                type="number"
                value={config.lora_r}
                onChange={(e) => setConfig({ ...config, lora_r: parseInt(e.target.value) || 8 })}
                min="1"
              />
            </div>
            <div className="form-field">
              <label htmlFor="lora-alpha">LoRA Alpha</label>
              <input
                id="lora-alpha"
                type="number"
                value={config.lora_alpha}
                onChange={(e) => setConfig({ ...config, lora_alpha: parseInt(e.target.value) || 16 })}
                min="1"
              />
            </div>
            <div className="form-field">
              <label htmlFor="max-seq-length">Max Seq Length</label>
              <input
                id="max-seq-length"
                type="number"
                value={config.max_seq_length}
                onChange={(e) => setConfig({ ...config, max_seq_length: parseInt(e.target.value) || 2048 })}
                min="128"
                step="128"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Training Actions */}
      <div className="training-actions">
        <div className="data-status">
          <span className={acceptedItems.length > 0 ? 'ready' : ''}>
            {acceptedItems.length > 0
              ? `${trainingType.toUpperCase()} Training: ${acceptedItems.length} samples${trainingType === 'raft' && raftPreparedData.length > 0 ? ' (RAFT prepared)' : ''}`
              : 'No training data loaded'}
          </span>
        </div>
        <div className="action-group">
          <button
            className="btn btn-secondary"
            onClick={handleExportForRunPod}
            disabled={!acceptedItems.length}
          >
            <Icons.Package />
            <span>Export ZIP</span>
          </button>
          <button
            className="btn btn-start"
            onClick={onStartTraining}
            disabled={!connected || !acceptedItems.length}
          >
            <Icons.Play />
            <span>Start Training</span>
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div className="glass-card console-panel">
        <h3>Console Output</h3>
        <div
          className="console"
          ref={consoleRef}
          role="log"
          aria-live="polite"
          aria-label="Training console output"
        >
          {consoleOutput.map((line, i) => (
            <div key={i} className="console-line">{line}</div>
          ))}
          {consoleOutput.length === 0 && (
            <div className="console-line muted">Waiting for activity...</div>
          )}
        </div>
      </div>
      {trainingDialog}
    </div>
  )
}

// ============================================
// EVALUATION SECTION
// ============================================

function EvaluateSection({
  evalConfig,
  setEvalConfig,
  evalResults,
  setEvalResults,
  modelResponses,
  setModelResponses,
  evalProgress,
  setEvalProgress,
  onSaveNotification
}) {
  const { dialog: evalDialog, showAlert } = useDialog()
  const responseFileRef = useRef(null)

  // Judge prompt template
  const JUDGE_PROMPT = `You are evaluating the quality of an AI assistant's response to a question.

Question: {question}
Expected Answer: {expected_answer}
Model Response: {model_response}

Rate the response on a scale of 1-5:
1 = Completely incorrect or contradicts the expected answer
2 = Mostly incorrect with some accurate elements
3 = Partially correct but missing key points
4 = Mostly correct with minor omissions
5 = Fully correct and well-explained

Provide your rating as a single number, then a brief explanation.
Rating:`

  // Load model responses file
  const handleLoadResponses = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target.result
        let responses = []

        if (file.name.endsWith('.jsonl')) {
          responses = content.trim().split('\n').map(line => JSON.parse(line))
        } else {
          const parsed = JSON.parse(content)
          responses = Array.isArray(parsed) ? parsed : [parsed]
        }

        // Normalize response format
        const normalized = responses.map((item, i) => ({
          _id: item._id || item.id || `resp_${i}`,
          question: item.question || item.messages?.[0]?.content || item.instruction || '',
          expected_answer: item.expected_answer || item.expected || item.answer || item.messages?.[1]?.content || item.cot_answer || '',
          model_response: item.model_response || item.response || item.generated || '',
          _status: 'pending'
        }))

        setModelResponses(normalized)
        setEvalResults([])
        onSaveNotification?.(`Loaded ${normalized.length} model responses`)
      } catch (err) {
        showAlert('Failed to load responses: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Create judge prompt for a single item
  const createJudgePrompt = (question, expected, response) => {
    return JUDGE_PROMPT
      .replace('{question}', question)
      .replace('{expected_answer}', expected)
      .replace('{model_response}', response)
  }

  // Parse judge output to extract score and explanation
  const parseJudgeOutput = (output) => {
    const lines = output.trim().split('\n')
    const firstLine = lines[0].trim()

    // Try standalone number
    if (/^[1-5]$/.test(firstLine)) {
      return {
        score: parseInt(firstLine),
        explanation: lines.slice(1).join('\n').trim()
      }
    }

    // Try "Rating: N" pattern
    const ratingMatch = output.match(/[Rr]ating[:\s]+([1-5])/i)
    if (ratingMatch) {
      return {
        score: parseInt(ratingMatch[1]),
        explanation: output.substring(output.indexOf(ratingMatch[0]) + ratingMatch[0].length).trim()
      }
    }

    // Try any number 1-5 in first 50 chars
    const numMatch = output.slice(0, 50).match(/[1-5]/)
    if (numMatch) {
      return {
        score: parseInt(numMatch[0]),
        explanation: output
      }
    }

    // Default to 3 if parsing fails
    return { score: 3, explanation: output }
  }

  // Run evaluation via RunPod judge endpoint
  const runEvaluation = async () => {
    if (!modelResponses.length) {
      showAlert('Load model responses first')
      return
    }

    if (!evalConfig.judgeEndpoint || !evalConfig.judgeApiKey) {
      showAlert('Configure judge endpoint and API key first')
      return
    }

    setEvalProgress({ current: 0, total: modelResponses.length, status: 'running' })
    const results = []

    for (let i = 0; i < modelResponses.length; i++) {
      const item = modelResponses[i]
      setEvalProgress({ current: i + 1, total: modelResponses.length, status: 'running' })

      try {
        // Create judge prompt
        const prompt = createJudgePrompt(
          item.question,
          item.expected_answer,
          item.model_response
        )

        // Call judge endpoint
        const response = await fetch(`https://api.runpod.ai/v2/${evalConfig.judgeEndpoint}/runsync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${evalConfig.judgeApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: {
              prompt: prompt,
              max_tokens: 500,
              temperature: 0.1
            }
          })
        })

        const data = await response.json()
        const judgeOutput = data.output?.response || data.output?.text || data.output || ''

        const { score, explanation } = parseJudgeOutput(judgeOutput)
        const normalizedScore = (score - 1) / 4 // Map 1-5 to 0-1

        results.push({
          ...item,
          _evalScore: normalizedScore,
          _rawScore: score,
          _evalExplanation: explanation,
          _status: normalizedScore < evalConfig.scoreThreshold ? 'flagged' : 'passed',
          _evaluatedAt: new Date().toISOString()
        })
      } catch (err) {
        console.error(`Evaluation error for item ${i}:`, err)
        results.push({
          ...item,
          _evalScore: 0,
          _rawScore: 1,
          _evalExplanation: `Error: ${err.message}`,
          _status: 'error',
          _evaluatedAt: new Date().toISOString()
        })
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 100))
    }

    setEvalResults(results)
    setEvalProgress({ current: modelResponses.length, total: modelResponses.length, status: 'complete' })
    onSaveNotification?.(`Evaluation complete: ${results.filter(r => r._status === 'flagged').length} items flagged`)
  }

  // Export evaluation results
  const exportResults = () => {
    if (!evalResults.length) {
      showAlert('No evaluation results to export')
      return
    }

    const jsonl = evalResults.map(item => JSON.stringify(item)).join('\n')
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eval_results_${new Date().toISOString().slice(0, 10)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Calculate statistics
  const stats = evalResults.length > 0 ? {
    total: evalResults.length,
    avgScore: (evalResults.reduce((sum, r) => sum + (r._evalScore || 0), 0) / evalResults.length).toFixed(3),
    flagged: evalResults.filter(r => r._status === 'flagged').length,
    passed: evalResults.filter(r => r._status === 'passed').length,
    errors: evalResults.filter(r => r._status === 'error').length,
    scoreDistribution: [1, 2, 3, 4, 5].map(s => evalResults.filter(r => r._rawScore === s).length)
  } : null

  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Evaluation</h2>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => responseFileRef.current?.click()}
          >
            <Icons.Upload />
            <span>Load Responses</span>
          </button>
          <input
            ref={responseFileRef}
            type="file"
            accept=".json,.jsonl"
            onChange={handleLoadResponses}
            style={{ display: 'none' }}
            aria-label="Upload model responses file"
          />
          <button
            className="btn btn-primary"
            onClick={exportResults}
            disabled={!evalResults.length}
          >
            <Icons.Download />
            <span>Export Results</span>
          </button>
        </div>
      </div>

      <div className="config-panels">
        {/* Judge Configuration */}
        <div className="glass-card config-panel">
          <h3>Judge Configuration</h3>
          <div className="config-form">
            <div className="form-field">
              <label htmlFor="judge-endpoint">Judge Endpoint ID</label>
              <input
                id="judge-endpoint"
                type="text"
                value={evalConfig.judgeEndpoint}
                onChange={(e) => setEvalConfig({ ...evalConfig, judgeEndpoint: e.target.value })}
                placeholder="RunPod endpoint for judge model"
              />
            </div>
            <div className="form-field">
              <label htmlFor="judge-api-key">Judge API Key</label>
              <input
                id="judge-api-key"
                type="password"
                value={evalConfig.judgeApiKey}
                onChange={(e) => setEvalConfig({ ...evalConfig, judgeApiKey: e.target.value })}
                placeholder="RunPod API key"
              />
            </div>
            <div className="form-field">
              <label htmlFor="score-threshold">Flag Threshold (0-1)</label>
              <input
                id="score-threshold"
                type="number"
                value={evalConfig.scoreThreshold}
                onChange={(e) => setEvalConfig({ ...evalConfig, scoreThreshold: parseFloat(e.target.value) || 0.7 })}
                min="0"
                max="1"
                step="0.1"
              />
            </div>
          </div>
        </div>

        {/* Evaluation Status */}
        <div className="glass-card config-panel">
          <h3>Evaluation Status</h3>
          <div className="eval-status">
            <p className="status-line">
              <span>Responses Loaded:</span>
              <strong>{modelResponses.length}</strong>
            </p>
            {evalProgress.status && (
              <div className="progress-section compact">
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{ width: evalProgress.total ? `${(evalProgress.current / evalProgress.total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="progress-text">
                  {evalProgress.current}/{evalProgress.total} ({evalProgress.status})
                </span>
              </div>
            )}
            <button
              className={`btn btn-start${evalProgress.status === 'running' ? ' btn-loading' : ''}`}
              onClick={runEvaluation}
              disabled={!modelResponses.length || evalProgress.status === 'running'}
            >
              <Icons.Play />
              <span>{evalProgress.status === 'running' ? 'Evaluating...' : 'Run Evaluation'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <>
          <div className="stats-row">
            <div className="glass-card stat-card">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Evaluated</span>
            </div>
            <div className="glass-card stat-card">
              <span className="stat-value">{stats.avgScore}</span>
              <span className="stat-label">Average Score</span>
            </div>
            <div className="glass-card stat-card">
              <span className="stat-value success">{stats.passed}</span>
              <span className="stat-label">Passed</span>
            </div>
            <div className="glass-card stat-card">
              <span className="stat-value warning">{stats.flagged}</span>
              <span className="stat-label">Flagged</span>
            </div>
          </div>

          {/* Score Distribution */}
          <div className="glass-card">
            <h3>Score Distribution</h3>
            <div className="score-distribution">
              {[1, 2, 3, 4, 5].map((score, i) => (
                <div key={score} className="score-bar">
                  <span className="score-label">{score}</span>
                  <div className="bar-container">
                    <div
                      className={`bar ${score <= 2 ? 'error' : score === 3 ? 'warning' : 'success'}`}
                      style={{ width: `${stats.total ? (stats.scoreDistribution[i] / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="bar-count">{stats.scoreDistribution[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Sample Results Preview */}
      {evalResults.length > 0 && (
        <div className="glass-card">
          <h3>Recent Results (Last 5)</h3>
          <div className="results-list">
            {evalResults.slice(-5).reverse().map((item, i) => (
              <div key={i} className={`result-item ${item._status}`}>
                <div className="result-header">
                  <span className={`status-badge status-${item._status}`}>
                    {item._status.toUpperCase()}
                  </span>
                  <span className="score">Score: {item._rawScore}/5</span>
                </div>
                <div className="result-question">{item.question?.slice(0, 100)}...</div>
                <div className="result-explanation">{item._evalExplanation?.slice(0, 150)}...</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {evalDialog}
    </div>
  )
}

// ============================================
// METRICS SECTION (with Flagged Review)
// ============================================

function MetricsSection({
  jobHistory,
  evalResults,
  setEvalResults,
  onSaveNotification
}) {
  const { dialog: metricsDialog, showAlert } = useDialog()
  const [viewMode, setViewMode] = useState('overview') // 'overview' | 'flagged'
  const [flaggedIndex, setFlaggedIndex] = useState(0)
  const [editedCorrection, setEditedCorrection] = useState('')
  const correctionRef = useRef(null)

  // Get flagged items
  const flaggedItems = evalResults.filter(r => r._status === 'flagged' || r._status === 'corrected')

  // Current flagged item
  const currentFlagged = flaggedItems[flaggedIndex]

  // Handle correction save
  const handleSaveCorrection = () => {
    if (!currentFlagged || !editedCorrection.trim()) return

    const updated = evalResults.map(item => {
      if (item._id === currentFlagged._id) {
        return {
          ...item,
          _correctedAnswer: editedCorrection,
          _status: 'corrected'
        }
      }
      return item
    })

    setEvalResults(updated)
    onSaveNotification?.('Correction saved')

    // Move to next flagged item
    if (flaggedIndex < flaggedItems.length - 1) {
      setFlaggedIndex(i => i + 1)
      setEditedCorrection('')
    }
  }

  // Accept item as-is (dismiss flag)
  const handleAcceptAsIs = () => {
    if (!currentFlagged) return

    const updated = evalResults.map(item => {
      if (item._id === currentFlagged._id) {
        return { ...item, _status: 'accepted' }
      }
      return item
    })

    setEvalResults(updated)

    if (flaggedIndex < flaggedItems.length - 1) {
      setFlaggedIndex(i => i + 1)
    } else if (flaggedIndex > 0) {
      setFlaggedIndex(i => i - 1)
    }
  }

  // Reject item completely
  const handleRejectItem = () => {
    if (!currentFlagged) return

    const updated = evalResults.map(item => {
      if (item._id === currentFlagged._id) {
        return { ...item, _status: 'rejected' }
      }
      return item
    })

    setEvalResults(updated)

    if (flaggedIndex < flaggedItems.length - 1) {
      setFlaggedIndex(i => i + 1)
    } else if (flaggedIndex > 0) {
      setFlaggedIndex(i => i - 1)
    }
  }

  // Export corrections for retraining
  const exportCorrections = () => {
    const corrected = evalResults.filter(r => r._status === 'corrected')
    if (!corrected.length) {
      showAlert('No corrections to export')
      return
    }

    // Format as ShareGPT for retraining
    const exportData = corrected.map(item => ({
      messages: [
        { role: 'user', content: item.question },
        { role: 'assistant', content: item._correctedAnswer }
      ]
    }))

    const jsonl = exportData.map(item => JSON.stringify(item)).join('\n')
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `corrections_${new Date().toISOString().slice(0, 10)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)

    onSaveNotification?.(`Exported ${corrected.length} corrections`)
  }

  // Enter edit mode when viewing a new flagged item
  useEffect(() => {
    if (currentFlagged) {
      setEditedCorrection(currentFlagged._correctedAnswer || currentFlagged.expected_answer || '')
    }
  }, [flaggedIndex, currentFlagged])

  return (
    <div className="section-content">
      <div className="section-header">
        <h2>Metrics & Review</h2>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'overview' ? 'active' : ''}`}
              onClick={() => setViewMode('overview')}
            >
              Overview
            </button>
            <button
              className={`toggle-btn ${viewMode === 'flagged' ? 'active' : ''}`}
              onClick={() => setViewMode('flagged')}
            >
              Flagged Review ({flaggedItems.length})
            </button>
          </div>
          {viewMode === 'flagged' && (
            <button
              className="btn btn-primary"
              onClick={exportCorrections}
              disabled={!evalResults.filter(r => r._status === 'corrected').length}
            >
              <Icons.Download />
              <span>Export Corrections</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'overview' ? (
        <>
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

          {/* Evaluation Summary */}
          {evalResults.length > 0 && (
            <div className="stats-row">
              <div className="glass-card stat-card">
                <span className="stat-value">{evalResults.length}</span>
                <span className="stat-label">Evaluated</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-value success">{evalResults.filter(r => r._status === 'passed' || r._status === 'accepted').length}</span>
                <span className="stat-label">Passed</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-value warning">{evalResults.filter(r => r._status === 'flagged').length}</span>
                <span className="stat-label">Need Review</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-value">{evalResults.filter(r => r._status === 'corrected').length}</span>
                <span className="stat-label">Corrected</span>
              </div>
            </div>
          )}

          <div className="glass-card jobs-panel">
            <h3>Job History</h3>
            {jobHistory.length > 0 ? (
              <div className="job-list">
                {jobHistory.map((job, i) => (
                  <div key={i} className={`job-card ${job.status.toLowerCase().replace('_', '-')}`}>
                    <div className="job-header">
                      <span className="job-id">{job.id?.slice(0, 12) || 'Unknown'}</span>
                      <span className={`job-status ${job.status.toLowerCase()}`}>
                        {(job.status === 'IN_PROGRESS' || job.status === 'IN_QUEUE') && <Icons.Spinner />}
                        {job.status}
                      </span>
                    </div>
                    <TrainingSpinner status={job.status} />
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
                <div className="no-data-icon">
                  <Icons.BarChart />
                </div>
                <p>No training jobs yet</p>
                <p className="hint">Start a training job to see metrics here</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Flagged Review Mode */
        <div className="flagged-review">
          {flaggedItems.length > 0 ? (
            <>
              <div className="progress-section">
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${((flaggedIndex + 1) / flaggedItems.length) * 100}%`
                    }}
                  />
                </div>
                <span className="progress-text">
                  {flaggedIndex + 1} of {flaggedItems.length} flagged items
                </span>
              </div>

              <div className="glass-card preview-card">
                <div className="preview-header">
                  <span className={`status-badge status-${currentFlagged?._status}`}>
                    {currentFlagged?._status?.toUpperCase()}
                  </span>
                  <span className="score-display">
                    Score: {currentFlagged?._rawScore}/5 ({((currentFlagged?._evalScore || 0) * 100).toFixed(0)}%)
                  </span>
                </div>

                <div className="preview-field">
                  <label>Question</label>
                  <div className="field-content">{currentFlagged?.question || '-'}</div>
                </div>

                <div className="preview-field">
                  <label>
                    <Icons.X /> Model Response (Flagged)
                  </label>
                  <div className="field-content flagged-response">
                    {currentFlagged?.model_response || '-'}
                  </div>
                </div>

                <div className="preview-field">
                  <label>Expected Answer</label>
                  <div className="field-content expected">{currentFlagged?.expected_answer || '-'}</div>
                </div>

                <div className="preview-field">
                  <label>Judge Explanation</label>
                  <div className="field-content explanation">{currentFlagged?._evalExplanation || '-'}</div>
                </div>

                <div className="preview-field">
                  <label>
                    <Icons.Edit /> Your Correction
                  </label>
                  <textarea
                    ref={correctionRef}
                    className="field-content answer editable"
                    value={editedCorrection}
                    onChange={(e) => setEditedCorrection(e.target.value)}
                    placeholder="Enter the corrected answer..."
                  />
                </div>
              </div>

              <div className="action-buttons">
                <button className="btn btn-accept" onClick={handleSaveCorrection}>
                  <Icons.Check />
                  <span>Save Correction</span>
                </button>
                <button className="btn btn-secondary" onClick={handleAcceptAsIs}>
                  <span>Accept As-Is</span>
                </button>
                <button className="btn btn-reject" onClick={handleRejectItem}>
                  <Icons.X />
                  <span>Reject</span>
                </button>
              </div>

              <div className="navigation-controls">
                <button
                  className="btn btn-nav"
                  onClick={() => setFlaggedIndex(i => Math.max(0, i - 1))}
                  disabled={flaggedIndex === 0}
                >
                  <Icons.ChevronLeft />
                  <span>Previous</span>
                </button>
                <span className="nav-counter">
                  {flaggedIndex + 1} of {flaggedItems.length}
                </span>
                <button
                  className="btn btn-nav"
                  onClick={() => setFlaggedIndex(i => Math.min(flaggedItems.length - 1, i + 1))}
                  disabled={flaggedIndex >= flaggedItems.length - 1}
                >
                  <span>Next</span>
                  <Icons.ChevronRight />
                </button>
              </div>
            </>
          ) : (
            <div className="no-data-message">
              <div className="no-data-icon">
                <Icons.Flag />
              </div>
              <p>No flagged items to review</p>
              <p className="hint">Run evaluation to identify items that need review</p>
            </div>
          )}
        </div>
      )}
      {metricsDialog}
    </div>
  )
}

// ============================================
// TOAST NOTIFICATION COMPONENT
// ============================================

function Toast({ message, onClose }) {
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setClosing(true), 2600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (closing) {
      const timer = setTimeout(onClose, 400)
      return () => clearTimeout(timer)
    }
  }, [closing, onClose])

  const handleClose = () => {
    setClosing(true)
  }

  return (
    <div className={`toast ${closing ? 'toast-exit' : ''}`} role="alert" aria-live="polite">
      <span>{message}</span>
      <button onClick={handleClose} aria-label="Close notification">&times;</button>
    </div>
  )
}

// ============================================
// DOCS SECTION
// ============================================

function DocsSection() {
  const [activeDoc, setActiveDoc] = useState(null)

  const docs = [
    {
      id: 'executive',
      title: 'Executive Summary',
      subtitle: 'What MagisAI Training Hub is and how it works',
      icon: '📋'
    },
    {
      id: 'guide',
      title: 'User Guide',
      subtitle: 'Detailed instructions for every feature',
      icon: '📖'
    },
    {
      id: 'versions',
      title: 'Version History',
      subtitle: 'Docker image changes and bug fixes',
      icon: '🔄'
    }
  ]

  if (activeDoc) {
    return (
      <div className="docs-section">
        <div className="section-header">
          <h2>Documentation</h2>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setActiveDoc(null)}>
              <Icons.ChevronLeft /> Back
            </button>
          </div>
        </div>
        <div className="docs-reader glass-card">
          {activeDoc === 'executive' && <ExecutiveSummaryDoc />}
          {activeDoc === 'guide' && <UserGuideDoc />}
          {activeDoc === 'versions' && <VersionHistoryDoc />}
        </div>
      </div>
    )
  }

  return (
    <div className="docs-section">
      <div className="section-header">
        <h2>Documentation</h2>
      </div>
      <div className="docs-grid">
        {docs.map(doc => (
          <button
            key={doc.id}
            className="docs-card glass-card"
            onClick={() => setActiveDoc(doc.id)}
          >
            <span className="docs-card-icon">{doc.icon}</span>
            <div className="docs-card-text">
              <h3>{doc.title}</h3>
              <p>{doc.subtitle}</p>
            </div>
            <Icons.ChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}

function ExecutiveSummaryDoc() {
  return (
    <article className="docs-content">
      <h2>MagisAI Training Hub</h2>
      <p className="docs-lead">A desktop application that helps you create a custom AI assistant specialized in theological Q&A with a human-in-the-loop approach.</p>

      <h3>The Problem It Solves</h3>
      <ul>
        <li><strong>Generic AI models make mistakes</strong> on specialized theological topics</li>
        <li><strong>Fully automated training</strong> can amplify errors without human oversight</li>
      </ul>

      <h3>How It Works (5 Steps)</h3>
      <div className="docs-steps">
        <div className="docs-step">
          <span className="docs-step-num">1</span>
          <div>
            <strong>Import Your Q&A Data</strong>
            <p>Load theological Q&A pairs from CSV or PDF files.</p>
          </div>
        </div>
        <div className="docs-step">
          <span className="docs-step-num">2</span>
          <div>
            <strong>Human Review</strong>
            <p>A reviewer examines each pair: Accept, Reject, or Edit.</p>
          </div>
        </div>
        <div className="docs-step">
          <span className="docs-step-num">3</span>
          <div>
            <strong>Prepare Training Data</strong>
            <p>Format approved data using RAFT for citation-based responses.</p>
          </div>
        </div>
        <div className="docs-step">
          <span className="docs-step-num">4</span>
          <div>
            <strong>Train on Cloud GPUs</strong>
            <p>Training runs on RunPod. Click "Start Training" and the app handles everything.</p>
          </div>
        </div>
        <div className="docs-step">
          <span className="docs-step-num">5</span>
          <div>
            <strong>Review & Improve</strong>
            <p>Low-scoring answers are flagged for review, creating a continuous improvement loop.</p>
          </div>
        </div>
      </div>

      <h3>Key Benefits</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Benefit</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>Quality Control</td><td>Humans approve all training data before AI learns</td></tr>
            <tr><td>No GPU Required</td><td>Training runs on cloud GPUs (RunPod)</td></tr>
            <tr><td>Continuous Improvement</td><td>AI mistakes get corrected and fed back</td></tr>
            <tr><td>Cost Effective</td><td>Pay only for GPU time (~$0.50-2/hour)</td></tr>
            <tr><td>Specialized Knowledge</td><td>AI understands theological nuances</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Technical Overview</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Component</th><th>Technology</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td>Web App</td><td>React + Vite</td><td>User interface</td></tr>
            <tr><td>Base Models</td><td>Qwen 2.5 (7B-14B)</td><td>Starting point for training</td></tr>
            <tr><td>Training</td><td>LoRA / QLoRA</td><td>Efficient fine-tuning</td></tr>
            <tr><td>Cloud GPUs</td><td>RunPod Serverless</td><td>Remote training</td></tr>
            <tr><td>Vector DB</td><td>Weaviate</td><td>RAFT distractors</td></tr>
          </tbody>
        </table>
      </div>

      <h3>What is LoRA?</h3>
      <p>Instead of retraining the entire AI model, LoRA trains a small "adapter" layer (~1-5% of parameters). This means faster training, lower cost ($5-20 per run), and less memory needed.</p>

      <h3>What is RAFT?</h3>
      <p>RAFT (Retrieval-Augmented Fine-Tuning) trains the AI to read multiple documents, identify relevant ones, extract and cite information, and explain reasoning step-by-step.</p>

      <h3>Cost Estimate</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Item</th><th>Cost</th><th>Frequency</th></tr></thead>
          <tbody>
            <tr><td>RunPod GPU (A6000)</td><td>~$0.79/hour</td><td>Per training session</td></tr>
            <tr><td>Typical training run</td><td>~$5-15</td><td>Per 1000 Q&A pairs</td></tr>
            <tr><td>Weaviate Cloud</td><td>Free tier</td><td>Monthly</td></tr>
            <tr><td>Software</td><td>Free (open source)</td><td>One-time setup</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  )
}

function UserGuideDoc() {
  return (
    <article className="docs-content">
      <h2>User Guide</h2>
      <p className="docs-lead">Complete guide to using MagisAI Training Hub for human-in-the-loop AI training.</p>

      <h3>Tab 1: Data Review</h3>
      <h4>Loading Data</h4>
      <ul>
        <li><strong>From CSV:</strong> Click "Load Data" and select your CSV file with Question/Answer columns</li>
        <li><strong>From JSON:</strong> Click "Resume" to load a previously saved session</li>
      </ul>

      <h4>Reviewing Q&A Pairs</h4>
      <div className="docs-table">
        <table>
          <thead><tr><th>Action</th><th>Button</th><th>Keyboard</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td>Accept</td><td>Green &#10003;</td><td>A</td><td>Mark as good for training</td></tr>
            <tr><td>Reject</td><td>Red &#10007;</td><td>R</td><td>Exclude from training</td></tr>
            <tr><td>Edit</td><td>Blue &#9998;</td><td>E</td><td>Modify the answer text</td></tr>
            <tr><td>Previous</td><td>&#8592;</td><td>Left Arrow</td><td>Go to previous pair</td></tr>
            <tr><td>Next</td><td>&#8594;</td><td>Right Arrow</td><td>Go to next pair</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Tab 2: Training</h3>
      <h4>Step 1: Connect to RunPod</h4>
      <p>Click "Connect" in the RunPod section and wait for the green "Connected" status.</p>

      <h4>Step 2: Prepare Training Data</h4>
      <ul>
        <li><strong>Prepare from Curated:</strong> Click "Prepare RAFT Data" to format accepted Q&A pairs</li>
        <li><strong>Load Existing:</strong> Select a previously prepared .jsonl file</li>
      </ul>

      <h4>Step 3: Configure Training</h4>
      <div className="docs-table">
        <table>
          <thead><tr><th>Parameter</th><th>Default</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>Training Type</td><td>SFT</td><td>SFT, RAFT, or DPO</td></tr>
            <tr><td>Learning Rate</td><td>2e-5</td><td>How fast the model learns</td></tr>
            <tr><td>Epochs</td><td>3</td><td>Passes through data</td></tr>
            <tr><td>Batch Size</td><td>4</td><td>Samples per step</td></tr>
            <tr><td>LoRA Rank</td><td>16</td><td>Adapter capacity</td></tr>
            <tr><td>LoRA Alpha</td><td>32</td><td>Scaling factor</td></tr>
            <tr><td>Max Seq Length</td><td>2048</td><td>Max token length</td></tr>
          </tbody>
        </table>
      </div>

      <h4>Step 4: Start Training</h4>
      <p>Click "Start Training", confirm the dialog, and monitor progress via the spinner and console output.</p>

      <h3>Tab 3: Metrics & Evaluation</h3>
      <h4>Score Colors</h4>
      <div className="docs-table">
        <table>
          <thead><tr><th>Color</th><th>Score</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><span className="docs-score docs-score-red">Red</span></td><td>&lt; 0.4</td><td>Poor quality</td></tr>
            <tr><td><span className="docs-score docs-score-orange">Orange</span></td><td>0.4 - 0.6</td><td>Needs improvement</td></tr>
            <tr><td><span className="docs-score docs-score-yellow">Yellow</span></td><td>0.6 - 0.8</td><td>Acceptable</td></tr>
            <tr><td><span className="docs-score docs-score-green">Green</span></td><td>&gt; 0.8</td><td>Good quality</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Keyboard Shortcuts</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Key</th><th>Action</th><th>Tab</th></tr></thead>
          <tbody>
            <tr><td><kbd>A</kbd></td><td>Accept current Q&A</td><td>Data Review</td></tr>
            <tr><td><kbd>R</kbd></td><td>Reject current Q&A</td><td>Data Review</td></tr>
            <tr><td><kbd>E</kbd></td><td>Edit current answer</td><td>Data Review</td></tr>
            <tr><td><kbd>&#8592;</kbd></td><td>Previous Q&A</td><td>Data Review</td></tr>
            <tr><td><kbd>&#8594;</kbd></td><td>Next Q&A</td><td>Data Review</td></tr>
            <tr><td><kbd>Ctrl+S</kbd></td><td>Save session</td><td>Data Review</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Troubleshooting</h3>
      <div className="docs-troubleshoot">
        <div className="docs-trouble-item">
          <strong>"RunPod API key not configured"</strong>
          <p>Add <code>RUNPOD_API_KEY=your_key</code> to your .env file</p>
        </div>
        <div className="docs-trouble-item">
          <strong>"No endpoints found"</strong>
          <p>Create a serverless endpoint in RunPod dashboard first</p>
        </div>
        <div className="docs-trouble-item">
          <strong>"Job stuck in IN_QUEUE"</strong>
          <p>Check if your RunPod endpoint has available workers (cold start may be needed)</p>
        </div>
        <div className="docs-trouble-item">
          <strong>Training fails immediately</strong>
          <p>Check console output and verify endpoint uses correct Docker image</p>
        </div>
        <div className="docs-trouble-item">
          <strong>Out of memory</strong>
          <p>Reduce batch size, sequence length, or use a smaller model</p>
        </div>
        <div className="docs-trouble-item">
          <strong>"No space left on device"</strong>
          <p>Create a 100GB Network Volume in RunPod and attach to your endpoint</p>
        </div>
      </div>
    </article>
  )
}

function VersionHistoryDoc() {
  return (
    <article className="docs-content">
      <h2>Version History</h2>
      <p className="docs-lead">Docker image versions and change log for the RunPod serverless handler.</p>

      <h3>Docker Image Versions</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Version</th><th>Date</th><th>Status</th><th>Key Change</th></tr></thead>
          <tbody>
            <tr><td>v7</td><td>2026-01-18</td><td><span className="docs-badge docs-badge-current">Current</span></td><td>DataCollator, data validation, truncation</td></tr>
            <tr><td>v6</td><td>2026-01-18</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>padding_side fix, EOS token, debug logging</td></tr>
            <tr><td>v5</td><td>2026-01-18</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>Message-to-text conversion, all-linear targets</td></tr>
            <tr><td>v4</td><td>2026-01-18</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>Pinned requirements, memory optimizations</td></tr>
            <tr><td>v3</td><td>2026-01-17</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>Removed autoawq</td></tr>
            <tr><td>v2</td><td>2026-01-17</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>SFTConfig parameter fix</td></tr>
            <tr><td>v1</td><td>2026-01-16</td><td><span className="docs-badge docs-badge-deprecated">Deprecated</span></td><td>Initial release</td></tr>
          </tbody>
        </table>
      </div>

      <h3>v7 (Current)</h3>
      <p><strong>Fixes tokenization/batching errors</strong></p>
      <ul>
        <li>Added DataCollatorForLanguageModeling for proper batch padding</li>
        <li>Added truncation_side = "left" to keep assistant responses</li>
        <li>Data validation loop ensures all text fields are strings</li>
        <li>Handles nested lists by flattening, filters empty samples</li>
      </ul>

      <h3>v6</h3>
      <p><strong>Fixes training loss=0 issue</strong></p>
      <ul>
        <li>padding_side = "right" (required for causal LM)</li>
        <li>EOS token at end of each training sample</li>
        <li>Changed warmup_ratio → warmup_steps=10</li>
        <li>Debug logging (sample preview, token count)</li>
      </ul>

      <h3>v5</h3>
      <p><strong>Message format conversion</strong></p>
      <ul>
        <li>Automatic conversion from chat messages to text</li>
        <li>target_modules="all-linear"</li>
        <li>Gradient checkpointing, eager attention</li>
      </ul>

      <h3>Bug Fix History</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>Issue</th><th>Error</th><th>Solution</th></tr></thead>
          <tbody>
            <tr><td>GraphQL query</td><td>400 Bad Request</td><td>Removed serverlessDiscount field</td></tr>
            <tr><td>API URL</td><td>404 Not Found</td><td>api.runpod.io → api.runpod.ai</td></tr>
            <tr><td>AWQ model</td><td>Loading requires auto-awq</td><td>Use non-AWQ models</td></tr>
            <tr><td>Disk space</td><td>No space left</td><td>100GB Network Volume</td></tr>
            <tr><td>Dataset</td><td>KeyError: 'text'</td><td>Message-to-text conversion</td></tr>
            <tr><td>Training</td><td>loss: 0.0</td><td>padding_side, EOS fixes</td></tr>
            <tr><td>Batching</td><td>Excessive nesting</td><td>DataCollator, validation</td></tr>
          </tbody>
        </table>
      </div>

      <h3>TRL API Compatibility</h3>
      <div className="docs-table">
        <table>
          <thead><tr><th>TRL Version</th><th>max_seq_length</th><th>tokenizer</th></tr></thead>
          <tbody>
            <tr><td>0.8.x</td><td>SFTTrainer</td><td>tokenizer=</td></tr>
            <tr><td>0.9.x</td><td>SFTConfig</td><td>tokenizer=</td></tr>
            <tr><td>0.10+</td><td>SFTConfig</td><td>processing_class=</td></tr>
          </tbody>
        </table>
      </div>

      <h3>How to Update Docker Image</h3>
      <div className="docs-code">
        <code>
          cd server<br/>
          docker build -t matvg621/magisai-training:v8 .<br/>
          docker push matvg621/magisai-training:v8
        </code>
      </div>
      <p>Always increment the version number to ensure RunPod pulls the new image.</p>
    </article>
  )
}

// ============================================
// MAIN APP
// ============================================

function App() {
  const { theme, toggleTheme } = useTheme()
  const [activeSection, setActiveSection] = useState('data')
  const [connected, setConnected] = useState(false)
  const [runpodConnecting, setRunpodConnecting] = useState(false)
  const [runpodError, setRunpodError] = useState(null)
  const [trainingData, setTrainingData] = useState([])
  const [dataFormat, setDataFormat] = useState('sharegpt')
  const [consoleOutput, setConsoleOutput] = useState([])
  const [toastMessage, setToastMessage] = useState(null)
  const [jobHistory, setJobHistory] = useState(() => {
    const saved = localStorage.getItem('job_history')
    return saved ? JSON.parse(saved) : []
  })

  // RAFT configuration
  const [raftConfig, setRaftConfig] = useState({
    numDistractors: 3,
    oracleProbability: 0.8
  })

  // Weaviate configuration - loaded from environment variables
  const [weaviateConfig] = useState({
    url: import.meta.env.VITE_WEAVIATE_URL || '',
    apiKey: import.meta.env.VITE_WEAVIATE_API_KEY || '',
    collection: import.meta.env.VITE_WEAVIATE_COLLECTION || 'MagisDocuments'
  })

  // RunPod configuration - loaded from environment variables
  const runpodConfig = {
    apiKey: import.meta.env.VITE_RUNPOD_API_KEY || '',
    endpointId: import.meta.env.VITE_RUNPOD_ENDPOINT_ID || ''
  }

  // Evaluation state
  const [evalConfig, setEvalConfig] = useState({
    scoreThreshold: 0.7,
    judgeEndpoint: localStorage.getItem('judge_endpoint') || '',
    judgeApiKey: localStorage.getItem('judge_api_key') || ''
  })
  const [evalResults, setEvalResults] = useState([])
  const [modelResponses, setModelResponses] = useState([])
  const [evalProgress, setEvalProgress] = useState({ current: 0, total: 0, status: '' })

  // Save eval config to localStorage
  useEffect(() => {
    localStorage.setItem('judge_endpoint', evalConfig.judgeEndpoint)
    localStorage.setItem('judge_api_key', evalConfig.judgeApiKey)
  }, [evalConfig.judgeEndpoint, evalConfig.judgeApiKey])

  const showToast = useCallback((message) => {
    setToastMessage(message)
  }, [])

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
    setRunpodConnecting(true)
    setRunpodError(null)

    try {
      const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })

      if (response.ok) {
        setConnected(true)
        setRunpodError(null)
        log('Connected to RunPod successfully!')
      } else {
        log(`Connection failed: ${response.status}`)
        setConnected(false)
        setRunpodError(`Status ${response.status}`)
      }
    } catch (err) {
      log(`Connection error: ${err.message}`)
      setConnected(false)
      setRunpodError(err.message)
    } finally {
      setRunpodConnecting(false)
    }
  }

  const handleStartTraining = async () => {
    if (!connected || !trainingData.length) return

    const acceptedItems = trainingData.filter(
      item => item._status === 'accepted' || item._status === 'edited'
    )

    if (!acceptedItems.length) {
      log('No accepted training data. Accept items in Data Review first.')
      return
    }

    log('Starting training job...')
    log(`Model: ${config.base_model}`)
    log(`Method: ${config.method}`)
    log(`Samples: ${acceptedItems.length}`)

    const jobId = `job_${Date.now()}`
    const newJob = {
      id: jobId,
      status: 'IN_QUEUE',
      model: config.base_model,
      samples: acceptedItems.length,
      startTime: new Date().toLocaleString()
    }

    setJobHistory(prev => {
      const updated = [newJob, ...prev]
      localStorage.setItem('job_history', JSON.stringify(updated))
      return updated
    })

    try {
      // Clean data for API
      const cleanData = acceptedItems.map(({ _id, _status, ...rest }) => rest)

      const response = await fetch(`https://api.runpod.ai/v2/${endpointIdRef.current}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeyRef.current}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: {
            base_model: config.base_model,
            training_data: cleanData,
            config: {
              method: config.method,
              num_epochs: config.num_epochs,
              learning_rate: parseFloat(config.learning_rate),
              batch_size: config.batch_size,
              gradient_accumulation_steps: config.gradient_accumulation_steps,
              max_seq_length: config.max_seq_length,
              lora_r: config.lora_r,
              lora_alpha: config.lora_alpha,
              use_raft: dataFormat === 'raft',
              hub_token: import.meta.env.VITE_HF_TOKEN || '',
              hub_model_id: config.hub_model_id || ''
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
    <>
      <Starfield theme={theme} />
      <div className="app">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          connected={connected}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        <main className="main-content">
          {activeSection === 'data' && (
            <DataReviewSection
              trainingData={trainingData}
              setTrainingData={setTrainingData}
              onSaveNotification={showToast}
            />
          )}
          {activeSection === 'training' && (
            <TrainingSection
              config={config}
              setConfig={setConfig}
              trainingData={trainingData}
              connected={connected}
              runpodConnecting={runpodConnecting}
              runpodError={runpodError}
              onConnect={handleConnect}
              onStartTraining={handleStartTraining}
              consoleOutput={consoleOutput}
              dataFormat={dataFormat}
              raftConfig={raftConfig}
              setRaftConfig={setRaftConfig}
              weaviateConfig={weaviateConfig}
              runpodConfig={runpodConfig}
              onSaveNotification={showToast}
            />
          )}
          {activeSection === 'evaluate' && (
            <EvaluateSection
              evalConfig={evalConfig}
              setEvalConfig={setEvalConfig}
              evalResults={evalResults}
              setEvalResults={setEvalResults}
              modelResponses={modelResponses}
              setModelResponses={setModelResponses}
              evalProgress={evalProgress}
              setEvalProgress={setEvalProgress}
              onSaveNotification={showToast}
            />
          )}
          {activeSection === 'metrics' && (
            <MetricsSection
              jobHistory={jobHistory}
              evalResults={evalResults}
              setEvalResults={setEvalResults}
              onSaveNotification={showToast}
            />
          )}
          {activeSection === 'docs' && (
            <DocsSection />
          )}
        </main>
      </div>
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </>
  )
}

export default App
