import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const PlayIcon = () => <span>▶</span>
const PauseIcon = () => <span>⏸</span>
const PrevIcon = () => <span>⏮</span>
const NextIcon = () => <span>⏭</span>
const ShuffleIcon = ({active}) => <span style={{color: active ? '#c084fc' : 'inherit'}}>🔀</span>
const RepeatIcon = ({active}) => <span style={{color: active ? '#c084fc' : 'inherit'}}>🔁</span>
const VolHighIcon = () => <span>🔊</span>
const VolLowIcon = () => <span>🔉</span>
const VolMuteIcon = () => <span>🔇</span>
const MusicIcon = () => <span>🎵</span>
const LoaderIcon = () => <span className="spin">⟳</span>

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec < 10 ? '0'+sec : sec}`
}
function getFileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Unknown')
      .replace(/\.mp3$|\.wav$|\.ogg$|\.flac$/i, '')
      .replace(/[_-]/g, ' ')
  } catch { return 'Unknown' }
}

function Visualizer({ isPlaying }) {
  const bars = Array.from({length: 18}, (_, i) => i)
  const [heights, setHeights] = useState(bars.map(() => 4))
  const rafRef = useRef()

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setHeights(bars.map(() => 4))
      return
    }
    let last = 0
    const animate = (t) => {
      if (t - last > 90) {
        setHeights(bars.map(() => Math.floor(Math.random() * 18) + 4))
        last = t
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  return (
    <div className="visualizer">
      {bars.map(i => <div key={i} className="viz-bar" style={{height: `${heights[i]}px`}} />)}
    </div>
  )
}

export default function App() {
  const [tracks, setTracks] = useState([])
  const [bgUrl, setBgUrl] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(80)
  const [isShuffle, setIsShuffle] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  const audioRef = useRef(new Audio())
  const audio = audioRef.current

  useEffect(() => {
    Promise.all([
      fetch('/songs.txt').then(r => r.ok ? r.text() : Promise.reject('Không tìm thấy songs.txt')),
      fetch('/background.txt').then(r => r.ok ? r.text() : '').catch(() => '')
    ])
    .then(([songsText, bgText]) => {
      const urls = songsText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      const parsed = urls.map((url, i) => ({
        id: i, url, title: getFileName(url), artist: 'Unknown Artist',
        duration: 0, loaded: false,
      }))
      setTracks(parsed)

      const bgLines = bgText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      if (bgLines.length > 0) setBgUrl(bgLines[0])

      setLoading(false)

      parsed.forEach((track, idx) => {
        const a = new Audio(track.url)
        a.preload = 'metadata'
        a.addEventListener('loadedmetadata', () => {
          if (a.duration && a.duration !== Infinity) {
            setTracks(prev => {
              const next = [...prev]
              if (next[idx]) next[idx] = {...next[idx], duration: a.duration, loaded: true}
              return next
            })
          }
        })
      })
    })
    .catch(err => { setError(err.message || err); setLoading(false) })
  }, [])

  const currentTrack = tracks[currentIndex]

  useEffect(() => {
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime)
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    const onLoadedMeta = () => {
      if (audio.duration && audio.duration !== Infinity) setDuration(audio.duration)
    }
    const onEnded = () => {
      if (isRepeat) { audio.currentTime = 0; audio.play().catch(()=>{}) }
      else handleNext()
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMeta)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMeta)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audio, isDragging, isRepeat, isShuffle, currentIndex, tracks.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowRight') handleNext()
      if (e.code === 'ArrowLeft') handlePrev()
      if (e.code === 'ArrowUp') { e.preventDefault(); setVolume(v => Math.min(100, v+5)) }
      if (e.code === 'ArrowDown') { e.preventDefault(); setVolume(v => Math.max(0, v-5)) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentIndex, isPlaying, volume])

  useEffect(() => { audio.volume = volume / 100 }, [volume, audio])

  const loadTrack = useCallback((index) => {
    if (index < 0 || index >= tracks.length) return
    setCurrentIndex(index)
    audio.src = tracks[index].url
    audio.play().catch(()=>{})
    setProgress(0); setCurrentTime(0)
    setDuration(tracks[index].duration || 0)
  }, [tracks, audio])

  const togglePlay = useCallback(() => {
    if (currentIndex === -1 && tracks.length > 0) { loadTrack(0); return }
    if (audio.paused) audio.play().catch(()=>{})
    else audio.pause()
  }, [currentIndex, tracks.length, audio, loadTrack])

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return
    let idx = isShuffle ? Math.floor(Math.random()*tracks.length)
      : (currentIndex + 1 >= tracks.length ? 0 : currentIndex + 1)
    loadTrack(idx)
  }, [tracks.length, isShuffle, currentIndex, loadTrack])

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return
    let idx = isShuffle ? Math.floor(Math.random()*tracks.length)
      : (currentIndex - 1 < 0 ? tracks.length - 1 : currentIndex - 1)
    loadTrack(idx)
  }, [tracks.length, isShuffle, currentIndex, loadTrack])

  const handleProgressChange = (e) => {
    const val = parseFloat(e.target.value)
    setProgress(val)
    if (audio.duration) setCurrentTime((val/100)*audio.duration)
  }
  const handleProgressCommit = (e) => {
    setIsDragging(false)
    const val = parseFloat(e.target.value)
    if (audio.duration) audio.currentTime = (val/100)*audio.duration
  }

  const VolIcon = volume === 0 ? VolMuteIcon : volume < 50 ? VolLowIcon : VolHighIcon

  return (
    <div className="app">
      <div className="bg-layer" style={bgUrl ? {backgroundImage: `url(${bgUrl})`} : {}} />
      <div className="content">
        <div className="header">
          <div className="logo">
            <div className="logo-icon"><MusicIcon /></div>
            <h1>Music</h1>
          </div>
          <span className="badge">{tracks.length} bài</span>
        </div>

        {loading && (
          <div className="center-msg">
            <LoaderIcon />
            <p>Đang tải playlist...</p>
          </div>
        )}
        {error && (
          <div className="center-msg">
            <p>⚠️ {error}</p>
            <p className="sub">Tạo file <code>public/songs.txt</code> với danh sách URL nhạc</p>
          </div>
        )}
        {!loading && !error && tracks.length === 0 && (
          <div className="center-msg">
            <p>Playlist trống</p>
            <p className="sub">Thêm URL vào <code>public/songs.txt</code></p>
          </div>
        )}

        {!loading && !error && tracks.length > 0 && (
          <>
            <div className="np-section">
              <div className={`album-art ${isPlaying ? 'playing' : ''}`}>
                <div className="vinyl">
                  <div className="vinyl-groove" />
                  <div className="vinyl-groove" />
                  <div className="vinyl-groove" />
                  <div className="vinyl-label"><MusicIcon /></div>
                </div>
              </div>
              <div className="np-title" title={currentTrack?.title || 'Chưa chọn'}>
                {currentTrack?.title || 'Chưa chọn bài hát'}
              </div>
              <div className="np-artist">{currentTrack?.artist || '—'}</div>
              <Visualizer isPlaying={isPlaying} />
            </div>

            <div className="controls">
              <button className="ctrl-sec" onClick={()=>setIsShuffle(s=>!s)} title="Shuffle">
                <ShuffleIcon active={isShuffle} />
              </button>
              <button className="ctrl-sec" onClick={handlePrev} title="Bài trước (←)">
                <PrevIcon />
              </button>
              <button className="ctrl-play" onClick={togglePlay} title="Phát / Tạm dừng (Space)">
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className="ctrl-sec" onClick={handleNext} title="Bài sau (→)">
                <NextIcon />
              </button>
              <button className="ctrl-sec" onClick={()=>setIsRepeat(r=>!r)} title="Lặp lại">
                <RepeatIcon active={isRepeat} />
              </button>
            </div>

            <div className="progress-area">
              <span className="time">{fmtTime(currentTime)}</span>
              <input type="range" min={0} max={100} step={0.1} value={progress}
                onMouseDown={()=>setIsDragging(true)}
                onTouchStart={()=>setIsDragging(true)}
                onInput={handleProgressChange}
                onChange={handleProgressCommit}
              />
              <span className="time">{fmtTime(duration)}</span>
            </div>

            <div className="volume-area">
              <button className="vol-btn" onClick={()=>setVolume(v=>v===0?80:0)}>
                <VolIcon />
              </button>
              <input type="range" className="vol-slider" min={0} max={100} value={volume}
                onChange={e=>setVolume(parseInt(e.target.value))}
              />
            </div>

            <div className="playlist-section">
              <div className="playlist-header">
                <h2>Danh sách phát</h2>
              </div>
              <div className="playlist">
                {tracks.map((track, i) => (
                  <div key={track.id} className={`track ${i===currentIndex?'active':''}`} onClick={()=>loadTrack(i)}>
                    <div className="track-num">
                      {i===currentIndex && isPlaying ? (
                        <div className="playing-bars"><span/><span/><span/></div>
                      ) : (i+1)}
                    </div>
                    <div className="track-info">
                      <div className="track-title">{track.title}</div>
                      <div className="track-artist">{track.artist}</div>
                    </div>
                    <div className="track-dur">{track.duration?fmtTime(track.duration):'—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
