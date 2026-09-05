import { useEffect, useRef, useState } from "react";

/** 倒计时（秒）。running 为 false 时暂停；归零触发 onZero。 */
export function useTimer(totalSeconds: number, running: boolean, onZero?: () => void) {
  const [left, setLeft] = useState(totalSeconds);
  const cb = useRef(onZero);
  cb.current = onZero;
  useEffect(() => setLeft(totalSeconds), [totalSeconds]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          cb.current?.();
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  return left;
}

export function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
