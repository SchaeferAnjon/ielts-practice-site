import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type AudioHandle = { seek: (t: number) => void; play: () => void; pause: () => void };

function fmt(s: number) {
  if (!isFinite(s)) return "00:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const AudioPlayer = forwardRef<AudioHandle, { src: string; countdown?: number | null; onEnded?: () => void; locked?: boolean }>(function AudioPlayer({ src, countdown, onEnded, locked }, ref) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [rate, setRate] = useState(1);
  const [volOpen, setVolOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    seek: (t) => {
      if (audio.current) {
        audio.current.currentTime = Math.max(0, t);
        audio.current.play().catch(() => {});
      }
    },
    play: () => audio.current?.play().catch(() => {}),
    pause: () => audio.current?.pause(),
  }));

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    if (audio.current) audio.current.volume = vol;
  }, [vol]);
  useEffect(() => {
    setPlaying(false);
    setCur(0);
  }, [src]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const seekAt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = (e.clientX - rect.left) / rect.width;
    if (audio.current && dur) audio.current.currentTime = p * dur;
  };
  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="player">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => onEnded?.()}
      />
      <button className="pbtn" onClick={toggle} title={playing ? "暂停" : "播放"}>{playing ? "❚❚" : "▶"}</button>
      <div className="track" onClick={seekAt} title={locked ? "考试模式下不可拖动进度" : "点击跳转"}>
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="knob" style={{ left: `${pct}%` }} />
      </div>
      <div className="time">{fmt(cur)} / {fmt(dur)}</div>
      <div className={`vol ${volOpen ? "open" : ""}`}>
        <button className="ibtn" onClick={() => setVolOpen((v) => !v)} title="音量">{vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊"}</button>
        <div className="pop">
          <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} />
        </div>
      </div>
      <select value={rate} onChange={(e) => setRate(Number(e.target.value))} title="倍速">
        {[0.75, 1, 1.25, 1.5].map((r) => (
          <option key={r} value={r}>{r}x</option>
        ))}
      </select>
      {countdown != null && <div className="countdown" title="本科目剩余时间">{fmt(countdown)}</div>}
    </div>
  );
});

export default AudioPlayer;
