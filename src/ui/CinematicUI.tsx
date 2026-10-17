import { useEffect, useState } from 'react';
import { cutsceneNow, cutsceneVoice, useCutscene } from '../game/cutscene';
import { say, speakerFor, stopVoice } from '../systems/audio/voice';
import { retryMission, useMissions } from '../game/missions';
import { onKeyPress } from '../systems/input';
import { chime } from '../systems/audio/stingers';

/** Letterbox bars, subtitles and the mission title during a briefing (GTA style). */
export function CinematicUI() {
  const active = useCutscene((s) => s.active);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      tick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  const now = active ? cutsceneNow() : null;
  const shot = now?.shot;
  // each briefing line is SPOKEN as its shot starts (the shot waits for the speaker to finish)
  useEffect(() => {
    if (!active) {
      if (cutsceneVoice.index >= 0) stopVoice();
      cutsceneVoice.index = -1;
      cutsceneVoice.speaking = false;
      return;
    }
    if (!now || now.index === cutsceneVoice.index) return;
    cutsceneVoice.index = now.index;
    cutsceneVoice.held = 0;
    const line = now.shot.line;
    if (!line) {
      cutsceneVoice.speaking = false;
      return;
    }
    const idx = now.index;
    cutsceneVoice.speaking = true;
    say({
      who: speakerFor(line.who),
      name: line.who,
      text: line.text,
      subtitle: false, // the letterbox shows its own subtitle
      onEnd: () => {
        if (cutsceneVoice.index === idx) cutsceneVoice.speaking = false;
      },
    });
  });
  return (
    <div className={`cinematic${active ? ' on' : ''}`} aria-hidden={!active}>
      <div className="lb lb-top" />
      <div className="lb lb-bottom" />
      {shot?.title && now!.t < 0.85 && (
        <div className="cine-title" key={shot.title}>
          {shot.title}
        </div>
      )}
      {shot?.line && (
        <div className="cine-sub" key={`${now!.index}`}>
          <b className={shot.line.who === 'Mkurugenzi' ? 'abel' : ''}>{shot.line.who}:</b> {shot.line.text}
        </div>
      )}
      {!shot?.line && shot?.subtitle && <div className="cine-sub">{shot.subtitle}</div>}
      {active && <div className="cine-skip">Skip · Space</div>}
    </div>
  );
}

/** MISSION PASSED (gold, with the pay) / MISSION FAILED (red, with the reason and a retry). */
export function MissionBanner() {
  const banner = useMissions((s) => s.banner);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!banner) return;
    if (banner.kind === 'passed') chime('passed');
    else chime('failed');
    const id = setInterval(() => tick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, [banner]);
  useEffect(() => onKeyPress('KeyE', () => void retryMission()), []);
  if (!banner || performance.now() > banner.until) return null;
  return (
    <div className={`mission-banner ${banner.kind}`} key={banner.until}>
      <h2>{banner.title}</h2>
      <p>{banner.detail}</p>
      {banner.kind === 'failed' && banner.retry && <small>Press E to retry</small>}
    </div>
  );
}
