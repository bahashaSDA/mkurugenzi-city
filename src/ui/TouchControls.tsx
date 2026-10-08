import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { input } from '../systems/input';

const STICK_R = 56;

/** SPEC 8.2 mobile: left virtual joystick, right-side drag to look, big contextual buttons. */
export function TouchControls() {
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef({ id: -1, ox: 0, oy: 0 });
  const look = useRef({ id: -1, x: 0, y: 0 });

  const stickDown = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, ox: r.left + r.width / 2, oy: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    stickMove(e);
  };
  const stickMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (e.pointerId !== s.id) return;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    input.touchMoveX = dx / STICK_R;
    input.touchMoveY = -dy / STICK_R;
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const stickUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stick.current.id) return;
    stick.current.id = -1;
    input.touchMoveX = input.touchMoveY = 0;
    if (knob.current) knob.current.style.transform = '';
  };

  const lookDown = (e: RPointerEvent<HTMLDivElement>) => {
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const lookMove = (e: RPointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (e.pointerId !== l.id) return;
    input.lookDX += (e.clientX - l.x) * 1.6;
    input.lookDY += (e.clientY - l.y) * 1.6;
    input.lastLookTime = performance.now();
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === look.current.id) look.current.id = -1;
  };

  return (
    <div className="touch">
      <div className="touch-look" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      <div className="touch-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}>
        <div ref={knob} className="touch-knob" />
      </div>
      <div className="touch-buttons">
        <button
          className="touch-btn"
          onPointerDown={() => (input.touchSprint = !input.touchSprint)}
          aria-label="Toggle run"
        >
          RUN
        </button>
        <button
          className="touch-btn"
          onPointerDown={() => (input.jump = true)}
          onPointerUp={() => (input.jump = false)}
          onPointerCancel={() => (input.jump = false)}
          aria-label="Jump"
        >
          JUMP
        </button>
      </div>
    </div>
  );
}
