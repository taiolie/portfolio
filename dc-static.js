/* Tiny standalone runtime for the exported portfolio pages.
   Supports: {{path}} holes in text and attributes, <sc-if value="{{x}}">,
   onClick / onChange / onInput / onSubmit handlers, setState, componentDidMount. */
(function () {
  'use strict';

  function DCLogic() { this.state = {}; this.props = {}; }
  DCLogic.prototype.setState = function (u) {
    var patch = typeof u === 'function' ? u(this.state, this.props) : u;
    if (patch) this.state = Object.assign({}, this.state, patch);
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var EXACT = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;
  var EVENTS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown', onfocus: 'focusin', onblur: 'focusout' };

  function lookup(vals, expr) {
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null' || expr === 'undefined') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var cur = vals;
    var parts = expr.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function str(v) { return v == null || v === false ? '' : String(v); }

  // Build a fresh DOM tree for one render from the template.
  function build(tplNode, vals, out) {
    for (var c = tplNode.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        var t = c.data;
        out.appendChild(document.createTextNode(t.indexOf('{{') < 0 ? t : t.replace(HOLE, function (_, p) { return str(lookup(vals, p)); })));
      } else if (c.nodeType === 1) {
        var tag = c.tagName.toLowerCase();
        if (tag === 'sc-if') {
          var m = (c.getAttribute('value') || '').match(EXACT);
          if (m && lookup(vals, m[1])) build(c, vals, out);
          continue;
        }
        var el = document.createElementNS(c.namespaceURI, c.localName);
        for (var i = 0; i < c.attributes.length; i++) {
          var a = c.attributes[i];
          if (a.name.indexOf('hint-') === 0) continue;
          var name = a.name, val = a.value, ev = EVENTS[name.toLowerCase()];
          var exact = val.match(EXACT);
          if (ev) {
            var fn = exact ? lookup(vals, exact[1]) : null;
            if (typeof fn === 'function') { (el.__h || (el.__h = {}))[ev] = fn; }
            continue;
          }
          if (exact) {
            var raw = lookup(vals, exact[1]);
            if (raw === false || raw == null) continue;
            el.setAttribute(name, String(raw));
          } else {
            el.setAttribute(name, val.indexOf('{{') < 0 ? val : val.replace(HOLE, function (_, p) { return str(lookup(vals, p)); }));
          }
        }
        build(tag === 'template' ? c.content : c, vals, el);
        out.appendChild(el);
      }
    }
  }

  // Patch the live DOM to match the freshly built tree, keeping nodes (focus, scroll) where possible.
  function morph(live, next) {
    var lc = live.firstChild, nc = next.firstChild;
    while (nc) {
      var nNext = nc.nextSibling;
      if (!lc) { live.appendChild(nc); }
      else if (lc.nodeType !== nc.nodeType || (lc.nodeType === 1 && lc.tagName !== nc.tagName)) {
        live.replaceChild(nc, lc); lc = nc;
      } else if (lc.nodeType === 3) {
        if (lc.data !== nc.data) lc.data = nc.data;
      } else if (lc.nodeType === 1) {
        syncAttrs(lc, nc);
        lc.__h = nc.__h;
        morph(lc, nc);
      }
      lc = lc ? lc.nextSibling : null;
      nc = nNext;
    }
    while (lc) { var rm = lc; lc = lc.nextSibling; live.removeChild(rm); }
  }

  function syncAttrs(a, b) {
    for (var i = a.attributes.length - 1; i >= 0; i--) {
      var n = a.attributes[i].name;
      if (!b.hasAttribute(n)) a.removeAttribute(n);
    }
    for (var j = 0; j < b.attributes.length; j++) {
      var at = b.attributes[j];
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
  }

  var comp, root, tpl, queued = false;

  function render() {
    queued = false;
    var vals = comp.renderVals() || {};
    var frag = document.createElement('div');
    build(tpl, vals, frag);
    morph(root, frag);
  }
  function schedule() {
    if (queued || !comp) return;
    queued = true;
    (window.queueMicrotask || function (f) { Promise.resolve().then(f); })(render);
  }

  function dispatch(e) {
    var type = e.type;
    for (var n = e.target; n && n !== root.parentNode; n = n.parentNode) {
      if (n.__h && n.__h[type]) {
        n.__h[type].call(null, e);
        if (e.cancelBubble) break;
      }
    }
  }

  function start() {
    tpl = document.getElementById('dc-template').content;
    root = document.getElementById('dc-root');
    var src = document.querySelector('script[data-dc-script]');
    var Component = new Function('DCLogic', src.textContent + '\n;return Component;')(DCLogic);
    comp = new Component();
    comp.state = comp.state || {};
    comp.props = comp.props || {};
    ['click', 'input', 'submit', 'keydown', 'focusin', 'focusout'].forEach(function (t) { root.addEventListener(t, dispatch); });
    render();
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
    window.addEventListener('pagehide', function () { if (typeof comp.componentWillUnmount === 'function') comp.componentWillUnmount(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
