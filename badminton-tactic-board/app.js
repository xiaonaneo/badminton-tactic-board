(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('court');
  const board = svg.closest('.board');
  const eraserCursor = document.getElementById('eraser-cursor');
  const statusEl = document.getElementById('status') || { set textContent(_) {} };

  let tool = 'select';
  let deleteMode = false;
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

  // 手机端侧栏应与实际渲染出的场地内容对齐。场地 SVG 会因可用宽度
  // 在容器中垂直居中，直接让侧栏拉满视口会导致上下边缘错位。
  function syncMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const toolbar = document.querySelector('.toolbar');
    if (!sidebar || !toolbar || !svg) return;

    const isMobile = window.matchMedia('(max-width: 560px)').matches;
    if (!isMobile) {
      sidebar.style.height = '';
      sidebar.style.alignSelf = '';
      return;
    }

    const svgHeight = svg.getBoundingClientRect().height;
    if (!svgHeight) return;
    const toolbarStyle = window.getComputedStyle(toolbar);
    const verticalPadding = parseFloat(toolbarStyle.paddingTop) + parseFloat(toolbarStyle.paddingBottom);
    sidebar.style.height = `${Math.ceil(svgHeight + verticalPadding)}px`;
    sidebar.style.alignSelf = 'center';
  }

  function scheduleSidebarSync() {
    window.requestAnimationFrame(syncMobileSidebar);
  }

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

  function markerRadius(team) {
    return team === 'shuttle' ? 11 : 15 * Math.SQRT2;
  }

  function markerOverlaps(m, team) {
    const radius = markerRadius(team);
    return items.some(function (it) {
      if (it.kind !== 'marker') return false;
      const otherRadius = markerRadius(it.team);
      return Math.hypot(it.m.x - m.x, it.m.y - m.y) < (radius + otherRadius) / window.COURT.SCALE;
    });
  }

  function nextMarkerPosition(team) {
    const anchors = team === 'red'
      ? [
        { x: 2.0, y: 1.6 }, { x: 2.0, y: 3.1 }, { x: 3.5, y: 1.6 },
        { x: 3.5, y: 3.1 }, { x: 5.0, y: 1.6 }, { x: 5.0, y: 3.1 },
      ]
      : team === 'blue'
      ? [
        { x: 11.4, y: 4.5 }, { x: 11.4, y: 3.0 }, { x: 9.9, y: 4.5 },
        { x: 9.9, y: 3.0 }, { x: 8.4, y: 4.5 }, { x: 8.4, y: 3.0 },
      ]
      : [
        { x: 6.7, y: 3.05 }, { x: 6.7, y: 2.0 }, { x: 6.7, y: 4.1 },
        { x: 5.6, y: 3.05 }, { x: 7.8, y: 3.05 }, { x: 5.6, y: 2.0 },
      ];
    const candidate = anchors.find(function (m) { return !markerOverlaps(m, team); });
    if (candidate) return candidate;

    for (let x = 1.0; x <= 12.4; x += 1.2) {
      for (let y = 0.8; y <= 5.3; y += 1.2) {
        const fallback = { x: x, y: y };
        if (!markerOverlaps(fallback, team)) return fallback;
      }
    }
    return team === 'red' ? { x: 2.0, y: 1.6 } : team === 'blue' ? { x: 11.4, y: 4.5 } : { x: 6.7, y: 3.05 };
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
    // Keep the red/blue marker area at exactly twice its previous size.
    // Increasing the circle itself also enlarges the pointer hit target on touch devices.
    const radius = markerRadius(team);
    g.appendChild(el('circle', { r: radius, class: 'dot ' + team }));
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

    if (deleteMode) {
      const target = e.target.closest ? e.target.closest('[data-kind]') : null;
      if (target) {
        const item = findItem(target.getAttribute('data-kind'), +target.getAttribute('data-id'));
        if (item) removeItem(item);
      }
      return;
    }

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
    if (deleteMode) {
      const rect = board.getBoundingClientRect();
      eraserCursor.style.left = `${e.clientX - rect.left}px`;
      eraserCursor.style.top = `${e.clientY - rect.top}px`;
      eraserCursor.classList.add('is-visible');
    }
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
  svg.addEventListener('pointerleave', function () {
    eraserCursor.classList.remove('is-visible');
  });

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
    // 删除模式下触摸元素会继续派发 click，不能让它落入标注输入逻辑。
    if (deleteMode || tool !== 'text') return;
    openTextInput(e);
  });

  svg.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ---------- 工具切换 ----------
  const deleteButton = document.getElementById('delete');
  function setDeleteMode(active) {
    deleteMode = active;
    deleteButton.setAttribute('aria-pressed', String(active));
    svg.classList.toggle('tool-delete', active);
    if (active) {
      tool = 'select';
      closeTextInput();
      document.querySelectorAll('input[name="tool"]').forEach(function (radio) { radio.checked = false; });
      svg.classList.remove('tool-arrow', 'tool-brush', 'tool-text');
      select(null);
    } else {
      eraserCursor.classList.remove('is-visible');
      if (!document.querySelector('input[name="tool"]:checked')) {
        const selectRadio = document.querySelector('input[name="tool"][value="select"]');
        selectRadio.checked = true;
        tool = 'select';
      }
    }
  }

  function setTool(t) {
    tool = t;
    setDeleteMode(false);
    svg.classList.toggle('tool-arrow', t === 'arrow');
    svg.classList.toggle('tool-text', t === 'text');
    svg.classList.toggle('tool-brush', t === 'brush');
  }

  function activateMoveTool() {
    document.querySelector('input[name="tool"][value="select"]').checked = true;
    setTool('select');
  }

  // ---------- 控件 ----------
  document.getElementById('add-red').addEventListener('click', function () {
    addMarker(nextMarkerPosition('red'), 'red');
    activateMoveTool();
  });
  document.getElementById('add-blue').addEventListener('click', function () {
    addMarker(nextMarkerPosition('blue'), 'blue');
    activateMoveTool();
  });
  document.getElementById('add-shuttle').addEventListener('click', function () {
    addMarker(nextMarkerPosition('shuttle'), 'shuttle');
    activateMoveTool();
  });
  deleteButton.addEventListener('click', function () {
    setDeleteMode(!deleteMode);
  });
  const clearButton = document.getElementById('clear');
  const clearConfirmLayer = document.getElementById('clear-confirm');
  const clearCancelButton = document.getElementById('clear-cancel');
  const clearConfirmButton = document.getElementById('clear-confirm-action');
  const saveButton = document.getElementById('save');
  const actionButtons = Array.prototype.slice.call(document.querySelectorAll('.action-group.ops button, .action-group.share button'));
  const addButtons = Array.prototype.slice.call(document.querySelectorAll('.action-group.adds button'));

  function markActionButton(button) {
    actionButtons.forEach(function (item) { item.classList.toggle('is-clicked', item === button); });
  }

  function resetActionButton(button) {
    button.classList.remove('is-clicked');
    if (document.activeElement === button) button.blur();
  }

  function flashResetActionButton(button) {
    setTimeout(function () { resetActionButton(button); }, 350);
  }

  actionButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button !== deleteButton) setDeleteMode(false);
      markActionButton(button);
    });
  });
  addButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      actionButtons.forEach(function (item) { item.classList.remove('is-clicked'); });
    });
  });

  function closeClearConfirm() {
    clearConfirmLayer.hidden = true;
    resetActionButton(clearButton);
  }

  function clearItems() {
    items.forEach(function (it) { it.el.remove(); });
    items = [];
    nextId = 1;
    select(null);
    scheduleCache();
    closeClearConfirm();
    markActionButton(clearButton);
    flashResetActionButton(clearButton);
    showToast('已清空');
  }

  clearButton.addEventListener('click', function () {
    if (!items.length) {
      resetActionButton(clearButton);
      showToast('当前没有可清空的战术');
      return;
    }
    clearConfirmLayer.hidden = false;
    clearCancelButton.focus();
  });
  clearCancelButton.addEventListener('click', closeClearConfirm);
  clearConfirmButton.addEventListener('click', clearItems);
  clearConfirmLayer.addEventListener('click', function (e) {
    if (e.target === clearConfirmLayer) closeClearConfirm();
  });
  const undoButton = document.getElementById('undo');
  undoButton.addEventListener('click', function () {
    undo();
    flashResetActionButton(undoButton);
  });
  saveButton.addEventListener('click', saveImage);

  const contactButton = document.getElementById('contact-author');
  const contactCard = document.getElementById('contact-card');
  const contactValue = contactCard.querySelector('.contact-card-value');
  const githubButton = document.getElementById('github-repo');
  const githubCard = document.getElementById('github-card');
  const authorCards = [
    { button: contactButton, card: contactCard },
    { button: githubButton, card: githubCard },
  ];
  function setAuthorCard(entry, open) {
    entry.card.hidden = !open;
    entry.button.setAttribute('aria-expanded', String(open));
    if (!open) resetActionButton(entry.button);
  }
  function toggleAuthorCard(entry) {
    const shouldOpen = entry.card.hidden;
    authorCards.forEach(function (item) { setAuthorCard(item, false); });
    if (shouldOpen) setAuthorCard(entry, true);
  }
  authorCards.forEach(function (entry) {
    entry.button.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleAuthorCard(entry);
    });
  });
  function closeAuthorCards(e) {
    const clickedAuthorUI = authorCards.some(function (entry) {
      return entry.button.contains(e.target) || entry.card.contains(e.target);
    });
    if (!clickedAuthorUI) {
      authorCards.forEach(function (entry) { setAuthorCard(entry, false); });
    }
  }
  document.addEventListener('pointerdown', closeAuthorCards, true);
  document.addEventListener('click', closeAuthorCards);
  function fallbackCopyText(text) {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (e) {
      copied = false;
    }
    input.remove();
    return copied;
  }
  function copyContactValue() {
    const text = contactValue.textContent.trim();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('已复制');
      }).catch(function () {
        showToast(fallbackCopyText(text) ? '已复制' : '复制失败，请长按选择文本');
      });
      return;
    }
    showToast(fallbackCopyText(text) ? '已复制' : '复制失败，请长按选择文本');
  }
  contactValue.addEventListener('click', copyContactValue);
  contactValue.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      copyContactValue();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !clearConfirmLayer.hidden) {
      e.preventDefault();
      closeClearConfirm();
      return;
    }
    if (e.key === 'Tab' && !clearConfirmLayer.hidden) {
      e.preventDefault();
      if (document.activeElement === clearCancelButton) clearConfirmButton.focus();
      else clearCancelButton.focus();
      return;
    }
    if (e.key === 'Escape' && authorCards.some(function (entry) { return !entry.card.hidden; })) {
      authorCards.forEach(function (entry) { setAuthorCard(entry, false); });
      contactButton.focus();
    }
  });

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
        showToast('保存成功');
        flashResetActionButton(saveButton);
        return;
      }
      const file = new File([blob], 'badminton-tactic.png', { type: 'image/png' });
      const shareData = window.TACTIC_SHARE.buildShareData(file);

      function fallbackAfterShareFailure() {
        window.TACTIC_SHARE.copyImageToClipboard(navigator, blob).then(function (copied) {
          if (copied) {
            flashResetActionButton(saveButton);
            return;
          }
          downloadPNG(blob);
          showToast('保存成功');
          flashResetActionButton(saveButton);
        });
      }

      if (!window.TACTIC_SHARE.canShareFiles(navigator, shareData)) {
        fallbackAfterShareFailure();
        return;
      }

      try {
        navigator.share(shareData).then(function () {
          // 微信等分享目标完成后保持静默，避免打断转发流程。
          flashResetActionButton(saveButton);
        }).catch(function (err) {
          if (!err || err.name !== 'AbortError') fallbackAfterShareFailure();
          else flashResetActionButton(saveButton);
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
  scheduleSidebarSync();
  window.addEventListener('resize', scheduleSidebarSync, { passive: true });
  window.addEventListener('orientationchange', scheduleSidebarSync, { passive: true });
  if (window.ResizeObserver) {
    const boardObserver = new ResizeObserver(scheduleSidebarSync);
    boardObserver.observe(board);
  }
  setTool('select');
  try {
    const saved = localStorage.getItem('badminton-tactic-board:v1');
    if (saved) restore(JSON.parse(saved));
  } catch (e) {
    showToast('已忽略无法读取的本地战术');
  }
  scheduleCache();
})();
