// 羽毛球场地几何（竖版：宽沿 x 轴，长沿 y 轴）。
// 单双打统一为双打全场；唯一真实尺寸来源是“米”，渲染时经 SCALE 换算成像素。
// 官方尺寸来源：BWF《羽毛球竞赛规则》(Laws of Badminton)。
window.COURT = (function () {
  const DIM = {
    length: 13.40,             // 全场长
    width: 6.10,               // 场地宽（双打）
    shortService: 1.98,        // 前发球线到网的距离
    doublesLongService: 0.76,  // 双打后发球线到端线的距离
    netHeight: 1.55,           // 网高（支柱处 1.55m，中央 1.524m）
  };

  const SCALE = 50;   // 像素 / 米
  const MARGIN = 24;  // 画布四周留白
  const FLOOR_RADIUS = 12; // 与外层毛玻璃框视觉匹配的圆角半径（SVG 坐标）

  const WIDTH_PX = DIM.width * SCALE;   // 横向像素
  const LENGTH_PX = DIM.length * SCALE; // 纵向像素
  const VIEW_W = WIDTH_PX + MARGIN * 2;
  const VIEW_H = LENGTH_PX + MARGIN * 2;

  function px(v) {
    return MARGIN + v * SCALE;
  }
  function invPx(v) {
    return (v - MARGIN) / SCALE;
  }

  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function line(x1, y1, x2, y2, cls) {
    return el('line', { x1, y1, x2, y2, class: cls });
  }

  function rect(x, y, w, h, cls, extra = {}) {
    return el('rect', { x, y, width: w, height: h, class: cls, ...extra });
  }

  function makeDefs() {
    const defs = el('defs', {});
    const marker = el('marker', {
      id: 'arrowhead',
      viewBox: '0 0 14 12',
      refX: '1',
      refY: '6',
      markerWidth: '14',
      markerHeight: '12',
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });
    marker.appendChild(el('path', {
      d: 'M0,1 L13,6 L0,11 Z',
      fill: '#FFD500',
      stroke: '#8a6d00',
      'stroke-width': '0.7',
    }));
    defs.appendChild(marker);
    return defs;
  }

  function render(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    svg.appendChild(makeDefs());
    svg.appendChild(rect(0, 0, VIEW_W, VIEW_H, 'floor', { rx: FLOOR_RADIUS, ry: FLOOR_RADIUS }));

    const court = el('g', { class: 'court' });

    const left = px(0);
    const right = px(DIM.width);
    const top = px(0);
    const bottom = px(DIM.length);
    const netY = px(DIM.length / 2);
    const shortTop = px(DIM.length / 2 - DIM.shortService);
    const shortBottom = px(DIM.length / 2 + DIM.shortService);
    const longTop = px(DIM.doublesLongService);
    const longBottom = px(DIM.length - DIM.doublesLongService);
    const centreX = px(DIM.width / 2);

    // 外边界（矩形 = 上下端线 + 左右边线）
    court.appendChild(rect(left, top, WIDTH_PX, LENGTH_PX, 'line'));

    // 网（实线）
    court.appendChild(line(left, netY, right, netY, 'net'));

    // 前发球线
    court.appendChild(line(left, shortTop, right, shortTop, 'line'));
    court.appendChild(line(left, shortBottom, right, shortBottom, 'line'));

    // 双打后发球线
    court.appendChild(line(left, longTop, right, longTop, 'line'));
    court.appendChild(line(left, longBottom, right, longBottom, 'line'));

    // 中线（各自从前发球线到端线）
    court.appendChild(line(centreX, top, centreX, shortTop, 'line'));
    court.appendChild(line(centreX, shortBottom, centreX, bottom, 'line'));

    svg.appendChild(court);
  }

  // 米模型：{ x: 长(0..13.4，0=上端), y: 宽(0..6.1，0=左) }
  function metersToSvgPx(m) {
    return { x: px(m.y), y: px(m.x) };
  }

  function pxToMeters(p) {
    return { x: invPx(p.y), y: invPx(p.x) };
  }

  function clampMeters(m) {
    return {
      x: Math.min(DIM.length, Math.max(0, m.x)),
      y: Math.min(DIM.width, Math.max(0, m.y)),
    };
  }

  return {
    DIM,
    SCALE,
    MARGIN,
    VIEW_W,
    VIEW_H,
    render,
    pxToMeters,
    metersToSvgPx,
    clampMeters,
  };
})();
