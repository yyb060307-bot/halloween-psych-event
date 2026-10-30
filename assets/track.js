// 그로스 데이터 수집기: 페이지뷰 / 퍼널 / 버튼 클릭 / 스크롤 깊이 / 이탈
(function () {
  const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;
  const SESSION_TTL = 30 * 60 * 1000; // 30분 동안 활동 없으면 새 세션
  const LS = window.localStorage;

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function readJSON(key) {
    try { return JSON.parse(LS.getItem(key)); } catch { return null; }
  }

  // 세션: 30분 비활성 시 갱신. 퍼널 도달 단계도 세션 단위로 기록
  function loadSession() {
    const now = Date.now();
    let s = readJSON('hw_session');
    if (!s || now - s.last > SESSION_TTL) {
      const p = new URLSearchParams(location.search);
      s = {
        id: uuid(),
        steps: [],
        scroll: [],
        utm_source: p.get('utm_source'),
        utm_medium: p.get('utm_medium'),
        utm_campaign: p.get('utm_campaign'),
        referrer: document.referrer ? document.referrer.slice(0, 500) : null,
      };
    }
    s.last = now;
    LS.setItem('hw_session', JSON.stringify(s));
    return s;
  }

  // A/B 변형: 방문자 단위로 고정, ?v=A 또는 ?v=B 로 강제 가능
  function loadVariant() {
    const forced = new URLSearchParams(location.search).get('v');
    if (forced === 'A' || forced === 'B') { LS.setItem('hw_variant', forced); return forced; }
    let v = LS.getItem('hw_variant');
    if (v !== 'A' && v !== 'B') { v = Math.random() < 0.5 ? 'A' : 'B'; LS.setItem('hw_variant', v); }
    return v;
  }

  function detectDevice() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  const session = loadSession();
  const variant = loadVariant();
  const device = detectDevice();
  const startedAt = Date.now();
  let queue = [];

  function save() {
    session.last = Date.now();
    LS.setItem('hw_session', JSON.stringify(session));
  }

  // PostgREST 배치 INSERT는 모든 객체의 키가 같아야 하므로 항상 같은 형태로 전송
  function push(event_type, event_name, meta) {
    queue.push({
      session_id: session.id,
      event_type,
      event_name: String(event_name).slice(0, 80),
      variant,
      utm_source: session.utm_source,
      utm_medium: session.utm_medium,
      utm_campaign: session.utm_campaign,
      referrer: session.referrer,
      device,
      meta: meta || {},
    });
    save();
  }

  function flush(useKeepalive) {
    if (!queue.length) return Promise.resolve();
    const rows = queue;
    queue = [];
    return fetch(SUPABASE_URL + '/rest/v1/events', {
      method: 'POST',
      keepalive: !!useKeepalive,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    }).then((res) => {
      if (!res.ok) console.warn('[track] insert failed', res.status);
    }).catch(() => { queue = rows.concat(queue); });
  }

  const Tracker = {
    session, variant, device,
    pageView(name) { push('page_view', name || location.pathname); },
    // 퍼널 단계는 세션당 1회만 기록 (고유 세션 수 기준 이탈률 계산)
    funnel(step, meta) {
      if (session.steps.includes(step)) return;
      session.steps.push(step);
      push('funnel', step, meta);
    },
    click(name, meta) { push('click', name, meta); },
    flush,
  };

  // data-track="버튼이름" 이 붙은 모든 요소의 클릭 자동 수집
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (el) Tracker.click(el.dataset.track, { text: (el.textContent || '').trim().slice(0, 40) });
  }, true);

  // 스크롤 깊이 25/50/75/100%
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const pct = ((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100;
    for (const d of [25, 50, 75, 100]) {
      if (pct >= d - 1 && !session.scroll.includes(d)) {
        session.scroll.push(d);
        push('scroll', 'depth_' + String(d).padStart(3, '0'));
      }
    }
  }, { passive: true });

  // 페이지 이탈 시 체류시간과 마지막 퍼널 단계 기록
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      push('exit', 'leave', {
        seconds: Math.round((Date.now() - startedAt) / 1000),
        last_step: session.steps[session.steps.length - 1] || null,
      });
      flush(true);
    }
  });

  setInterval(() => flush(false), 2000);
  window.Tracker = Tracker;
})();
