(function () {
  const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;
  const T = window.Tracker;
  const EVENT_START = new Date('2026-10-31T18:00:00+09:00');

  // A/B 테스트 카피: A = 호기심 자극, B = 희소성/손실회피
  const COPY = {
    A: { hook: '당신의 무의식이 가장 두려워하는 것은 무엇일까요?<br />오늘 밤, 직접 확인해 보세요.', cta: '무의식의 방 입장하기 🎃' },
    B: { hook: '선착순 120명 한정 · 사전 예매 시 <b>1,000원 할인</b><br />자리가 사라지기 전에 확보하세요.', cta: '남은 자리 확인하기 👻' },
  };

  // 가격은 DB 값이 기준. 아래는 설명 문구와 오프라인 대비용 기본값
  const PRODUCT_INFO = {
    ticket: { desc: '모든 실험 부스 입장 + 웰컴 사탕 꾸러미', price: 5000 },
    tarot: { desc: '심리 타로 + 투사 검사 1회 (15분)', price: 3000 },
    goods: { desc: '로르샤흐 손수건 + 프로이트 스티커 + 호박 키링', price: 8000 },
    bundle: { desc: '입장권 + 타로 + 굿즈 세트를 한 번에 (3,000원 할인)', price: 13000, best: true },
  };
  const FALLBACK = [
    { code: 'ticket', name: '할로윈 나이트 입장권', price: 5000 },
    { code: 'tarot', name: '심리 타로 상담권', price: 3000 },
    { code: 'goods', name: '무의식 굿즈 세트', price: 8000 },
    { code: 'bundle', name: '올인원 패키지 (입장+타로+굿즈)', price: 13000 },
  ];

  const $ = (s) => document.querySelector(s);
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let selected = null;
  let qty = 1;

  // ---- 1. 랜딩 ----
  T.pageView('index');
  T.funnel('landing');
  $('#hero-hook').innerHTML = COPY[T.variant].hook;
  $('#hero-cta').textContent = COPY[T.variant].cta;

  function tick() {
    const diff = EVENT_START - Date.now();
    const el = $('#countdown');
    if (diff <= 0) { el.innerHTML = '<div><b>NOW</b><span>진행 중</span></div>'; return; }
    const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24,
      m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
    el.innerHTML = [[d, '일'], [h, '시간'], [m, '분'], [s, '초']]
      .map(([v, l]) => `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  }
  tick();
  setInterval(tick, 1000);

  // ---- 2. 프로그램 확인 (섹션이 화면에 40% 이상 보이면) ----
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { T.funnel('view_program'); obs.disconnect(); }
  }, { threshold: 0.4 }).observe($('#program'));

  // ---- 상품 렌더링 ----
  async function loadProducts() {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/products?select=code,name,price&order=sort_order', {
        headers: { apikey: SUPABASE_KEY },
      });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch {
      return FALLBACK;
    }
  }

  loadProducts().then((products) => {
    $('#products').innerHTML = products.map((p) => {
      const info = PRODUCT_INFO[p.code] || {};
      return `
        <div class="product${info.best ? ' best' : ''}">
          ${info.best ? '<span class="badge">BEST · 가장 인기</span>' : ''}
          <h3>${esc(p.name)}</h3>
          <div class="price">${won(p.price)}</div>
          <div class="desc">${esc(info.desc || '')}</div>
          <button class="cta" data-code="${esc(p.code)}" data-track="buy_${esc(p.code)}">선택하기</button>
        </div>`;
    }).join('');
    $('#products').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-code]');
      if (!btn) return;
      selected = products.find((p) => p.code === btn.dataset.code);
      openCheckout();
    });
  });

  // ---- 3~4. 상품 선택 → 주문서 진입 ----
  const dialog = $('#checkout');
  const form = $('#order-form');

  function openCheckout() {
    T.funnel('select_item', { product: selected.code });
    qty = 1;
    form.hidden = false;
    $('#done').hidden = true;
    $('#form-error').textContent = '';
    $('#selected-item').textContent = `${selected.name} · ${won(selected.price)}`;
    renderTotal();
    dialog.showModal();
    T.funnel('checkout_start', { product: selected.code });
  }

  function renderTotal() {
    $('#qty').value = qty;
    $('#total').textContent = won(selected.price * qty);
  }
  $('#qty-minus').onclick = () => { qty = Math.max(1, qty - 1); renderTotal(); };
  $('#qty-plus').onclick = () => { qty = Math.min(10, qty + 1); renderTotal(); };
  $('#close-checkout').onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // ---- 5. 정보 입력 완료 (모든 필수 항목이 유효해진 순간) ----
  form.addEventListener('input', () => {
    if (form.checkValidity()) T.funnel('form_filled');
  });

  // ---- 6. 구매 완료 ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      $('#form-error').textContent = '입력 내용을 확인해 주세요.';
      T.click('checkout_invalid');
      return;
    }
    const fd = new FormData(form);
    const btn = $('#submit-order');
    btn.disabled = true;
    $('#form-error').textContent = '';
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/orders', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          session_id: T.session.id,
          product_code: selected.code,
          quantity: qty,
          buyer_name: fd.get('buyer_name').trim(),
          student_no: fd.get('student_no').trim(),
          phone: fd.get('phone').trim(),
          variant: T.variant,
          utm_source: T.session.utm_source,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      T.funnel('purchase', { product: selected.code, quantity: qty, amount: selected.price * qty });
      T.flush();
      form.reset();
      form.hidden = true;
      $('#done-amount').textContent = won(selected.price * qty);
      $('#done').hidden = false;
    } catch (err) {
      console.error(err);
      $('#form-error').textContent = '예매에 실패했어요. 잠시 후 다시 시도해 주세요.';
      T.click('checkout_error');
    } finally {
      btn.disabled = false;
    }
  });

  $('#copy-account').onclick = async () => {
    try {
      await navigator.clipboard.writeText('농협 000-0000-0000-00');
      $('#copy-account').textContent = '복사됨 ✓';
    } catch { /* 클립보드 권한 없음 */ }
  };

  // 공유 링크에 utm_source=share 를 붙여 바이럴 유입 측정
  $('#share').onclick = async () => {
    const url = location.origin + location.pathname + '?utm_source=share&utm_medium=referral';
    const data = { title: '무의식의 방 · 심리학과 할로윈 나이트', text: '같이 갈래? 🎃', url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); $('#share').textContent = '링크 복사됨 ✓'; }
    } catch { /* 사용자가 취소 */ }
  };
})();
