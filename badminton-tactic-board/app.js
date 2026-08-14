(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('court');
  const statusEl = document.getElementById('status') || { set textContent(_) {} };

  let tool = 'select';
  let items = [];      // { kind, id, el, ... }
  let nextId = 1;
  let selected = null;
  let drag = null;         // { item, pointerId }
  let arrowDraft = null;   // { from, el, pointerId }
  let brushDraft = null;   // { el, d, last, pointerId }
  let activeTextInput = null;
  let cachedBlob = null;
  let cacheTimer = null;
  let toastTimer = null;

  // ---------- 坐标与 DOM 工具 ----------
  function clampMeters(m) {
    return window.COURT.clampMeters(m);
  }
  function metersToSvg(m) {
    return window.COURT.metersToSvgPx(m);
  }
  function svgToMeters(p) {
    return window.COURT.pxToMeters(p);
  }

  function clientToSvg(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: e.clientX, y: e.clientY };
    return pt.matrixTransform(ctm.inverse());
  }

  function el(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function findItem(kind, id) {
    return items.find(function (it) { return it.kind === kind && it.id === id; }) || null;
  }

  function fmtMeters(m) {
    return `长 ${m.x.toFixed(2)} m，宽 ${m.y.toFixed(2)} m`;
  }

  function describe(it) {
    if (it.kind === 'marker') {
      const t = it.team === 'shuttle' ? '羽毛球' : it.team === 'red' ? '红方' : '蓝方';
      return `${t} #${it.id} @ ${fmtMeters(it.m)}`;
    }
    if (it.kind === 'annotation') {
      return `标注 #${it.id} “${it.text}” @ ${fmtMeters(it.m)}`;
    }
    if (it.kind === 'arrow') {
      return `箭头 #${it.id} 从 ${fmtMeters(it.from)} → 到 ${fmtMeters(it.to)}`;
    }
    if (it.kind === 'brush') {
      return `画笔 #${it.id}`;
    }
    return '';
  }

  function select(it) {
    selected = it;
    items.forEach(function (x) {
      x.el.classList.toggle('selected', x === it);
    });
    statusEl.textContent = it ? describe(it) : '—';
  }

  // ---------- 更新与创建 ----------
  function updateItem(it) {
    if (it.kind === 'marker' || it.kind === 'annotation') {
      const p = metersToSvg(it.m);
      it.el.setAttribute('transform', `translate(${p.x},${p.y})`);
    }
    if (it.kind === 'marker') {
      it.el.querySelector('text').textContent = it.team === 'shuttle' ? '' : String(it.id);
    }
    if (it.kind === 'arrow') {
      const a = metersToSvg(it.from);
      const b = metersToSvg(it.to);
      it.el.querySelectorAll('line').forEach(function (l) {
        l.setAttribute('x1', a.x);
        l.setAttribute('y1', a.y);
        l.setAttribute('x2', b.x);
        l.setAttribute('y2', b.y);
      });
    }
    if (it.kind === 'brush') {
      it.el.querySelectorAll('path').forEach(function (p) {
        p.setAttribute('d', it.d);
      });
    }
  }

  function addItem(it) {
    it.el.setAttribute('data-kind', it.kind);
    it.el.setAttribute('data-id', it.id);
    items.push(it);
    svg.appendChild(it.el);
    updateItem(it);
    select(it);
    scheduleCache();
  }

  function snapshot() {
    return {
      version: 1,
      items: items.map(function (it) {
        const value = { kind: it.kind, id: it.id };
        if (it.team) value.team = it.team;
        if (it.m) value.m = { x: it.m.x, y: it.m.y };
        if (it.text) value.text = it.text;
        if (it.from) value.from = { x: it.from.x, y: it.from.y };
        if (it.to) value.to = { x: it.to.x, y: it.to.y };
        if (it.d) value.d = it.d;
        return value;
      }),
    };
  }

  function restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.items)) {
      throw new Error('JSON 格式不受支持');
    }
    items.forEach(function (it) { it.el.remove(); });
    items = [];
    selected = null;
    nextId = 1;
    data.items.forEach(function (it) {
      if (it.kind === 'marker' && it.m && it.team) addMarker(clampMeters(it.m), it.team);
      else if (it.kind === 'annotation' && it.m && typeof it.text === 'string') addAnnotation(clampMeters(it.m), it.text);
      else if (it.kind === 'arrow' && it.from && it.to) addArrow(clampMeters(it.from), clampMeters(it.to));
    });
    select(null);
    scheduleCache();
  }

  function addMarker(m, team) {
    const g = el('g', { class: 'marker' });
    g.appendChild(el('circle', { r: 13, class: 'dot ' + team }));
    const text = el('text', { class: 'label', 'text-anchor': 'middle', dy: '0.35em' });
    g.appendChild(text);
    addItem({ kind: 'marker', id: nextId++, el: g, team: team, m: { x: m.x, y: m.y } });
  }

  function addAnnotation(m, text) {
    const g = el('g', { class: 'annotation' });
    const t = el('text', { 'text-anchor': 'middle', dy: '0.35em' });
    t.textContent = text;
    g.appendChild(t);
    addItem({ kind: 'annotation', id: nextId++, el: g, m: { x: m.x, y: m.y }, text: text });
  }

  function addArrow(from, to) {
    const g = el('g', { class: 'arrow' });
    g.appendChild(el('line', { class: 'arrow-hit' }));
    g.appendChild(el('line', { class: 'arrow-line', 'marker-end': 'url(#arrowhead)' }));
    addItem({ kind: 'arrow', id: nextId++, el: g, from: from, to: to });
  }

  function removeItem(it) {
    it.el.remove();
    items = items.filter(function (x) { return x !== it; });
    if (selected === it) select(null);
    scheduleCache();
  }

  function removeSelected() {
    if (selected) removeItem(selected);
  }

  function undo() {
    const it = items.pop();
    if (!it) return;
    it.el.remove();
    select(null);
    scheduleCache();
  }

  // ---------- 指针交互 ----------
  function startDrag(item, e) {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const p = clientToSvg(e);
    drag = { item: item, pointerId: e.pointerId, start: p };
    if (item.kind === 'arrow') {
      drag.orig = {
        from: { x: item.from.x, y: item.from.y },
        to: { x: item.to.x, y: item.to.y },
      };
    }
    item.el.classList.add('dragging');
    svg.classList.add('is-dragging');
    select(item);
  }

  svg.addEventListener('pointerdown', function (e) {
    const p = clientToSvg(e);

    if (tool === 'arrow') {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const draft = el('line', {
        class: 'arrow-line',
        'marker-end': 'url(#arrowhead)',
        x1: p.x, y1: p.y, x2: p.x, y2: p.y,
      });
      svg.appendChild(draft);
      arrowDraft = { from: p, el: draft, pointerId: e.pointerId };
      return;
    }

    if (tool === 'brush') {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      const g = el('g', { class: 'brush' });
      g.appendChild(el('path', { class: 'brush-hit', d: d }));
      g.appendChild(el('path', { class: 'brush-line', d: d }));
      svg.appendChild(g);
      brushDraft = { el: g, d: d, last: { x: p.x, y: p.y }, pointerId: e.pointerId };
      return;
    }

    if (tool === 'text') return; // 用 click 事件放置

    // select 工具
    const target = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (!target) {
      select(null);
      return;
    }
    const item = findItem(target.getAttribute('data-kind'), +target.getAttribute('data-id'));
    if (!item) return;
    select(item);
    if (item.kind === 'marker' || item.kind === 'annotation' || item.kind === 'arrow') {
      startDrag(item, e);
    }
  });

  svg.addEventListener('pointermove', function (e) {
    const p = clientToSvg(e);
    if (drag) {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (drag.item.kind === 'arrow') {
        const fromSvg = metersToSvg(drag.orig.from);
        const toSvg = metersToSvg(drag.orig.to);
        drag.item.from = clampMeters(svgToMeters({ x: fromSvg.x + dx, y: fromSvg.y + dy }));
        drag.item.to = clampMeters(svgToMeters({ x: toSvg.x + dx, y: toSvg.y + dy }));
      } else {
        drag.item.m = clampMeters(svgToMeters(p));
      }
      updateItem(drag.item);
      select(drag.item);
    } else if (arrowDraft) {
      arrowDraft.el.setAttribute('x2', p.x);
      arrowDraft.el.setAttribute('y2', p.y);
    } else if (brushDraft) {
      const dx = p.x - brushDraft.last.x;
      const dy = p.y - brushDraft.last.y;
      if (dx * dx + dy * dy < 1.5 * 1.5) return;
      brushDraft.last = { x: p.x, y: p.y };
      brushDraft.d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      brushDraft.el.querySelectorAll('path').forEach(function (path) {
        path.setAttribute('d', brushDraft.d);
      });
    }
  });

  function endInteraction(e) {
    if (drag) {
      drag.item.el.classList.remove('dragging');
      svg.classList.remove('is-dragging');
      drag = null;
      scheduleCache();
      return;
    }
    if (arrowDraft) {
      const p = clientToSvg(e);
      const dx = p.x - arrowDraft.from.x;
      const dy = p.y - arrowDraft.from.y;
      arrowDraft.el.remove();
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        const from = clampMeters(svgToMeters(arrowDraft.from));
        const to = clampMeters(svgToMeters(p));
        addArrow(from, to);
      }
      arrowDraft = null;
    }
    if (brushDraft) {
      if (brushDraft.d.indexOf('L') !== -1) {
        addItem({ kind: 'brush', id: nextId++, el: brushDraft.el, d: brushDraft.d });
      } else {
        brushDraft.el.remove();
      }
      brushDraft = null;
    }
  }

  svg.addEventListener('pointerup', endInteraction);
  svg.addEventListener('pointercancel', endInteraction);

  function closeTextInput() {
    if (activeTextInput) {
      activeTextInput.remove();
      activeTextInput = null;
    }
  }

  function openTextInput(e) {
    const m = clampMeters(svgToMeters(clientToSvg(e)));
    closeTextInput();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.placeholder = '输入标注文字…';
    input.autocapitalize = 'off';
    input.autocorrect = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.style.left = Math.min(Math.max(8, e.clientX - 90), window.innerWidth - 200) + 'px';
    input.style.top = Math.min(e.clientY, window.innerHeight * 0.4) + 'px';
    document.body.appendChild(input);
    input.focus();
    activeTextInput = input;

    let done = false;
    function commit() {
      if (done) return;
      done = true;
      const text = input.value.trim();
      closeTextInput();
      if (text) addAnnotation(m, text);
    }
    function cancel() {
      if (done) return;
      done = true;
      closeTextInput();
    }
    input.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  svg.addEventListener('click', function (e) {
    if (tool !== 'text') return;
    openTextInput(e);
  });

  svg.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ---------- 工具切换 ----------
  function setTool(t) {
    tool = t;
    svg.classList.toggle('tool-arrow', t === 'arrow');
    svg.classList.toggle('tool-text', t === 'text');
    svg.classList.toggle('tool-brush', t === 'brush');
  }

  // ---------- 控件 ----------
  document.getElementById('add-red').addEventListener('click', function () {
    addMarker({ x: 1.5, y: 2.0 }, 'red');
  });
  document.getElementById('add-blue').addEventListener('click', function () {
    addMarker({ x: 11.9, y: 4.1 }, 'blue');
  });
  document.getElementById('add-shuttle').addEventListener('click', function () {
    addMarker({ x: 6.7, y: 3.05 }, 'shuttle');
  });
  document.getElementById('delete').addEventListener('click', removeSelected);
  document.getElementById('clear').addEventListener('click', function () {
    items.forEach(function (it) { it.el.remove(); });
    items = [];
    select(null);
    scheduleCache();
  });
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('save').addEventListener('click', saveImage);

  document.querySelectorAll('input[name="tool"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (r.checked) setTool(r.value);
    });
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected) {
        e.preventDefault();
        removeSelected();
      }
    }
  });

  // ---------- 导出 / 分享 ----------
  function renderPNGBlob(cb) {
    const scale = 2;
    const w = window.COURT.VIEW_W;
    const h = window.COURT.VIEW_H;

    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);

    const styleProps = [
      'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
      'stroke-dasharray', 'stroke-miterlimit', 'fill-opacity', 'stroke-opacity',
      'opacity', 'font-size', 'font-family', 'font-weight', 'font-style',
      'text-anchor', 'dominant-baseline', 'paint-order', 'letter-spacing',
    ];
    const originalNodes = Array.prototype.slice.call(svg.querySelectorAll('*'));
    const cloneNodes = Array.prototype.slice.call(clone.querySelectorAll('*'));
    for (let i = 0; i < originalNodes.length; i++) {
      const cs = window.getComputedStyle(originalNodes[i]);
      let s = '';
      for (let j = 0; j < styleProps.length; j++) {
        const prop = styleProps[j];
        const v = cs.getPropertyValue(prop);
        if (v) s += `${prop}:${v};`;
      }
      if (s) cloneNodes[i].setAttribute('style', s);
    }

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(cb, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      statusEl.textContent = '生成图片失败';
    };
    img.src = url;
  }

  function scheduleCache() {
    try { localStorage.setItem('badminton-tactic-board:v1', JSON.stringify(snapshot())); } catch (e) { /* storage unavailable */ }
    if (cacheTimer) clearTimeout(cacheTimer);
    cacheTimer = setTimeout(function () {
      renderPNGBlob(function (blob) {
        cachedBlob = blob;
      });
    }, 200);
  }

  function downloadPNG(blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'badminton-tactic-' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(function () {
      toast.classList.add('show');
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.hidden = true; }, 250);
    }, 2200);
  }

  function saveImage() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    function doSave(blob) {
      if (!isTouch || !navigator.share) {
        downloadPNG(blob);
        statusEl.textContent = '已下载 PNG';
        return;
      }
      const file = new File([blob], 'badminton-tactic.png', { type: 'image/png' });
      const shareData = window.TACTIC_SHARE.buildShareData(file);

      function fallbackAfterShareFailure() {
        window.TACTIC_SHARE.copyImageToClipboard(navigator, blob).then(function (copied) {
          if (copied) {
            showToast('图片已复制，打开微信粘贴给指定好友');
            return;
          }
          downloadPNG(blob);
          showToast('分享失败，图片已下载');
        });
      }

      if (!window.TACTIC_SHARE.canShareFiles(navigator, shareData)) {
        fallbackAfterShareFailure();
        return;
      }

      try {
        navigator.share(shareData).then(function () {
          showToast('保存成功');
        }).catch(function (err) {
          if (!err || err.name !== 'AbortError') fallbackAfterShareFailure();
        });
      } catch (e) {
        fallbackAfterShareFailure();
      }
    }

    if (cachedBlob) {
      doSave(cachedBlob);
    } else {
      renderPNGBlob(doSave);
    }
  }

  // ---------- 初始化 ----------
  window.COURT.render(svg);
  setTool('select');
  try {
    const saved = localStorage.getItem('badminton-tactic-board:v1');
    if (saved) restore(JSON.parse(saved));
  } catch (e) {
    showToast('已忽略无法读取的本地战术');
  }
  scheduleCache();
})();
